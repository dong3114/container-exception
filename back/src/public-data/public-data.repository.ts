import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { DATABASE, type Database, type DbTransaction } from '../db/database.js';
import {
  actor,
  bl,
  container,
  containerBl,
  event,
  eventEntityLink,
  externalIdentifier,
  publicDataFetch,
  rawInput,
  scenario,
  vesselCall,
} from '../db/schema/index.js';
import { eventIdempotencyKey } from '../persistence/event-writer.js';
import type { Sha256Hash } from '../shared/hash/hash.js';
import type { FetchOutcome, PublicDataDataset, PublicDataMode } from './contracts.js';

/** 녹화 재생 사건이 속하는 시나리오(사건 S-2: 시뮬레이션 ⇔ scenario_id). 고정 UUIDv7 */
export const PUBLIC_DATA_REPLAY_SCENARIO_ID = '019a0b6e-5f00-7102-8000-000000000102';

export interface FetchRow {
  fetchId: string;
  dataset: PublicDataDataset;
  operation: string;
  requestParams: Record<string, string>;
  pageNo: number;
  mode: PublicDataMode;
  requestedAt: string;
  receivedAt: string | null;
  httpStatus: number | null;
  resultCode: string | null;
  outcome: FetchOutcome;
  totalCount: number | null;
  itemCount: number | null;
  rawInputId: string | null;
  requestedByActorId: string;
  traceId: string | null;
  isSimulated: boolean;
}

export interface RawRow {
  rawInputId: string;
  sourceName: string;
  requestRef: string;
  payloadRef: string;
  payloadHash: Sha256Hash;
  sourceRecordKey: string;
  receivedAt: string;
  collectedByActorId: string;
  isSimulated: boolean;
}

export interface PublicEvent {
  eventId: string;
  rawInputId: string;
  claimLocator: string;
  eventType: string;
  factKind: 'MILESTONE' | 'FORECAST' | 'STATE' | 'IDENTITY';
  factKey: string;
  valueText?: string | null;
  valueTimestamp?: string | null;
  valueCode?: string | null;
  sourceEventTime: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceReasons: string[];
  payload: Record<string, unknown>;
  subject: { entityType: 'VESSEL_CALL' | 'CONTAINER' | 'BL'; entityId: string };
  context?: { entityType: 'VESSEL_CALL' | 'CONTAINER' | 'BL'; entityId: string } | null;
  receivedAt: string;
  recordedAt: string;
  isSimulated: boolean;
}

export type Upserted = { id: string; created: boolean } | { id: null; conflict: 'SIMULATION_MISMATCH' };

/**
 * 공공데이터 영속 — 호출 원장 · 원문 · 개체 · PUBLIC_API 사건. 쓰기는 모두 호출자의 트랜잭션 `tx` 안에서 돈다.
 * 개체는 식별 정보만 쓰고(존재하면 그대로), 시각 · 선석 · 규격 같은 사실은 사건으로 남긴다.
 */
