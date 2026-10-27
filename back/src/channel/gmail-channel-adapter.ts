import { assertOutsideTransaction } from '../db/transaction.js';
import { Instant } from '../shared/time/instant.js';
import {
  type ChannelAdapter,
  type ChannelCapabilities,
  ChannelSendError,
  type InboundRawMessage,
  type InboundScope,
  type OutboundMessage,
  type SentReceipt,
} from './channel-adapter.js';
import { GmailApiError, type GmailClient, headerOf } from './gmail/gmail-client.js';
import { buildMime, fromBase64Url, parseMail, toBase64Url } from './gmail/gmail-mime.js';

export interface GmailAdapterOptions {
  /** CERA 전용 Gmail 계정 주소(보내는 사람 · 자기 편지 거르기). */
  accountEmail: string;
  /** 이보다 큰 편지는 받지 않는다(폭탄 메일 · docs/18 G.6) [ASSUMPTION]. */
  maxMessageBytes: number;
  /** 화해 조회가 훑는 보낸 편지함 범위(일). */
  lookupDays: number;
}

/** 화해 조회의 상한 — 이보다 많으면 "확인할 수 없음"으로 던진다(없다고 단정하지 않는다). */
const LOOKUP_MAX_PAGES = 10;

/**
 * Gmail 채널(T-118 · docs/18 G · ADR-027 Tech Validation). Mock 과 **같은 포트**를 구현한다 — 발송 흐름(승인 → Outbox → Worker)은 그대로다.
 *
 * - 발송: 승인 사본으로 만든 text/plain 편지 + `X-CERA-Message` · `X-CERA-Thread`. 같은 대화의 다음 편지는 Gmail threadId +
 *   In-Reply-To/References 로 잇는다. 돌려주는 외부 메시지 id = **RFC822 Message-ID**(상대 회신의 In-Reply-To 와 맞춰 보는 값),
 *   외부 스레드 id = Gmail threadId
 * - 화해(`lookupSent`): 보낸 편지함을 훑어 `X-CERA-Message` 가 같은 편지를 찾는다. 다 훑지 못하면 던진다(재전송 금지 쪽)
 * - 수신(`fetchInbound`): **CERA 가 아는 스레드만**(scope). CERA 가 보낸 편지(SENT · X-CERA-Message · 자기 주소)는 거른다.
 *   원문은 `format=raw` 의 RFC822 바이트 그대로. 해석 · 발신자 판정은 CERA(InboundProcessor)가 한다
 * - `declaresSimulated = false` — 실채널. 가상 메시지는 이 어댑터로 나갈 수 없다(J.3, `sendBlocks`)
 */
export class GmailChannelAdapter implements ChannelAdapter {
  readonly channelType = 'GMAIL' as const;
  readonly declaresSimulated = false;

  constructor(
    private readonly client: GmailClient,
    private readonly options: GmailAdapterOptions,
  ) {}

  capabilities(): ChannelCapabilities {
    return { threading: true, attachments: false, structured_reply: false, delivery_receipt: false, inbound_push: false };
  }

  async send(message: OutboundMessage): Promise<SentReceipt> {
    assertOutsideTransaction('ChannelAdapter.send');
    if (message.isSimulated) throw new ChannelSendError('PERMANENT', 'SIMULATION_MISMATCH', 'A simulated message cannot leave through Gmail');
    let inReplyTo: string | null = null;
    let references: string[] = [];
    if (message.externalThreadId) {
      const thread = await this.client.getThread(message.externalThreadId, ['Message-ID']);
      references = (thread?.messages ?? []).map((m) => headerOf(m, 'Message-ID')).filter((x): x is string => Boolean(x));
      inReplyTo = references.at(-1) ?? null;
    }
    const mime = buildMime({
      from: this.options.accountEmail,
      to: message.to,
      subject: message.subject,
      bodyText: message.bodyText,
      ceraMessageId: message.ceraMessageId,
      ceraThreadId: message.ceraThreadId,
      inReplyTo,
      references,
    });
    const sent = await this.client.send(toBase64Url(mime), message.externalThreadId);
    return { externalMessageId: await this.rfcMessageId(sent.id), externalThreadId: sent.threadId };
  }

