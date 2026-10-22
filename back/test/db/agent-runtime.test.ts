import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type pg from 'pg';
import request from 'supertest';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AgentReconciler } from '../../src/agent-tools/reconciler.js';
import { createApiApp } from '../../src/app/create-api.js';
import { WorkerModule } from '../../src/app/worker.module.js';
import type { Env } from '../../src/config/env.js';
import { DOMAIN_SIGNALS, type DomainSignals } from '../../src/shared/signals/domain-signals.js';
import { actor, hashOf, registry, T0, type Registry } from './fixtures.js';
import { appPool, testEnv } from './support.js';

/**
 * T-104 — 두 프로세스로 도는 CeraRecoveryGraph(ADR-036):
 *   NestJS(권한 · 상태 전이 · checkpoint 저장) ↔ Python LangGraph(추론 · Tool 호출 · interrupt)
 * START → 노드 → Tool → 조건 분기 → interrupt(사람 승인) → **Python 재기동** → 사람 승인 → 신호로 재개 → END.
 * Python 은 DB 자격증명이 없다 — checkpoint 는 /internal/agent-runtime 으로만 쓴다.
 */
const contentDir = mkdtempSync(join(tmpdir(), 'cera-agent-runtime-content-'));
const TOKEN = 'agent-runtime-token-for-tests-' + 'k'.repeat(24) + '-SECRET';
const ACTOR = 'x-cera-actor-id';

let api: INestApplication;
let worker: INestApplicationContext;
let env: Env;
let http: ReturnType<typeof request>;
let db: pg.Pool;
let python: ChildProcess | null = null;
let pythonPort: number;
let apiPort: number;
let w: Registry & { runId: string; truckPoolId: string };

const freePort = () =>
  new Promise<number>((r) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => r(port));
    });
  });

