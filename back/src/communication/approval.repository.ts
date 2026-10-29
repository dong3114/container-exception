import { Inject, Injectable } from '@nestjs/common';
import { type SQL, and, asc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { DATABASE, type Database, type DbTransaction } from '../db/database.js';
import {
  actor,
  commMessage,
  messageApproval,
  messageApprovalStructuredField,
  messageStatusTransition,
  recoveryRun,
  sendAttempt,
  planFollowUp,
  recoveryPlan,
} from '../db/schema/index.js';
import { Instant } from '../shared/time/instant.js';
import type { ApprovalDecision, ApprovalRow, InvalidationCause } from './approval-rules.js';

export type ApprovalInsert = typeof messageApproval.$inferInsert;
export type ApprovalCopyInsert = typeof messageApprovalStructuredField.$inferInsert;
type Reader = Database | DbTransaction;

export interface ApprovalRecord extends ApprovalRow {
  messageId: string;
  actorId: string;
  actorName: string;
  actorType: string;
  approvedContentRef: string | null;
  approvedPlanRunId: string | null;
  reason: string | null;
}

export interface LockedMessage {
  messageId: string;
  currentStatus: string | null;
  contentHash: string;
  toAddressId: string | null;
  isSimulated: boolean;
  threadId: string;
}

export interface ActorRow {
  actorId: string;
  actorType: string;
  displayName: string;
  isActive: boolean;
}

/**
 * 승인 결정의 읽기 · 쓰기(T-089 U4). 쓰기는 호출자의 트랜잭션(`tx`)으로만 — 승인 행 · 사본 · 상태 전이 · 편의 포인터 ·
 * 감사가 한 단위(T-069 12절 T2 · T3). 상태는 모두 PostgreSQL 에 있다(API 인스턴스 메모리 없음 — LB 뒤 어느 인스턴스든 같다).
 */
@Injectable()
export class ApprovalRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** 메시지 행 잠금(같은 메시지의 결정 · 수정 · 발송 시도를 줄 세운다 — M08 · M12 가드와 같은 행). */
  async lockMessage(tx: DbTransaction, messageId: string): Promise<LockedMessage | null> {
    const rows = await tx
      .select({
        messageId: commMessage.messageId,
        currentStatus: commMessage.currentStatus,
        contentHash: commMessage.contentHash,
        toAddressId: commMessage.toAddressId,
        isSimulated: commMessage.isSimulated,
        threadId: commMessage.threadId,
      })
      .from(commMessage)
      .where(and(eq(commMessage.messageId, messageId), eq(commMessage.direction, 'OUTBOUND'), eq(commMessage.messageKind, 'BUSINESS')))
      .for('update');
    return rows[0] ?? null;
  }

  async listForMessage(messageId: string, reader: Reader = this.db): Promise<ApprovalRecord[]> {
    return this.list(reader, eq(messageApproval.messageId, messageId));
  }

  async listForMessages(messageIds: readonly string[], reader: Reader = this.db): Promise<ApprovalRecord[]> {
    if (messageIds.length === 0) return [];
    return this.list(reader, inArray(messageApproval.messageId, [...messageIds]));
  }

  async findApproval(approvalId: string): Promise<ApprovalRecord | null> {
    return (await this.list(this.db, eq(messageApproval.approvalId, approvalId)))[0] ?? null;
  }

  private async list(reader: Reader, where: SQL | undefined): Promise<ApprovalRecord[]> {
    const rows = await reader
      .select({ a: messageApproval, actorName: actor.displayName, actorType: actor.actorType })
      .from(messageApproval)
      .innerJoin(actor, eq(actor.actorId, messageApproval.actorId))
      .where(where)
      .orderBy(asc(messageApproval.decidedAt), asc(messageApproval.approvalId));
    return rows.map(({ a, actorName, actorType }) => ({
      approvalId: a.approvalId,
      messageId: a.messageId,
      decision: a.decision as ApprovalDecision,
      invalidatesApprovalId: a.invalidatesApprovalId,
      invalidationCause: a.invalidationCause as InvalidationCause | null,
      decidedAt: Instant.fromDb(a.decidedAt),
      expiresAt: a.expiresAt === null ? null : Instant.fromDb(a.expiresAt),
      approvedContentHash: a.approvedContentHash,
      approvedToAddressId: a.approvedToAddressId,
      approvedContentRef: a.approvedContentRef,
      approvedPlanRunId: a.approvedPlanRunId,
      actorId: a.actorId,
      actorName,
      actorType,
      reason: a.reason,
    }));
  }

  async copiesFor(approvalId: string) {
    return this.db
      .select()
      .from(messageApprovalStructuredField)
      .where(eq(messageApprovalStructuredField.approvalId, approvalId))
      .orderBy(asc(messageApprovalStructuredField.fieldKey));
  }

  async insertApproval(tx: DbTransaction, row: ApprovalInsert, copies: ApprovalCopyInsert[]): Promise<void> {
    await tx.insert(messageApproval).values(row);
    if (copies.length > 0) await tx.insert(messageApprovalStructuredField).values(copies);
  }

  /** `comm_message.current_approval_id` — 편의 포인터일 뿐(정본은 승인 표, docs/22 15.5.1). */
  async setCurrentApproval(tx: DbTransaction, messageId: string, approvalId: string | null): Promise<void> {
    await tx.update(commMessage).set({ currentApprovalId: approvalId }).where(eq(commMessage.messageId, messageId));
  }

  async insertTransition(
    tx: DbTransaction,
    t: { id: string; messageId: string; status: 'APPROVED' | 'REJECTED'; actorId: string; at: string; isSimulated: boolean; note: string | null },
  ): Promise<void> {
    await tx.insert(messageStatusTransition).values({
      transitionId: t.id,
      messageId: t.messageId,
      status: t.status,
      occurredAt: t.at,
      actorId: t.actorId,
      note: t.note,
      isSimulated: t.isSimulated,
    });
  }

  /** 이미 나갔거나 나가는 중(성공 · 결과 미기록 · 미확정)인 발송 시도가 있는가 — 있으면 승인을 거둘 수 없다(FR-APV-12). */
  async hasSentOrSending(reader: Reader, messageId: string): Promise<boolean> {
    const rows = await reader
      .select({ id: sendAttempt.sendAttemptId })
      .from(sendAttempt)
      .where(and(eq(sendAttempt.messageId, messageId), or(isNull(sendAttempt.result), inArray(sendAttempt.result, ['SUCCESS', 'UNKNOWN']))))
      .limit(1);
    return rows.length > 0;
  }

  /** 계획 실행 단위 잠금(M12 `fn_cera_lock_plan_run` — 승인 가드와 같은 키). */
  async lockPlanRun(tx: DbTransaction, runId: string): Promise<void> {
    await tx.execute(sql`SELECT cera.fn_cera_lock_plan_run(${runId}::uuid)`);
  }

  /** 이 실행을 대체한 새 실행(`previous_run_id` = 이 실행). 없으면 null. */
  async findSuccessorRun(runId: string, reader: Reader = this.db): Promise<string | null> {
    const rows = await reader.select({ runId: recoveryRun.runId }).from(recoveryRun).where(eq(recoveryRun.previousRunId, runId)).limit(1);
    return rows[0]?.runId ?? null;
  }

  /**
   * 승인된 계획의 후속 문의(T-116)이면 그 판과 지금 상태. 판이 APPROVED 가 아니면(OUTDATED · SUPERSEDED) 이 초안의 값은 더 이상
   * 지금 계획이 아니다 — 승인 · 발송을 막는다(계획 실행 교체와 같은 규칙).
   */
  async findFollowUpPlan(messageId: string, reader: Reader = this.db): Promise<{ planId: string; status: string } | null> {
    const rows = await reader
      .select({ planId: planFollowUp.planId, status: recoveryPlan.planStatus })
      .from(planFollowUp)
      .innerJoin(recoveryPlan, eq(recoveryPlan.planId, planFollowUp.planId))
      .where(eq(planFollowUp.messageId, messageId))
      .limit(1);
    return rows[0] ?? null;
  }

  async findRunPrevious(tx: DbTransaction, runId: string): Promise<{ previousRunId: string | null } | null> {
    const rows = await tx.select({ previousRunId: recoveryRun.previousRunId }).from(recoveryRun).where(eq(recoveryRun.runId, runId)).limit(1);
    return rows[0] ?? null;
  }

  /**
   * T-136: 이 복구 실행에서 **지금 승인된 판이 아닌** 판(OUTDATED · SUPERSEDED 등)에서 나온 후속 요청 메시지의 `APPROVED` 행들.
   * 판이 승인 상태를 잃으면 그 판의 후속 초안 승인은 더는 유효하지 않다 — 이력은 남기고 지금 유효성만 무효화한다.
   */
  async listApprovedForStalePlans(tx: DbTransaction, recoveryRunId: string): Promise<{ approvalId: string; messageId: string }[]> {
    return tx
      .select({ approvalId: messageApproval.approvalId, messageId: messageApproval.messageId })
      .from(messageApproval)
      .innerJoin(planFollowUp, eq(planFollowUp.messageId, messageApproval.messageId))
      .innerJoin(recoveryPlan, eq(recoveryPlan.planId, planFollowUp.planId))
      .where(and(eq(recoveryPlan.caseRunId, recoveryRunId), ne(recoveryPlan.planStatus, 'APPROVED'), eq(messageApproval.decision, 'APPROVED')))
      .orderBy(asc(messageApproval.decidedAt), asc(messageApproval.approvalId));
  }

  /** 이 실행을 근거로 한 `APPROVED` 행들(계획 교체 때 살아 있는 것을 골라 무효화한다). */
  async listApprovedForRun(tx: DbTransaction, runId: string): Promise<{ approvalId: string; messageId: string }[]> {
    return tx
      .select({ approvalId: messageApproval.approvalId, messageId: messageApproval.messageId })
      .from(messageApproval)
      .where(and(eq(messageApproval.approvedPlanRunId, runId), eq(messageApproval.decision, 'APPROVED')))
      .orderBy(asc(messageApproval.decidedAt), asc(messageApproval.approvalId));
  }

  async findActor(actorId: string): Promise<ActorRow | null> {
    const rows = await this.db
      .select({ actorId: actor.actorId, actorType: actor.actorType, displayName: actor.displayName, isActive: actor.isActive })
      .from(actor)
      .where(eq(actor.actorId, actorId))
      .limit(1);
    return rows[0] ?? null;
  }

  async listActiveHumans(): Promise<ActorRow[]> {
    return this.db
      .select({ actorId: actor.actorId, actorType: actor.actorType, displayName: actor.displayName, isActive: actor.isActive })
      .from(actor)
      .where(and(eq(actor.actorType, 'HUMAN'), eq(actor.isActive, true)))
      .orderBy(asc(actor.displayName), asc(actor.actorId));
  }

  /** 같은 스레드의 보내는 메시지(만든 순서) — 수정 사슬(이전 · 다음 revision). */
  async threadMessageIds(threadId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: commMessage.messageId })
      .from(commMessage)
      .where(and(eq(commMessage.threadId, threadId), eq(commMessage.direction, 'OUTBOUND'), eq(commMessage.messageKind, 'BUSINESS')))
      .orderBy(asc(commMessage.createdAt), asc(commMessage.messageId));
    return rows.map((r) => r.id);
  }
}
