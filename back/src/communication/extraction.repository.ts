import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, like, sql } from 'drizzle-orm';
import { DATABASE, type Database, type DbTransaction } from '../db/database.js';
import {
  auditLog,
  commMessage,
  commMessageQuestion,
  commMessageStructuredField,
  commThread,
  counterparty,
  extraction,
  questionItem,
  rawInput,
  systemError,
} from '../db/schema/index.js';

export type ExtractionInsert = typeof extraction.$inferInsert;
export const EXTRACTION_COMPONENT = 'ReplyExtraction';

export interface ExtractionSubject {
  messageId: string;
  threadId: string;
  rawInputId: string;
  sourceName: string;
  rawReceivedAt: string;
  rawSourceRecordedAt: string | null;
  payloadRef: string | null;
  isSimulated: boolean;
  counterpartyName: string;
  questions: { questionItemId: string; askId: string; questionType: string; questionText: string; expectedUnit: string | null }[];
  /** 이 스레드에서 보낸 메시지의 구조화 값(질문을 정한 값). */
  askedValues: Record<string, string | null>;
}

/**
 * 회신 추출(T-092 U7)의 읽기 · 쓰기. 추출할 회신 = 스레드에 붙은 INBOUND 메시지(정상 회신 — 보류는 메시지가 없어 대상이 될 수 없다)
 * 중 아직 추출 기록 · 완료 감사가 없고 기술 실패가 한도 미만인 것. 작업 표를 새로 만들지 않는다.
 */
