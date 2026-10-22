import { Inject, Injectable } from '@nestjs/common';
import canonicalize from 'canonicalize';
import { z } from 'zod';
import { ContentService } from '../content/content-service.js';
import { ABSENT, CONTENT_STORE, type ContentStore } from '../content/content-store.js';
import { TransactionRunner } from '../db/transaction.js';
import { currentContext } from '../shared/context/request-context.js';
import { BusinessRuleError, ValidationError } from '../shared/errors/cera-error.js';
import { sha256Bytes } from '../shared/hash/hash.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import { AgentRunRepository } from './agent-run.repository.js';
import { RuntimeStoreRepository } from './runtime-store.repository.js';
import { AgentServiceAuth } from './service-auth.js';
import { ToolGatewayError } from './tool-errors.js';

/**
 * Agent Runtime API(T-104 · ADR-036 결정 2) — Python LangGraph checkpointer 가 쓰는 저장 통로. Python 에 DB 자격증명이 없다.
 *
 * - checkpoint 본문(LangGraph serde 의 typed bytes, base64)은 내용 저장소 `AGENT_CHECKPOINT` 에, 행에는 참조 + 지문만
 * - pending write 는 작은 값만 행에(256 KiB 이하)
 * - **실행 상태다.** 승인 · 사실 · 발송 여부의 정본이 아니다 — 재개한 그래프는 Tool 로 다시 읽는다
 * - 쓰기는 RUNNING 실행에만(DB 가드), 읽기는 실행이 있으면
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const typed = z.object({ type: z.string().min(1).max(40), b64: z.string().max(4_000_000).regex(/^[A-Za-z0-9+/]*={0,2}$/) }).strict();
const cid = z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/);
const ns = z.string().max(200);

export const putCheckpointSchema = z
  .object({
    checkpoint_ns: ns,
    checkpoint_id: cid,
    parent_checkpoint_id: cid.nullable(),
    checkpoint: typed,
    metadata: typed,
    meta_source: z.string().max(20).nullable(),
    meta_step: z.number().int().nullable(),
  })
  .strict();
export const putWritesSchema = z
  .object({
    checkpoint_ns: ns,
    checkpoint_id: cid,
    task_id: z.string().min(1).max(64),
    task_path: z.string().max(300),
    writes: z.array(z.object({ idx: z.number().int(), channel: z.string().min(1).max(200), type: z.string().min(1).max(40), b64: z.string().max(262_144).regex(/^[A-Za-z0-9+/]*={0,2}$/) }).strict()).max(200),
  })
  .strict();
const code = z.string().regex(/^[A-Z][A-Z0-9_]{0,59}$/);
export const stepsSchema = z
  .object({
    steps: z
      .array(
        z
          .object({
            node: z.string().regex(/^[a-z][a-z0-9_]{0,59}$/),
            outcome: code,
            detail_code: code.nullable(),
            tool_call_id: z.uuid().nullable(),
            retry_count: z.number().int().min(0).max(100),
            started_at: z.string(),
            finished_at: z.string(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();

@Injectable()
export class AgentRuntimeService {
  constructor(
    @Inject(AgentServiceAuth) private readonly auth: AgentServiceAuth,
    @Inject(AgentRunRepository) private readonly runs: AgentRunRepository,
    @Inject(RuntimeStoreRepository) private readonly store: RuntimeStoreRepository,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(CONTENT_STORE) private readonly contentStore: ContentStore,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async putCheckpoint(authorization: string | undefined, agentRunId: string, body: unknown) {
    await this.gate(authorization, agentRunId, true);
    const b = parse(putCheckpointSchema, body);
    const bytes = new TextEncoder().encode(canonicalize({ k: 'agent-checkpoint', v: 1, checkpoint: b.checkpoint, metadata: b.metadata }) ?? '');
    const stored = await this.content.storeVerified('AGENT_CHECKPOINT', bytes, 'application/json');
    await this.tx.run(async (tx) => {
      const run = await this.store.lockRun(tx, agentRunId);
      if (run?.status !== 'RUNNING') throw notRunning(run?.status);
      await this.store.insertCheckpoint(tx, {
        checkpointRowId: this.ids.newId(),
        agentRunId,
        checkpointNs: b.checkpoint_ns,
        checkpointId: b.checkpoint_id,
        parentCheckpointId: b.parent_checkpoint_id,
        contentRef: stored.ref,
        contentHash: stored.sha256,
        metaSource: b.meta_source,
        metaStep: b.meta_step,
        createdAt: this.clock.now().toDb(),
      });
    });
    return { checkpoint_id: b.checkpoint_id };
  }

  async putWrites(authorization: string | undefined, agentRunId: string, body: unknown) {
    await this.gate(authorization, agentRunId, true);
    const b = parse(putWritesSchema, body);
    await this.tx.run(async (tx) => {
      const run = await this.store.lockRun(tx, agentRunId);
      if (run?.status !== 'RUNNING') throw notRunning(run?.status);
      for (const w of b.writes) {
        await this.store.upsertWrite(tx, {
          agentRunId,
          checkpointNs: b.checkpoint_ns,
          checkpointId: b.checkpoint_id,
          taskId: b.task_id,
          writeIdx: w.idx,
          taskPath: b.task_path,
          channel: w.channel,
          valueType: w.type,
          valueB64: w.b64,
          valueHash: sha256Bytes(w.b64),
          createdAt: this.clock.now().toDb(),
        });
      }
    });
    return { written: b.writes.length };
  }

  async getCheckpoints(authorization: string | undefined, agentRunId: string, q: { ns?: string; checkpoint_id?: string; before?: string; limit?: string }) {
    await this.gate(authorization, agentRunId, false);
    const limit = q.limit ? Math.min(Math.max(Number(q.limit) || 1, 1), 100) : 1;
    const rows = await this.store.checkpoints(agentRunId, {
      checkpointNs: q.ns ?? null,
      checkpointId: q.checkpoint_id && cid.safeParse(q.checkpoint_id).success ? q.checkpoint_id : null,
      before: q.before && cid.safeParse(q.before).success ? q.before : null,
      limit,
    });
    const out = [];
    for (const r of rows) {
      const bytes = await this.contentStore.get(r.contentRef as never);
      if (bytes === ABSENT || sha256Bytes(bytes) !== r.contentHash) throw new BusinessRuleError('CHECKPOINT_CONTENT_MISSING', 'Checkpoint content is missing or changed', 409);
      const doc = JSON.parse(new TextDecoder().decode(bytes)) as { checkpoint: { type: string; b64: string }; metadata: { type: string; b64: string } };
      const writes = await this.store.writes(agentRunId, r.checkpointNs, [r.checkpointId]);
      out.push({
        checkpoint_ns: r.checkpointNs,
        checkpoint_id: r.checkpointId,
        parent_checkpoint_id: r.parentCheckpointId,
        checkpoint: doc.checkpoint,
        metadata: doc.metadata,
        writes: writes.map((w) => ({ task_id: w.taskId, idx: w.writeIdx, channel: w.channel, type: w.valueType, b64: w.valueB64, task_path: w.taskPath })),
      });
    }
    return { checkpoints: out };
  }

  async addSteps(authorization: string | undefined, agentRunId: string, body: unknown) {
    await this.gate(authorization, agentRunId, true);
    const b = parse(stepsSchema, body);
    const traceId = currentContext()?.traceId ?? null;
    await this.tx.run(async (tx) => {
      const run = await this.store.lockRun(tx, agentRunId);
      if (run?.status !== 'RUNNING') throw notRunning(run?.status);
      for (const s of b.steps) {
        const started = Instant.parseIso(s.started_at);
        const finished = Instant.parseIso(s.finished_at);
        await this.store.insertStep(tx, agentRunId, {
          stepId: this.ids.newId(),
          kind: 'NODE',
          node: s.node,
          outcome: s.outcome,
          detailCode: s.detail_code,
          toolCallId: s.tool_call_id,
          retryCount: s.retry_count,
          startedAt: started.toDb(),
          finishedAt: (finished.isBefore(started) ? started : finished).toDb(),
          durationMs: Math.max(0, finished.epochMs - started.epochMs),
          traceId,
        });
      }
      await this.store.setCurrentNode(tx, agentRunId, b.steps.at(-1)!.node, this.clock.now().toDb());
    });
    return { recorded: b.steps.length };
  }

  private async gate(authorization: string | undefined, agentRunId: string, write: boolean) {
    this.auth.verify(authorization);
    if (!UUID.test(agentRunId)) throw new ToolGatewayError('AGENT_RUN_NOT_FOUND', 404, 'No agent run with this id');
    const run = await this.runs.findRun(agentRunId);
    if (!run) throw new ToolGatewayError('AGENT_RUN_NOT_FOUND', 404, 'No agent run with this id');
    if (write && run.status !== 'RUNNING') throw notRunning(run.status);
  }
}

const notRunning = (status: string | undefined) => new ToolGatewayError('AGENT_RUN_NOT_ACTIVE', 409, `Execution state is written only while the run is RUNNING (now ${status ?? 'missing'})`);

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body);
  if (!r.success) throw new ValidationError('INVALID_REQUEST', 'Request does not match the agent runtime contract', r.error.issues.map((i) => i.path.join('.')));
  return r.data;
}