async function startPython(): Promise<void> {
  python = spawn(process.env.CERA_PYTHON ?? 'python', ['-m', 'cera_ai'], {
    cwd: resolve('../ai'),
    env: {
      ...process.env,
      CERA_AI_PORT: String(pythonPort),
      CERA_LLM_MODE: 'replay',
      CERA_AGENT_MODE: 'on',
      CERA_AGENT_TOOL_TOKEN: TOKEN,
      CERA_BACKEND_TOOL_URL: `http://127.0.0.1:${apiPort}`,
      PYTHONIOENCODING: 'utf-8',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 80; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${pythonPort}/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('AI Server did not start (python -m cera_ai)');
}

async function stopPython(): Promise<void> {
  const p = python;
  python = null;
  if (!p || p.exitCode !== null) return;
  await new Promise<void>((r) => {
    p.once('exit', () => r());
    p.kill();
  });
}

async function startApi(): Promise<void> {
  api = await createApiApp(env);
  await api.listen(apiPort, '127.0.0.1');
  http = request(api.getHttpServer());
}

const reconcile = () => worker.get(AgentReconciler).runOnce();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const toolCount = async (id: string, tool: string) =>
  Number((await db.query('SELECT count(*) AS n FROM cera.agent_tool_call WHERE agent_run_id = $1 AND tool_name = $2', [id, tool])).rows[0].n);

async function simulatedRun(scenarioId: string): Promise<string> {
  const snapshotId = v7();
  const runId = v7();
  await db.query(
    `INSERT INTO cera.planning_snapshot (snapshot_id, as_of, fact_fingerprint, rule_version, tariff_version, policy_version, contains_simulated, created_at, scenario_id)
     VALUES ($1, $2, $3, 'r1', 't1', 'p1', true, $2, $4)`,
    [snapshotId, T0, hashOf(`snap-${snapshotId}`), scenarioId],
  );
  await db.query(
    `INSERT INTO cera.recovery_run (run_id, snapshot_id, trigger_type, trigger_ref, objective_version, run_status, total_cost_krw, contains_simulated, executed_at)
     VALUES ($1, $2, 'EXCEPTION_DETECTED', 'RP-RUNTIME', 'o1', 'FEASIBLE', 1250000, true, $3)`,
    [runId, snapshotId, T0],
  );
  return runId;
}

const PARAMS = { inquiry: { quantity: 2, window_from: '15:00', window_to: '17:00' } };

/** A fresh partner truck pool → a new MISSING gap (earlier runs already asked about the older pools). */
const newTruckPool = async () =>
  db.query("INSERT INTO cera.truck_pool (truck_pool_id, pool_name, ownership, owner_counterparty_id) VALUES ($1, 'Runtime 셔틀', 'PARTNER', $2)", [v7(), w.counterpartyId]);

const createRun = async (parameters: unknown = PARAMS) =>
  (await http.post('/agent-runs').set(ACTOR, w.humanId).send({ recovery_run_id: w.runId, goal: 'close the information gaps of the plan', runtime_version: 'test', parameters }).expect(201))
    .body.agent_run_id as string;

const view = async (id: string) => (await http.get(`/agent-runs/${id}`).expect(200)).body;

async function until(id: string, done: (v: { status: string }) => boolean, ms = 30_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await view(id);
    if (done(v)) return v;
    if (Date.now() > end) throw new Error(`run ${id} stuck in ${v.status}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

const draftHash = async (messageId: string) => (await http.get(`/communication/drafts/${messageId}`).expect(200)).body.message.content_hash as string;

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

beforeAll(async () => {
  pythonPort = await freePort();
  apiPort = await freePort();
  env = testEnv({
    CERA_CONTENT_DIR: contentDir,
    CERA_PUBLIC_DATA_MODE: 'replay',
    CERA_PUBLIC_DATA_REPLAY_DIR: '../data/fixtures/public-data',
    CERA_AGENT_TOOLS_ENABLED: 'true',
    CERA_AGENT_TOOL_TOKEN: TOKEN,
    CERA_AGENT_RUNTIME_URL: `http://127.0.0.1:${pythonPort}`,
    CERA_AGENT_RUNTIME_TIMEOUT_MS: '60000',
    CERA_AGENT_RECONCILE_ENABLED: 'true',
    CERA_AGENT_RUNTIME_MAX_ATTEMPTS: '3',
    CERA_AGENT_RUNTIME_RETRY_BASE_MS: '100',
  });
  await startApi();
  // the Worker process's reconciler (same code the worker runs every cycle) — here as an application context
  worker = await NestFactory.createApplicationContext(WorkerModule.forRoot(env), { logger: false });
  db = appPool();
  await actor(db, 'AI_AGENT');
  const r = await registry(db);
  const scenarioId = v7();
  await db.query("INSERT INTO cera.scenario (scenario_id, scenario_name, as_of_base, created_at) VALUES ($1, 'runtime scenario', $2, $2)", [scenarioId, T0]);
  const truckPoolId = v7();
  await db.query("INSERT INTO cera.truck_pool (truck_pool_id, pool_name, ownership, owner_counterparty_id) VALUES ($1, 'Runtime 셔틀', 'PARTNER', $2)", [truckPoolId, r.counterpartyId]);
  w = { ...r, runId: await simulatedRun(scenarioId), truckPoolId };
  await startPython();
}, 60_000);

afterAll(async () => {
  await stopPython();
  // leave no waiting run behind for other test files
  await db?.query("UPDATE cera.agent_run SET status = 'CANCELLED', finished_at = started_at, waiting_reason = NULL, pending_ref_type = NULL, pending_ref_id = NULL, next_attempt_at = NULL WHERE status NOT IN ('COMPLETED', 'FAILED', 'CANCELLED')");
  await worker?.close();
  await api?.close();
  await db?.end();
  rmSync(contentDir, { recursive: true, force: true });
});

describe('CeraRecoveryGraph across two processes', () => {
  let runId: string;
  let messageId: string;

  it('start runs START → load_context → inspect_gaps → choose_next_action → … → request_approval and stops at the human interrupt', async () => {
    runId = await createRun();
    expect((await view(runId)).status).toBe('CREATED');
    const started = (await http.post(`/agent-runs/${runId}/start`).set(ACTOR, w.humanId).expect(200)).body;
    expect(started).toMatchObject({ status: 'WAITING_HUMAN', waiting_reason: 'HUMAN_APPROVAL_REQUIRED', current_node: 'wait_for_human', pending_ref: { type: 'COMM_MESSAGE' } });
    messageId = started.pending_ref.id;
    const nodes = started.steps.filter((s: { kind: string }) => s.kind === 'NODE').map((s: { node: string }) => s.node);
    expect(nodes.slice(0, 6)).toEqual(['load_context', 'inspect_gaps', 'choose_next_action', 'prepare_inquiry', 'create_draft', 'request_approval']);
    expect(started.steps[0].kind).toBe('START');
    expect(started.steps.at(-1)).toMatchObject({ kind: 'INTERRUPT', outcome: 'WAITING_HUMAN' });
    // the graph asked for approval — it did not approve. The draft waits for a person.
    const msg = await db.query('SELECT current_status FROM cera.comm_message WHERE message_id = $1', [messageId]);
    expect(msg.rows[0].current_status).toBe('PENDING_APPROVAL');
    const calls = await db.query('SELECT tool_name FROM cera.agent_tool_call WHERE agent_run_id = $1 ORDER BY started_at', [runId]);
    expect(calls.rows.map((c) => c.tool_name)).toEqual(['get_recovery_context', 'get_information_gaps', 'find_counterparty', 'create_inquiry_draft', 'request_approval']);
    // checkpoints were written through the backend (rows + content store), including the interrupt
    expect(Number((await db.query('SELECT count(*) AS n FROM cera.agent_checkpoint WHERE agent_run_id = $1', [runId])).rows[0].n)).toBeGreaterThan(3);
    const interrupts = await db.query("SELECT 1 FROM cera.agent_checkpoint_write WHERE agent_run_id = $1 AND channel = '__interrupt__'", [runId]);
    expect(interrupts.rowCount).toBeGreaterThan(0);
  });

  it('a second start returns the current state — no second graph, no second draft', async () => {
    const again = (await http.post(`/agent-runs/${runId}/start`).set(ACTOR, w.humanId).expect(200)).body;
    expect(again.status).toBe('WAITING_HUMAN');
    expect(again.steps.filter((s: { kind: string }) => s.kind === 'START')).toHaveLength(1);
    expect(Number((await db.query("SELECT count(*) AS n FROM cera.agent_tool_call WHERE agent_run_id = $1 AND tool_name = 'create_inquiry_draft'", [runId])).rows[0].n)).toBe(1);
  });

  it('the Python process restarts; a human approves; the approval signal resumes the run from its checkpoint to COMPLETED', async () => {
    await stopPython();
    await startPython(); // a new process: nothing of the first graph is in memory
    await http
      .post(`/communication/drafts/${messageId}/approve`)
      .set(ACTOR, w.humanId)
      .send({ content_hash: await draftHash(messageId) })
      .expect(200);
    const done = await until(runId, (v) => v.status === 'COMPLETED' || v.status === 'FAILED');
    expect(done).toMatchObject({ status: 'COMPLETED', pending_ref: null, waiting_reason: null });
    const steps = done.steps as { kind: string; node: string | null; outcome: string; detail_code: string | null }[];
    expect(steps.filter((s) => s.kind === 'RESUME')).toHaveLength(1);
    const afterResume = steps.slice(steps.findIndex((s) => s.kind === 'RESUME') + 1);
    // continued after the interrupt — the first nodes did not run again
    expect(afterResume.filter((s) => s.kind === 'NODE').map((s) => s.node)).toEqual(['wait_for_human', 'refresh_status', 'build_result']);
    expect(afterResume.find((s) => s.node === 'refresh_status')?.detail_code).toBe('APPROVED');
    expect(steps.at(-1)).toMatchObject({ kind: 'TERMINAL', outcome: 'COMPLETED', detail_code: 'INQUIRY_APPROVED' });
    const calls = await db.query('SELECT tool_name FROM cera.agent_tool_call WHERE agent_run_id = $1 ORDER BY started_at', [runId]);
    expect(calls.rows.map((c) => c.tool_name).slice(5)).toEqual(['get_communication_status']); // re-read the authoritative status
    // a resume of a finished run is a no-op
    const late = (await http.post(`/agent-runs/${runId}/resume`).set(ACTOR, w.humanId).send({ reason: 'MANUAL' }).expect(200)).body;
    expect(late.status).toBe('COMPLETED');
    await expectSql(db.query("UPDATE cera.agent_run SET status = 'RUNNING' WHERE agent_run_id = $1", [runId]), 'CE004');
  });

  it('a rejected draft ends the run with INQUIRY_REJECTED', async () => {
    await newTruckPool();
    const id = await createRun();
    const started = (await http.post(`/agent-runs/${id}/start`).set(ACTOR, w.humanId).expect(200)).body;
    expect(started.status).toBe('WAITING_HUMAN');
    const mid = started.pending_ref.id as string;
    // O. two resume calls at once while the draft is still pending: the backend status is re-read, the run waits again,
    //    and nothing is drafted twice
    const both = await Promise.all([0, 1].map(() => http.post(`/agent-runs/${id}/resume`).set(ACTOR, w.humanId).send({ reason: 'MANUAL' })));
    expect(both.map((r) => r.status)).toEqual([200, 200]);
    expect((await view(id)).status).toBe('WAITING_HUMAN');
    expect(Number((await db.query("SELECT count(*) AS n FROM cera.agent_tool_call WHERE agent_run_id = $1 AND tool_name = 'create_inquiry_draft'", [id])).rows[0].n)).toBe(1);
    await http.post(`/communication/drafts/${mid}/reject`).set(ACTOR, w.humanId).send({ reason: '시간대가 맞지 않음', content_hash: await draftHash(mid) }).expect(200);
    const done = await until(id, (v) => v.status === 'COMPLETED' || v.status === 'FAILED');
    expect(done.status).toBe('COMPLETED');
    expect(done.steps.at(-1)).toMatchObject({ kind: 'TERMINAL', detail_code: 'INQUIRY_REJECTED' });
  });

  it('without human parameters the graph fails with a typed code instead of inventing numbers', async () => {
    await newTruckPool();
    const id = await createRun({});
    const done = (await http.post(`/agent-runs/${id}/start`).set(ACTOR, w.humanId).expect(200)).body;
    expect(done).toMatchObject({ status: 'FAILED', last_error_code: 'INQUIRY_PARAMETERS_REQUIRED' });
    expect(Number((await db.query("SELECT count(*) AS n FROM cera.agent_tool_call WHERE agent_run_id = $1 AND tool_name = 'create_inquiry_draft'", [id])).rows[0].n)).toBe(0);
  });

  it('runtime API: wrong token refused; checkpoints only for RUNNING runs; finished runs are frozen', async () => {
    await http.get(`/internal/agent-runtime/runs/${runId}/checkpoints`).expect(401);
    await http.get(`/internal/agent-runtime/runs/${runId}/checkpoints`).set('authorization', `Bearer ${TOKEN}x`).expect(401);
    const res = await http
      .put(`/internal/agent-runtime/runs/${runId}/checkpoints`)
      .set('authorization', `Bearer ${TOKEN}`)
      .send({ checkpoint_ns: '', checkpoint_id: 'late-1', parent_checkpoint_id: null, checkpoint: { type: 'msgpack', b64: '' }, metadata: { source: 'loop', step: 99 } });
    expect(res.status).toBeGreaterThanOrEqual(400);
    // the app role has no DELETE on runtime records (privilege layer); the append-only trigger is the next layer
    await expectSql(db.query('DELETE FROM cera.agent_checkpoint WHERE agent_run_id = $1', [runId]), '42501');
    await expectSql(db.query('DELETE FROM cera.agent_step WHERE agent_run_id = $1', [runId]), '42501');
    await expectSql(db.query('UPDATE cera.agent_step SET outcome = $2 WHERE agent_run_id = $1', [runId, 'X']), '42501');
  });

  it('the service token is nowhere in checkpoints, writes, steps, content files or error records', async () => {
    const writes = await db.query('SELECT value_b64 FROM cera.agent_checkpoint_write');
    const decoded = writes.rows.map((r) => Buffer.from(r.value_b64, 'base64').toString('latin1')).join('');
    const rows = JSON.stringify((await db.query('SELECT * FROM cera.agent_step')).rows) + JSON.stringify((await db.query('SELECT * FROM cera.agent_checkpoint')).rows);
    const errors = JSON.stringify((await db.query('SELECT * FROM cera.system_error')).rows);
    const files = filesUnder(contentDir).map((f) => readFileSync(f).toString('latin1')).join('');
    for (const blob of [decoded, rows, errors, files]) {
      expect(blob).not.toContain(TOKEN);
      expect(blob).not.toContain('-SECRET');
    }
    expect(files.length).toBeGreaterThan(0);
  });

  it('lost wake-up: the approval commits but its signal never arrives; after an API restart the reconciler resumes the same run', async () => {
    await newTruckPool();
    const id = await createRun();
    const started = (await http.post(`/agent-runs/${id}/start`).set(ACTOR, w.humanId).expect(200)).body;
    expect(started.status).toBe('WAITING_HUMAN');
    const mid = started.pending_ref.id as string;
    // fault injection: the in-process signal is dropped (as if the process died right after the approval commit)
    (api.get(DOMAIN_SIGNALS) as DomainSignals).emit = () => undefined;
    await http.post(`/communication/drafts/${mid}/approve`).set(ACTOR, w.humanId).send({ content_hash: await draftHash(mid) }).expect(200);
    await sleep(300);
    expect((await view(id)).status).toBe('WAITING_HUMAN'); // nothing woke it
    // "NestJS restart": a fresh API process (no memory of the run) — then the worker's startup / periodic reconcile
    await api.close();
    await startApi();
    const summary = await reconcile();
    expect(summary.woken).toBeGreaterThanOrEqual(1);
    const done = await until(id, (v) => v.status === 'COMPLETED' || v.status === 'FAILED');
    expect(done.steps.at(-1)).toMatchObject({ kind: 'TERMINAL', outcome: 'COMPLETED', detail_code: 'INQUIRY_APPROVED' });
    expect(done.steps.filter((s: { kind: string; detail_code: string }) => s.kind === 'RESUME').map((s: { detail_code: string }) => s.detail_code)).toEqual(['APPROVAL_DECIDED']);
    // no duplicates: one draft, one approval request, one approval
    expect(await toolCount(id, 'create_inquiry_draft')).toBe(1);
    expect(await toolCount(id, 'request_approval')).toBe(1);
    expect(Number((await db.query("SELECT count(*) AS n FROM cera.message_approval WHERE message_id = $1 AND decision = 'APPROVED'", [mid])).rows[0].n)).toBe(1);
    // reconciling again does nothing
    expect((await reconcile()).woken).toBe(0);
  });

  it('runtime outage is transient: WAITING_RUNTIME with bounded backoff, the retry continues the same run once Python is back', async () => {
    await stopPython();
    await newTruckPool();
    const id = await createRun();
    const first = (await http.post(`/agent-runs/${id}/start`).set(ACTOR, w.humanId).expect(200)).body;
    expect(first).toMatchObject({ status: 'WAITING_RUNTIME', waiting_reason: 'AGENT_RUNTIME_UNAVAILABLE', runtime_attempts: 1, finished_at: null });
    expect(first.next_attempt_at).not.toBeNull();
    expect((await reconcile()).retried).toBe(0); // not due yet (100 ms)
    await sleep(150);
    await reconcile(); // attempt 2 — still down
    expect(await view(id)).toMatchObject({ status: 'WAITING_RUNTIME', runtime_attempts: 2 });
    await startPython();
    await sleep(250); // 200 ms backoff
    await reconcile(); // attempt 3 — Python is back: continues (no checkpoint yet → start)
    const resumed = await view(id);
    expect(resumed).toMatchObject({ status: 'WAITING_HUMAN', runtime_attempts: 0, next_attempt_at: null });
    expect(await toolCount(id, 'create_inquiry_draft')).toBe(1);
    const errs = await db.query('SELECT error_code, retryable FROM cera.system_error WHERE related_entity_id = $1 ORDER BY occurred_at', [id]);
    expect(errs.rows).toEqual([
      { error_code: 'AGENT_RUNTIME_UNAVAILABLE', retryable: true },
      { error_code: 'AGENT_RUNTIME_UNAVAILABLE', retryable: true },
    ]);
  });

  it('the retry limit ends the run: max attempts → FAILED (no infinite retry)', async () => {
    await stopPython();
    await newTruckPool();
    const id = await createRun();
    await http.post(`/agent-runs/${id}/start`).set(ACTOR, w.humanId).expect(200);
    await sleep(150);
    await reconcile();
    await sleep(250);
    await reconcile();
    expect(await view(id)).toMatchObject({ status: 'FAILED', last_error_code: 'AGENT_RUNTIME_UNAVAILABLE', runtime_attempts: 3 });
    await sleep(500);
    expect((await reconcile()).retried).toBe(0);
    await startPython();
  });
});

async function expectSql(p: Promise<unknown>, code: string): Promise<void> {
  try {
    await p;
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code);
    return;
  }
  throw new Error(`expected SQLSTATE ${code}`);
}
