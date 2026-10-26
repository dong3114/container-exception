import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { DATABASE, type Database, type DbTransaction } from '../db/database.js';
import {
  actor,
  auditLog,
  canonicalFact,
  commMessage,
  commThread,
  conflict,
  counterparty,
  event,
  eventEntityLink,
  eventVerificationTarget,
  extraction,
  facility,
  questionItem,
  rawInput,
  recoveryRun,
  truckPool,
} from '../db/schema/index.js';
import { Instant } from '../shared/time/instant.js';
import type { Authority, Confidence, FactEvent, VerificationEvent } from './reconcile-rules.js';

export type Q = Database | DbTransaction;
export type EventRow = typeof event.$inferSelect;

export interface Coordinate {
  entityType: string;
  entityId: string;
  factKey: string;
  scopeType: string;
  scopeRef: string;
  isSimulated: boolean;
}

export const coordinateKey = (c: Coordinate) => [c.entityType, c.entityId, c.factKey, c.scopeType, c.scopeRef, c.isSimulated ? 'S' : 'R'].join('|');

/** 한 좌표의 사건 + 그 사건을 대상으로 한 확인 사건. `rows` 는 화면 표시용 원본 행(권한 등급 · 출처 · 근거). */
export interface CoordinateData {
  coordinate: Coordinate;
  rows: EventRow[];
  events: FactEvent[];
  verifications: (VerificationEvent & { actorId: string | null; reasonCode: string | null; note: string | null })[];
  scenarioId: string | null;
}

export function toFactEvent(r: EventRow): FactEvent {
  const payload = (r.payload ?? {}) as Record<string, unknown>;
  // 권한은 수신 때 **사실 계열별로** 판정해 사건에 남긴 값만 쓴다. 판정이 없는 사건은 권한 없음(NONE → 강도 0) —
  // 시스템 · 공공데이터 · 파트너 출처라는 이유만으로 강해지지 않는다. 사람(HUMAN_UI) 직접 입력만 운영자 권한 S 를 기본으로 갖는다
  const assessed = payload.authority === 'A' || payload.authority === 'S' || payload.authority === 'W' ? (payload.authority as Authority) : null;
  const authority: Authority = assessed ?? (r.sourceType === 'HUMAN_UI' ? 'S' : 'NONE');
  const evidence = r.sourceEventTime ?? r.sourceRecordedAt ?? r.receivedAt;
  return {
    eventId: r.eventId,
    eventClass: r.eventClass as 'OBSERVATION' | 'CORRECTION',
    supersedesEventId: r.supersedesEventId,
    value: r.valueNumber === null ? null : Number(r.valueNumber),
    unit: r.valueUnit,
    factKind: r.factKind ?? 'STATE',
    validFrom: r.validFrom ? Instant.fromDb(r.validFrom).toIsoUtc() : null,
    validUntil: r.validUntil ? Instant.fromDb(r.validUntil).toIsoUtc() : null,
    sourceType: r.sourceType,
    authority,
    confidence: r.inputConfidenceLevel as Confidence,
    evidenceTime: Instant.fromDb(evidence).toIsoUtc(),
    evidenceTimeQuality: r.sourceEventTime ? 'EVENT_TIME' : r.sourceRecordedAt ? 'RECORDED_TIME' : 'RECEIVED_ONLY',
    receivedAt: Instant.fromDb(r.receivedAt).toIsoUtc(),
  };
}

export interface QuestionTarget {
  questionItemId: string;
  askId: string;
  questionType: string;
  status: string;
  expectedUnit: string | null;
  target: { entityType: string; entityId: string; factKey: string; scopeType: string; scopeRef: string } | null;
}

export interface PromotionContext {
  messageId: string;
  threadId: string;
  rawInputId: string;
  rawSourceType: string;
  rawReceivedAt: string;
  rawSourceRecordedAt: string | null;
  isSimulated: boolean;
  scenarioId: string | null;
  counterpartyId: string;
  counterpartyRole: string;
  planSuperseded: boolean;
  questions: QuestionTarget[];
  extractions: (typeof extraction.$inferSelect)[];
}

