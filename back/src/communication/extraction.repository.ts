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
  extractionRetryRequest,
  questionItem,
  rawInput,
  systemError,
} from '../db/schema/index.js';

export type ExtractionInsert = typeof extraction.$inferInsert;
export type RetryRequestRow = typeof extractionRetryRequest.$inferSelect;
export const EXTRACTION_COMPONENT = 'ReplyExtraction';
/** 기술 실패 기록의 operation_name — 자동 시도와 사람이 요청한 시도를 구분한다(T-124) */
export const EXTRACTION_OPERATION = { AUTO: 'extractReply', HUMAN_RETRY: 'extractReplyRetry' } as const;

/** 한 회신의 추출 기록(시간순). 실패 = system_error · 완료 = audit_log(EXTRACTION_*) · 재시도 요청 = extraction_retry_request. */
export interface AttemptLog {
  failures: { at: string; code: string; operation: string; providerCode: string | null; retryable: boolean }[];
  completions: { at: string; action: string }[];
  retries: RetryRequestRow[];
}

/** 사람이 연 재시도가 아직 결과 없이 열려 있다(요청 뒤에 완료 감사도 기술 실패도 없다). `r` = extraction_retry_request 별칭 */
export const OPEN_RETRY = sql`NOT EXISTS (SELECT 1 FROM cera.audit_log a WHERE a.target_type = 'COMM_MESSAGE' AND a.target_id = r.message_id::text AND a.action LIKE 'EXTRACTION\\_%' AND a.occurred_at >= r.requested_at)
  AND NOT EXISTS (SELECT 1 FROM cera.system_error e WHERE e.related_entity_type = 'COMM_MESSAGE' AND e.related_entity_id = r.message_id::text AND e.component_name = ${EXTRACTION_COMPONENT} AND e.occurred_at >= r.requested_at)`;

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
 * 중 아직 추출 기록 · 완료 감사가 없고 기술 실패가 한도 미만인 것(자동), 또는 사람이 연 재시도가 결과 없이 열려 있는 것
 * (T-124 — 요청 하나 = 시도 하나, 자동 한도는 되돌리지 않는다). 작업 표를 새로 만들지 않는다.
 */
