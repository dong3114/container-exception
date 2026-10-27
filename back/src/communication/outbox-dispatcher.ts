import { Inject, Injectable, Logger } from '@nestjs/common';
import { CHANNEL_ADAPTERS, ChannelSendError, type ChannelAdapter, type ChannelType, type OutboundMessage } from '../channel/channel-adapter.js';
import type { ChannelAdapters } from '../channel/channel.module.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { TransactionRunner } from '../db/transaction.js';
import { AuditRecorder } from '../persistence/audit-recorder.js';
import { AUDIT_ACTION } from '../persistence/catalog.js';
import { canonicalHash } from '../shared/hash/hash.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { DOMAIN_SIGNALS, type DomainSignals } from '../shared/signals/domain-signals.js';
import { ApprovalRepository } from './approval.repository.js';
import { liveApproval } from './approval-rules.js';
import { DraftService } from './draft.service.js';
import { SendRepository } from './send.repository.js';
import { RECONCILED_FOUND, RECONCILED_NOT_SENT, nextAttemptAt } from './send-rules.js';

/** 시도를 선커밋하고 돌려받는 것 — 이것으로 외부 호출(트랜잭션 밖)과 결과 기록(새 트랜잭션)을 한다. */
export interface Claim {
  messageId: string;
  threadId: string;
  sendAttemptId: string;
  attemptNo: number;
  approvalId: string;
  isSimulated: boolean;
  adapter: ChannelAdapter;
  outbound: OutboundMessage;
}

export type SendOutcome =
  | { kind: 'SUCCESS'; externalMessageId: string; externalThreadId: string }
  | { kind: 'TRANSIENT' | 'PERMANENT' | 'AUTH' | 'UNKNOWN'; code: string; message: string };

export type ProcessResult = 'SENT' | 'RETRY_SCHEDULED' | 'FAILED' | 'UNKNOWN' | 'DEQUEUED' | 'SKIPPED' | 'PAUSED';

export interface CycleSummary {
  reconciled: number;
  processed: Record<ProcessResult, number>;
}

const isUnresolved = (r: string | null) => r === null || r === 'UNKNOWN';

/**
 * Outbox 디스패처(T-090 U5 · docs/24 14 · 15 T4~T6 · docs/18 H.2 · H.3). Worker 프로세스가 주기마다 `runCycle()` 을 부른다.
 *
 *   1. 화해: 결과 없는 · 미확정 시도 → `lookupSent` → 찾으면 SUCCESS, 없음이 확인되면 RETRYABLE_FAILURE(RECONCILED_NOT_SENT)
 *   2. 픽업: `QUEUED` 메시지 → 같은 발송 판정(`DraftService.sendCheck`) → 막히면 대기 해제(재시도 금지 · 사유 남김)
 *   3. 시도 선커밋(`claim`): 메시지 행 `FOR UPDATE SKIP LOCKED` → 승인 행을 잠근 뒤 다시 확인 → `send_attempt`(결과 NULL) → 커밋
 *   4. 외부 호출(`transmit`): 트랜잭션 **밖** — 승인 사본에서 만든 내용 · `X-CERA-Message` 헤더
 *   5. 결과(`record`): 새 트랜잭션에서 결과 한 번 + 상태 전이 + 감사
 *
 * 같은 메시지가 두 번 나가지 않는 이유: 메시지당 미확정 시도 1건(U-7) · 성공 1건(U-6) · 성공 뒤 새 시도 금지(M08) — 모두 DB 가 강제하고,
 * 3과 4 사이에 죽으면 남은 "결과 없는 시도"가 다음 주기의 1(화해)로 가서 **다시 보내기 전에 먼저 조회**한다.
 * 업무 상태는 프로세스 메모리에 두지 않는다(여러 Worker · 재기동 안전).
 */
@Injectable()
export class OutboxDispatcher {
  private readonly logger = new Logger('OutboxDispatcher');
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly reconcileAfterMs: number;
  private readonly paused: boolean;

