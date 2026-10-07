import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { assertOutsideTransaction } from '../db/transaction.js';
import type { IdGenerator } from '../shared/id/uuid.js';
import type { Clock } from '../shared/time/clock.js';
import { type ChannelAdapter, type ChannelCapabilities, ChannelSendError, type InboundRawMessage, type OutboundMessage, type SentReceipt } from './channel-adapter.js';

/** 시험 · 시연용 장애 주입(T-069 8.2). 운영(production)에서는 쓰지 않는다. */
export type MockFault = 'none' | 'transient' | 'permanent' | 'timeout_after_send' | 'crash_after_send';
export const MOCK_FAULTS: readonly MockFault[] = ['none', 'transient', 'permanent', 'timeout_after_send', 'crash_after_send'];

/** Mock 수신함의 한 통 — 이 파일 바이트 전체가 "원문"이다(Gmail 의 RFC822 자리). */
export interface MockInboundRecord {
  external_message_id: string;
  external_thread_id: string | null;
  channel_received_at: string;
  headers: {
    From: string;
    To: string;
    Subject: string;
    'Message-ID': string;
    Date?: string;
    'In-Reply-To'?: string;
    References?: string;
  };
  body_text: string;
}

/** 개발 · 시험용 회신 주입 옵션. 기본값은 "보낸 그 주소가 같은 스레드로 답했다". */
export interface SimulatedReply {
  /** 이 CERA 메시지(보낸 편지함의 X-CERA-Message)에 대한 답. 없으면 스레드 밖 메일. */
  replyToCeraMessageId?: string | null;
  from?: string;
  body?: string;
  subject?: string;
  /** `Date` 헤더: 문자열 그대로 · null = 헤더 없음 · 생략 = 지금. */
  dateHeader?: string | null;
  /** 채널 수신 시각(ISO). 생략 = 지금. */
  channelReceivedAt?: string;
  /** 외부 스레드 id · In-Reply-To 를 직접 정한다(애매한 연결 시험). undefined = 보낸 기록에서. */
  externalThreadId?: string | null;
  inReplyTo?: string | null;
}

export interface MockSentRecord {
  provider_message_id: string;
  external_thread_id: string;
  headers: { 'X-CERA-Message': string };
  to: string;
  subject: string;
  body_text: string;
  content_hash: string;
  is_simulated: boolean;
  sent_at: string;
}

/**
 * Mock 채널(가상 "메일 서버"). **네트워크를 쓰지 않는다** — 보낸 편지는 로컬 디렉터리(gitignore 된 `data/raw/mock-channel/`)에
 * 한 통 = 파일 하나로 남는다. 그래서 프로세스가 죽었다 살아나도 `lookupSent` 가 "보낸 편지함"을 조회할 수 있다 —
 * 화해 로직이 Gmail 과 똑같이 시험된다(T-069 8.2).
 *
 * 장애 주입(`fault`): `transient` · `permanent` 은 보내지 않고 실패 · `timeout_after_send` 는 보낸 뒤 응답을 잃는다(UNKNOWN) ·
 * `crash_after_send` 는 보낸 직전 · 직후 프로세스가 죽은 상황(`onCrash` — 기본은 프로세스 종료)을 흉내 낸다.
 */
export class MockChannelAdapter implements ChannelAdapter {
  readonly channelType = 'MOCK' as const;
  readonly declaresSimulated = true;
  private readonly sentDir: string;

  constructor(
    root: string,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private fault: MockFault = 'none',
    private readonly onCrash: () => never = () => process.exit(70),
  ) {
    this.sentDir = join(resolve(root), 'sent');
    this.inboxDir = join(resolve(root), 'inbox');
  }

  private readonly inboxDir: string;

  capabilities(): ChannelCapabilities {
    return { threading: true, attachments: false, structured_reply: false, delivery_receipt: false, inbound_push: false };
  }

  /** 시험이 장애를 바꾼다(한 번 쓰고 되돌리지 않는다 — 호출자가 정한다). */
  setFault(fault: MockFault): void {
    this.fault = fault;
  }

  async send(message: OutboundMessage): Promise<SentReceipt> {
    assertOutsideTransaction('ChannelAdapter.send');
    if (this.fault === 'transient') throw new ChannelSendError('TRANSIENT', 'MOCK_TEMPORARY_FAILURE', 'Mock channel temporarily unavailable');
    if (this.fault === 'permanent') throw new ChannelSendError('PERMANENT', 'MOCK_RECIPIENT_REJECTED', 'Mock channel rejected the recipient');

    const record: MockSentRecord = {
      provider_message_id: `mock-msg-${this.ids.newId()}`,
      external_thread_id: message.externalThreadId ?? `mock-thread-${message.ceraThreadId}`,
      headers: { 'X-CERA-Message': message.ceraMessageId },
      to: message.to,
      subject: message.subject,
      body_text: message.bodyText,
      content_hash: message.contentHash,
      is_simulated: message.isSimulated,
      sent_at: this.clock.now().toIsoUtc(),
    };
    await mkdir(this.sentDir, { recursive: true });
    const path = join(this.sentDir, `${record.provider_message_id}.json`);
    await writeFile(`${path}.partial`, JSON.stringify(record, null, 2), { flag: 'wx' });
    await rename(`${path}.partial`, path);

    if (this.fault === 'crash_after_send') this.onCrash();
    if (this.fault === 'timeout_after_send') throw new ChannelSendError('UNKNOWN', 'MOCK_TIMEOUT', 'Mock channel did not answer in time');
    return { externalMessageId: record.provider_message_id, externalThreadId: record.external_thread_id };
  }

