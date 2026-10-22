import { DOMAIN_SIGNALS, type DomainSignals } from '../shared/signals/domain-signals.js';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CHANNEL_ADAPTERS, type ChannelAdapter, type InboundRawMessage } from '../channel/channel-adapter.js';
import type { ChannelAdapters } from '../channel/channel.module.js';
import { ContentService } from '../content/content-service.js';
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

  constructor(
    @Inject(InboundRepository) private readonly inbound: InboundRepository,
    @Inject(DraftService) private readonly drafts: DraftService,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(AuditRecorder) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CHANNEL_ADAPTERS) private readonly adapters: ChannelAdapters,
    @Inject(DOMAIN_SIGNALS) private readonly signals: DomainSignals,
  ) {}

  async runCycle(): Promise<InboundCycleSummary> {
    const summary: InboundCycleSummary = { fetched: 0, NORMAL: 0, HOLD: 0, DUPLICATE: 0 };
    for (const adapter of this.adapters.values()) {
      // 워터마크는 최적화일 뿐 — 같은 메일이 다시 와도 UNIQUE 가 막는다. 저장할 곳이 없어 매 주기 처음부터 받는다(Mock).
      const { messages } = await adapter.fetchInbound(null);
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

      const thread = decision.thread;
      const messageId = this.ids.newId();
      await this.inbound.insertInboundMessage(tx, {
        messageId,
        threadId: thread.threadId,
        direction: 'INBOUND',
        messageKind: 'BUSINESS',
        channelType: adapter.channelType,
        externalMessageId: m.externalMessageId,
        fromAddress: normalizeAddress(m.from).slice(0, 200),
        // 받은 메시지의 내용은 원문(raw_input)이 정본 — 메시지 행에는 원문 지문만(내용 참조는 보내는 메시지용 범주)
        contentHash: stored.sha256,
        createdAt: now.toDb(),
        receivedAt: receivedAt.toDb(),
        isSimulated: thread.isSimulated,
        scenarioId,
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
      await this.audit.record(tx, {
        actorId: system,
        action: AUDIT_ACTION.INBOUND_RECEIVED,
        targetType: 'COMM_MESSAGE',
        targetId: messageId,
        result: 'SUCCESS',
        isSimulated: thread.isSimulated,
      });
      return 'NORMAL' as const;
    });
  }
}
