import { sql } from 'drizzle-orm';
import type { PgTableExtraConfigValue } from 'drizzle-orm/pg-core';
import { boolean, check, foreignKey, index, integer, primaryKey, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { cera, ckHash, ckIn, hash, n, tstz } from './_common.js';
import { AGENT_RUN_STATUS, TOOL_CALL_STATUS, TOOL_CATEGORY } from './codes.js';
import { actor } from './m01-foundation.js';
import { recoveryRun } from './m03-planning.js';

/**
 * M16 Agent 실행 · Tool 호출 기록(T-103 · ADR-036) — docs/24 22.36 · 22.37 · docs/22 rev.2.7.
 * **업무 사실이 아니라 실행 기록이다.** Agent 가 무엇을 언제 물었고 무엇을 받았나를 남기되, 입력 · 출력은 지문만 둔다 —
 * 메일 원문 · 공공 API 원문 · 비밀값을 복제하지 않는다. 결과가 업무 기록(초안 등)이면 그 id 만 가리킨다.
 * 범위: 실행은 사람(또는 Coordinator)이 계획 실행 하나에 묶어 만든다. Agent 가 범위를 고르지 못한다.
 * 트리거 · 권한은 M17(custom).
 */

export const agentRun = cera.table(
  'agent_run',
  {
    agentRunId: uuid('agent_run_id').notNull(),
    recoveryRunId: uuid('recovery_run_id').notNull(),
    goal: varchar('goal', { length: 300 }).notNull(),
    status: text('status').notNull(),
    createdByActorId: uuid('created_by_actor_id').notNull(),
    agentActorId: uuid('agent_actor_id').notNull(),
    runtimeVersion: varchar('runtime_version', { length: 40 }),
    traceId: varchar('trace_id', { length: 64 }),
    startedAt: tstz('started_at').notNull(),
    finishedAt: tstz('finished_at'),
    isSimulated: boolean('is_simulated').notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_agent_run'), columns: [t.agentRunId] }),
    foreignKey({ name: n('fk_agent_run__recovery_run_id'), columns: [t.recoveryRunId], foreignColumns: [recoveryRun.runId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_agent_run__created_by_actor_id'), columns: [t.createdByActorId], foreignColumns: [actor.actorId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_agent_run__agent_actor_id'), columns: [t.agentActorId], foreignColumns: [actor.actorId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    ckIn('agent_run', t.status, AGENT_RUN_STATUS),
    check(n('ck_agent_run__finished_shape'), sql`(${t.status} = 'ACTIVE') = (${t.finishedAt} IS NULL)`),
    check(n('ck_agent_run__finished_after_started'), sql`${t.finishedAt} IS NULL OR ${t.finishedAt} >= ${t.startedAt}`),
    index(n('ix_agent_run__recovery_run_id')).on(t.recoveryRunId),
  ],
);

export const agentToolCall = cera.table(
  'agent_tool_call',
  {
    toolCallId: uuid('tool_call_id').notNull(),
    agentRunId: uuid('agent_run_id').notNull(),
    toolName: varchar('tool_name', { length: 60 }).notNull(),
    toolVersion: varchar('tool_version', { length: 10 }).notNull(),
    category: text('category').notNull(),
    status: text('status').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 100 }),
    inputHash: hash('input_hash').notNull(),
    outputHash: hash('output_hash'),
    resultRefType: varchar('result_ref_type', { length: 40 }),
    resultRefId: uuid('result_ref_id'),
    errorCode: varchar('error_code', { length: 60 }),
    startedAt: tstz('started_at').notNull(),
    finishedAt: tstz('finished_at'),
    durationMs: integer('duration_ms'),
    requestId: varchar('request_id', { length: 64 }),
    traceId: varchar('trace_id', { length: 64 }),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_agent_tool_call'), columns: [t.toolCallId] }),
    foreignKey({ name: n('fk_agent_tool_call__agent_run_id'), columns: [t.agentRunId], foreignColumns: [agentRun.agentRunId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    ckIn('agent_tool_call', t.category, TOOL_CATEGORY),
    ckIn('agent_tool_call', t.status, TOOL_CALL_STATUS),
    ckHash('agent_tool_call', t.inputHash),
    ckHash('agent_tool_call', t.outputHash),
    check(n('ck_agent_tool_call__tool_name'), sql`${t.toolName} ~ '^[a-z][a-z0-9_]{1,59}$'`),
    check(n('ck_agent_tool_call__idempotency_key'), sql`${t.idempotencyKey} ~ '^[A-Za-z0-9._:-]{1,100}$'`),
    // 끝난 호출만 끝난 시각 · 소요가 있다. 실패 · 거부는 오류 코드가 있고 성공은 없다
    check(n('ck_agent_tool_call__finished_shape'), sql`(${t.status} = 'STARTED') = (${t.finishedAt} IS NULL AND ${t.durationMs} IS NULL)`),
    check(n('ck_agent_tool_call__error_shape'), sql`(${t.status} IN ('FAILED', 'REJECTED')) = (${t.errorCode} IS NOT NULL)`),
    check(n('ck_agent_tool_call__result_ref_pair'), sql`(${t.resultRefType} IS NULL) = (${t.resultRefId} IS NULL)`),
    check(n('ck_agent_tool_call__duration'), sql`${t.durationMs} IS NULL OR ${t.durationMs} >= 0`),
    // 같은 실행 · 같은 Tool · 같은 멱등 키의 진행 중 · 성공 호출은 하나 — 재시도가 부작용을 두 번 만들지 않는다(실패 · 거부는 다시 시도 가능)
    uniqueIndex(n('uq_agent_tool_call__run_tool_idempotency_key'))
      .on(t.agentRunId, t.toolName, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL AND ${t.status} IN ('STARTED', 'SUCCEEDED')`),
    index(n('ix_agent_tool_call__agent_run_id__started_at')).on(t.agentRunId, t.startedAt),
  ],
);
