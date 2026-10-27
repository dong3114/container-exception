import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE, type Database } from '../db/database.js';
import { commMessage, commThread, planningSnapshot, recoveryRun } from '../db/schema/index.js';
import { TransactionRunner } from '../db/transaction.js';
import { AuditRecorder } from '../persistence/audit-recorder.js';
import { AUDIT_ACTION } from '../persistence/catalog.js';
import { BusinessRuleError, ValidationError } from '../shared/errors/cera-error.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { DOMAIN_SIGNALS, type DomainSignals } from '../shared/signals/domain-signals.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import { TruthRepository } from '../truth/truth.repository.js';
import { TruthService } from '../truth/truth.service.js';
import type { InboundItemDto } from './dto.js';
import { ExtractionRepository } from './extraction.repository.js';
import { type Check, failedCodes } from './extraction-rules.js';
import { extractionStatus } from './extraction-status.js';
import { InboundService } from './inbound.service.js';

const uuid = z.string().uuid();
const retrySchema = z.object({ command_id: uuid, note: z.string().trim().min(1).max(200).optional() }).strict();

/** 사람이 확인했거나 공식 기록으로 이미 알게 된 값 — 공백을 닫는 상태(gap-rules 와 같다) */
const GAP_CLOSING_STATES = ['CONFIRMED', 'OBSERVED'];

/**
 * 사람이 요청하는 회신 추출 재시도(T-124). 자동 재시도(`CERA_EXTRACTION_MAX_ATTEMPTS`)와 따로다 — 요청 하나가 시도 하나를 연다.
 *
 * - 이전 시도의 기록(실패 · 완료 · 후보)은 지우거나 고치지 않는다. 새 시도는 기존 Worker 경로(AI 호출 → 결정론 검증 → 승격 판정)를 그대로 지난다
 * - 같은 명령 id 의 재요청은 같은 요청으로 돌아온다(두 번 누름 · 네트워크 재시도). 이미 시도가 진행 중이면 409
 * - 옛 회신이 지금 사실을 흔들지 않게 요청 때 다시 본다: 같은 스레드에 더 새 회신 · 새 문의가 있으면 REPLY_SUPERSEDED,
 *   물은 사실이 이미 사람 확인(또는 공식 기록)으로 알려졌으면 GAP_ALREADY_RESOLVED. 승격 판정(T-093)도 그대로 다시 지난다
 */
