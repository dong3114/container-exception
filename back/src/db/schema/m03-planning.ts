import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { cera, ckHash, ckIn, ckJsonType, n, hash, tstz } from './_common.js';
import { RUN_STATUS, RUN_TRIGGER_TYPE } from './codes.js';
import { scenario } from './m01-foundation.js';

/** M03 계획 시드 — docs/24 22.10 · 22.11. 둘 다 APPEND_ONLY(트리거는 M07). */

export const planningSnapshot = cera.table(
  'planning_snapshot',
  {
    snapshotId: uuid('snapshot_id').notNull(),
    asOf: tstz('as_of').notNull(),
    factFingerprint: hash('fact_fingerprint').notNull(),
    ruleVersion: varchar('rule_version', { length: 20 }).notNull(),
    tariffVersion: varchar('tariff_version', { length: 20 }).notNull(),
    policyVersion: varchar('policy_version', { length: 20 }).notNull(),
    scopeRef: jsonb('scope_ref').$type<Record<string, unknown>>(),
    containsSimulated: boolean('contains_simulated').notNull(),
    createdAt: tstz('created_at').notNull(),
    scenarioId: uuid('scenario_id'),
  },
  (t) => [
    primaryKey({ name: n('pk_planning_snapshot'), columns: [t.snapshotId] }),
    foreignKey({
      name: n('fk_planning_snapshot__scenario_id'),
      columns: [t.scenarioId],
      foreignColumns: [scenario.scenarioId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_planning_snapshot__snapshot_id__contains_simulated')).on(t.snapshotId, t.containsSimulated),
    ckHash('planning_snapshot', t.factFingerprint),
    check(n('ck_planning_snapshot__scenario_simulated'), sql`${t.scenarioId} IS NULL OR ${t.containsSimulated}`),
    ckJsonType('planning_snapshot', t.scopeRef, 'object'),
  ],
);

export const recoveryRun = cera.table(
  'recovery_run',
  {
    runId: uuid('run_id').notNull(),
    snapshotId: uuid('snapshot_id').notNull(),
    triggerType: text('trigger_type').notNull(),
    triggerRef: varchar('trigger_ref', { length: 60 }),
    previousRunId: uuid('previous_run_id'),
    objectiveVersion: varchar('objective_version', { length: 20 }).notNull(),
    runStatus: text('run_status').notNull(),
    unmetConstraints: jsonb('unmet_constraints').$type<unknown[]>(),
    totalCostKrw: bigint('total_cost_krw', { mode: 'bigint' }),
    solveMs: integer('solve_ms'),
    containsSimulated: boolean('contains_simulated').notNull(),
    executedAt: tstz('executed_at').notNull(),
  },
  (t) => [
    primaryKey({ name: n('pk_recovery_run'), columns: [t.runId] }),
    foreignKey({
      name: n('fk_recovery_run__snapshot_id__contains_simulated'),
      columns: [t.snapshotId, t.containsSimulated],
      foreignColumns: [planningSnapshot.snapshotId, planningSnapshot.containsSimulated],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_recovery_run__previous_run_id'), columns: [t.previousRunId], foreignColumns: [t.runId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    ckIn('recovery_run', t.triggerType, RUN_TRIGGER_TYPE),
    ckIn('recovery_run', t.runStatus, RUN_STATUS),
    check(n('ck_recovery_run__previous_not_self'), sql`${t.previousRunId} <> ${t.runId}`),
    check(n('ck_recovery_run__infeasible_unmet'), sql`${t.runStatus} <> 'INFEASIBLE' OR ${t.unmetConstraints} IS NOT NULL`),
    check(n('ck_recovery_run__total_cost_krw'), sql`${t.totalCostKrw} >= 0`),
    check(n('ck_recovery_run__solve_ms'), sql`${t.solveMs} >= 0`),
    ckJsonType('recovery_run', t.unmetConstraints, 'array'),
    index(n('ix_recovery_run__previous_run_id')).on(t.previousRunId),
    index(n('ix_recovery_run__snapshot_id')).on(t.snapshotId),
  ],
);
