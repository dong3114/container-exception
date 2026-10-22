import { sql } from 'drizzle-orm';
import type { PgTableExtraConfigValue } from 'drizzle-orm/pg-core';
import { check, foreignKey, index, integer, primaryKey, text, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { cera, ckContentRef, ckHash, ckIn, contentRef, hash, n, tstz } from './_common.js';
import { AGENT_STEP_KIND } from './codes.js';
import { agentRun, agentToolCall } from './m16-agent.js';

/**
 * M18 Agent Runtime(T-104 · ADR-036 결정 2) — docs/24 22.38 ~ 22.40 · docs/22 rev.2.8.
 * **실행 상태이지 업무 사실이 아니다.** checkpoint 는 "어디서 이어 갈지"만 담는다 — 재개한 그래프는 업무 상태를 Tool 로 다시 읽는다.
 * Python Agent Runtime 은 DB 자격증명이 없다: 이 표들은 Backend 의 /internal/agent-runtime API 만 쓴다.
 * checkpoint 본문은 내용 저장소(`AGENT_CHECKPOINT`) 참조 + 지문, 쓰기(pending writes)는 작은 값만 행에 둔다.
 */

export const agentStep = cera.table(
  'agent_step',
  {
    stepId: uuid('step_id').notNull(),
    agentRunId: uuid('agent_run_id').notNull(),
    seq: integer('seq').notNull(),
    kind: text('kind').notNull(),
    node: varchar('node', { length: 60 }),
    outcome: varchar('outcome', { length: 60 }).notNull(),
    detailCode: varchar('detail_code', { length: 60 }),
    toolCallId: uuid('tool_call_id'),
    retryCount: integer('retry_count').notNull().default(0),
    startedAt: tstz('started_at').notNull(),
    finishedAt: tstz('finished_at').notNull(),
    durationMs: integer('duration_ms').notNull(),
    traceId: varchar('trace_id', { length: 64 }),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_agent_step'), columns: [t.stepId] }),
    foreignKey({ name: n('fk_agent_step__agent_run_id'), columns: [t.agentRunId], foreignColumns: [agentRun.agentRunId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_agent_step__tool_call_id'), columns: [t.toolCallId], foreignColumns: [agentToolCall.toolCallId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_agent_step__agent_run_id__seq')).on(t.agentRunId, t.seq),
    ckIn('agent_step', t.kind, AGENT_STEP_KIND),
    check(n('ck_agent_step__node'), sql`${t.node} ~ '^[a-z][a-z0-9_]{0,59}$'`),
    check(n('ck_agent_step__outcome'), sql`${t.outcome} ~ '^[A-Z][A-Z0-9_]{0,59}$'`),
    check(n('ck_agent_step__detail_code'), sql`${t.detailCode} ~ '^[A-Z][A-Z0-9_]{0,59}$'`),
    check(n('ck_agent_step__node_shape'), sql`(${t.kind} = 'NODE') = (${t.node} IS NOT NULL)`),
    check(n('ck_agent_step__seq'), sql`${t.seq} >= 1`),
    check(n('ck_agent_step__retry_count'), sql`${t.retryCount} >= 0`),
    check(n('ck_agent_step__duration'), sql`${t.durationMs} >= 0 AND ${t.finishedAt} >= ${t.startedAt}`),
  ],
);

export const agentCheckpoint = cera.table(
  'agent_checkpoint',
  {
    checkpointRowId: uuid('checkpoint_row_id').notNull(),
    agentRunId: uuid('agent_run_id').notNull(),
    checkpointNs: varchar('checkpoint_ns', { length: 200 }).notNull().default(''),
    checkpointId: varchar('checkpoint_id', { length: 64 }).notNull(),
    parentCheckpointId: varchar('parent_checkpoint_id', { length: 64 }),
    contentRef: contentRef('content_ref').notNull(),
    contentHash: hash('content_hash').notNull(),
    metaSource: varchar('meta_source', { length: 20 }),
    metaStep: integer('meta_step'),
    createdAt: tstz('created_at').notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_agent_checkpoint'), columns: [t.checkpointRowId] }),
    foreignKey({ name: n('fk_agent_checkpoint__agent_run_id'), columns: [t.agentRunId], foreignColumns: [agentRun.agentRunId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_agent_checkpoint__run_ns_checkpoint_id')).on(t.agentRunId, t.checkpointNs, t.checkpointId),
    ckContentRef('agent_checkpoint', t.contentRef, 'AGENT_CHECKPOINT'),
    ckHash('agent_checkpoint', t.contentHash),
    check(n('ck_agent_checkpoint__checkpoint_id'), sql`${t.checkpointId} ~ '^[A-Za-z0-9._:-]{1,64}$'`),
    check(n('ck_agent_checkpoint__parent_checkpoint_id'), sql`${t.parentCheckpointId} ~ '^[A-Za-z0-9._:-]{1,64}$'`),
  ],
);

export const agentCheckpointWrite = cera.table(
  'agent_checkpoint_write',
  {
    agentRunId: uuid('agent_run_id').notNull(),
    checkpointNs: varchar('checkpoint_ns', { length: 200 }).notNull().default(''),
    checkpointId: varchar('checkpoint_id', { length: 64 }).notNull(),
    taskId: varchar('task_id', { length: 64 }).notNull(),
    writeIdx: integer('write_idx').notNull(),
    taskPath: varchar('task_path', { length: 300 }).notNull().default(''),
    channel: varchar('channel', { length: 200 }).notNull(),
    valueType: varchar('value_type', { length: 40 }).notNull(),
    valueB64: text('value_b64').notNull(),
    valueHash: hash('value_hash').notNull(),
    createdAt: tstz('created_at').notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_agent_checkpoint_write'), columns: [t.agentRunId, t.checkpointNs, t.checkpointId, t.taskId, t.writeIdx] }),
    foreignKey({ name: n('fk_agent_checkpoint_write__agent_run_id'), columns: [t.agentRunId], foreignColumns: [agentRun.agentRunId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    ckHash('agent_checkpoint_write', t.valueHash),
    // 실행 상태의 작은 값만(노드 반환 · interrupt · resume). 큰 값은 checkpoint 본문(내용 저장소)에 있다
    check(n('ck_agent_checkpoint_write__value_size'), sql`length(${t.valueB64}) <= 262144`),
    check(n('ck_agent_checkpoint_write__value_b64'), sql`${t.valueB64} ~ '^[A-Za-z0-9+/]*={0,2}$'`),
    index(n('ix_agent_checkpoint_write__checkpoint')).on(t.agentRunId, t.checkpointNs, t.checkpointId),
  ],
);