@Injectable()
export class PublicDataRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findActor(actorId: string): Promise<{ actorType: string; isActive: boolean } | null> {
    const rows = await this.db.select({ actorType: actor.actorType, isActive: actor.isActive }).from(actor).where(eq(actor.actorId, actorId)).limit(1);
    return rows[0] ?? null;
  }

  async ensureReplayScenario(tx: DbTransaction, at: string): Promise<void> {
    await tx
      .insert(scenario)
      .values({
        scenarioId: PUBLIC_DATA_REPLAY_SCENARIO_ID,
        scenarioName: 'public-data-replay',
        description: 'Public data replay fixtures (synthetic / masked — not live public API responses)',
        dataPackRef: 'data/fixtures/public-data',
        asOfBase: at,
        createdAt: at,
      })
      .onConflictDoNothing();
  }

  async insertRawInput(tx: DbTransaction, r: RawRow): Promise<void> {
    await tx.insert(rawInput).values({
      rawInputId: r.rawInputId,
      sourceType: 'PUBLIC_API',
      sourceName: r.sourceName,
      requestRef: r.requestRef,
      payloadRef: r.payloadRef,
      payloadHash: r.payloadHash,
      sourceRecordKey: r.sourceRecordKey,
      receivedAt: r.receivedAt,
      collectedByActorId: r.collectedByActorId,
      isSimulated: r.isSimulated,
    });
  }

  async insertFetch(tx: DbTransaction | Database, f: FetchRow): Promise<void> {
    await tx.insert(publicDataFetch).values({ ...f, provider: 'DATA_GO_KR' });
  }

  /** 입항 건: 키가 같으면 같은 행. 선명이 새로 왔으면 채운다. 실제 ↔ 시뮬레이션이 섞이면 쓰지 않는다. */
  async upsertVesselCall(
    tx: DbTransaction,
    v: { id: string; portAuthorityCode: string; callYear: number; callSeq: number; callSign: string; vesselName: string | null; rawInputId: string; isSimulated: boolean; at: string },
  ): Promise<Upserted> {
    const inserted = await tx
      .insert(vesselCall)
      .values({
        vesselCallId: v.id,
        portAuthorityCode: v.portAuthorityCode,
        callYear: v.callYear,
        callSeq: v.callSeq,
        callSign: v.callSign,
        vesselName: v.vesselName,
        firstRawInputId: v.rawInputId,
        isSimulated: v.isSimulated,
        registeredAt: v.at,
      })
      .onConflictDoNothing()
      .returning({ id: vesselCall.vesselCallId });
    if (inserted[0]) return { id: inserted[0].id, created: true };
    const [existing] = await tx
      .select({ id: vesselCall.vesselCallId, isSimulated: vesselCall.isSimulated, vesselName: vesselCall.vesselName })
      .from(vesselCall)
      .where(
        and(
          eq(vesselCall.portAuthorityCode, v.portAuthorityCode),
          eq(vesselCall.callYear, v.callYear),
          eq(vesselCall.callSeq, v.callSeq),
          eq(vesselCall.callSign, v.callSign),
        ),
      )
      .for('update');
    if (!existing) throw new Error('vessel_call conflict without a row');
    if (existing.isSimulated !== v.isSimulated) return { id: null, conflict: 'SIMULATION_MISMATCH' };
    if (v.vesselName && existing.vesselName !== v.vesselName) {
      await tx.update(vesselCall).set({ vesselName: v.vesselName }).where(eq(vesselCall.vesselCallId, existing.id));
    }
    return { id: existing.id, created: false };
  }

  /** B/L: (종류, 번호, 연도) 가 같으면 같은 행. DS-02 는 종류 UNKNOWN · 연도 없음. */
  async upsertBl(tx: DbTransaction, b: { id: string; blNo: string; rawInputId: string; isSimulated: boolean; at: string }): Promise<Upserted> {
    const inserted = await tx
      .insert(bl)
      .values({ blId: b.id, blNo: b.blNo, blType: 'UNKNOWN', blYear: null, firstRawInputId: b.rawInputId, isSimulated: b.isSimulated, registeredAt: b.at })
      .onConflictDoNothing()
      .returning({ id: bl.blId });
    if (inserted[0]) return { id: inserted[0].id, created: true };
    const [existing] = await tx
      .select({ id: bl.blId, isSimulated: bl.isSimulated })
      .from(bl)
      .where(and(eq(bl.blType, 'UNKNOWN'), eq(bl.blNo, b.blNo), sql`${bl.blYear} IS NULL`));
    if (!existing) throw new Error('bl conflict without a row');
    return existing.isSimulated === b.isSimulated ? { id: existing.id, created: false } : { id: null, conflict: 'SIMULATION_MISMATCH' };
  }

  /**
   * 컨테이너: 번호가 같으면 같은 행. 처음이면 이 입항 건 · 규격으로 등록한다.
   * 이미 있으면 비어 있는 칸(규격 · 입항 건)만 채운다 — 다른 입항 건에 이미 걸려 있으면 바꾸지 않고 알린다(이력은 사건에 있다).
   */
  async upsertContainer(
    tx: DbTransaction,
    c: { id: string; containerNo: string; sizeType: string | null; vesselCallId: string; rawInputId: string; isSimulated: boolean; at: string },
  ): Promise<Upserted & { otherVesselCall?: boolean }> {
    const inserted = await tx
      .insert(container)
      .values({
        containerId: c.id,
        containerNo: c.containerNo,
        sizeType: c.sizeType,
        vesselCallId: c.vesselCallId,
        firstRawInputId: c.rawInputId,
        isSimulated: c.isSimulated,
        registeredAt: c.at,
      })
      .onConflictDoNothing()
      .returning({ id: container.containerId });
    if (inserted[0]) return { id: inserted[0].id, created: true };
    const [existing] = await tx
      .select({ id: container.containerId, isSimulated: container.isSimulated, sizeType: container.sizeType, vesselCallId: container.vesselCallId })
      .from(container)
      .where(eq(container.containerNo, c.containerNo))
      .for('update');
    if (!existing) throw new Error('container conflict without a row');
    if (existing.isSimulated !== c.isSimulated) return { id: null, conflict: 'SIMULATION_MISMATCH' };
    const patch: { sizeType?: string; vesselCallId?: string } = {};
    if (!existing.sizeType && c.sizeType) patch.sizeType = c.sizeType;
    if (!existing.vesselCallId) patch.vesselCallId = c.vesselCallId;
    if (Object.keys(patch).length > 0) await tx.update(container).set(patch).where(eq(container.containerId, existing.id));
    return { id: existing.id, created: false, otherVesselCall: Boolean(existing.vesselCallId && existing.vesselCallId !== c.vesselCallId) };
  }

  /** PRIMARY 연결이 없으면 만든다. 다른 B/L 이 PRIMARY 면 그대로 두고 false. */
  async linkContainerBl(tx: DbTransaction, containerId: string, blId: string): Promise<'LINKED' | 'ALREADY' | 'OTHER_PRIMARY'> {
    const [primary] = await tx
      .select({ blId: containerBl.blId })
      .from(containerBl)
      .where(and(eq(containerBl.containerId, containerId), eq(containerBl.linkRole, 'PRIMARY')));
    if (primary) return primary.blId === blId ? 'ALREADY' : 'OTHER_PRIMARY';
    const inserted = await tx.insert(containerBl).values({ containerId, blId, linkRole: 'PRIMARY' }).onConflictDoNothing().returning({ id: containerBl.containerId });
    return inserted.length > 0 ? 'LINKED' : 'ALREADY';
  }

  /** 외부 식별자(적하목록관리번호 · MSN). 이미 같은 값이면 그대로, 다른 소유자면 'OTHER_OWNER'. */
  async insertExternalIdentifier(
    tx: DbTransaction,
    e: { id: string; ownerType: 'BL' | 'CONTAINER' | 'VESSEL_CALL'; ownerId: string; idType: 'MANIFEST_NO' | 'MSN'; idValue: string; rawInputId: string; isSimulated: boolean },
  ): Promise<'INSERTED' | 'ALREADY' | 'OTHER_OWNER'> {
    const inserted = await tx
      .insert(externalIdentifier)
      .values({
        externalIdentifierId: e.id,
        ownerType: e.ownerType,
        ownerId: e.ownerId,
        issuingSystem: 'MOF',
        idType: e.idType,
        idValue: e.idValue,
        sourceRawInputId: e.rawInputId,
        isSimulated: e.isSimulated,
      })
      .onConflictDoNothing()
      .returning({ id: externalIdentifier.externalIdentifierId });
    if (inserted.length > 0) return 'INSERTED';
    const [existing] = await tx
      .select({ ownerType: externalIdentifier.ownerType, ownerId: externalIdentifier.ownerId })
      .from(externalIdentifier)
      .where(and(eq(externalIdentifier.issuingSystem, 'MOF'), eq(externalIdentifier.idType, e.idType), eq(externalIdentifier.idValue, e.idValue)));
    return existing && existing.ownerType === e.ownerType && existing.ownerId === e.ownerId ? 'ALREADY' : 'OTHER_OWNER';
  }

  /** PUBLIC_API 관측 사건 + SUBJECT(+ CONTEXT) 링크. 같은 원문 · 같은 주장 위치는 한 번만(evk/1). */
  async insertEvent(tx: DbTransaction, e: PublicEvent): Promise<string | null> {
    const idempotencyKey = eventIdempotencyKey({
      rawInputId: e.rawInputId,
      claimLocator: e.claimLocator,
      subject: e.subject,
      factKey: e.factKey,
      targets: null,
      scope: { type: 'GLOBAL', ref: '' },
      eventClass: 'OBSERVATION',
    });
    const inserted = await tx
      .insert(event)
      .values({
        eventId: e.eventId,
        schemaVersion: 'ev-1',
        rawInputId: e.rawInputId,
        eventClass: 'OBSERVATION',
        eventType: e.eventType,
        factKind: e.factKind,
        factKey: e.factKey,
        valueText: e.valueText ?? null,
        valueTimestamp: e.valueTimestamp ?? null,
        valueCode: e.valueCode ?? null,
        sourceEventTime: e.sourceEventTime,
        receivedAt: e.receivedAt,
        sourceType: 'PUBLIC_API',
        extractionMethod: 'RULE_PARSED',
        inputQuality: 'STRUCTURED',
        inputConfidenceLevel: e.confidence,
        inputConfidenceReasons: e.confidenceReasons,
        idempotencyKey,
        payload: { claim_locator: e.claimLocator, ...e.payload },
        recordedAt: e.recordedAt,
        isSimulated: e.isSimulated,
        scenarioId: e.isSimulated ? PUBLIC_DATA_REPLAY_SCENARIO_ID : null,
      })
      .onConflictDoNothing({ target: event.idempotencyKey })
      .returning({ id: event.eventId });
    if (inserted.length === 0) return null;
    await tx.insert(eventEntityLink).values({ eventId: e.eventId, entityType: e.subject.entityType, entityId: e.subject.entityId, linkRole: 'SUBJECT' });
    if (e.context) {
      await tx.insert(eventEntityLink).values({ eventId: e.eventId, entityType: e.context.entityType, entityId: e.context.entityId, linkRole: 'CONTEXT' });
    }
    return e.eventId;
  }

  // ── 읽기 ──

  async vesselCalls(filter: { ids?: string[]; limit: number }) {
    const q = this.db
      .select({
        id: vesselCall.vesselCallId,
        port: vesselCall.portAuthorityCode,
        year: vesselCall.callYear,
        seq: vesselCall.callSeq,
        callSign: vesselCall.callSign,
        vesselName: vesselCall.vesselName,
        isSimulated: vesselCall.isSimulated,
        firstRawInputId: vesselCall.firstRawInputId,
        registeredAt: vesselCall.registeredAt,
      })
      .from(vesselCall);
    const filtered = filter.ids ? q.where(inArray(vesselCall.vesselCallId, filter.ids.length ? filter.ids : ['00000000-0000-7000-8000-000000000000'])) : q;
    return filtered.orderBy(desc(vesselCall.registeredAt), desc(vesselCall.vesselCallId)).limit(filter.limit);
  }

  /** 개체마다 사실 키별 최신 공공 관측(받은 시각 → 기록 시각 순). 현재 사실(Reconciliation)이 아니다. */
  async latestObservations(entityType: 'VESSEL_CALL' | 'CONTAINER', entityIds: string[], factKeys: string[]) {
    if (entityIds.length === 0) return [];
    return this.db
      .selectDistinctOn([eventEntityLink.entityId, event.factKey], {
        entityId: eventEntityLink.entityId,
        factKey: event.factKey,
        eventId: event.eventId,
        eventType: event.eventType,
        valueText: event.valueText,
        valueTimestamp: event.valueTimestamp,
        valueCode: event.valueCode,
        payload: event.payload,
        rawInputId: event.rawInputId,
      })
      .from(event)
      .innerJoin(eventEntityLink, and(eq(eventEntityLink.eventId, event.eventId), eq(eventEntityLink.linkRole, 'SUBJECT')))
      .where(and(eq(eventEntityLink.entityType, entityType), inArray(eventEntityLink.entityId, entityIds), inArray(event.factKey, factKeys), eq(event.sourceType, 'PUBLIC_API')))
      .orderBy(eventEntityLink.entityId, event.factKey, desc(event.receivedAt), desc(event.recordedAt), desc(event.eventId));
  }

  /** 원문 id → 출처(호출 원장 + 원문 지문). */
  async provenanceByRawInput(rawInputIds: string[]) {
    if (rawInputIds.length === 0) return [];
    return this.db
      .select({
        rawInputId: rawInput.rawInputId,
        payloadHash: rawInput.payloadHash,
        fetchId: publicDataFetch.fetchId,
        dataset: publicDataFetch.dataset,
        mode: publicDataFetch.mode,
        isSimulated: publicDataFetch.isSimulated,
        requestedAt: publicDataFetch.requestedAt,
        receivedAt: publicDataFetch.receivedAt,
      })
      .from(rawInput)
      .innerJoin(publicDataFetch, eq(publicDataFetch.rawInputId, rawInput.rawInputId))
      .where(inArray(rawInput.rawInputId, rawInputIds));
  }

  async manifestNos(vesselCallIds: string[]) {
    if (vesselCallIds.length === 0) return [];
    return this.db
      .select({ ownerId: externalIdentifier.ownerId, value: externalIdentifier.idValue })
      .from(externalIdentifier)
      .where(and(eq(externalIdentifier.ownerType, 'VESSEL_CALL'), eq(externalIdentifier.idType, 'MANIFEST_NO'), inArray(externalIdentifier.ownerId, vesselCallIds)));
  }

  async containerCounts(vesselCallIds: string[]) {
    if (vesselCallIds.length === 0) return [];
    return this.db
      .select({ vesselCallId: container.vesselCallId, count: sql<number>`count(*)::int` })
      .from(container)
      .where(inArray(container.vesselCallId, vesselCallIds))
      .groupBy(container.vesselCallId);
  }

  async containersOfVesselCall(vesselCallId: string) {
    return this.db
      .select({
        id: container.containerId,
        containerNo: container.containerNo,
        sizeType: container.sizeType,
        isSimulated: container.isSimulated,
        firstRawInputId: container.firstRawInputId,
        blId: bl.blId,
        blNo: bl.blNo,
        blType: bl.blType,
      })
      .from(container)
      .leftJoin(containerBl, and(eq(containerBl.containerId, container.containerId), eq(containerBl.linkRole, 'PRIMARY')))
      .leftJoin(bl, eq(bl.blId, containerBl.blId))
      .where(eq(container.vesselCallId, vesselCallId))
      .orderBy(container.containerNo);
  }

  async msnByBl(blIds: string[]) {
    if (blIds.length === 0) return [];
    return this.db
      .select({ ownerId: externalIdentifier.ownerId, value: externalIdentifier.idValue })
      .from(externalIdentifier)
      .where(and(eq(externalIdentifier.ownerType, 'BL'), eq(externalIdentifier.idType, 'MSN'), inArray(externalIdentifier.ownerId, blIds)));
  }

  async fetches(limit: number) {
    return this.db
      .select({
        fetchId: publicDataFetch.fetchId,
        dataset: publicDataFetch.dataset,
        operation: publicDataFetch.operation,
        requestParams: publicDataFetch.requestParams,
        pageNo: publicDataFetch.pageNo,
        mode: publicDataFetch.mode,
        requestedAt: publicDataFetch.requestedAt,
        receivedAt: publicDataFetch.receivedAt,
        httpStatus: publicDataFetch.httpStatus,
        resultCode: publicDataFetch.resultCode,
        outcome: publicDataFetch.outcome,
        totalCount: publicDataFetch.totalCount,
        itemCount: publicDataFetch.itemCount,
        rawInputId: publicDataFetch.rawInputId,
        isSimulated: publicDataFetch.isSimulated,
      })
      .from(publicDataFetch)
      .orderBy(desc(publicDataFetch.requestedAt), desc(publicDataFetch.fetchId))
      .limit(limit);
  }
}