  async lookupSent(ceraMessageId: string): Promise<string | null> {
    assertOutsideTransaction('ChannelAdapter.lookupSent');
    const found = (await this.sentRecords()).find((r) => r.headers['X-CERA-Message'] === ceraMessageId);
    return found?.provider_message_id ?? null;
  }

  async fetchInbound(watermark: string | null): Promise<{ messages: InboundRawMessage[]; nextWatermark: string | null }> {
    assertOutsideTransaction('ChannelAdapter.fetchInbound');
    let names: string[];
    try {
      names = (await readdir(this.inboxDir)).filter((n) => n.endsWith('.json'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { messages: [], nextWatermark: watermark };
      throw error;
    }
    const messages: InboundRawMessage[] = [];
    for (const name of names.sort()) {
      const raw = await readFile(join(this.inboxDir, name));
      const r = JSON.parse(raw.toString('utf8')) as MockInboundRecord;
      if (watermark && r.channel_received_at <= watermark) continue;
      messages.push({
        externalMessageId: r.external_message_id,
        externalThreadId: r.external_thread_id,
        raw: new Uint8Array(raw),
        mediaType: 'application/json',
        from: r.headers.From,
        to: r.headers.To.split(',').map((a) => a.trim()).filter(Boolean),
        subject: r.headers.Subject,
        dateHeader: r.headers.Date ?? null,
        inReplyTo: r.headers['In-Reply-To'] ?? null,
        references: (r.headers.References ?? '').split(/\s+/).filter(Boolean),
        channelReceivedAt: r.channel_received_at,
        bodyText: r.body_text,
      });
    }
    messages.sort((a, b) => (a.channelReceivedAt < b.channelReceivedAt ? -1 : a.channelReceivedAt > b.channelReceivedAt ? 1 : 0));
    return { messages, nextWatermark: messages.at(-1)?.channelReceivedAt ?? watermark };
  }

  /**
   * **개발 · 시험 전용**: 상대 업체가 답장한 것처럼 수신함에 한 통을 넣는다(제품 API 가 아니다 — `npm run mock:reply` CLI 와 시험만 쓴다).
   * 기본값은 보낸 편지함의 그 메시지에 대해 받는 사람이 같은 스레드로 답한 메일이다.
   */
  async simulateReply(options: SimulatedReply = {}): Promise<MockInboundRecord> {
    assertOutsideTransaction('MockChannelAdapter.simulateReply');
    const sent = options.replyToCeraMessageId
      ? (await this.sentRecords()).find((r) => r.headers['X-CERA-Message'] === options.replyToCeraMessageId)
      : undefined;
    if (options.replyToCeraMessageId && !sent) throw new Error(`no sent message ${options.replyToCeraMessageId} in the mock sent box`);
    const now = this.clock.now();
    const externalMessageId = `mock-in-${this.ids.newId()}`;
    const inReplyTo = options.inReplyTo === undefined ? (sent?.provider_message_id ?? null) : options.inReplyTo;
    const headers: MockInboundRecord['headers'] = {
      From: options.from ?? sent?.to ?? 'someone@example.invalid',
      To: 'cera-ops@example.invalid',
      Subject: options.subject ?? (sent ? `Re: ${sent.subject}` : '문의'),
      'Message-ID': `<${externalMessageId}@mock.invalid>`,
    };
    const date = options.dateHeader === undefined ? new Date(now.epochMs).toUTCString() : options.dateHeader;
    if (date !== null) headers.Date = date;
    if (inReplyTo) {
      headers['In-Reply-To'] = inReplyTo;
      headers.References = inReplyTo;
    }
    const record: MockInboundRecord = {
      external_message_id: externalMessageId,
      external_thread_id: options.externalThreadId === undefined ? (sent?.external_thread_id ?? null) : options.externalThreadId,
      channel_received_at: options.channelReceivedAt ?? now.toIsoUtc(),
      headers,
      body_text: options.body ?? '확인했습니다. 요청하신 대로 가능합니다.',
    };
    await mkdir(this.inboxDir, { recursive: true });
    const path = join(this.inboxDir, `${record.channel_received_at.replace(/[:.]/g, '-')}_${externalMessageId}.json`);
    await writeFile(`${path}.partial`, JSON.stringify(record, null, 2), { flag: 'wx' });
    await rename(`${path}.partial`, path);
    return record;
  }

  /** 보낸 편지함 전체(시험 · 시연에서 "몇 통 나갔나"를 센다). */
  async sentRecords(): Promise<MockSentRecord[]> {
    let names: string[];
    try {
      names = await readdir(this.sentDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const out: MockSentRecord[] = [];
    for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
      out.push(JSON.parse(await readFile(join(this.sentDir, name), 'utf8')) as MockSentRecord);
    }
    return out;
  }
}
