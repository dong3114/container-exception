import { sql } from 'drizzle-orm';
import type { PgTableExtraConfigValue } from 'drizzle-orm/pg-core';
import { bigint, boolean, check, date, foreignKey, index, integer, jsonb, primaryKey, text, uniqueIndex, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { cera, ckHash, ckIn, ckJsonType, hash, n, tstz } from './_common.js';
import { PLAN_ACTION, PLAN_STATUS, SOLVER_STATUS } from './codes.js';
import { actor, scenario } from './m01-foundation.js';
import { planningSnapshot, recoveryRun } from './m03-planning.js';
import { agentRun } from './m16-agent.js';

/**
 * M22 복구 계획(T-114) — Solver 실행 하나 = 계획 판 하나. **후보 계획이지 실행 지시가 아니다**: 승인은 사람만, 배차 · 발송은 없다.
 * - 입력 스냅숏(쓴 사실 id · 상태 · as_of · 정책 판)은 `planning_snapshot`(append-only)에 남긴다 — 사실이 바뀌면 이 기록과 비교해 OUTDATED
 * - `case_run_id` = 사람이 · Agent 가 다루는 계획 실행(recovery_run). 판은 그 안에서 1, 2, 3 …
 * - Solver 결과 숫자는 결정론 엔진 출력이다(ADR-029). 시뮬레이션 입력이면 contains_simulated(규칙 9)
 * 트리거 · 권한은 M23(custom).
 */

export const recoveryPlan = cera.table(
  'recovery_plan',
  {
    planId: uuid('plan_id').notNull(),
    caseRunId: uuid('case_run_id').notNull(),
    snapshotId: uuid('snapshot_id').notNull(),
    version: integer('version').notNull(),
    planStatus: text('plan_status').notNull(),
    solverStatus: text('solver_status').notNull(),
    solverVersion: varchar('solver_version', { length: 40 }).notNull(),
    inputHash: hash('input_hash').notNull(),
    planHash: hash('plan_hash').notNull(),
    objectiveKrw: bigint('objective_krw', { mode: 'bigint' }),
    baseCostKrw: bigint('base_cost_krw', { mode: 'bigint' }),
    riskPenaltyKrw: bigint('risk_penalty_krw', { mode: 'bigint' }),
    baselineTotalKrw: bigint('baseline_total_krw', { mode: 'bigint' }).notNull(),
    baselineBaseCostKrw: bigint('baseline_base_cost_krw', { mode: 'bigint' }).notNull(),
    // 절감은 음수일 수 있다(Baseline 은 트럭을 다시 배정하지 않는 규칙이라 더 싸게 나올 수 있다)
    savingKrw: bigint('saving_krw', { mode: 'bigint' }),
    baseSavingKrw: bigint('base_saving_krw', { mode: 'bigint' }),
    candidateCount: integer('candidate_count').notNull(),
    /** 비용 · Solver 결과의 나머지(제약 · 경고 · 가정 · Baseline 배정 · 자원 사용 · 시간) — 화면 · 설명용 */
    result: jsonb('result').$type<Record<string, unknown>>().notNull(),
    costMs: integer('cost_ms').notNull(),
    solveMs: integer('solve_ms').notNull(),
    outdatedReasons: jsonb('outdated_reasons').$type<unknown[]>(),
    outdatedAt: tstz('outdated_at'),
    supersededByPlanId: uuid('superseded_by_plan_id'),
    approvedByActorId: uuid('approved_by_actor_id'),
    approvedAt: tstz('approved_at'),
    createdByActorId: uuid('created_by_actor_id').notNull(),
    agentRunId: uuid('agent_run_id'),
    containsSimulated: boolean('contains_simulated').notNull(),
    scenarioId: uuid('scenario_id'),
    createdAt: tstz('created_at').notNull(),
    updatedAt: tstz('updated_at').notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_recovery_plan'), columns: [t.planId] }),
    foreignKey({ name: n('fk_recovery_plan__case_run_id'), columns: [t.caseRunId], foreignColumns: [recoveryRun.runId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_recovery_plan__snapshot_id__contains_simulated'), columns: [t.snapshotId, t.containsSimulated], foreignColumns: [planningSnapshot.snapshotId, planningSnapshot.containsSimulated] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_recovery_plan__superseded_by_plan_id'), columns: [t.supersededByPlanId], foreignColumns: [t.planId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_recovery_plan__approved_by_actor_id'), columns: [t.approvedByActorId], foreignColumns: [actor.actorId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_recovery_plan__created_by_actor_id'), columns: [t.createdByActorId], foreignColumns: [actor.actorId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_recovery_plan__agent_run_id'), columns: [t.agentRunId], foreignColumns: [agentRun.agentRunId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_recovery_plan__scenario_id'), columns: [t.scenarioId], foreignColumns: [scenario.scenarioId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_recovery_plan__case_run_id__version')).on(t.caseRunId, t.version),
    // 계획 실행마다 지금 쓰이는(제안 · 승인) 판은 하나뿐
    uniqueIndex(n('uq_recovery_plan__case_run_id__current'))
      .on(t.caseRunId)
      .where(sql`plan_status IN ('PROPOSED', 'APPROVED')`),
    ckIn('recovery_plan', t.planStatus, PLAN_STATUS),
    ckIn('recovery_plan', t.solverStatus, SOLVER_STATUS),
    ckHash('recovery_plan', t.inputHash),
    ckHash('recovery_plan', t.planHash),
    ckJsonType('recovery_plan', t.result, 'object'),
    ckJsonType('recovery_plan', t.outdatedReasons, 'array'),
    check(n('ck_recovery_plan__version'), sql`${t.version} >= 1`),
    check(n('ck_recovery_plan__amounts'), sql`(${t.objectiveKrw} IS NULL OR ${t.objectiveKrw} >= 0) AND (${t.baseCostKrw} IS NULL OR ${t.baseCostKrw} >= 0) AND (${t.riskPenaltyKrw} IS NULL OR ${t.riskPenaltyKrw} >= 0) AND ${t.baselineTotalKrw} >= 0 AND ${t.baselineBaseCostKrw} >= 0`),
    check(n('ck_recovery_plan__timings'), sql`${t.costMs} >= 0 AND ${t.solveMs} >= 0 AND ${t.candidateCount} >= 0`),
    // 실행 가능한 해가 있으면 목적값이 있고, 없으면(INFEASIBLE · ERROR) 목적값도 없다
    check(n('ck_recovery_plan__objective_shape'), sql`(${t.solverStatus} IN ('OPTIMAL', 'FEASIBLE', 'TIME_LIMIT')) = (${t.objectiveKrw} IS NOT NULL)`),
    // 실행 불가 판은 목적값이 없고, 제안 · 승인 판은 목적값이 있다
    check(n('ck_recovery_plan__infeasible_status'), sql`(${t.planStatus} <> 'INFEASIBLE' OR ${t.objectiveKrw} IS NULL) AND (${t.planStatus} NOT IN ('PROPOSED', 'APPROVED') OR ${t.objectiveKrw} IS NOT NULL)`),
    check(n('ck_recovery_plan__approved_shape'), sql`(${t.approvedByActorId} IS NULL) = (${t.approvedAt} IS NULL)`),
    check(n('ck_recovery_plan__approved_status'), sql`${t.planStatus} <> 'APPROVED' OR ${t.approvedByActorId} IS NOT NULL`),
    check(n('ck_recovery_plan__outdated_shape'), sql`(${t.outdatedAt} IS NULL) = (${t.outdatedReasons} IS NULL)`),
    check(n('ck_recovery_plan__superseded_shape'), sql`(${t.planStatus} = 'SUPERSEDED') = (${t.supersededByPlanId} IS NOT NULL)`),
    check(n('ck_recovery_plan__superseded_not_self'), sql`${t.supersededByPlanId} <> ${t.planId}`),
    check(n('ck_recovery_plan__scenario_simulated'), sql`${t.scenarioId} IS NULL OR ${t.containsSimulated}`),
    index(n('ix_recovery_plan__snapshot_id')).on(t.snapshotId),
    index(n('ix_recovery_plan__agent_run_id')).on(t.agentRunId),
  ],
);

export const recoveryPlanItem = cera.table(
  'recovery_plan_item',
  {
    planId: uuid('plan_id').notNull(),
    // 컨테이너는 아직 저장소 표가 없다(시나리오 데이터 팩의 합성 id) — 참조 문자열로 둔다
    containerRef: varchar('container_ref', { length: 40 }).notNull(),
    action: text('action').notNull(),
    targetRef: varchar('target_ref', { length: 60 }).notNull(),
    destinationRef: varchar('destination_ref', { length: 60 }).notNull(),
    deliveryDay: date('delivery_day', { mode: 'string' }).notNull(),
    scheduledAt: tstz('scheduled_at'),
    truckRef: varchar('truck_ref', { length: 120 }),
    baseCostKrw: bigint('base_cost_krw', { mode: 'bigint' }).notNull(),
    riskPenaltyKrw: bigint('risk_penalty_krw', { mode: 'bigint' }).notNull(),
    totalKrw: bigint('total_krw', { mode: 'bigint' }).notNull(),
    /** 비용 항목(출처 · 가정) · 이유 코드 · 대안 · 근거 · 경고 — 결정론 엔진 출력 그대로 */
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_recovery_plan_item'), columns: [t.planId, t.containerRef] }),
    foreignKey({ name: n('fk_recovery_plan_item__plan_id'), columns: [t.planId], foreignColumns: [recoveryPlan.planId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    ckIn('recovery_plan_item', t.action, PLAN_ACTION),
    ckJsonType('recovery_plan_item', t.detail, 'object'),
    check(n('ck_recovery_plan_item__amounts'), sql`${t.baseCostKrw} >= 0 AND ${t.riskPenaltyKrw} >= 0 AND ${t.totalKrw} = ${t.baseCostKrw} + ${t.riskPenaltyKrw}`),
  ],
);