@Injectable()
export class ExtractionRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * 자동 시도(T-125): 기술 실패가 한도 미만 · 재시도해도 같은 실패(retryable = false)가 없고 · 마지막 실패에서 간격(`retryDelayMs`)이 지났을 때만.
   * 간격은 저장된 실패 시각으로 센다 — 프로세스 재시작 · Redis 유무와 관계없이 같다. 사람이 연 시도에는 간격이 없다.
   */
  async pendingMessageIds(limit: number, maxAttempts: number, now: string = new Date().toISOString(), backoff: { baseMs: number; maxMs: number } = { baseMs: 0, maxMs: 0 }): Promise<string[]> {
    const autoFailures = sql`(SELECT count(*) FROM cera.system_error e WHERE e.related_entity_type = 'COMM_MESSAGE' AND e.related_entity_id = ${commMessage.messageId}::text AND e.component_name = ${EXTRACTION_COMPONENT})`;
    const rows = await this.db
      .select({ id: commMessage.messageId })
      .from(commMessage)
      .where(
        and(
          eq(commMessage.direction, 'INBOUND'),
          sql`(
            (NOT EXISTS (SELECT 1 FROM cera.extraction x WHERE x.message_id = ${commMessage.messageId})
              AND NOT EXISTS (SELECT 1 FROM cera.audit_log a WHERE a.target_type = 'COMM_MESSAGE' AND a.target_id = ${commMessage.messageId}::text AND a.action LIKE 'EXTRACTION\\_%')
              AND ${autoFailures} < ${maxAttempts}
              AND NOT EXISTS (SELECT 1 FROM cera.system_error e WHERE e.related_entity_type = 'COMM_MESSAGE' AND e.related_entity_id = ${commMessage.messageId}::text AND e.component_name = ${EXTRACTION_COMPONENT} AND e.retryable = false)
              AND coalesce(
                (SELECT max(e.occurred_at) FROM cera.system_error e WHERE e.related_entity_type = 'COMM_MESSAGE' AND e.related_entity_id = ${commMessage.messageId}::text AND e.component_name = ${EXTRACTION_COMPONENT})
                  + make_interval(secs => least(${backoff.baseMs}::float8 * power(3, greatest(${autoFailures} - 1, 0)), ${backoff.maxMs}::float8) / 1000),
                '-infinity'::timestamptz) <= ${now}::timestamptz)
            OR EXISTS (SELECT 1 FROM cera.extraction_retry_request r WHERE r.message_id = ${commMessage.messageId} AND ${OPEN_RETRY})
          )`,
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

  /**
   * 이미 끝났는가. 자동 시도 = 이 회신에 추출 기록 · 완료 감사가 하나라도 있으면. 사람이 연 시도(`since` = 요청 시각) = 그 뒤의 완료 감사가 있으면 —
   * 이전 시도의 추출 행 · 감사는 그대로 두고 새 시도의 결과를 덧붙인다(T-124).
   */
  async hasExtractions(tx: DbTransaction, messageId: string, since: string | null = null): Promise<boolean> {
    if (since === null) {
      const rows = await tx.select({ id: extraction.extractionId }).from(extraction).where(eq(extraction.messageId, messageId)).limit(1);
      if (rows.length > 0) return true;
    }
    const done = await tx
      .select({ id: auditLog.auditId })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.targetType, 'COMM_MESSAGE'),
          eq(auditLog.targetId, messageId),
          like(auditLog.action, 'EXTRACTION\\_%'),
          ...(since === null ? [] : [sql`${auditLog.occurredAt} >= ${since}`]),
        ),
      )
      .limit(1);
    return done.length > 0;
  }

  /** 결과 없이 열려 있는 사람 재시도 요청(있으면 최신 하나). */
  async openRetry(messageId: string, q: Database | DbTransaction = this.db): Promise<RetryRequestRow | null> {
    const open = await q.execute<{ id: string }>(
      sql`SELECT r.retry_request_id AS id FROM cera.extraction_retry_request r WHERE r.message_id = ${messageId} AND ${OPEN_RETRY} ORDER BY r.requested_at DESC LIMIT 1`,
    );
    const id = open.rows[0]?.id;
    if (!id) return null;
    const rows = await q.select().from(extractionRetryRequest).where(eq(extractionRetryRequest.retryRequestId, id)).limit(1);
    return rows[0] ?? null;
  }

  async retryByCommand(actorId: string, commandId: string, q: Database | DbTransaction = this.db): Promise<RetryRequestRow | null> {
    const rows = await q
      .select()
      .from(extractionRetryRequest)
      .where(and(eq(extractionRetryRequest.requestedByActorId, actorId), eq(extractionRetryRequest.commandId, commandId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async insertRetry(tx: DbTransaction, row: typeof extractionRetryRequest.$inferInsert): Promise<void> {
    await tx.insert(extractionRetryRequest).values(row);
  }

  async insert(tx: DbTransaction, rows: ExtractionInsert[]): Promise<void> {
    if (rows.length > 0) await tx.insert(extraction).values(rows);
  }

  async forMessages(messageIds: readonly string[]) {
    if (messageIds.length === 0) return [];
    return this.db.select().from(extraction).where(inArray(extraction.messageId, [...messageIds])).orderBy(asc(extraction.askId), asc(extraction.extractionId));
  }

  /** 회신마다 추출 기록을 시간순으로 — 상태 · 시도 이력 · 재시도 판정이 같은 기록을 본다. */
  async attemptLogs(messageIds: readonly string[], q: Database | DbTransaction = this.db): Promise<Map<string, AttemptLog>> {
    const out = new Map<string, AttemptLog>(messageIds.map((id) => [id, { failures: [], completions: [], retries: [] }]));
    if (messageIds.length === 0) return out;
    const ids = [...messageIds];
    const failures = await q
      .select({ id: systemError.relatedEntityId, at: systemError.occurredAt, code: systemError.errorCode, operation: systemError.operationName, message: systemError.safeErrorMessage, retryable: systemError.retryable })
      .from(systemError)
      .where(and(eq(systemError.relatedEntityType, 'COMM_MESSAGE'), inArray(systemError.relatedEntityId, ids), eq(systemError.componentName, EXTRACTION_COMPONENT)))
      .orderBy(asc(systemError.occurredAt), asc(systemError.errorId));
    for (const f of failures) {
      // 공급자 코드(NO_RECORDING · PROVIDER_NOT_CONFIGURED …)는 기록기가 안전 메시지 괄호 안에 남긴 것뿐이다(원문 · 비밀값 없음)
      const providerCode = /\(([A-Z][A-Z0-9_]{1,59})\)/.exec(f.message)?.[1] ?? null;
      if (f.id) out.get(f.id)?.failures.push({ at: f.at, code: f.code, operation: f.operation, providerCode: providerCode === f.code ? null : providerCode, retryable: f.retryable });
    }
    const completions = await q
      .select({ targetId: auditLog.targetId, at: auditLog.occurredAt, action: auditLog.action })
      .from(auditLog)
      .where(and(eq(auditLog.targetType, 'COMM_MESSAGE'), inArray(auditLog.targetId, ids), like(auditLog.action, 'EXTRACTION\\_%')))
      .orderBy(asc(auditLog.occurredAt), asc(auditLog.auditId));
    for (const c of completions) out.get(c.targetId)?.completions.push({ at: c.at, action: c.action });
    const retries = await q.select().from(extractionRetryRequest).where(inArray(extractionRetryRequest.messageId, ids)).orderBy(asc(extractionRetryRequest.requestedAt));
    for (const r of retries) out.get(r.messageId)?.retries.push(r);
    return out;
  }
}
