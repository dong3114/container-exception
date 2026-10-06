import { Injectable } from '@nestjs/common';
import type { DbTransaction } from '../db/database.js';
import { event, eventEntityLink, rawInput } from '../db/schema/index.js';
import { canonicalHash, type Sha256Hash } from '../shared/hash/hash.js';

export interface RawInputRecord {
  rawInputId: string;
  sourceType: 'HUMAN_UI';
  sourceName: string;
  /** 사람 화면 명령은 명령 id(UUIDv7) — 같은 명령의 재시도를 한 행으로 모은다(docs/24 9절). */
  sourceRecordKey: string;
  payloadRef: string;
  payloadHash: Sha256Hash;
  receivedAt: string;
  collectedByActorId: string;
  isSimulated: boolean;
}

export interface HumanObservation {
  eventId: string;
  rawInputId: string;
  eventType: string;
  factKind: 'STATE';
  factKey: string;
  valueNumber: string;
  valueUnit: string;
  subject: { entityType: 'FACILITY' | 'COUNTERPARTY' | 'TRUCK_POOL'; entityId: string };
  sourceRoleAtIngestion: string | null;
  enteredByActorId: string;
  receivedAt: string;
  recordedAt: string;
  isSimulated: boolean;
  scenarioId: string | null;
}

/** 사건 멱등 키 `evk/1`(docs/24 9절). 값은 재료가 아니다. 사람 화면 명령의 주장 위치는 `/`. */
export function eventIdempotencyKey(input: {
  rawInputId: string;
  claimLocator: string;
  subject: { entityType: string; entityId: string };
  factKey: string | null;
  targets: readonly string[] | null;
  scope: { type: string; ref: string };
  eventClass: 'OBSERVATION' | 'CORRECTION' | 'VERIFICATION';
}): Sha256Hash {
  return canonicalHash({
    k: 'event-idem',
    v: 1,
    origin: { raw_input_id: input.rawInputId },
    claim_locator: input.claimLocator,
    subject: { entity_type: input.subject.entityType, entity_id: input.subject.entityId },
    fact_key: input.factKey,
    targets: input.targets ? [...input.targets].sort() : null,
    scope: { type: input.scope.type, ref: input.scope.ref },
    event_class: input.eventClass,
  });
}

/**
 * 사람 입력(HUMAN_UI) 경로의 최소 쓰기(U1: 시드의 창고 수용량 초기 사실에 쓴다).
 * 업무 사건 흐름 전체(추출 채택 T9 · 확인 T11 · 재계산 T10)는 U7~U9 에서 이 위에 더한다.
 * append-only — 수정·삭제 메서드가 없다. 모든 메서드는 호출자의 트랜잭션 `tx` 안에서 돈다.
 */
@Injectable()
export class EventWriter {
  /** U-3: 같은 (source_name, source_record_key) 는 한 행. 이미 있으면 false. */
  async insertRawInput(tx: DbTransaction, r: RawInputRecord): Promise<boolean> {
    const rows = await tx
      .insert(rawInput)
      .values({
        rawInputId: r.rawInputId,
        sourceType: r.sourceType,
        sourceName: r.sourceName,
        payloadRef: r.payloadRef,
        payloadHash: r.payloadHash,
        sourceRecordKey: r.sourceRecordKey,
        receivedAt: r.receivedAt,
        collectedByActorId: r.collectedByActorId,
        isSimulated: r.isSimulated,
      })
      .onConflictDoNothing()
      .returning({ id: rawInput.rawInputId });
    return rows.length > 0;
  }

  /**
   * OBSERVATION 사건 + SUBJECT 링크. `ON CONFLICT (idempotency_key) DO NOTHING` — 이미 있으면 링크도 넣지 않고 null(docs/24 9절).
   * SUBJECT 정확히 1건은 커밋 시 지연 트리거가 검사한다(I-8).
   */
  async recordHumanObservation(tx: DbTransaction, o: HumanObservation): Promise<string | null> {
    const idempotencyKey = eventIdempotencyKey({
      rawInputId: o.rawInputId,
      claimLocator: '/',
      subject: o.subject,
      factKey: o.factKey,
      targets: null,
      scope: { type: 'GLOBAL', ref: '' },
      eventClass: 'OBSERVATION',
    });
    const inserted = await tx
      .insert(event)
      .values({
        eventId: o.eventId,
        schemaVersion: 'ev-1',
        rawInputId: o.rawInputId,
        eventClass: 'OBSERVATION',
        eventType: o.eventType,
        factKind: o.factKind,
        factKey: o.factKey,
        valueNumber: o.valueNumber,
        valueUnit: o.valueUnit,
        receivedAt: o.receivedAt,
        sourceType: 'HUMAN_UI',
        sourceRoleAtIngestion: o.sourceRoleAtIngestion,
        extractionMethod: 'DIRECT',
        inputQuality: 'STRUCTURED',
        inputConfidenceLevel: 'HIGH',
        enteredByActorId: o.enteredByActorId,
        idempotencyKey,
        payload: { claim_locator: '/' },
        recordedAt: o.recordedAt,
        isSimulated: o.isSimulated,
        scenarioId: o.scenarioId,
      })
      .onConflictDoNothing({ target: event.idempotencyKey })
      .returning({ id: event.eventId });
    if (inserted.length === 0) return null;
    await tx.insert(eventEntityLink).values({
      eventId: o.eventId,
      entityType: o.subject.entityType,
      entityId: o.subject.entityId,
      linkRole: 'SUBJECT',
    });
    return o.eventId;
  }
}
