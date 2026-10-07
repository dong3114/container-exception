import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { DATABASE, type Database, type DbTransaction } from '../db/database.js';
import { commMessage, commThread, messageStatusTransition, questionItem, commMessageQuestion, sendAttempt } from '../db/schema/index.js';
import { Instant } from '../shared/time/instant.js';
import type { AttemptRow } from './send-rules.js';

type Reader = Database | DbTransaction;

export interface TransitionRow {
  status: string;
  occurredAt: Instant;
  note: string | null;
  actorId: string | null;
}

/**
 * 발송(T-090 U5)의 읽기 · 쓰기. Outbox = `comm_message.current_status = 'QUEUED'`(docs/24 14절 — 별도 표 없음).
 * 쓰기는 호출자의 트랜잭션으로만. 상태는 전부 PostgreSQL 에 있다 — Worker · API 인스턴스 메모리에 업무 상태를 두지 않는다.
 */
@Injectable()
export class SendRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async attempts(messageId: string, reader: Reader = this.db): Promise<AttemptRow[]> {
    const rows = await reader.select().from(sendAttempt).where(eq(sendAttempt.messageId, messageId)).orderBy(asc(sendAttempt.attemptNo));
    return rows.map((r) => ({
      sendAttemptId: r.sendAttemptId,
      attemptNo: r.attemptNo,
      approvalId: r.approvalId,
      startedAt: Instant.fromDb(r.startedAt),
      finishedAt: r.finishedAt === null ? null : Instant.fromDb(r.finishedAt),
      result: r.result as AttemptRow['result'],
      errorCode: r.errorCode,
      errorMessage: r.errorMessage,
      providerMessageId: r.providerMessageId,
    }));
  }

  async transitions(messageId: string): Promise<TransitionRow[]> {
    const rows = await this.db
      .select()
      .from(messageStatusTransition)
      .where(eq(messageStatusTransition.messageId, messageId))
      .orderBy(asc(messageStatusTransition.occurredAt), asc(messageStatusTransition.transitionId));
    return rows.map((r) => ({ status: r.status, occurredAt: Instant.fromDb(r.occurredAt), note: r.note, actorId: r.actorId }));
  }

  /** 발송 대기 중인 메시지 후보(잠그지 않는다 — 실제 픽업은 `claim` 이 `SKIP LOCKED` 로). 부분 인덱스 `ix_comm_message__queued`. */
  async queuedMessageIds(limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: commMessage.messageId })
      .from(commMessage)
      .where(eq(commMessage.currentStatus, 'QUEUED'))
      .orderBy(asc(commMessage.createdAt), asc(commMessage.messageId))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  /**
   * 픽업 잠금(docs/24 14 결정 2): 아직 `QUEUED` 인 그 메시지 행을 `FOR UPDATE SKIP LOCKED`. 다른 워커 · 요청이 잡고 있으면 null —
   * 기다리지 않고 다음 메시지로 간다.
   */
  async claimQueued(tx: DbTransaction, messageId: string): Promise<{ messageId: string; contentHash: string; isSimulated: boolean } | null> {
    const rows = await tx
      .select({ messageId: commMessage.messageId, contentHash: commMessage.contentHash, isSimulated: commMessage.isSimulated })
      .from(commMessage)
      .where(and(eq(commMessage.messageId, messageId), eq(commMessage.currentStatus, 'QUEUED')))
      .for('update', { skipLocked: true });
    return rows[0] ?? null;
  }

  /** 결과 없는 · 미확정 시도(U-7 부분 인덱스가 받친다) 중 `before` 보다 먼저 시작한 것 — 화해 대상. */
  async unresolvedAttempts(before: Instant, limit: number): Promise<{ sendAttemptId: string; messageId: string; result: string | null }[]> {
    return this.db
      .select({ sendAttemptId: sendAttempt.sendAttemptId, messageId: sendAttempt.messageId, result: sendAttempt.result })
      .from(sendAttempt)
      .where(and(or(isNull(sendAttempt.result), eq(sendAttempt.result, 'UNKNOWN')), sql`${sendAttempt.startedAt} <= ${before.toDb()}`))
      .orderBy(asc(sendAttempt.startedAt))
      .limit(limit);
  }

  async lockMessage(tx: DbTransaction, messageId: string): Promise<{ currentStatus: string | null; isSimulated: boolean; threadId: string } | null> {
    const rows = await tx
      .select({ currentStatus: commMessage.currentStatus, isSimulated: commMessage.isSimulated, threadId: commMessage.threadId })
      .from(commMessage)
      .where(eq(commMessage.messageId, messageId))
      .for('update');
    return rows[0] ?? null;
  }

  async insertAttempt(tx: DbTransaction, row: typeof sendAttempt.$inferInsert): Promise<void> {
    await tx.insert(sendAttempt).values(row);
  }

  /** 결과 5열을 한 번(M08 가드가 "한 번 · 화해만"을 강제한다). */
  async recordResult(
    tx: DbTransaction,
    sendAttemptId: string,
    r: { result: AttemptRow['result']; finishedAt?: string; errorCode?: string | null; errorMessage?: string | null; providerMessageId?: string | null },
  ): Promise<void> {
    await tx
      .update(sendAttempt)
      .set({
        result: r.result,
        ...(r.finishedAt === undefined ? {} : { finishedAt: r.finishedAt }),
        errorCode: r.errorCode ?? null,
        errorMessage: r.errorMessage ?? null,
        providerMessageId: r.providerMessageId ?? null,
      })
      .where(eq(sendAttempt.sendAttemptId, sendAttemptId));
  }

  async insertTransition(
    tx: DbTransaction,
    t: { id: string; messageId: string; status: 'QUEUED' | 'SENT' | 'DELIVERY_FAILED' | 'APPROVED'; actorId: string; at: string; isSimulated: boolean; note: string | null; sendAttemptId?: string | null },
  ): Promise<void> {
    await tx.insert(messageStatusTransition).values({
      transitionId: t.id,
      messageId: t.messageId,
      status: t.status,
      occurredAt: t.at,
      actorId: t.actorId,
      sendAttemptId: t.sendAttemptId ?? null,
      note: t.note,
      isSimulated: t.isSimulated,
    });
  }

  /**
   * 첫 성공의 한 번 채움(docs/24 14 결정 4): 메시지 `sent_at` · 스레드 `external_thread_id`(비어 있을 때만) · 스레드 회신 대기 ·
   * 질문 `SENT`. 같은 값 재기록도 하지 않는다(M07 one-time fill 가드).
   */
  async markSent(tx: DbTransaction, m: { messageId: string; threadId: string; sentAt: string; externalThreadId: string | null }): Promise<void> {
    await tx.update(commMessage).set({ sentAt: m.sentAt }).where(and(eq(commMessage.messageId, m.messageId), isNull(commMessage.sentAt)));
    // 화해로 찾은 성공은 외부 스레드 id 를 모를 수 있다 — 모르면 채우지 않는다(추측하지 않는다)
    if (m.externalThreadId) {
      await tx
        .update(commThread)
        .set({ externalThreadId: m.externalThreadId })
        .where(and(eq(commThread.threadId, m.threadId), isNull(commThread.externalThreadId)));
    }
    await tx
      .update(commThread)
      .set({ threadStatus: 'WAITING_REPLY', lastActivityAt: m.sentAt })
      .where(and(eq(commThread.threadId, m.threadId), inArray(commThread.threadStatus, ['OPEN'])));
    const questions = await tx
      .select({ id: commMessageQuestion.questionItemId })
      .from(commMessageQuestion)
      .where(eq(commMessageQuestion.messageId, m.messageId));
    if (questions.length > 0) {
      await tx
        .update(questionItem)
        .set({ questionStatus: 'SENT' })
        .where(and(inArray(questionItem.questionItemId, questions.map((q) => q.id)), eq(questionItem.questionStatus, 'DRAFTED')));
    }
  }

  async threadExternalId(threadId: string): Promise<string | null> {
    const rows = await this.db.select({ id: commThread.externalThreadId }).from(commThread).where(eq(commThread.threadId, threadId)).limit(1);
    return rows[0]?.id ?? null;
  }

  async latestQueuedAt(messageId: string): Promise<Instant | null> {
    const rows = await this.db
      .select({ at: messageStatusTransition.occurredAt })
      .from(messageStatusTransition)
      .where(and(eq(messageStatusTransition.messageId, messageId), eq(messageStatusTransition.status, 'QUEUED')))
      .orderBy(desc(messageStatusTransition.occurredAt))
      .limit(1);
    return rows[0] ? Instant.fromDb(rows[0].at) : null;
  }
}