  async lookupSent(ceraMessageId: string): Promise<string | null> {
    assertOutsideTransaction('ChannelAdapter.lookupSent');
    let pageToken: string | null = null;
    for (let page = 0; page < LOOKUP_MAX_PAGES; page += 1) {
      const list = await this.client.listMessages(`in:sent newer_than:${this.options.lookupDays}d`, pageToken);
      for (const m of list.messages ?? []) {
        const meta = await this.client.getMetadata(m.id, ['X-CERA-Message', 'Message-ID']);
        if (headerOf(meta, 'X-CERA-Message') === ceraMessageId) return headerOf(meta, 'Message-ID') ?? `gmail:${m.id}`;
      }
      if (!list.nextPageToken) return null; // 범위 전체를 확인했다 — 나가지 않았다
      pageToken = list.nextPageToken;
    }
    throw new GmailApiError('UNKNOWN', 'GMAIL_LOOKUP_INCOMPLETE', 'Sent mailbox too large to confirm', null);
  }

  async fetchInbound(watermark: string | null, scope?: InboundScope): Promise<{ messages: InboundRawMessage[]; nextWatermark: string | null }> {
    assertOutsideTransaction('ChannelAdapter.fetchInbound');
    if (!scope || scope.externalThreadIds.length === 0) return { messages: [], nextWatermark: watermark }; // 메일함 전체를 읽지 않는다
    const self = this.options.accountEmail.toLowerCase();
    const messages: InboundRawMessage[] = [];
    for (const threadId of scope.externalThreadIds) {
      const thread = await this.client.getThread(threadId, ['From', 'X-CERA-Message']);
      for (const m of thread?.messages ?? []) {
        const labels = m.labelIds ?? [];
        if (labels.includes('SENT') || labels.includes('DRAFT')) continue;
        if (headerOf(m, 'X-CERA-Message')) continue; // CERA 가 보낸 편지
        if ((headerOf(m, 'From') ?? '').toLowerCase().includes(self)) continue;
        if (await scope.alreadyStored(m.id)) continue;
        if ((m.sizeEstimate ?? 0) > this.options.maxMessageBytes) continue; // 받지 않는다 — 저장도 하지 않는다
        const full = await this.client.getRaw(m.id);
        const raw = fromBase64Url(full.raw);
        if (raw.byteLength > this.options.maxMessageBytes) continue;
        const parsed = await parseMail(raw);
        messages.push({
          externalMessageId: full.id,
          externalThreadId: full.threadId,
          raw,
          mediaType: 'message/rfc822',
          from: parsed.from,
          to: parsed.to,
          subject: parsed.subject,
          dateHeader: parsed.dateHeader,
          inReplyTo: parsed.inReplyTo,
          references: parsed.references,
          channelReceivedAt: Instant.ofEpochMs(Number(full.internalDate)).toIsoUtc(),
          bodyText: parsed.bodyText,
        });
      }
    }
    messages.sort((a, b) => (a.channelReceivedAt < b.channelReceivedAt ? -1 : a.channelReceivedAt > b.channelReceivedAt ? 1 : 0));
    return { messages, nextWatermark: messages.at(-1)?.channelReceivedAt ?? watermark };
  }

  /** 연동 상태 확인(화면 · 운영) — 토큰 갱신 + 계정 확인. 값(토큰)은 돌려주지 않는다. */
  async status(): Promise<{ connected: boolean; account: string | null; code: string | null }> {
    try {
      await this.client.refreshAccessToken();
      const p = await this.client.profile();
      return { connected: p.emailAddress.toLowerCase() === this.options.accountEmail.toLowerCase(), account: maskAddress(p.emailAddress), code: null };
    } catch (error) {
      return { connected: false, account: null, code: error instanceof ChannelSendError ? error.code : 'GMAIL_STATUS_FAILED' };
    }
  }

  /** 보낸 편지의 RFC822 Message-ID. 읽지 못하면 Gmail id 로 대신한다(스레드 id 로는 여전히 이어진다). */
  private async rfcMessageId(gmailId: string): Promise<string> {
    try {
      return headerOf(await this.client.getMetadata(gmailId, ['Message-ID']), 'Message-ID') ?? `gmail:${gmailId}`;
    } catch {
      return `gmail:${gmailId}`;
    }
  }
}

/** 로그 · 화면용 주소 가리기(docs/18 G.4): `k***@example.com`. */
export function maskAddress(address: string): string {
  const [local, domain] = address.split('@');
  if (!local || !domain) return '***';
  return `${local[0]}***@${domain}`;
}