@Injectable()
export class ExtractionRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async pendingMessageIds(limit: number, maxAttempts: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: commMessage.messageId })
      .from(commMessage)
      .where(
        and(
          eq(commMessage.direction, 'INBOUND'),
          sql`NOT EXISTS (SELECT 1 FROM cera.extraction x WHERE x.message_id = ${commMessage.messageId})`,
          sql`NOT EXISTS (SELECT 1 FROM cera.audit_log a WHERE a.target_type = 'COMM_MESSAGE' AND a.target_id = ${commMessage.messageId}::text AND a.action LIKE 'EXTRACTION\\_%')`,
          sql`(SELECT count(*) FROM cera.system_error e WHERE e.related_entity_type = 'COMM_MESSAGE' AND e.related_entity_id = ${commMessage.messageId}::text AND e.component_name = ${EXTRACTION_COMPONENT}) < ${maxAttempts}`,
        ),
      )
      .orderBy(asc(commMessage.createdAt), asc(commMessage.messageId))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  /** 추출에 필요한 Backend 확정 문맥: 회신 · 원문 · 스레드 상대 · 그 스레드의 질문 · 보낸 값. */
  async subject(messageId: string): Promise<ExtractionSubject | null> {
    const head = (
      await this.db
        .select({
          messageId: commMessage.messageId,
          threadId: commMessage.threadId,
          rawInputId: rawInput.rawInputId,
          sourceName: rawInput.sourceName,
          rawReceivedAt: rawInput.receivedAt,
          rawSourceRecordedAt: rawInput.sourceRecordedAt,
          payloadRef: rawInput.payloadRef,
          isSimulated: rawInput.isSimulated,
          counterpartyName: counterparty.displayName,
        })
        .from(commMessage)
        .innerJoin(rawInput, and(eq(rawInput.sourceName, commMessage.channelType), eq(rawInput.sourceRecordKey, commMessage.externalMessageId)))
        .innerJoin(commThread, eq(commThread.threadId, commMessage.threadId))
        .innerJoin(counterparty, eq(counterparty.counterpartyId, commThread.counterpartyId))
        .where(and(eq(commMessage.messageId, messageId), eq(commMessage.direction, 'INBOUND')))
        .limit(1)
    )[0];
    if (!head) return null;
    const questions = await this.db
      .select({
        questionItemId: questionItem.questionItemId,
        askId: questionItem.askId,
        questionType: questionItem.questionType,
        questionText: questionItem.questionText,
        expectedUnit: questionItem.expectedUnit,
      })
      .from(questionItem)
      .where(eq(questionItem.threadId, head.threadId))
      .orderBy(asc(questionItem.askId));
    // 질문을 실은 가장 최근의 보낸 메시지(발송 완료) — 그 구조화 값이 질문의 날짜 · 시간창이다
    const outbound = await this.db
      .select({ messageId: commMessage.messageId })
      .from(commMessage)
      .innerJoin(commMessageQuestion, eq(commMessageQuestion.messageId, commMessage.messageId))
      .where(and(eq(commMessage.threadId, head.threadId), eq(commMessage.direction, 'OUTBOUND'), sql`${commMessage.sentAt} IS NOT NULL`))
      .orderBy(desc(commMessage.sentAt))
      .limit(1);
    const values: Record<string, string | null> = {};
    if (outbound[0]) {
      const fields = await this.db
        .select({ key: commMessageStructuredField.fieldKey, text: commMessageStructuredField.valueText, num: commMessageStructuredField.valueNumber })
        .from(commMessageStructuredField)
        .where(eq(commMessageStructuredField.messageId, outbound[0].messageId));
      for (const f of fields) values[f.key] = f.text ?? f.num;
    }
    return { ...head, questions, askedValues: values };
  }

  /** 같은 회신의 추출 저장을 줄 세운다(트랜잭션 끝까지). */
  async lockMessage(tx: DbTransaction, messageId: string): Promise<void> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`cera.extraction:${messageId}`}, 0))`);
  }

  async hasExtractions(tx: DbTransaction, messageId: string): Promise<boolean> {
    const rows = await tx.select({ id: extraction.extractionId }).from(extraction).where(eq(extraction.messageId, messageId)).limit(1);
    if (rows.length > 0) return true;
    const done = await tx
      .select({ id: auditLog.auditId })
      .from(auditLog)
      .where(and(eq(auditLog.targetType, 'COMM_MESSAGE'), eq(auditLog.targetId, messageId), like(auditLog.action, 'EXTRACTION\\_%')))
      .limit(1);
    return done.length > 0;
  }

  async insert(tx: DbTransaction, rows: ExtractionInsert[]): Promise<void> {
    if (rows.length > 0) await tx.insert(extraction).values(rows);
  }

  async forMessages(messageIds: readonly string[]) {
    if (messageIds.length === 0) return [];
    return this.db.select().from(extraction).where(inArray(extraction.messageId, [...messageIds])).orderBy(asc(extraction.askId), asc(extraction.extractionId));
  }

  /** 추출 완료 · 건너뜀 감사(후보가 없을 때의 결과 종류). */
  async completions(messageIds: readonly string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (messageIds.length === 0) return out;
    const rows = await this.db
      .select({ targetId: auditLog.targetId, action: auditLog.action })
      .from(auditLog)
      .where(and(eq(auditLog.targetType, 'COMM_MESSAGE'), inArray(auditLog.targetId, [...messageIds]), like(auditLog.action, 'EXTRACTION\\_%')))
      .orderBy(asc(auditLog.occurredAt));
    for (const r of rows) out.set(r.targetId, r.action);
    return out;
  }

  /** 기술 실패(시도 수 · 마지막 코드). */
  async failures(messageIds: readonly string[]): Promise<Map<string, { count: number; lastCode: string }>> {
    const out = new Map<string, { count: number; lastCode: string }>();
    if (messageIds.length === 0) return out;
    const rows = await this.db
      .select({ id: systemError.relatedEntityId, code: systemError.errorCode })
      .from(systemError)
      .where(and(eq(systemError.relatedEntityType, 'COMM_MESSAGE'), inArray(systemError.relatedEntityId, [...messageIds]), eq(systemError.componentName, EXTRACTION_COMPONENT)))
      .orderBy(asc(systemError.occurredAt), asc(systemError.errorId));
    for (const r of rows) if (r.id) out.set(r.id, { count: (out.get(r.id)?.count ?? 0) + 1, lastCode: r.code });
    return out;
  }
}
