import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import { DATABASE, type Database, type DbTransaction } from '../db/database.js';
import {
  actor,
  commMessage,
  commMessageQuestion,
  commMessageStructuredField,
  commThread,
  contactChannelAddress,
  counterparty,
  counterpartyContact,
  facility,
  messageStatusTransition,
  planningSnapshot,
  questionItem,
  recoveryRun,
  truckPool,
} from '../db/schema/index.js';

export type ThreadInsert = typeof commThread.$inferInsert;
export type QuestionInsert = typeof questionItem.$inferInsert;
export type MessageInsert = typeof commMessage.$inferInsert;
export type FieldInsert = typeof commMessageStructuredField.$inferInsert;

export interface RunRow {
  runId: string;
  triggerRef: string | null;
  executedAt: string;
  containsSimulated: boolean;
  scenarioId: string | null;
}

export interface TargetRow {
  id: string;
  name: string;
  /** 시설 종류(WAREHOUSE · ODCY · TERMINAL) 또는 트럭 풀 소유(OWN · PARTNER). */
  kind: string;
  ownerCounterpartyId: string | null;
}

/**
 * 문의 초안의 읽기 · 쓰기(T-088 U3). 쓰기 메서드는 호출자의 트랜잭션(`tx`)으로만 쓴다 — 스레드 · 질문 · 메시지 ·
 * 구조화 값 · 상태 전이가 한 단위로 커밋되거나 함께 사라진다. 상태는 모두 DB 에 있다(API 인스턴스 메모리 없음).
 */
