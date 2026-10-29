import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, integer, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { cera, ckIn, n, tstz } from './_common.js';
import { CORROBORATION_RESULT } from './codes.js';
import { event } from './m05-inbound-event.js';
import { operationalException } from './m37-operational-exception.js';

/**
 * M41 공공 근거 교차 확인(T-136 · Corroboration). 업체가 말한 것(주장 사건)과 공공 관측(공공 API 사건)이 **같은 사실**(같은 주체 · 같은 사실 키)을
 * 말할 때만 결정론으로 비교한 결과 한 줄 — append-only. 공공 근거가 새로 들어오면 새 행(이력)이 생긴다.
 *
 * - MATCH: 같은 사실을 지지한다(허용 오차 안) · CONFLICT: 같은 사실인데 값이 다르다(사람 검토)
 * - NO_PUBLIC_EVIDENCE: 비교할 공공 관측이 없다(업체 말이 거짓이라는 뜻이 아니다) · STALE_PUBLIC_EVIDENCE: 공공 관측이 오래됐다
 * - NOT_COMPARABLE: 공공데이터가 다루지 않는 사실(창고 수용량 · 트럭 가용 등 — 정상, 오류 아님)
 * 비교 · 판정은 LLM 이 아니라 규칙(`corroboration-rules.ts`)이 한다. 근거(주장 사건 · 공공 사건 · 값 · 기준 시각 · 이유)를 함께 남긴다.
 */
export const corroboration = cera.table(
  'corroboration',
  {
    corroborationId: uuid('corroboration_id').notNull(),
    claimEventId: uuid('claim_event_id').notNull(),
    publicEventId: uuid('public_event_id'),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    factKey: text('fact_key').notNull(),
    result: text('result').notNull(),
    reasonCode: text('reason_code').notNull(),
    claimValueText: text('claim_value_text'),
    publicValueText: text('public_value_text'),
    differenceMinutes: integer('difference_minutes'),
    toleranceMinutes: integer('tolerance_minutes'),
    publicFreshness: text('public_freshness'),
    evaluatedAsOf: tstz('evaluated_as_of').notNull(),
    ruleVersion: text('rule_version').notNull(),
    isSimulated: boolean('is_simulated').notNull(),
    createdAt: tstz('created_at').notNull(),
  },
  (t) => [
    primaryKey({ name: n('pk_corroboration'), columns: [t.corroborationId] }),
    foreignKey({ name: n('fk_corroboration__claim_event_id'), columns: [t.claimEventId], foreignColumns: [event.eventId] }).onDelete('restrict').onUpdate('restrict'),
    foreignKey({ name: n('fk_corroboration__public_event_id'), columns: [t.publicEventId], foreignColumns: [event.eventId] }).onDelete('restrict').onUpdate('restrict'),
    ckIn('corroboration', t.result, CORROBORATION_RESULT),
    check(n('ck_corroboration__public_pair'), sql`(${t.result} IN ('MATCH', 'CONFLICT', 'STALE_PUBLIC_EVIDENCE')) = (${t.publicEventId} IS NOT NULL)`),
    check(n('ck_corroboration__reason_code'), sql`${t.reasonCode} ~ '^[A-Z][A-Z0-9_]*$'`),
    // 같은 주장 · 같은 공공 근거 · 같은 규칙 판은 한 번만(다시 돌려도 행이 늘지 않는다)
    uniqueIndex(n('uq_corroboration__claim_public_rule')).on(t.claimEventId, sql`coalesce(${t.publicEventId}, '00000000-0000-0000-0000-000000000000'::uuid)`, t.ruleVersion),
    index(n('ix_corroboration__entity')).on(t.entityType, t.entityId, t.factKey, t.createdAt),
  ],
);

/**
 * M41 예외가 영향을 준 컨테이너(T-136 · Phase 5). 탐지기가 "넘치는" 컨테이너로 고른 것을 관계로 남긴다(관측 기록의 evidence JSON 은 감사용으로 그대로).
 * 복구 계획은 이 관계로 **재배치 후보**(영향)와 **고정된 기존 계획**(영향 없음 — 자원은 쓰지만 바꾸지 않는다)을 나눈다.
 * `container_ref` = 실행의 컨테이너 표시(LIVE = 컨테이너 번호, SCENARIO = 시나리오 컨테이너 id). append-only.
 */
export const operationalExceptionContainer = cera.table(
  'operational_exception_container',
  {
    exceptionId: uuid('exception_id').notNull(),
    observationId: uuid('observation_id').notNull(),
    containerRef: text('container_ref').notNull(),
    planOrder: integer('plan_order').notNull(),
    createdAt: tstz('created_at').notNull(),
  },
  (t) => [
    primaryKey({ name: n('pk_operational_exception_container'), columns: [t.observationId, t.containerRef] }),
    foreignKey({ name: n('fk_operational_exception_container__exception_id'), columns: [t.exceptionId], foreignColumns: [operationalException.exceptionId] }).onDelete('restrict').onUpdate('restrict'),
    check(n('ck_operational_exception_container__plan_order'), sql`${t.planOrder} >= 0`),
    index(n('ix_operational_exception_container__exception')).on(t.exceptionId, t.createdAt),
  ],
);
