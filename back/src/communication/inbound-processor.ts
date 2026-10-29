import { DOMAIN_SIGNALS, type DomainSignals } from '../shared/signals/domain-signals.js';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CHANNEL_ADAPTERS, type ChannelAdapter, type InboundRawMessage, type InboundScope } from '../channel/channel-adapter.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import type { ChannelAdapters } from '../channel/channel.module.js';
import { ContentService } from '../content/content-service.js';
import { ABSENT, CONTENT_STORE, type ContentStore } from '../content/content-store.js';
import { parseMail } from '../channel/gmail/gmail-mime.js';
import { BusinessRuleError } from '../shared/errors/cera-error.js';
import { TransactionRunner } from '../db/transaction.js';
import { AuditRecorder } from '../persistence/audit-recorder.js';
import { AUDIT_ACTION, type AuditAction } from '../persistence/catalog.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import { DraftService } from './draft.service.js';
import { DATE_REJECTED_ACTION_PREFIX, HELD_ACTION_PREFIX, InboundRepository } from './inbound.repository.js';
import { type InboundDecision, classifyInbound, evidenceTime, normalizeAddress } from './inbound-rules.js';

export type IngestResult = 'NORMAL' | 'HOLD' | 'DUPLICATE';

export interface InboundCycleSummary {
  fetched: number;
  NORMAL: number;
  HOLD: number;
  DUPLICATE: number;
  /** 채널별 이번 주기의 수신 확인 결과(T-133 운영 화면 — 코드만, 오류 문장 · 비밀 없음) */
  channels: Record<string, { ok: boolean; code?: string }>;
}

/** 어댑터 오류에서 운영 화면에 보일 코드만 꺼낸다(예: `GMAIL_TOKEN_REVOKED`). 형식이 아니면 일반 코드 */
export function fetchErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,59}$/.test(code) ? code : 'INBOUND_FETCH_FAILED';
}

/**
 * 수신 처리(T-091 U6 · docs/24 15 T7 · T-069 11.6). Worker 가 발송 주기 다음에 부른다.
 *
 *   1. `fetchInbound` — 트랜잭션 밖(어댑터)
 *   2. 이미 받은 외부 id 면 건너뜀(빠른 확인 — 정확성은 3의 UNIQUE)
 *   3. 판정(순수): 스레드 연결 · 발신자(등록부) · Q-44 근거 시각
 *   4. 원문 바이트를 내용 저장소에 **먼저** 저장(트랜잭션 밖, 저장 후 지문 확인 — 16.2)
 *   5. 한 트랜잭션: `raw_input`(ON CONFLICT DO NOTHING — 충돌이면 전체 건너뜀) → 정상이면 INBOUND 메시지 + 보낸 메시지 `REPLIED`
 *      + 스레드 `ANSWERED` + 감사, 보류면 사유별 감사만(원문은 남고 스레드에 붙지 않는다)
 *
 * 내용은 해석하지 않는다(LLM 없음). 사실(Event)을 만들지 않는다 — 추출은 다음 단위(U7).
 */
@Injectable()
export class InboundProcessor {
  private readonly logger = new Logger('InboundProcessor');
  private readonly inboundThreadDays: number;

