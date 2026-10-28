import { sql } from 'drizzle-orm';
import { bigint, boolean, check, date, foreignKey, index, integer, jsonb, primaryKey, text, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { ckHash, ckIn, cera, hash, n, tstz } from './_common.js';
import { CONTAINER_PRIORITY, CONTAINER_SIZE_TYPE, OPERATIONAL_RECORD_STATUS, PLANNING_INPUT_KIND, PLANNING_INPUT_SOURCE, TARIFF_RATE_TYPE, TARIFF_UNIT } from './codes.js';
import { actor } from './m01-foundation.js';
import { facility } from './m02-registry.js';
import { recoveryRun } from './m03-planning.js';
import { container } from './m14-public-data.js';

/**
 * M30 실제 계획 입력(T-123) — 공공데이터로 얻을 수 없는 기업 내부 운영 정보를 **사람이 넣은 그대로** 담는다.
 * 시간에 따라 바뀌는 값(그날 수용량 · 차량 가용)은 여기 두지 않는다 — Truth 사실(사건)이다. 여기는 기준 · 계획 정보다:
 *   - 컨테이너 계획 정보(계획 실행마다): 목적지 · 원래 배차 · LFD · 우선순위 · 반출 가능 · 선사
 *   - 계약 요율(효력 기간): Demurrage · 보관 · 운송 · ODCY · Detention 무료일
 *   - 시설 계획 정보: 받는 규격 · 출발 가능 시각 · 마지막 출발 · 왕복 시간 · 보관 한도
 * 모두 append-only(M31). 고칠 때는 새 판이 옛 판을 가리킨다(`supersedes_*`, 판마다 후속은 하나) — 지우지 않는다.
 * 계획 판은 자기가 쓴 판의 id · 지문을 스냅숏에 남기므로, 나중에 값이 바뀌어도 그때 무엇으로 계산했는지 남는다.
 */
export const planningInputBatch = cera.table(
  'planning_input_batch',
  {
    batchId: uuid('batch_id').notNull(),
    inputKind: text('input_kind').notNull(),
    recoveryRunId: uuid('recovery_run_id'),
    commandId: uuid('command_id').notNull(),
    submittedByActorId: uuid('submitted_by_actor_id').notNull(),
    sourceType: text('source_type').notNull(),
    sourceLabel: varchar('source_label', { length: 100 }),
    contentHash: hash('content_hash').notNull(),
    rowCount: integer('row_count').notNull(),
    acceptedCount: integer('accepted_count').notNull(),
    unchangedCount: integer('unchanged_count').notNull(),
    submittedAt: tstz('submitted_at').notNull(),
  },
  (t) => [
    primaryKey({ name: n('pk_planning_input_batch'), columns: [t.batchId] }),
    foreignKey({ name: n('fk_planning_input_batch__recovery_run_id'), columns: [t.recoveryRunId], foreignColumns: [recoveryRun.runId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_planning_input_batch__submitted_by_actor_id'), columns: [t.submittedByActorId], foreignColumns: [actor.actorId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_planning_input_batch__submitted_by_actor_id__command_id')).on(t.submittedByActorId, t.commandId),
    ckIn('planning_input_batch', t.inputKind, PLANNING_INPUT_KIND),
    ckHash('planning_input_batch', t.contentHash),
    ckIn('planning_input_batch', t.sourceType, PLANNING_INPUT_SOURCE),
    // M37(T-132): 컨테이너 묶음은 실행에 속하거나(실행 계획 입력) 운영 기준 계획(NULL)이다. 요율 · 시설 정보는 실행에 속하지 않는다
    check(n('ck_planning_input_batch__run_scope'), sql`${t.inputKind} = 'CONTAINERS' OR ${t.recoveryRunId} IS NULL`),
    check(n('ck_planning_input_batch__counts'), sql`${t.rowCount} >= 0 AND ${t.acceptedCount} >= 0 AND ${t.unchangedCount} >= 0 AND ${t.acceptedCount} + ${t.unchangedCount} = ${t.rowCount}`),
  ],
);

export const planningContainerRecord = cera.table(
  'planning_container_record',
  {
    recordId: uuid('record_id').notNull(),
    batchId: uuid('batch_id').notNull(),
    // M37(T-132): NULL = 운영 기준 계획(어느 복구 실행에도 속하지 않은 예정 반입 — 예외 탐지기가 본다). 값 = 그 실행의 계획 입력
    recoveryRunId: uuid('recovery_run_id'),
    containerNo: varchar('container_no', { length: 11 }).notNull(),
    containerId: uuid('container_id'),
    sizeType: text('size_type').notNull(),
    carrierCode: varchar('carrier_code', { length: 20 }).notNull(),
    priority: text('priority').notNull(),
    lfd: date('lfd', { mode: 'string' }),
    pickupReady: boolean('pickup_ready').notNull(),
    currentTerminal: varchar('current_terminal', { length: 40 }).notNull(),
    destinationFacilityId: uuid('destination_facility_id').notNull(),
    plannedDay: date('planned_day', { mode: 'string' }).notNull(),
    plannedDepartHour: integer('planned_depart_hour'),
    alternateDestinationAllowed: boolean('alternate_destination_allowed').notNull(),
    recordStatus: text('record_status').notNull(),
    rowNo: integer('row_no').notNull(),
    contentHash: hash('content_hash').notNull(),
    supersedesRecordId: uuid('supersedes_record_id'),
    recordedAt: tstz('recorded_at').notNull(),
  },
  (t) => [
    primaryKey({ name: n('pk_planning_container_record'), columns: [t.recordId] }),
    foreignKey({ name: n('fk_planning_container_record__batch_id'), columns: [t.batchId], foreignColumns: [planningInputBatch.batchId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_planning_container_record__recovery_run_id'), columns: [t.recoveryRunId], foreignColumns: [recoveryRun.runId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_planning_container_record__container_id'), columns: [t.containerId], foreignColumns: [container.containerId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_planning_container_record__destination_facility_id'), columns: [t.destinationFacilityId], foreignColumns: [facility.facilityId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_planning_container_record__supersedes_record_id'), columns: [t.supersedesRecordId], foreignColumns: [t.recordId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_planning_container_record__supersedes_record_id')).on(t.supersedesRecordId),
    check(n('ck_planning_container_record__container_no'), sql`${t.containerNo} ~ '^[A-Z]{4}[0-9]{7}$'`),
    ckIn('planning_container_record', t.sizeType, CONTAINER_SIZE_TYPE),
    ckHash('planning_container_record', t.contentHash),
    ckIn('planning_container_record', t.priority, CONTAINER_PRIORITY),
    ckIn('planning_container_record', t.recordStatus, OPERATIONAL_RECORD_STATUS),
    check(n('ck_planning_container_record__planned_depart_hour'), sql`${t.plannedDepartHour} IS NULL OR ${t.plannedDepartHour} BETWEEN 0 AND 23`),
    index(n('ix_planning_container_record__recovery_run_id')).on(t.recoveryRunId, t.containerNo),
  ],
);

export const tariffRate = cera.table(
  'tariff_rate',
  {
    rateId: uuid('rate_id').notNull(),
    batchId: uuid('batch_id').notNull(),
    rateType: text('rate_type').notNull(),
    carrierCode: varchar('carrier_code', { length: 20 }),
    fromRef: varchar('from_ref', { length: 60 }),
    toRef: varchar('to_ref', { length: 60 }),
    sizeType: text('size_type'),
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    unit: text('unit').notNull(),
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    effectiveUntil: date('effective_until', { mode: 'string' }),
    sourceNote: varchar('source_note', { length: 200 }).notNull(),
    recordStatus: text('record_status').notNull(),
    rowNo: integer('row_no').notNull(),
    contentHash: hash('content_hash').notNull(),
    supersedesRateId: uuid('supersedes_rate_id'),
    recordedAt: tstz('recorded_at').notNull(),
  },
  (t) => [
    primaryKey({ name: n('pk_tariff_rate'), columns: [t.rateId] }),
    foreignKey({ name: n('fk_tariff_rate__batch_id'), columns: [t.batchId], foreignColumns: [planningInputBatch.batchId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_tariff_rate__supersedes_rate_id'), columns: [t.supersedesRateId], foreignColumns: [t.rateId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_tariff_rate__supersedes_rate_id')).on(t.supersedesRateId),
    ckIn('tariff_rate', t.rateType, TARIFF_RATE_TYPE),
    ckHash('tariff_rate', t.contentHash),
    ckIn('tariff_rate', t.unit, TARIFF_UNIT),
    ckIn('tariff_rate', t.sizeType, CONTAINER_SIZE_TYPE),
    check(n('ck_tariff_rate__amount'), sql`${t.amount} >= 0`),
    check(n('ck_tariff_rate__period'), sql`${t.effectiveUntil} IS NULL OR ${t.effectiveUntil} >= ${t.effectiveFrom}`),
    ckIn('tariff_rate', t.recordStatus, OPERATIONAL_RECORD_STATUS),
    index(n('ix_tariff_rate__rate_type')).on(t.rateType, t.effectiveFrom),
  ],
);

export const facilityPlanningProfile = cera.table(
  'facility_planning_profile',
  {
    profileId: uuid('profile_id').notNull(),
    batchId: uuid('batch_id').notNull(),
    facilityId: uuid('facility_id').notNull(),
    accepts: jsonb('accepts').$type<string[]>().notNull(),
    openFromHour: integer('open_from_hour').notNull(),
    lastDepartureHour: integer('last_departure_hour').notNull(),
    tripHours: integer('trip_hours').notNull(),
    maxStorageDays: integer('max_storage_days'),
    recordStatus: text('record_status').notNull(),
    rowNo: integer('row_no').notNull(),
    contentHash: hash('content_hash').notNull(),
    supersedesProfileId: uuid('supersedes_profile_id'),
    recordedAt: tstz('recorded_at').notNull(),
  },
  (t) => [
    primaryKey({ name: n('pk_facility_planning_profile'), columns: [t.profileId] }),
    foreignKey({ name: n('fk_facility_planning_profile__batch_id'), columns: [t.batchId], foreignColumns: [planningInputBatch.batchId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_facility_planning_profile__facility_id'), columns: [t.facilityId], foreignColumns: [facility.facilityId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_facility_planning_profile__supersedes_profile_id'), columns: [t.supersedesProfileId], foreignColumns: [t.profileId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_facility_planning_profile__supersedes_profile_id')).on(t.supersedesProfileId),
    check(n('ck_facility_planning_profile__hours'), sql`${t.openFromHour} BETWEEN 0 AND 23 AND ${t.lastDepartureHour} BETWEEN 0 AND 23 AND ${t.lastDepartureHour} >= ${t.openFromHour}`),
    check(n('ck_facility_planning_profile__trip_hours'), sql`${t.tripHours} BETWEEN 1 AND 24`),
    check(n('ck_facility_planning_profile__max_storage_days'), sql`${t.maxStorageDays} IS NULL OR ${t.maxStorageDays} >= 0`),
    ckIn('facility_planning_profile', t.recordStatus, OPERATIONAL_RECORD_STATUS),
    ckHash('facility_planning_profile', t.contentHash),
    index(n('ix_facility_planning_profile__facility_id')).on(t.facilityId),
  ],
);