@Injectable()
export class DraftRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findRun(runId: string): Promise<RunRow | null> {
    const rows = await this.db
      .select({
        runId: recoveryRun.runId,
        triggerRef: recoveryRun.triggerRef,
        executedAt: recoveryRun.executedAt,
        containsSimulated: recoveryRun.containsSimulated,
        scenarioId: planningSnapshot.scenarioId,
      })
      .from(recoveryRun)
      .innerJoin(planningSnapshot, eq(planningSnapshot.snapshotId, recoveryRun.snapshotId))
      .where(eq(recoveryRun.runId, runId))
      .limit(1);
    return rows[0] ?? null;
  }

  async listRuns(limit: number): Promise<RunRow[]> {
    return this.db
      .select({
        runId: recoveryRun.runId,
        triggerRef: recoveryRun.triggerRef,
        executedAt: recoveryRun.executedAt,
        containsSimulated: recoveryRun.containsSimulated,
        scenarioId: planningSnapshot.scenarioId,
      })
      .from(recoveryRun)
      .innerJoin(planningSnapshot, eq(planningSnapshot.snapshotId, recoveryRun.snapshotId))
      .orderBy(desc(recoveryRun.executedAt))
      .limit(limit);
  }

  async findFacility(facilityId: string): Promise<TargetRow | null> {
    const rows = await this.db
      .select({ id: facility.facilityId, name: facility.facilityName, kind: facility.facilityType })
      .from(facility)
      .where(and(eq(facility.facilityId, facilityId), eq(facility.isActive, true)))
      .limit(1);
    return rows[0] ? { ...rows[0], ownerCounterpartyId: null } : null;
  }

  async findTruckPool(truckPoolId: string): Promise<TargetRow | null> {
    const rows = await this.db
      .select({ id: truckPool.truckPoolId, name: truckPool.poolName, kind: truckPool.ownership, ownerCounterpartyId: truckPool.ownerCounterpartyId })
      .from(truckPool)
      .where(and(eq(truckPool.truckPoolId, truckPoolId), eq(truckPool.isActive, true)))
      .limit(1);
    return rows[0] ?? null;
  }

  async findOwnedTruckPools(counterpartyId: string): Promise<TargetRow[]> {
    return this.db
      .select({ id: truckPool.truckPoolId, name: truckPool.poolName, kind: truckPool.ownership, ownerCounterpartyId: truckPool.ownerCounterpartyId })
      .from(truckPool)
      .where(and(eq(truckPool.ownerCounterpartyId, counterpartyId), eq(truckPool.isActive, true)));
  }

  /** 상태 전이를 기록할 시스템 행위자(시드 · 운영 준비가 만든다). */
  async findSystemActorId(): Promise<string | null> {
    const rows = await this.db
      .select({ id: actor.actorId })
      .from(actor)
      .where(and(eq(actor.actorType, 'SYSTEM'), eq(actor.isActive, true)))
      .orderBy(asc(actor.actorId))
      .limit(1);
    return rows[0]?.id ?? null;
  }

  async insertThread(tx: DbTransaction, row: ThreadInsert): Promise<void> {
    await tx.insert(commThread).values(row);
  }

  async touchThread(tx: DbTransaction, threadId: string, at: string): Promise<void> {
    await tx.update(commThread).set({ lastActivityAt: at }).where(eq(commThread.threadId, threadId));
  }

  async insertQuestion(tx: DbTransaction, row: QuestionInsert): Promise<void> {
    await tx.insert(questionItem).values(row);
  }

  /**
   * 메시지 + DRAFTED 전이 + 자식(구조화 값 · 질문 연결). 자식은 DRAFTED 인 BUSINESS 메시지에만 붙는다(M08 가드) —
   * 그래서 순서가 메시지 → DRAFTED 전이 → 자식이다.
   */
  async insertDraftMessage(
    tx: DbTransaction,
    message: MessageInsert,
    fields: FieldInsert[],
    questionItemId: string,
    transition: { id: string; actorId: string; at: string },
  ): Promise<void> {
    await tx.insert(commMessage).values(message);
    await this.insertTransition(tx, { id: transition.id, messageId: message.messageId, status: 'DRAFTED', actorId: transition.actorId, at: transition.at, isSimulated: message.isSimulated, note: null });
    if (fields.length > 0) await tx.insert(commMessageStructuredField).values(fields);
    await tx.insert(commMessageQuestion).values({ messageId: message.messageId, questionItemId });
  }

  /** 상태 전이 한 줄. AFTER INSERT 트리거가 `comm_message.current_status` 캐시를 맞춘다(M08). */
  async insertTransition(
    tx: DbTransaction,
    t: { id: string; messageId: string; status: 'DRAFTED' | 'PENDING_APPROVAL' | 'CLOSED'; actorId: string; at: string; isSimulated: boolean; note: string | null },
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

  /** 초안 한 건을 화면 모양으로 모으는 데 필요한 행들. */
  async loadDraft(messageId: string) {
    const rows = await this.db
      .select({
        message: commMessage,
        thread: commThread,
        counterpartyName: counterparty.displayName,
        contactName: counterpartyContact.personName,
        normalizedAddress: contactChannelAddress.normalizedAddress,
      })
      .from(commMessage)
      .innerJoin(commThread, eq(commThread.threadId, commMessage.threadId))
      .innerJoin(counterparty, eq(counterparty.counterpartyId, commThread.counterpartyId))
      .leftJoin(counterpartyContact, eq(counterpartyContact.contactId, commThread.contactId))
      .leftJoin(contactChannelAddress, eq(contactChannelAddress.addressId, commMessage.toAddressId))
      .where(and(eq(commMessage.messageId, messageId), eq(commMessage.direction, 'OUTBOUND'), eq(commMessage.messageKind, 'BUSINESS')))
      .limit(1);
    const head = rows[0];
    if (!head) return null;
    const fields = await this.db
      .select()
      .from(commMessageStructuredField)
      .where(eq(commMessageStructuredField.messageId, messageId))
      .orderBy(asc(commMessageStructuredField.fieldKey));
    const questions = await this.db
      .select({ question: questionItem })
      .from(commMessageQuestion)
      .innerJoin(questionItem, eq(questionItem.questionItemId, commMessageQuestion.questionItemId))
      .where(eq(commMessageQuestion.messageId, messageId));
    return { ...head, fields, questions: questions.map((q) => q.question) };
  }

  async listDraftIds(limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: commMessage.messageId })
      .from(commMessage)
      .where(and(eq(commMessage.direction, 'OUTBOUND'), eq(commMessage.messageKind, 'BUSINESS')))
      .orderBy(desc(commMessage.createdAt), desc(commMessage.messageId))
      .limit(limit);
    return rows.map((r) => r.id);
  }
}
