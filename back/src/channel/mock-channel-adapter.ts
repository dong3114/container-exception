import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { assertOutsideTransaction } from '../db/transaction.js';
import type { IdGenerator } from '../shared/id/uuid.js';
import type { Clock } from '../shared/time/clock.js';
import { type ChannelAdapter, type ChannelCapabilities, ChannelSendError, type OutboundMessage, type SentReceipt } from './channel-adapter.js';

/** 시험 · 시연용 장애 주입(T-069 8.2). 운영(production)에서는 쓰지 않는다. */
export type MockFault = 'none' | 'transient' | 'permanent' | 'timeout_after_send' | 'crash_after_send';
export const MOCK_FAULTS: readonly MockFault[] = ['none', 'transient', 'permanent', 'timeout_after_send', 'crash_after_send'];

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
  }

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