  constructor(
    @Inject(DraftService) private readonly drafts: DraftService,
    @Inject(SendRepository) private readonly sends: SendRepository,
    @Inject(ApprovalRepository) private readonly approvals: ApprovalRepository,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(AuditRecorder) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CHANNEL_ADAPTERS) private readonly adapters: ChannelAdapters,
    @Inject(ENV) env: Env,
    @Inject(DOMAIN_SIGNALS) private readonly signals: DomainSignals,
  ) {
    this.maxAttempts = env.CERA_SEND_MAX_ATTEMPTS;
    this.retryBaseMs = env.CERA_SEND_RETRY_BASE_MS;
    this.reconcileAfterMs = env.CERA_SEND_RECONCILE_AFTER_MS;
    this.paused = env.CERA_SENDING_PAUSED;
  }

  async runCycle(options: { reconcileAfterMs?: number; batch?: number } = {}): Promise<CycleSummary> {
    const summary: CycleSummary = {
      reconciled: await this.reconcile(options.reconcileAfterMs ?? this.reconcileAfterMs),
      processed: { SENT: 0, RETRY_SCHEDULED: 0, FAILED: 0, UNKNOWN: 0, DEQUEUED: 0, SKIPPED: 0, PAUSED: 0 },
    };
    for (const messageId of await this.sends.queuedMessageIds(options.batch ?? 20)) {
      summary.processed[await this.processMessage(messageId)] += 1;
    }
    return summary;
  }

  /** 1. 화해(docs/24 14 결정 5). 확인하지 못하면(조회 실패) 그대로 두고 다음 주기에 다시. */
  async reconcile(afterMs: number): Promise<number> {
    let settled = 0;
    const before = this.clock.now().plusMs(-afterMs);
    for (const a of await this.sends.unresolvedAttempts(before, 50)) {
      const i = await this.drafts.inspect(a.messageId);
      const adapter = this.adapters.get(i.loaded.message.channelType as ChannelType);
      if (!adapter) continue;
      let found: string | null;
      try {
        found = await adapter.lookupSent(a.messageId);
      } catch (error) {
        this.logger.warn({ msg: 'lookup_sent failed — will retry next cycle', message_id: a.messageId, error: String(error) });
        continue;
      }
      const now = this.clock.now();
      const done = await this.tx.run(async (tx) => {
        const locked = await this.sends.lockMessage(tx, a.messageId);
        const attempt = (await this.sends.attempts(a.messageId, tx)).find((x) => x.sendAttemptId === a.sendAttemptId);
        if (!locked || !attempt || !isUnresolved(attempt.result)) return false; // 다른 Worker 가 먼저 정리했다
        const finishedAt = attempt.finishedAt === null ? now.toDb() : undefined; // UNKNOWN 의 finished_at 은 바꾸지 않는다(M08)
        if (found) {
          await this.sends.recordResult(tx, a.sendAttemptId, { result: 'SUCCESS', finishedAt, providerMessageId: found, errorMessage: RECONCILED_FOUND });
          await this.completeSent(tx, { messageId: a.messageId, threadId: locked.threadId, sendAttemptId: a.sendAttemptId, isSimulated: locked.isSimulated, externalThreadId: null, at: now.toDb(), status: locked.currentStatus });
        } else {
          await this.sends.recordResult(tx, a.sendAttemptId, { result: 'RETRYABLE_FAILURE', finishedAt, errorCode: RECONCILED_NOT_SENT, errorMessage: 'not found in channel — safe to retry' });
        }
        await this.audit.record(tx, {
          actorId: await this.drafts.systemActor(),
          action: AUDIT_ACTION.SEND_RECONCILED,
          targetType: 'SEND_ATTEMPT',
          targetId: a.sendAttemptId,
          result: 'SUCCESS',
          isSimulated: locked.isSimulated,
        });
        return true;
      });
      if (done) settled += 1;
    }
    return settled;
  }

  /** 2~5. 메시지 하나. */
  async processMessage(messageId: string): Promise<ProcessResult> {
    if (this.paused) return 'PAUSED'; // kill switch(FR-SND-12): 대기열에 그대로 둔다
    const claim = await this.claim(messageId);
    if (typeof claim === 'string') return claim;
    const outcome = await this.transmit(claim);
    const result = await this.record(claim, outcome);
    // 커밋 뒤 알림(T-121): 나갔으면 기다리던 Agent 를, 재시도면 예약 시각에 다시 — 실행 큐가 없으면 폴링이 같은 일을 한다
    if (result === 'SENT') this.signals.emit({ type: 'MESSAGE_SENT', messageId });
    if (result === 'RETRY_SCHEDULED') {
      const next = nextAttemptAt(await this.sends.attempts(messageId), this.retryBaseMs);
      const delayMs = next ? Math.max(0, next.epochMs - this.clock.now().epochMs) : this.retryBaseMs;
      this.signals.emit({ type: 'SEND_RETRY_SCHEDULED', messageId, delayMs, attempt: claim.attemptNo + 1 });
    }
    if (result === 'UNKNOWN') this.signals.emit({ type: 'SEND_RETRY_SCHEDULED', messageId, delayMs: this.reconcileAfterMs, attempt: claim.attemptNo });
    return result;
  }

  /** 2 + 3. 발송 판정 → 막히면 대기 해제 · 통과하면 시도 행을 선커밋. */
  async claim(messageId: string): Promise<Claim | ProcessResult> {
    const now = this.clock.now();
    const i = await this.drafts.inspect(messageId);
    const check = await this.drafts.sendCheck(i, now);
    const attempts = check.attempts;
    if (attempts.some((a) => isUnresolved(a.result))) return 'SKIPPED'; // 화해가 먼저다 — 재전송하지 않는다
    const last = attempts.at(-1);
    const retryable = last?.result === 'RETRYABLE_FAILURE';
    const system = await this.drafts.systemActor();

    if (check.blocks.length > 0 || (retryable && attempts.length >= this.maxAttempts)) {
      const exhausted = check.blocks.length === 0;
      const ok = await this.tx.run(async (tx) => {
        const locked = await this.sends.claimQueued(tx, messageId);
        if (!locked) return false;
        if (exhausted) {
          await this.transition(tx, messageId, 'DELIVERY_FAILED', system, now.toDb(), locked.isSimulated, `retries exhausted after ${attempts.length} attempts`);
        } else if (check.blocks.includes('ALREADY_SENT')) {
          await this.transition(tx, messageId, 'SENT', system, now.toDb(), locked.isSimulated, 'already sent (reconciled)');
        } else {
          // 정책 거부(docs/18 H.3): 재시도하지 않는다. 대기를 풀고 사유를 남긴다 — 사람이 보고 다시 요청한다.
          await this.transition(tx, messageId, 'APPROVED', system, now.toDb(), locked.isSimulated, `send blocked: ${check.blocks.join(', ')}`);
        }
        await this.audit.record(tx, {
          actorId: system,
          action: exhausted ? AUDIT_ACTION.SEND_FAILED : AUDIT_ACTION.SEND_DEQUEUED,
          targetType: 'COMM_MESSAGE',
          targetId: messageId,
          result: 'FAILURE',
          isSimulated: locked.isSimulated,
        });
        return true;
      });
      return ok ? (exhausted ? 'FAILED' : 'DEQUEUED') : 'SKIPPED';
    }

    const next = nextAttemptAt(attempts, this.retryBaseMs);
    if (next && next.isAfter(now)) return 'SKIPPED'; // 백오프 대기
    if (!check.live || !check.outbound || !check.adapter) return 'SKIPPED';
    const live = check.live;
    const outbound = check.outbound;
    const adapter = check.adapter;

    const claimed = await this.tx.run(async (tx) => {
      const locked = await this.sends.claimQueued(tx, messageId); // FOR UPDATE SKIP LOCKED
      if (!locked) return null;
      // 잠근 뒤 다시: 승인(취소 · 무효화 · 만료) · 시도 수
      const rows = await this.approvals.listForMessage(messageId, tx);
      const stillLive = liveApproval(rows, now);
      if (!stillLive || stillLive.approvalId !== live.approvalId || stillLive.approvedContentHash !== locked.contentHash) return null;
      const inTx = await this.sends.attempts(messageId, tx);
      if (inTx.length !== attempts.length) return null;
      const attemptNo = attempts.length + 1;
      const sendAttemptId = this.ids.newId();
      await this.sends.insertAttempt(tx, {
        sendAttemptId,
        messageId,
        approvalId: live.approvalId, // 실제로 쓴 살아 있는 승인 행
        attemptNo,
        idempotencyKey: canonicalHash({ k: 'send-attempt', v: 1, message_id: messageId, attempt_no: attemptNo }), // sak/1
        sentContentHash: live.approvedContentHash ?? '',
        startedAt: now.toDb(),
        isSimulated: locked.isSimulated,
      });
      return { sendAttemptId, attemptNo, isSimulated: locked.isSimulated };
    });
    if (!claimed) return 'SKIPPED';
    return { messageId, threadId: i.loaded.thread.threadId, approvalId: live.approvalId, adapter, outbound, ...claimed };
  }

  /** 4. 외부 호출 — 트랜잭션 밖(어댑터가 `assertOutsideTransaction` 으로 확인한다). 어댑터 오류를 분류로 바꾼다. */
  async transmit(claim: Claim): Promise<SendOutcome> {
    try {
      const receipt = await claim.adapter.send(claim.outbound);
      return { kind: 'SUCCESS', ...receipt };
    } catch (error) {
      if (error instanceof ChannelSendError) return { kind: error.kind, code: error.code, message: error.message };
      // 분류할 수 없는 예외 = 보냈는지 모른다 → 재전송 전에 화해
      return { kind: 'UNKNOWN', code: 'CHANNEL_UNEXPECTED_ERROR', message: 'Unexpected channel error' };
    }
  }

  /** 5. 결과 한 번 + 상태 전이 + 감사(새 트랜잭션). */
  async record(claim: Claim, outcome: SendOutcome): Promise<ProcessResult> {
    const now = this.clock.now().toDb();
    const system = await this.drafts.systemActor();
    return this.tx.run(async (tx) => {
      const locked = await this.sends.lockMessage(tx, claim.messageId);
      if (outcome.kind === 'SUCCESS') {
        await this.sends.recordResult(tx, claim.sendAttemptId, { result: 'SUCCESS', finishedAt: now, providerMessageId: outcome.externalMessageId });
        await this.completeSent(tx, {
          messageId: claim.messageId,
          threadId: claim.threadId,
          sendAttemptId: claim.sendAttemptId,
          isSimulated: claim.isSimulated,
          externalThreadId: outcome.externalThreadId,
          at: now,
          status: locked?.currentStatus ?? null,
        });
        return 'SENT';
      }
      const result = outcome.kind === 'TRANSIENT' ? 'RETRYABLE_FAILURE' : outcome.kind === 'UNKNOWN' ? 'UNKNOWN' : 'PERMANENT_FAILURE';
      await this.sends.recordResult(tx, claim.sendAttemptId, { result, finishedAt: now, errorCode: outcome.code, errorMessage: outcome.message.slice(0, 500) });
      const final = result === 'PERMANENT_FAILURE' || (result === 'RETRYABLE_FAILURE' && claim.attemptNo >= this.maxAttempts);
      if (final) {
        await this.transition(tx, claim.messageId, 'DELIVERY_FAILED', system, now, claim.isSimulated, `${outcome.kind.toLowerCase()} failure: ${outcome.code}`, claim.sendAttemptId);
      }
      await this.audit.record(tx, {
        actorId: system,
        action: AUDIT_ACTION.SEND_FAILED,
        targetType: 'SEND_ATTEMPT',
        targetId: claim.sendAttemptId,
        result: 'FAILURE',
        isSimulated: claim.isSimulated,
      });
      return final ? 'FAILED' : result === 'UNKNOWN' ? 'UNKNOWN' : 'RETRY_SCHEDULED';
    });
  }

  private async completeSent(
    tx: Parameters<Parameters<TransactionRunner['run']>[0]>[0],
    m: { messageId: string; threadId: string; sendAttemptId: string; isSimulated: boolean; externalThreadId: string | null; at: string; status: string | null },
  ): Promise<void> {
    const system = await this.drafts.systemActor();
    await this.sends.markSent(tx, { messageId: m.messageId, threadId: m.threadId, sentAt: m.at, externalThreadId: m.externalThreadId });
    if (m.status === 'QUEUED') {
      await this.transition(tx, m.messageId, 'SENT', system, m.at, m.isSimulated, 'sent', m.sendAttemptId);
    }
    await this.audit.record(tx, {
      actorId: system,
      action: AUDIT_ACTION.MESSAGE_SENT,
      targetType: 'SEND_ATTEMPT',
      targetId: m.sendAttemptId,
      result: 'SUCCESS',
      isSimulated: m.isSimulated,
    });
  }

  private async transition(
    tx: Parameters<Parameters<TransactionRunner['run']>[0]>[0],
    messageId: string,
    status: 'SENT' | 'DELIVERY_FAILED' | 'APPROVED',
    actorId: string,
    at: string,
    isSimulated: boolean,
    note: string,
    sendAttemptId: string | null = null,
  ): Promise<void> {
    await this.sends.insertTransition(tx, { id: this.ids.newId(), messageId, status, actorId, at, isSimulated, note: note.slice(0, 300), sendAttemptId });
  }
}
