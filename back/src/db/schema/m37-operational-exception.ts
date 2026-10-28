import { sql } from 'drizzle-orm';
import { boolean, check, date, foreignKey, index, integer, jsonb, primaryKey, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { cera, ckHash, ckIn, hash, n, tstz } from './_common.js';
import { EXCEPTION_BASIS, EXCEPTION_OBSERVATION_KIND, EXCEPTION_SCOPE, EXCEPTION_STATUS, EXCEPTION_TYPE } from './codes.js';
import { scenario } from './m01-foundation.js';
import { facility } from './m02-registry.js';
import { recoveryRun } from './m03-planning.js';
import { event } from './m05-inbound-event.js';

/**
 * M37 운영 예외(T-132 · ADR-040). 결정론 탐지기가 운영 기록(예정 반입) + Truth(수용량 사실)로 찾은 문제 하나.
 *
 * - 정체(종류 · 범위 · 시설 · 날짜)는 바뀌지 않는다. 같은 정체로 진행 중(ACTIVE)인 예외는 하나뿐이다(부분 유일 인덱스) —
 *   탐지를 몇 번 다시 돌려도, 프로세스가 둘이어도 예외 · 복구 실행이 둘 생기지 않는다
 * - 바뀌는 것은 지금 숫자(예정 · 수용량 · 부족)와 근거 · 상태(ACTIVE → RESOLVED 한 번) · 자동으로 만든 복구 실행(한 번 채움)뿐이다(M38 가드)
 * - 왜 그렇게 판단했는지는 관측 기록(`operational_exception_observation`, append-only)이 남긴다 — 근거가 바뀔 때마다 한 행
 */
export const operationalException = cera.table(
  'operational_exception',
  {
    exceptionId: uuid('exception_id').notNull(),
    exceptionType: text('exception_type').notNull(),
    scope: text('scope').notNull(),
    scenarioId: uuid('scenario_id'),
    facilityId: uuid('facility_id').notNull(),
    windowDay: date('window_day', { mode: 'string' }).notNull(),
    status: text('status').notNull(),
    basis: text('basis').notNull(),
    scheduledDemand: integer('scheduled_demand').notNull(),
    capacity: integer('capacity'),
    shortage: integer('shortage').notNull(),
    recoveryRunId: uuid('recovery_run_id'),
    isSimulated: boolean('is_simulated').notNull(),
    detectedAt: tstz('detected_at').notNull(),
    updatedAt: tstz('updated_at').notNull(),
    resolvedAt: tstz('resolved_at'),
  },
  (t) => [
    primaryKey({ name: n('pk_operational_exception'), columns: [t.exceptionId] }),
    foreignKey({ name: n('fk_operational_exception__scenario_id'), columns: [t.scenarioId], foreignColumns: [scenario.scenarioId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_operational_exception__facility_id'), columns: [t.facilityId], foreignColumns: [facility.facilityId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_operational_exception__recovery_run_id'), columns: [t.recoveryRunId], foreignColumns: [recoveryRun.runId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_operational_exception__recovery_run_id')).on(t.recoveryRunId),
    ckIn('operational_exception', t.exceptionType, EXCEPTION_TYPE),
    ckIn('operational_exception', t.scope, EXCEPTION_SCOPE),
    ckIn('operational_exception', t.status, EXCEPTION_STATUS),
    ckIn('operational_exception', t.basis, EXCEPTION_BASIS),
    check(n('ck_operational_exception__scope_scenario'), sql`(${t.scope} = 'SCENARIO') = (${t.scenarioId} IS NOT NULL) AND (${t.scope} = 'SCENARIO') = ${t.isSimulated}`),
    check(n('ck_operational_exception__numbers'), sql`${t.scheduledDemand} >= 0 AND (${t.capacity} IS NULL OR ${t.capacity} >= 0) AND ${t.shortage} >= 0`),
    check(n('ck_operational_exception__resolved'), sql`(${t.status} = 'RESOLVED') = (${t.resolvedAt} IS NOT NULL)`),
    check(n('ck_operational_exception__time_order'), sql`${t.updatedAt} >= ${t.detectedAt} AND (${t.resolvedAt} IS NULL OR ${t.resolvedAt} >= ${t.detectedAt})`),
    // 같은 문제(종류 · 범위 · 시나리오 · 시설 · 날짜)로 진행 중인 예외는 하나 — 중복 탐지 · 중복 복구 실행을 DB 가 막는다
    uniqueIndex(n('uq_operational_exception__active_identity'))
      .on(t.exceptionType, t.scope, sql`coalesce(${t.scenarioId}, '00000000-0000-0000-0000-000000000000'::uuid)`, t.facilityId, t.windowDay)
      .where(sql`${t.status} = 'ACTIVE'`),
    index(n('ix_operational_exception__status')).on(t.status, t.detectedAt),
  ],
);

/**
 * M37 예외 관측 기록 — append-only. "그때 무엇을 보고 그렇게 판단했나": 예정 반입 수 · 수용량 사실(값 · 상태 · 이긴 사건) · 부족 · 넘치는 컨테이너 · 기준 시각.
 * 근거 지문(`evidence_hash`)이 직전 기록과 같으면 새 행을 만들지 않는다(같은 입력의 반복 탐지 = 기록 없음).
 */
export const operationalExceptionObservation = cera.table(
  'operational_exception_observation',
  {
    observationId: uuid('observation_id').notNull(),
    exceptionId: uuid('exception_id').notNull(),
    kind: text('kind').notNull(),
    asOf: tstz('as_of').notNull(),
    observedAt: tstz('observed_at').notNull(),
    scheduledDemand: integer('scheduled_demand').notNull(),
    capacity: integer('capacity'),
    capacityState: text('capacity_state').notNull(),
    capacityEventId: uuid('capacity_event_id'),
    shortage: integer('shortage').notNull(),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull(),
    evidenceHash: hash('evidence_hash').notNull(),
  },
  (t) => [
    primaryKey({ name: n('pk_operational_exception_observation'), columns: [t.observationId] }),
    foreignKey({ name: n('fk_operational_exception_observation__exception_id'), columns: [t.exceptionId], foreignColumns: [operationalException.exceptionId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_operational_exception_observation__capacity_event_id'), columns: [t.capacityEventId], foreignColumns: [event.eventId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    ckIn('operational_exception_observation', t.kind, EXCEPTION_OBSERVATION_KIND),
    ckHash('operational_exception_observation', t.evidenceHash),
    check(n('ck_operational_exception_observation__numbers'), sql`${t.scheduledDemand} >= 0 AND (${t.capacity} IS NULL OR ${t.capacity} >= 0) AND ${t.shortage} >= 0`),
    check(n('ck_operational_exception_observation__capacity_state'), sql`${t.capacityState} ~ '^[A-Z][A-Z_]*$'`),
    index(n('ix_operational_exception_observation__exception_id')).on(t.exceptionId, t.observedAt),
  ],
);