  constructor(
    @Inject(InboundRepository) private readonly inbound: InboundRepository,
    @Inject(DraftService) private readonly drafts: DraftService,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(CONTENT_STORE) private readonly store: ContentStore,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(AuditRecorder) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CHANNEL_ADAPTERS) private readonly adapters: ChannelAdapters,
    @Inject(DOMAIN_SIGNALS) private readonly signals: DomainSignals,
    @Inject(ENV) env: Env,
  ) {
    this.inboundThreadDays = env.CERA_GMAIL_INBOUND_THREAD_DAYS;
  }

  async runCycle(): Promise<InboundCycleSummary> {
    const summary: InboundCycleSummary = { fetched: 0, NORMAL: 0, HOLD: 0, DUPLICATE: 0, channels: {} };
    for (const adapter of this.adapters.values()) {
      // 워터마크는 최적화일 뿐 — 같은 메일이 다시 와도 UNIQUE 가 막는다. 저장할 곳이 없어 매 주기 처음부터 받는다(Mock).
      // 실채널(Gmail)은 CERA 가 보낸 스레드만 본다(docs/18 G.3 2) — 메일함 전체를 읽지 않는다
      let messages: InboundRawMessage[];
      try {
        const scope = adapter.declaresSimulated ? undefined : await this.scopeFor(adapter);
        ({ messages } = await adapter.fetchInbound(null, scope));
        summary.channels[adapter.channelType] = { ok: true };
      } catch (error) {
        summary.channels[adapter.channelType] = { ok: false, code: fetchErrorCode(error) };
        // 한 채널의 장애(토큰 만료 · 네트워크)가 다른 채널 수신을 막지 않는다. 다음 주기에 다시
        this.logger.warn({ msg: 'inbound fetch failed — will retry next cycle', channel: adapter.channelType, error: String(error) });
        continue;
      }
      summary.fetched += messages.length;
      for (const m of messages) {
        try {
          const result = await this.ingest(adapter, m);
          summary[result] += 1;
          // 커밋 뒤 알림(T-105) — 기다리는 Agent 를 빨리 깨우는 최적화. 놓쳐도 재조정이 DB 상태로 깨운다
          if (result === 'NORMAL') this.signals.emit({ type: 'INBOUND_REPLY_RECEIVED', externalMessageId: m.externalMessageId });
        } catch (error) {
          this.logger.warn({ msg: 'inbound message not stored — will retry next cycle', external_message_id: m.externalMessageId, error: String(error) });
        }
      }
    }
    return summary;
  }

  private async scopeFor(adapter: ChannelAdapter): Promise<InboundScope> {
    const since = this.clock.now().plusMs(-this.inboundThreadDays * 86_400_000);
    return {
      externalThreadIds: await this.inbound.activeExternalThreadIds(adapter.channelType, since.toDb()),
      alreadyStored: (id) => this.inbound.rawInputExists(adapter.channelType, id),
    };
  }

  async ingest(adapter: ChannelAdapter, m: InboundRawMessage): Promise<IngestResult> {
    const sourceName = adapter.channelType; // 출처 = 채널 코드. 중복 키 = (출처, 외부 메시지 id)
    if (await this.inbound.rawInputExists(sourceName, m.externalMessageId)) return 'DUPLICATE';

    const replyIds = [m.inReplyTo, ...m.references].filter((x): x is string => Boolean(x));
    const decision: InboundDecision = classifyInbound({
      byExternalThread: m.externalThreadId ? await this.inbound.threadsByExternalId(adapter.channelType, m.externalThreadId) : [],
      byReplyHeaders: await this.inbound.threadsByProviderIds(adapter.channelType, [...new Set(replyIds)]),
      senders: await this.inbound.sendersByAddress(adapter.channelType, normalizeAddress(m.from)),
      adapterSimulated: adapter.declaresSimulated,
    });
    const channelReceivedAt = Instant.parseIso(m.channelReceivedAt);
    const ev = evidenceTime(m.dateHeader, channelReceivedAt);

    const stored = await this.content.storeVerified('RAW_INPUT_PAYLOAD', m.raw, m.mediaType);
    const now = this.clock.now();
    // CERA 가 받은 시각은 채널이 받은 시각보다 이를 수 없다(raw_input CHECK: 메일 근거 시각 ≤ 수신 시각)
    const receivedAt = now.isBefore(channelReceivedAt) ? channelReceivedAt : now;
    const system = await this.drafts.systemActor();
    const scenarioId = decision.thread ? await this.inbound.threadScenarioId(decision.thread.threadId) : null;

    return this.tx.run(async (tx) => {
      const rawInputId = this.ids.newId();
      const inserted = await this.inbound.insertRawInput(tx, {
        rawInputId,
        sourceType: 'EMAIL',
        sourceName,
        payloadRef: stored.ref,
        payloadHash: stored.sha256,
        sourceRecordKey: m.externalMessageId,
        sourceRecordedAt: ev.sourceRecordedAt.toDb(),
        receivedAt: receivedAt.toDb(),
        collectedByActorId: system,
        isSimulated: adapter.declaresSimulated,
      });
      if (!inserted) return 'DUPLICATE' as const; // 동시에 다른 Worker 가 넣었다 — 나머지를 하지 않는다
      if (ev.rejectReason) {
        // Q-44: Date 헤더를 쓰지 않은 이유를 수신 순간의 판정으로 남긴다(원문이 파기돼도 재현 — docs/22 11.2e)
        await this.audit.record(tx, {
          actorId: system,
          action: `${DATE_REJECTED_ACTION_PREFIX}${ev.rejectReason}` as AuditAction,
          targetType: 'RAW_INPUT',
          targetId: rawInputId,
          result: 'SUCCESS',
          isSimulated: adapter.declaresSimulated,
        });
      }

      if (decision.status === 'HOLD' || !decision.thread) {
        for (const reason of decision.reasons) {
          await this.audit.record(tx, {
            actorId: system,
            action: `${HELD_ACTION_PREFIX}${reason}` as AuditAction,
            targetType: 'RAW_INPUT',
            targetId: rawInputId,
            result: 'SUCCESS',
            isSimulated: adapter.declaresSimulated,
          });
        }
        return 'HOLD' as const;
      }

      await this.attachReply(tx, { thread: decision.thread, channelType: adapter.channelType, externalMessageId: m.externalMessageId, from: m.from, contentHash: stored.sha256, receivedAt, now, system, scenarioId, actorId: system, action: AUDIT_ACTION.INBOUND_RECEIVED });
      return 'NORMAL' as const;
    });
  }

  /** 회신을 문의에 붙인다 — 수신(Worker)과 보류 재처리(사람)가 같은 규칙을 쓴다. 원문(raw_input)은 바꾸지 않는다 */
  private async attachReply(
    tx: Parameters<Parameters<TransactionRunner['run']>[0]>[0],
    a: { thread: NonNullable<InboundDecision['thread']>; channelType: string; externalMessageId: string; from: string; contentHash: string; receivedAt: Instant; now: Instant; system: string; scenarioId: string | null; actorId: string; action: AuditAction },
  ): Promise<string> {
    const { thread, now, system } = a;
    const messageId = this.ids.newId();
    await this.inbound.insertInboundMessage(tx, {
      messageId,
      threadId: thread.threadId,
      direction: 'INBOUND',
      messageKind: 'BUSINESS',
      channelType: a.channelType,
      externalMessageId: a.externalMessageId,
      fromAddress: normalizeAddress(a.from).slice(0, 200),
      // 받은 메시지의 내용은 원문(raw_input)이 정본 — 메시지 행에는 원문 지문만(내용 참조는 보내는 메시지용 범주)
      contentHash: a.contentHash,
      createdAt: now.toDb(),
      receivedAt: a.receivedAt.toDb(),
      isSimulated: thread.isSimulated,
      scenarioId: a.scenarioId,
    });
    if (thread.outboundMessageId) {
      const status = await this.inbound.outboundStatus(tx, thread.outboundMessageId);
      if (status === 'SENT' || status === 'REPLIED') {
        await this.inbound.insertRepliedTransition(tx, {
          id: this.ids.newId(),
          messageId: thread.outboundMessageId,
          actorId: system,
          at: now.toDb(),
          isSimulated: thread.isSimulated,
          note: `reply received ${messageId}`,
        });
      }
    }
    await this.inbound.markThreadAnswered(tx, thread.threadId, now.toDb());
    await this.audit.record(tx, { actorId: a.actorId, action: a.action, targetType: 'COMM_MESSAGE', targetId: messageId, result: 'SUCCESS', isSimulated: thread.isSimulated });
    return messageId;
  }

  /**
   * 보류함 재처리(T-136) — 보류된 회신(raw_input, 메시지 없음)을 **지금** 등록부 · 스레드 기준으로 다시 판정한다. 사람(권한 확인은 호출자)이 부른다.
   * - 원문은 바꾸지 않는다(내용 저장소의 원래 바이트를 다시 읽어 같은 규칙으로 판정 — append-only 출처 유지)
   * - 붙으면 수신과 같은 규칙으로 회신 메시지를 만든다 → 추출은 Worker 가 평소처럼(한 번만 — 추출 쪽 잠금 · 상태가 중복을 막는다)
   * - 여전히 보류면 메시지를 만들지 않고 지금의 보류 사유를 돌려준다(시도는 감사에만)
   * - 이미 붙은 회신이면 ALREADY_ATTACHED — 두 번 눌러도 메시지 · 사실이 두 번 생기지 않는다(메시지는 (채널, 외부 id) 유일 + 원문 잠금)
   */
  async reprocessHeld(rawInputId: string, actorId: string): Promise<{ raw_input_id: string; result: 'ATTACHED' | 'STILL_HELD' | 'ALREADY_ATTACHED'; message_id: string | null; hold_reasons: string[] }> {
    const raw = await this.inbound.rawInputById(rawInputId);
    if (!raw || raw.sourceType !== 'EMAIL') throw new BusinessRuleError('NOT_FOUND', 'No received mail with this id', 404);
    const existing = await this.inbound.messageIdFor(raw.sourceName, raw.sourceRecordKey);
    if (existing) return { raw_input_id: rawInputId, result: 'ALREADY_ATTACHED', message_id: existing, hold_reasons: [] };
    const bytes = raw.payloadRef ? await this.store.get(raw.payloadRef as Parameters<ContentStore['get']>[0]) : ABSENT;
    if (bytes === ABSENT) throw new BusinessRuleError('CONTENT_MISSING', 'The original mail is no longer in the content store — it cannot be judged again', 409);
    const m = await rebuildInbound(raw.sourceName, raw.sourceRecordKey, bytes);
    const replyIds = [m.inReplyTo, ...m.references].filter((x): x is string => Boolean(x));
    const decision: InboundDecision = classifyInbound({
      byExternalThread: m.externalThreadId ? await this.inbound.threadsByExternalId(raw.sourceName, m.externalThreadId) : [],
      byReplyHeaders: await this.inbound.threadsByProviderIds(raw.sourceName, [...new Set(replyIds)]),
      senders: await this.inbound.sendersByAddress(raw.sourceName, normalizeAddress(m.from)),
      adapterSimulated: raw.isSimulated,
    });
    const now = this.clock.now();
    const system = await this.drafts.systemActor();
    if (decision.status === 'HOLD' || !decision.thread) {
      await this.tx.run((tx) => this.audit.record(tx, { actorId, action: AUDIT_ACTION.INBOUND_REPROCESS_STILL_HELD, targetType: 'RAW_INPUT', targetId: rawInputId, result: 'SUCCESS', isSimulated: raw.isSimulated }));
      return { raw_input_id: rawInputId, result: 'STILL_HELD', message_id: null, hold_reasons: [...decision.reasons] };
    }
    const thread = decision.thread;
    const scenarioId = await this.inbound.threadScenarioId(thread.threadId);
    const out = await this.tx.run(async (tx) => {
      await this.inbound.lockRawInput(tx, rawInputId);
      const again = await this.inbound.messageIdFor(raw.sourceName, raw.sourceRecordKey, tx);
      if (again) return { id: again, created: false };
      const id = await this.attachReply(tx, { thread, channelType: raw.sourceName, externalMessageId: raw.sourceRecordKey, from: m.from, contentHash: raw.payloadHash, receivedAt: Instant.fromDb(raw.receivedAt), now, system, scenarioId, actorId, action: AUDIT_ACTION.INBOUND_REPROCESSED });
      return { id, created: true };
    });
    if (out.created) this.signals.emit({ type: 'INBOUND_REPLY_RECEIVED', externalMessageId: raw.sourceRecordKey });
    return { raw_input_id: rawInputId, result: out.created ? 'ATTACHED' : 'ALREADY_ATTACHED', message_id: out.id, hold_reasons: [] };
  }
}

/** 저장된 원문 → 수신 때와 같은 머리글(보낸 사람 · 답장 대상 · 스레드). 원문을 바꾸지 않는다 — 읽기만 */
export async function rebuildInbound(channelType: string, externalMessageId: string, bytes: Uint8Array): Promise<Pick<InboundRawMessage, 'from' | 'inReplyTo' | 'references' | 'externalThreadId'>> {
  if (channelType === 'GMAIL') {
    const parsed = await parseMail(bytes);
    return { from: parsed.from, inReplyTo: parsed.inReplyTo, references: parsed.references, externalThreadId: null };
  }
  // MOCK — 수신함 JSON 봉투(mock-channel-adapter 의 형식)
  const r = JSON.parse(new TextDecoder().decode(bytes)) as { external_thread_id?: string | null; headers?: Record<string, string | undefined> };
  const h = r.headers ?? {};
  if (typeof h.From !== 'string') throw new BusinessRuleError('UNREADABLE_ORIGINAL', `The stored original of ${externalMessageId} has no sender header`, 422);
  return { from: h.From, inReplyTo: h['In-Reply-To'] ?? null, references: (h.References ?? '').split(/\s+/).filter(Boolean), externalThreadId: r.external_thread_id ?? null };
}

