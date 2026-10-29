import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNotNull } from 'drizzle-orm';
import { DATABASE, type Database } from '../db/database.js';
import { commMessage, commThread, planningSnapshot, recoveryRun } from '../db/schema/index.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import { TruthRepository } from '../truth/truth.repository.js';
import { TruthService } from '../truth/truth.service.js';

/** 공백을 닫는 사실 상태 — Agent 의 공백 규칙(context.service)과 같다: 사람이 확인했거나 공식 기록이다. 임시(PROVISIONAL)는 닫지 않는다 */
export const GAP_CLOSING_STATES = ['CONFIRMED', 'OBSERVED'];

export type ReplyStaleReason = 'REPLY_SUPERSEDED' | 'GAP_ALREADY_RESOLVED';

/**
 * 회신 하나가 **업무상** 아직 사람 검토 대상인가(T-124 → T-136 에서 한곳으로). 추출 결과(`needs_review`)는 그 회신만의 기록이고,
 * 업무 검토가 필요한지는 지금 사실 · 스레드가 정한다:
 * - 더 새 회신 · 그 뒤에 나간 새 문의가 있다 → REPLY_SUPERSEDED(그쪽을 본다)
 * - 물은 사실이 이미 확정 · 공식 기록이다 → GAP_ALREADY_RESOLVED(다시 읽을 필요 없음)
 * 둘 다 아니면 null(검토 대기). 다시 읽기 요청(ExtractionRetryService)과 화면 표시(InboundService)가 같은 판정을 쓴다 —
 * "다시 추출 가능"으로 보였는데 누르면 409 가 나는 일이 없게.
 */
@Injectable()
export class ReplyRelevance {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(TruthRepository) private readonly truthRepo: TruthRepository,
    @Inject(TruthService) private readonly truth: TruthService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async staleReason(threadId: string, messageId: string, isSimulated: boolean): Promise<ReplyStaleReason | null> {
    const [self] = await this.db.select({ createdAt: commMessage.createdAt }).from(commMessage).where(eq(commMessage.messageId, messageId)).limit(1);
    if (!self) return null;
    const newer = await this.db
      .select({ id: commMessage.messageId, direction: commMessage.direction })
      .from(commMessage)
      .where(and(eq(commMessage.threadId, threadId), gt(commMessage.createdAt, self.createdAt)))
      .limit(20);
    // 더 새 회신이 왔거나, 이 회신 뒤에 같은 스레드로 새 문의가 나갔다
    const newerOutbound = await this.db
      .select({ id: commMessage.messageId })
      .from(commMessage)
      .where(and(eq(commMessage.threadId, threadId), eq(commMessage.direction, 'OUTBOUND'), isNotNull(commMessage.sentAt), gt(commMessage.sentAt, self.createdAt)))
      .limit(1);
    if (newer.some((m) => m.direction === 'INBOUND') || newerOutbound.length > 0) return 'REPLY_SUPERSEDED';
    const [asked] = await this.db
      .select({ id: commMessage.messageId })
      .from(commMessage)
      .where(and(eq(commMessage.threadId, threadId), eq(commMessage.direction, 'OUTBOUND'), isNotNull(commMessage.sentAt)))
      .orderBy(desc(commMessage.sentAt))
      .limit(1);
    if (!asked) return null;
    const asOf = await this.evaluationAsOf(threadId, isSimulated);
    for (const c of await this.truthRepo.messageCoordinates(asked.id)) {
      const live = await this.truth.liveForCoordinate(c, asOf);
      if (GAP_CLOSING_STATES.includes(live.state)) return 'GAP_ALREADY_RESOLVED';
    }
    return null;
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