/** 사실 판정에 필요한 읽기 · 파생 표(canonical_fact · conflict) 쓰기. 사건 쓰기는 서비스가 한다(트랜잭션 경계). */
@Injectable()
export class TruthRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** 같은 좌표의 판정 · 쓰기를 줄 세운다(트랜잭션 끝까지). */
  async lockCoordinate(tx: DbTransaction, c: Coordinate): Promise<void> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`cera.fact:${coordinateKey(c)}`}, 0))`);
  }

  async findSystemActorId(q: Q = this.db): Promise<string | null> {
    const rows = await q.select({ id: actor.actorId }).from(actor).where(and(eq(actor.actorType, 'SYSTEM'), eq(actor.isActive, true))).orderBy(asc(actor.actorId)).limit(1);
    return rows[0]?.id ?? null;
  }

  async activeHuman(actorId: string, q: Q = this.db): Promise<{ actorId: string; displayName: string } | null> {
    const rows = await q
      .select({ actorId: actor.actorId, displayName: actor.displayName })
      .from(actor)
      .where(and(eq(actor.actorId, actorId), eq(actor.actorType, 'HUMAN'), eq(actor.isActive, true)))
      .limit(1);
    return rows[0] ?? null;
  }

  /** 좌표 하나의 사건 · 확인. */
  async coordinateData(c: Coordinate, q: Q = this.db): Promise<CoordinateData> {
    const rows = await q
      .select({ e: event })
      .from(event)
      .innerJoin(eventEntityLink, and(eq(eventEntityLink.eventId, event.eventId), eq(eventEntityLink.linkRole, 'SUBJECT')))
      .where(
        and(
          eq(eventEntityLink.entityType, c.entityType),
          eq(eventEntityLink.entityId, c.entityId),
          eq(event.factKey, c.factKey),
          eq(event.applicabilityScopeType, c.scopeType),
          eq(event.applicabilityScopeRef, c.scopeRef),
          eq(event.isSimulated, c.isSimulated),
          inArray(event.eventClass, ['OBSERVATION', 'CORRECTION']),
        ),
      )
      .orderBy(asc(event.receivedAt), asc(event.eventId));
    return this.assemble(c, rows.map((r) => r.e), q);
  }

  /** 개체들의 모든 좌표(사실 키 무관). 시뮬레이션이면 같은 시나리오의 사건만. */
  async subjectData(subjectIds: readonly string[], sim: { isSimulated: boolean; scenarioId: string | null }, q: Q = this.db): Promise<CoordinateData[]> {
    if (subjectIds.length === 0) return [];
    const rows = await q
      .select({ e: event, entityType: eventEntityLink.entityType, entityId: eventEntityLink.entityId })
      .from(event)
      .innerJoin(eventEntityLink, and(eq(eventEntityLink.eventId, event.eventId), eq(eventEntityLink.linkRole, 'SUBJECT')))
      .where(and(inArray(eventEntityLink.entityId, [...subjectIds]), eq(event.isSimulated, sim.isSimulated), inArray(event.eventClass, ['OBSERVATION', 'CORRECTION'])))
      .orderBy(asc(event.receivedAt), asc(event.eventId));
    const groups = new Map<string, { c: Coordinate; rows: EventRow[] }>();
    for (const r of rows) {
      if (!r.e.factKey) continue;
      if (sim.isSimulated && r.e.scenarioId !== sim.scenarioId) continue;
      const c: Coordinate = { entityType: r.entityType, entityId: r.entityId, factKey: r.e.factKey, scopeType: r.e.applicabilityScopeType, scopeRef: r.e.applicabilityScopeRef, isSimulated: r.e.isSimulated };
      const g = groups.get(coordinateKey(c)) ?? { c, rows: [] };
      g.rows.push(r.e);
      groups.set(coordinateKey(c), g);
    }
    const out: CoordinateData[] = [];
    for (const g of groups.values()) out.push(await this.assemble(g.c, g.rows, q));
    return out;
  }

  private async assemble(c: Coordinate, rows: EventRow[], q: Q): Promise<CoordinateData> {
    const verifications: CoordinateData['verifications'] = [];
    if (rows.length > 0) {
      const found = await q
        .select({ v: event, targetId: eventVerificationTarget.targetEventId })
        .from(eventVerificationTarget)
        .innerJoin(event, eq(event.eventId, eventVerificationTarget.verificationEventId))
        .where(and(inArray(eventVerificationTarget.targetEventId, rows.map((r) => r.eventId)), eq(eventVerificationTarget.targetRole, 'TARGET'), eq(event.eventClass, 'VERIFICATION')))
        .orderBy(asc(event.receivedAt), asc(event.eventId));
      const byId = new Map<string, (typeof verifications)[number]>();
      for (const f of found) {
        const existing = byId.get(f.v.eventId);
        if (existing) {
          (existing.targetEventIds as string[]).push(f.targetId);
          continue;
        }
        const p = (f.v.payload ?? {}) as Record<string, unknown>;
        byId.set(f.v.eventId, {
          eventId: f.v.eventId,
          action: f.v.verificationAction as VerificationEvent['action'],
          targetEventIds: [f.targetId],
          receivedAt: Instant.fromDb(f.v.receivedAt).toIsoUtc(),
          actorId: f.v.enteredByActorId,
          reasonCode: typeof p.reason_code === 'string' ? p.reason_code : null,
          note: typeof p.note === 'string' ? p.note : null,
        });
      }
      verifications.push(...byId.values());
    }
    return { coordinate: c, rows, events: rows.map(toFactEvent), verifications, scenarioId: rows[0]?.scenarioId ?? null };
  }

  async eventById(eventId: string, q: Q = this.db): Promise<(EventRow & { subjectType: string; subjectId: string }) | null> {
    const rows = await q
      .select({ e: event, subjectType: eventEntityLink.entityType, subjectId: eventEntityLink.entityId })
      .from(event)
      .innerJoin(eventEntityLink, and(eq(eventEntityLink.eventId, event.eventId), eq(eventEntityLink.linkRole, 'SUBJECT')))
      .where(eq(event.eventId, eventId))
      .limit(1);
    const r = rows[0];
    return r ? { ...r.e, subjectType: r.subjectType, subjectId: r.subjectId } : null;
  }

  // ── 파생 표(재생성 가능) ──
  async upsertCanonicalFact(tx: DbTransaction, row: typeof canonicalFact.$inferInsert): Promise<void> {
    await tx
      .insert(canonicalFact)
      .values(row)
      .onConflictDoUpdate({
        target: [canonicalFact.entityType, canonicalFact.entityId, canonicalFact.factKey, canonicalFact.applicabilityScopeType, canonicalFact.applicabilityScopeRef, canonicalFact.isSimulated],
        set: { ...row },
      });
  }

  async deleteCanonicalFact(tx: DbTransaction, c: Coordinate): Promise<void> {
    await tx
      .delete(canonicalFact)
      .where(and(eq(canonicalFact.entityType, c.entityType), eq(canonicalFact.entityId, c.entityId), eq(canonicalFact.factKey, c.factKey), eq(canonicalFact.applicabilityScopeType, c.scopeType), eq(canonicalFact.applicabilityScopeRef, c.scopeRef), eq(canonicalFact.isSimulated, c.isSimulated)));
  }

  async replaceConflicts(tx: DbTransaction, c: Coordinate, rows: (typeof conflict.$inferInsert)[]): Promise<void> {
    await tx
      .delete(conflict)
      .where(and(eq(conflict.entityType, c.entityType), eq(conflict.entityId, c.entityId), eq(conflict.factKey, c.factKey), eq(conflict.applicabilityScopeType, c.scopeType), eq(conflict.applicabilityScopeRef, c.scopeRef), eq(conflict.isSimulated, c.isSimulated)));
    if (rows.length > 0) await tx.insert(conflict).values(rows);
  }

  async canonicalFacts(subjectIds: readonly string[], q: Q = this.db) {
    if (subjectIds.length === 0) return [];
    return q.select().from(canonicalFact).where(inArray(canonicalFact.entityId, [...subjectIds]));
  }

  // ── 사건 쓰기(append-only — 수정 · 삭제 메서드 없음) ──
  /** `ON CONFLICT (idempotency_key) DO NOTHING` — 이미 있으면 false. */
  async insertEvent(tx: DbTransaction, row: typeof event.$inferInsert): Promise<boolean> {
    const inserted = await tx.insert(event).values(row).onConflictDoNothing({ target: event.idempotencyKey }).returning({ id: event.eventId });
    return inserted.length > 0;
  }

  async eventIdByKey(tx: Q, idempotencyKey: string): Promise<string | null> {
    const rows = await tx.select({ id: event.eventId }).from(event).where(eq(event.idempotencyKey, idempotencyKey)).limit(1);
    return rows[0]?.id ?? null;
  }

  async insertLinks(tx: DbTransaction, rows: (typeof eventEntityLink.$inferInsert)[]): Promise<void> {
    if (rows.length > 0) await tx.insert(eventEntityLink).values(rows);
  }

  async insertVerificationTargets(tx: DbTransaction, rows: (typeof eventVerificationTarget.$inferInsert)[]): Promise<void> {
    if (rows.length > 0) await tx.insert(eventVerificationTarget).values(rows);
  }

  /** PENDING 후보를 사건에 잇는다(한 번 전이 — 가드 트리거). */
  async acceptExtractions(tx: DbTransaction, ids: readonly string[], eventId: string, actorId: string, at: string): Promise<void> {
    if (ids.length === 0) return;
    await tx
      .update(extraction)
      .set({ reviewStatus: 'ACCEPTED', reviewedByActorId: actorId, reviewedAt: at, createdEventId: eventId })
      .where(and(inArray(extraction.extractionId, [...ids]), eq(extraction.reviewStatus, 'PENDING')));
  }

  // ── 승격 문맥(트랜잭션 안) ──
  async promotionContext(tx: Q, messageId: string): Promise<PromotionContext | null> {
    const head = (
      await tx
        .select({
          messageId: commMessage.messageId,
          threadId: commMessage.threadId,
          rawInputId: rawInput.rawInputId,
          rawSourceType: rawInput.sourceType,
          rawReceivedAt: rawInput.receivedAt,
          rawSourceRecordedAt: rawInput.sourceRecordedAt,
          isSimulated: commThread.isSimulated,
          scenarioId: commThread.scenarioId,
          counterpartyId: commThread.counterpartyId,
          counterpartyRole: counterparty.sourceRole,
          relatedRunId: commThread.relatedRunId,
        })
        .from(commMessage)
        .innerJoin(rawInput, and(eq(rawInput.sourceName, commMessage.channelType), eq(rawInput.sourceRecordKey, commMessage.externalMessageId)))
        .innerJoin(commThread, eq(commThread.threadId, commMessage.threadId))
        .innerJoin(counterparty, eq(counterparty.counterpartyId, commThread.counterpartyId))
        .where(and(eq(commMessage.messageId, messageId), eq(commMessage.direction, 'INBOUND')))
        .limit(1)
    )[0];
    if (!head) return null;
    const successor = head.relatedRunId ? (await tx.select({ id: recoveryRun.runId }).from(recoveryRun).where(eq(recoveryRun.previousRunId, head.relatedRunId)).limit(1))[0] : undefined;
    const qs = await tx
      .select({
        questionItemId: questionItem.questionItemId,
        askId: questionItem.askId,
        questionType: questionItem.questionType,
        status: questionItem.questionStatus,
        expectedUnit: questionItem.expectedUnit,
        entityType: questionItem.targetEntityType,
        entityId: questionItem.targetEntityId,
        factKey: questionItem.targetFactKey,
        scopeType: questionItem.targetApplicabilityScopeType,
        scopeRef: questionItem.targetApplicabilityScopeRef,
      })
      .from(questionItem)
      .where(eq(questionItem.threadId, head.threadId))
      .orderBy(asc(questionItem.askId));
    const extractions = await tx.select().from(extraction).where(eq(extraction.messageId, messageId)).orderBy(asc(extraction.askId), asc(extraction.extractionId));
    return {
      messageId: head.messageId,
      threadId: head.threadId,
      rawInputId: head.rawInputId,
      rawSourceType: head.rawSourceType,
      rawReceivedAt: head.rawReceivedAt,
      rawSourceRecordedAt: head.rawSourceRecordedAt,
      isSimulated: head.isSimulated,
      scenarioId: head.scenarioId,
      counterpartyId: head.counterpartyId,
      counterpartyRole: head.counterpartyRole,
      planSuperseded: Boolean(successor),
      questions: qs.map((x) => ({
        questionItemId: x.questionItemId,
        askId: x.askId,
        questionType: x.questionType,
        status: x.status,
        expectedUnit: x.expectedUnit,
        target: x.entityType && x.entityId && x.factKey && x.scopeType !== null && x.scopeRef !== null ? { entityType: x.entityType, entityId: x.entityId, factKey: x.factKey, scopeType: x.scopeType, scopeRef: x.scopeRef } : null,
      })),
      extractions,
    };
  }

  /** 질문 대상 개체의 종류 · 소유(권한 판정 재료). */
  async entityFacts(tx: Q, entityType: string, entityId: string): Promise<{ type: string; facilityType: string | null; ownerCounterpartyId: string | null; name: string } | null> {
    if (entityType === 'FACILITY') {
      const r = (await tx.select({ t: facility.facilityType, n: facility.facilityName }).from(facility).where(eq(facility.facilityId, entityId)).limit(1))[0];
      return r ? { type: 'FACILITY', facilityType: r.t, ownerCounterpartyId: null, name: r.n } : null;
    }
    if (entityType === 'TRUCK_POOL') {
      const r = (await tx.select({ o: truckPool.ownerCounterpartyId, n: truckPool.poolName }).from(truckPool).where(eq(truckPool.truckPoolId, entityId)).limit(1))[0];
      return r ? { type: 'TRUCK_POOL', facilityType: null, ownerCounterpartyId: r.o, name: r.n } : null;
    }
    return null;
  }

  async entityNames(ids: readonly string[], q: Q = this.db): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (ids.length === 0) return out;
    for (const r of await q.select({ id: facility.facilityId, n: facility.facilityName }).from(facility).where(inArray(facility.facilityId, [...ids]))) out.set(r.id, r.n);
    for (const r of await q.select({ id: truckPool.truckPoolId, n: truckPool.poolName }).from(truckPool).where(inArray(truckPool.truckPoolId, [...ids]))) out.set(r.id, r.n);
    return out;
  }

  /** 승격이 막힌 후보의 사유(감사 행동 `FACT_PROMOTION_BLOCKED_<사유>`, 대상 = 추출 id). */
  async blockedReasons(extractionIds: readonly string[], q: Q = this.db): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (extractionIds.length === 0) return out;
    const rows = await q
      .select({ id: auditLog.targetId, action: auditLog.action })
      .from(auditLog)
      .where(and(eq(auditLog.targetType, 'EXTRACTION'), inArray(auditLog.targetId, [...extractionIds]), sql`${auditLog.action} LIKE 'FACT\\_PROMOTION\\_BLOCKED\\_%'`))
      .orderBy(asc(auditLog.occurredAt));
    for (const r of rows) out.set(r.id, [...(out.get(r.id) ?? []), r.action.replace('FACT_PROMOTION_BLOCKED_', '')]);
    return out;
  }

  /** 이 계획 실행의 스레드가 물은 좌표들(화면: 이 실행의 사실 목록). */
  async runCoordinates(recoveryRunId: string, q: Q = this.db): Promise<Coordinate[]> {
    const rows = await q
      .select({
        entityType: questionItem.targetEntityType,
        entityId: questionItem.targetEntityId,
        factKey: questionItem.targetFactKey,
        scopeType: questionItem.targetApplicabilityScopeType,
        scopeRef: questionItem.targetApplicabilityScopeRef,
        isSimulated: questionItem.isSimulated,
      })
      .from(questionItem)
      .innerJoin(commThread, eq(commThread.threadId, questionItem.threadId))
      .where(eq(commThread.relatedRunId, recoveryRunId))
      .orderBy(desc(questionItem.questionItemId));
    return rows
      .filter((r) => r.entityType && r.entityId && r.factKey && r.scopeType !== null && r.scopeRef !== null)
      .map((r) => ({ entityType: r.entityType as string, entityId: r.entityId as string, factKey: r.factKey as string, scopeType: r.scopeType as string, scopeRef: r.scopeRef as string, isSimulated: r.isSimulated }));
  }

  /** 메시지(보낸 문의)의 질문 좌표들 — Agent 가 기다리는 사실. */
  async messageCoordinates(outboundMessageId: string, q: Q = this.db): Promise<Coordinate[]> {
    const rows = await q
      .select({
        entityType: questionItem.targetEntityType,
        entityId: questionItem.targetEntityId,
        factKey: questionItem.targetFactKey,
        scopeType: questionItem.targetApplicabilityScopeType,
        scopeRef: questionItem.targetApplicabilityScopeRef,
        isSimulated: questionItem.isSimulated,
      })
      .from(questionItem)
      .innerJoin(commThread, eq(commThread.threadId, questionItem.threadId))
      .innerJoin(commMessage, eq(commMessage.threadId, commThread.threadId))
      .where(eq(commMessage.messageId, outboundMessageId));
    return rows
      .filter((r) => r.entityType && r.entityId && r.factKey && r.scopeType !== null && r.scopeRef !== null)
      .map((r) => ({ entityType: r.entityType as string, entityId: r.entityId as string, factKey: r.factKey as string, scopeType: r.scopeType as string, scopeRef: r.scopeRef as string, isSimulated: r.isSimulated }));
  }

  /** 사건이 만든 추출(화면: 근거 인용 · 모델 출처). */
  async extractionsByIds(ids: readonly string[], q: Q = this.db) {
    if (ids.length === 0) return [];
    return q.select().from(extraction).where(inArray(extraction.extractionId, [...ids]));
  }
}