@Injectable()
export class ExtractionRetryService {
  private readonly maxAttempts: number;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ExtractionRepository) private readonly repo: ExtractionRepository,
    @Inject(InboundService) private readonly inbound: InboundService,
    @Inject(TruthRepository) private readonly truthRepo: TruthRepository,
    @Inject(TruthService) private readonly truth: TruthService,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(AuditRecorder) private readonly audit: AuditRecorder,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DOMAIN_SIGNALS) private readonly signals: DomainSignals,
    @Inject(ENV) env: Env,
  ) {
    this.maxAttempts = env.CERA_EXTRACTION_MAX_ATTEMPTS;
  }

  async request(messageId: string, actorHeader: string | undefined, body: unknown): Promise<{ retry_request_id: string; replayed: boolean; reply: InboundItemDto }> {
    if (!uuid.safeParse(messageId).success) throw new ValidationError('INVALID_ID', 'messageId must be a UUID', ['messageId']);
    const parsed = retrySchema.safeParse(body ?? {});
    if (!parsed.success) throw new ValidationError('INVALID_RETRY_REQUEST', 'command_id (uuid) is required; note is optional (1–200 chars)', parsed.error.issues.map((i) => i.path.join('.')));
    if (!actorHeader) throw new ValidationError('ACTOR_REQUIRED', 'X-CERA-Actor-Id header is required', ['x-cera-actor-id']);
    if (!uuid.safeParse(actorHeader).success) throw new ValidationError('INVALID_ID', 'X-CERA-Actor-Id must be a UUID', ['x-cera-actor-id']);
    const human = await this.truthRepo.activeHuman(actorHeader);
    if (!human) throw new BusinessRuleError('ACTOR_NOT_ALLOWED', 'Only an active human operator can ask for another extraction', 403);

    const subject = await this.repo.subject(messageId);
    if (!subject) throw new BusinessRuleError('NOT_FOUND', 'No attached reply with this id', 404);

    const result = await this.tx.run(async (t) => {
      // 추출 저장(Worker)과 같은 잠금 — 요청과 시도 결과가 엇갈려 기록되지 않는다
      await this.repo.lockMessage(t, messageId);
      const same = await this.repo.retryByCommand(human.actorId, parsed.data.command_id, t);
      if (same) {
        if (same.messageId !== messageId) throw new BusinessRuleError('COMMAND_ID_REUSED', 'This command_id was already used for another reply', 409);
        return { id: same.retryRequestId, replayed: true };
      }
      const rows = await this.repo.forMessages([messageId]);
      const status = extractionStatus((await this.repo.attemptLogs([messageId], t)).get(messageId)!, rows.map((r) => ({ validation: failedCodes(r.validatorResult as unknown as Check[]).length === 0 ? ('PASSED' as const) : ('REJECTED' as const), review_status: r.reviewStatus })), this.maxAttempts);
      if (status.retry.blocked_reason) throw new BusinessRuleError(status.retry.blocked_reason, retryBlockMessage(status.retry.blocked_reason), 409);
      await this.assertStillRelevant(subject.threadId, messageId, subject.isSimulated);

      const id = this.ids.newId();
      await this.repo.insertRetry(t, {
        retryRequestId: id,
        messageId,
        commandId: parsed.data.command_id,
        requestedByActorId: human.actorId,
        requestedAt: this.clock.now().toDb(),
        priorState: status.state as 'FAILED' | 'NO_CANDIDATE' | 'DONE',
        priorFailedAttempts: status.failed_attempts,
        note: parsed.data.note ?? null,
        isSimulated: subject.isSimulated,
      });
      await this.audit.record(t, { actorId: human.actorId, action: AUDIT_ACTION.REPLY_EXTRACTION_RETRY_REQUESTED, targetType: 'COMM_MESSAGE', targetId: messageId, result: 'SUCCESS', isSimulated: subject.isSimulated });
      return { id, replayed: false };
    });
    if (!result.replayed) this.signals.emit({ type: 'EXTRACTION_RETRY_REQUESTED', inboundMessageId: messageId });
    const reply = (await this.inbound.forThread(subject.threadId)).find((i) => i.message_id === messageId);
    if (!reply) throw new BusinessRuleError('NOT_FOUND', 'No attached reply with this id', 404);
    return { retry_request_id: result.id, replayed: result.replayed, reply };
  }

  /** 옛 회신을 다시 읽어 지금 사실을 흔들지 않는다: 더 새 회신 · 문의가 없고, 물은 사실이 아직 알려지지 않았을 때만. */
  private async assertStillRelevant(threadId: string, messageId: string, isSimulated: boolean): Promise<void> {
    const [self] = await this.db.select({ createdAt: commMessage.createdAt }).from(commMessage).where(eq(commMessage.messageId, messageId)).limit(1);
    const newer = await this.db
      .select({ id: commMessage.messageId, direction: commMessage.direction })
      .from(commMessage)
      .where(and(eq(commMessage.threadId, threadId), gt(commMessage.createdAt, self!.createdAt)))
      .limit(20);
    // 더 새 회신이 왔거나, 이 회신 뒤에 같은 스레드로 새 문의가 나갔다
    const newerOutbound = await this.db
      .select({ id: commMessage.messageId })
      .from(commMessage)
      .where(and(eq(commMessage.threadId, threadId), eq(commMessage.direction, 'OUTBOUND'), isNotNull(commMessage.sentAt), gt(commMessage.sentAt, self!.createdAt)))
      .limit(1);
    if (newer.some((m) => m.direction === 'INBOUND') || newerOutbound.length > 0) {
      throw new BusinessRuleError('REPLY_SUPERSEDED', 'A newer reply or inquiry exists on this thread — review that one instead', 409);
    }
    const [asked] = await this.db
      .select({ id: commMessage.messageId })
      .from(commMessage)
      .where(and(eq(commMessage.threadId, threadId), eq(commMessage.direction, 'OUTBOUND'), isNotNull(commMessage.sentAt)))
      .orderBy(desc(commMessage.sentAt))
      .limit(1);
    if (!asked) return;
    const asOf = await this.evaluationAsOf(threadId, isSimulated);
    for (const c of await this.truthRepo.messageCoordinates(asked.id)) {
      const live = await this.truth.liveForCoordinate(c, asOf);
      if (GAP_CLOSING_STATES.includes(live.state)) {
        throw new BusinessRuleError('GAP_ALREADY_RESOLVED', 'What this reply was asked about is already known (confirmed by a person or an official record) — extraction is no longer needed', 409);
      }
    }
  }

  /** 판정 기준 시각: 실제 = 지금 · 시뮬레이션 = 그 스레드가 묶인 계획 실행의 스냅숏 시각(Agent 와 같은 규칙). */
  private async evaluationAsOf(threadId: string, isSimulated: boolean): Promise<Instant> {
    if (!isSimulated) return this.clock.now();
    const [row] = await this.db
      .select({ asOf: planningSnapshot.asOf })
      .from(commThread)
      .innerJoin(recoveryRun, eq(recoveryRun.runId, commThread.relatedRunId))
      .innerJoin(planningSnapshot, eq(planningSnapshot.snapshotId, recoveryRun.snapshotId))
      .where(eq(commThread.threadId, threadId))
      .limit(1);
    return row ? Instant.fromDb(row.asOf) : this.clock.now();
  }
}

function retryBlockMessage(code: string): string {
  if (code === 'EXTRACTION_IN_PROGRESS') return 'An extraction attempt is still running or the worker is still retrying automatically';
  if (code === 'EXTRACTION_NOT_REQUIRED') return 'This reply already has a validated candidate — review it instead';
  return 'This reply cannot be extracted (no stored content or nothing was asked)';
}
