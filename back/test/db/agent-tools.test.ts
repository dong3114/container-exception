import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';
import request from 'supertest';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/app/create-api.js';
import type { Env } from '../../src/config/env.js';
import { actor, hashOf, registry, T0, type Registry } from './fixtures.js';
import { appPool, testEnv } from './support.js';

/**
 * T-103 — Agent Tool Layer: Python Agent Runtime(여기서는 HTTP 로 흉내) → /internal/agent-tools → 기존 도메인 서비스.
 * 인증 · 실행 범위 · 멱등 · 승인 요청(승인 아님) · 공공데이터 Tool(replay) · 비밀값 누출 · 동시 호출을 본다.
 */
const contentDir = mkdtempSync(join(tmpdir(), 'cera-agent-tools-content-'));
const TOKEN = 'agent-tool-token-for-tests-' + 'z'.repeat(24) + '-SECRET';
const env = (extra: Partial<Record<keyof Env, string>> = {}) =>
  testEnv({ CERA_CONTENT_DIR: contentDir, CERA_PUBLIC_DATA_MODE: 'replay', CERA_PUBLIC_DATA_REPLAY_DIR: '../data/fixtures/public-data', ...extra });

let api: INestApplication;
let disabledApi: INestApplication;
let http: ReturnType<typeof request>;
let db: pg.Pool;
let humanId: string;
let w: World;

interface World extends Registry {
  scenarioId: string;
  runId: string;
  otherRunId: string;
  truckPoolId: string;
  facilityId: string;
}

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
     VALUES ($1, $2, 'EXCEPTION_DETECTED', 'RP-AGENT', 'o1', 'FEASIBLE', 1250000, true, $3)`,
    [runId, snapshotId, T0],
  );
  return runId;
}

const tool = (name: string, runId: string | null, body: unknown, extra: Record<string, string> = {}) => {
  let req = http.post(`/internal/agent-tools/${name}`).set('authorization', `Bearer ${TOKEN}`);
  if (runId) req = req.set('x-cera-agent-run-id', runId);
  for (const [k, v] of Object.entries(extra)) req = req.set(k, v);
  return req.send(body as object);
};

const startRun = async (recoveryRunId: string) =>
  (await http.post('/agent-runs').set('x-cera-actor-id', humanId).send({ recovery_run_id: recoveryRunId, goal: 'close the information gaps of the plan', runtime_version: 'test' }).expect(201)).body
    .agent_run_id as string;

const truckDraft = () => ({
  address_id: w.addressId,
  intent: 'TRUCK_SLOT',
  target_id: w.truckPoolId,
  values: [
    { key: 'quantity', value_number: 2, unit: 'TRUCK' },
    { key: 'date', value_text: '2026-10-01' },
    { key: 'window_from', value_text: '15:00' },
    { key: 'window_to', value_text: '17:00' },
  ],
});

const count = async (sql: string, params: unknown[] = []) => Number((await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${sql}`, params)).rows[0]?.n);

beforeAll(async () => {
  api = await createApiApp(env({ CERA_AGENT_TOOLS_ENABLED: 'true', CERA_AGENT_TOOL_TOKEN: TOKEN }));
  await api.init();
  disabledApi = await createApiApp(env({ CERA_AGENT_TOOLS_ENABLED: 'false' }));
  await disabledApi.init();
  http = request(api.getHttpServer());
  db = appPool();
  humanId = await actor(db, 'HUMAN');
  await actor(db, 'AI_AGENT');
  const r = await registry(db);
  const scenarioId = v7();
  await db.query("INSERT INTO cera.scenario (scenario_id, scenario_name, as_of_base, created_at) VALUES ($1, 'agent scenario', $2, $2)", [scenarioId, T0]);
  const truckPoolId = v7();
  const facilityId = v7();
  await db.query("INSERT INTO cera.truck_pool (truck_pool_id, pool_name, ownership, owner_counterparty_id) VALUES ($1, 'Agent 셔틀', 'PARTNER', $2)", [truckPoolId, r.counterpartyId]);
  await db.query("INSERT INTO cera.facility (facility_id, facility_type, facility_name) VALUES ($1, 'WAREHOUSE', 'Agent 창고')", [facilityId]);
  w = { ...r, scenarioId, runId: await simulatedRun(scenarioId), otherRunId: await simulatedRun(scenarioId), truckPoolId, facilityId };
});

afterAll(async () => {
  await api.close();
  await disabledApi.close();
  await db.end();
  rmSync(contentDir, { recursive: true, force: true });
});

describe('gateway: service auth, run scope, registry only', () => {
  it('A. disabled tools refuse every call; B. a wrong or missing token is refused; nothing is recorded', async () => {
    const off = await request(disabledApi.getHttpServer()).post('/internal/agent-tools/get_recovery_context').set('authorization', `Bearer ${TOKEN}`).send({}).expect(503);
    expect(off.body).toMatchObject({ status: 'REJECTED', error: { code: 'AGENT_TOOLS_DISABLED' } });
    const runId = await startRun(w.runId);
    expect((await http.post('/internal/agent-tools/get_recovery_context').set('x-cera-agent-run-id', runId).send({}).expect(401)).body.error.code).toBe('UNAUTHORIZED_AGENT');
    await http.post('/internal/agent-tools/get_recovery_context').set('authorization', `Bearer ${TOKEN}x`).set('x-cera-agent-run-id', runId).send({}).expect(401);
    // 토큰을 쿼리에 넣어도 인증되지 않는다
    await http.post(`/internal/agent-tools/get_recovery_context?token=${TOKEN}`).set('x-cera-agent-run-id', runId).send({}).expect(401);
    expect(await count('cera.agent_tool_call WHERE agent_run_id = $1', [runId])).toBe(0);
  });

  it('runs are started by a human for one recovery run; the agent cannot pose as a human or start its own run', async () => {
    const agentId = (await db.query("SELECT actor_id FROM cera.actor WHERE actor_type = 'AI_AGENT' AND is_active ORDER BY actor_id LIMIT 1")).rows[0].actor_id;
    await http.post('/agent-runs').set('x-cera-actor-id', agentId).send({ recovery_run_id: w.runId, goal: 'x' }).expect(403);
    await http.post('/agent-runs').send({ recovery_run_id: w.runId, goal: 'x' }).expect(400);
    const runId = await startRun(w.runId);
    const view = (await http.get(`/agent-runs/${runId}`).expect(200)).body;
    expect(view).toMatchObject({ recovery_run_id: w.runId, status: 'CREATED', agent_actor_id: agentId, created_by_actor_id: humanId, is_simulated: true });
    expect((await http.get('/agent-runs/runtime').expect(200)).body).toMatchObject({ tools_enabled: true, tool_count: 10 });
  });

  it('I. only registered tools exist — approve / send are not reachable as tools', async () => {
    const runId = await startRun(w.runId);
    for (const name of ['approve_draft', 'send', 'request_send', 'confirm_fact']) {
      expect((await tool(name, runId, {}).expect(404)).body.error.code).toBe('TOOL_NOT_FOUND');
    }
    const catalog = (await http.get('/internal/agent-tools').set('authorization', `Bearer ${TOKEN}`).expect(200)).body;
    expect(catalog.tools.map((t: { name: string }) => t.name)).toHaveLength(10);
    expect(catalog.tools.every((t: { category: string }) => ['READ', 'EXTERNAL_READ', 'COMPUTE', 'PROPOSE', 'REQUEST'].includes(t.category))).toBe(true);
  });

  it('C. a run bound to R1 cannot read or act on R2', async () => {
    const runId = await startRun(w.runId);
    const ctx = await tool('get_recovery_context', runId, { recovery_run_id: w.otherRunId }).expect(200);
    expect(ctx.body).toMatchObject({ status: 'REJECTED', error: { code: 'OUT_OF_SCOPE' } });
    const gaps = await tool('get_information_gaps', runId, { recovery_run_id: w.otherRunId }).expect(200);
    expect(gaps.body.error.code).toBe('OUT_OF_SCOPE');
    // R2 의 초안은 R1 실행이 보지도, 승인 요청하지도 못한다
    const otherRun = await startRun(w.otherRunId);
    const other = await tool('create_inquiry_draft', otherRun, truckDraft(), { 'idempotency-key': 'r2-draft-1' }).expect(200);
    const otherMessage = other.body.output.message.message_id;
    expect((await tool('get_communication_status', runId, { message_id: otherMessage }).expect(200)).body.error.code).toBe('OUT_OF_SCOPE');
    expect((await tool('request_approval', runId, { message_id: otherMessage }, { 'idempotency-key': 'steal' }).expect(200)).body.error.code).toBe('OUT_OF_SCOPE');
    const rows = await db.query("SELECT status, error_code FROM cera.agent_tool_call WHERE agent_run_id = $1 AND error_code = 'OUT_OF_SCOPE'", [runId]);
    expect(rows.rows).toHaveLength(4);
    expect(rows.rows.every((r) => r.status === 'REJECTED')).toBe(true);
  });
});

describe('CERA read tools', () => {
  it('recovery context and information gaps are DTOs for the agent, scoped to the run, deterministic', async () => {
    const runId = await startRun(w.runId);
    const ctx = await tool('get_recovery_context', runId, {}).expect(200);
    expect(ctx.body.status).toBe('SUCCEEDED');
    expect(ctx.body.output.recovery_run).toMatchObject({ run_id: w.runId, total_cost_krw: '1250000', cost_result_kind: 'SCENARIO_RESULT', contains_simulated: true });
    expect(ctx.body.output.snapshot.plan_date).toBe('2026-10-01');
    expect(ctx.body.output.limitations.join(' ')).toContain('NOT_RECONCILED');
    const gaps = (await tool('get_information_gaps', runId, {}).expect(200)).body.output;
    expect(gaps.rule_version).toBe('gap-rules/1');
    expect(gaps.gaps.every((g: { candidate_state: string }) => g.candidate_state === 'NONE')).toBe(true); // nothing asked yet
    const ours = gaps.gaps.filter((g: { subject_id: string }) => g.subject_id === w.facilityId || g.subject_id === w.truckPoolId);
    expect(ours.map((g: { gap_kind: string; state: string; public_data_can_resolve: boolean }) => [g.gap_kind, g.state, g.public_data_can_resolve]).sort()).toEqual([
      ['FACILITY_CAPACITY', 'MISSING', false],
      ['TRUCK_AVAILABILITY', 'MISSING', false],
    ]);
    const again = (await tool('get_information_gaps', runId, {}).expect(200)).body.output;
    expect(again.gaps.map((g: { gap_id: string }) => g.gap_id)).toEqual(gaps.gaps.map((g: { gap_id: string }) => g.gap_id));
  });

  it('find_counterparty returns ids and Contact Gate verdicts, not address strings', async () => {
    const runId = await startRun(w.runId);
    const res = (await tool('find_counterparty', runId, { role: 'TRUCKING' }).expect(200)).body.output;
    const ours = res.counterparties.find((c: { counterparty_id: string }) => c.counterparty_id === w.counterpartyId);
    expect(ours.contacts[0].addresses[0]).toEqual({ address_id: w.addressId, channel_type: 'MOCK', eligible: true, blocked_reasons: [], is_simulated: true });
    expect(JSON.stringify(res)).not.toContain('@example.invalid');
  });
});

describe('public data tools (replay)', () => {
  it('D. get_vessel_calls and E. get_container_manifest go through the public data service and carry provenance', async () => {
    const runId = await startRun(w.runId);
    const calls = await tool('get_vessel_calls', runId, { from_date: '2026-10-20', to_date: '2026-10-21' }).expect(200);
    expect(calls.body.status).toBe('SUCCEEDED');
    expect(calls.body.output.summary).toMatchObject({ mode: 'REPLAY', outcome: 'SUCCESS' });
    const express = calls.body.output.items.find((v: { call_sign: string }) => v.call_sign === 'D7CR01');
    expect(express.registered_from).toMatchObject({ source_type: 'PUBLIC_API', mode: 'REPLAY', result_kind: 'SCENARIO_RESULT' });
    // 원장에 호출 주체로 Agent 행위자가 남는다
    const agentId = (await db.query("SELECT actor_id FROM cera.actor WHERE actor_type = 'AI_AGENT' ORDER BY actor_id LIMIT 1")).rows[0].actor_id;
    expect(await count('cera.public_data_fetch WHERE requested_by_actor_id = $1', [agentId])).toBeGreaterThan(0);

    const manifest = await tool('get_container_manifest', runId, { vessel_call_id: express.vessel_call_id }).expect(200);
    expect(manifest.body.output.containers).toHaveLength(51);
    expect(manifest.body.output.containers[0].registered_from).toMatchObject({ dataset: 'MOF_CONTAINER_MANIFEST', mode: 'REPLAY' });
    const detail = await tool('get_vessel_call', runId, { vessel_call_id: express.vessel_call_id }).expect(200);
    expect(detail.body.output.containers).toHaveLength(51);
    const missing = await tool('get_vessel_calls', runId, { from_date: '2026-01-01', to_date: '2026-01-02' }).expect(200);
    expect(missing.body).toMatchObject({ status: 'REJECTED', error: { code: 'CAPABILITY_NOT_AVAILABLE', cause_code: 'REPLAY_FIXTURE_NOT_FOUND' } });
    const bad = await tool('get_vessel_calls', runId, { from_date: '2026/10/20', to_date: '2026-10-21' }).expect(200);
    expect(bad.body).toMatchObject({ status: 'REJECTED', error: { code: 'INVALID_ARGUMENT' } });
  });
});

describe('communication tools', () => {
  it('F. create_inquiry_draft uses the existing Contact Gate and number check and stays DRAFTED; G. same key = same draft', async () => {
    const runId = await startRun(w.runId);
    const first = await tool('create_inquiry_draft', runId, truckDraft(), { 'idempotency-key': 'draft-1' }).expect(200);
    expect(first.body).toMatchObject({ status: 'SUCCEEDED', replayed: false, output: { number_check_passed: true, next_step: 'REQUEST_APPROVAL', message: { status: 'DRAFTED', approval_ready: false } } });
    const messageId = first.body.output.message.message_id;
    const thread = await db.query('SELECT t.related_run_id FROM cera.comm_message m JOIN cera.comm_thread t ON t.thread_id = m.thread_id WHERE m.message_id = $1', [messageId]);
    expect(thread.rows[0].related_run_id).toBe(w.runId); // 계획 실행은 실행 기록이 정했다
    const transitions = await db.query('SELECT s.status, a.actor_type FROM cera.message_status_transition s JOIN cera.actor a ON a.actor_id = s.actor_id WHERE s.message_id = $1', [messageId]);
    expect(transitions.rows).toEqual([{ status: 'DRAFTED', actor_type: 'AI_AGENT' }]);

    const retry = await tool('create_inquiry_draft', runId, truckDraft(), { 'idempotency-key': 'draft-1' }).expect(200);
    expect(retry.body).toMatchObject({ status: 'SUCCEEDED', replayed: true, tool_call_id: first.body.tool_call_id });
    expect(retry.body.output.message.message_id).toBe(messageId);
    const reused = await tool('create_inquiry_draft', runId, { ...truckDraft(), values: truckDraft().values.map((v) => (v.key === 'quantity' ? { ...v, value_number: 3 } : v)) }, { 'idempotency-key': 'draft-1' }).expect(200);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await count("cera.comm_message m JOIN cera.comm_thread t ON t.thread_id = m.thread_id WHERE t.related_run_id = $1 AND m.direction = 'OUTBOUND'", [w.runId])).toBe(1);

    const noKey = await tool('create_inquiry_draft', runId, truckDraft()).expect(200);
    expect(noKey.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const ineligible = await tool('create_inquiry_draft', runId, { ...truckDraft(), address_id: v7() }, { 'idempotency-key': 'draft-x' }).expect(200);
    expect(ineligible.body).toMatchObject({ status: 'REJECTED', error: { code: 'NOT_FOUND', cause_code: 'ADDRESS_NOT_FOUND' } });
    const pickRun = await tool('create_inquiry_draft', runId, { ...truckDraft(), source_run_id: w.otherRunId }, { 'idempotency-key': 'draft-y' }).expect(200);
    expect(pickRun.body.error.code).toBe('INVALID_ARGUMENT'); // Agent 는 계획 실행을 고르지 못한다
  });

  it('H. request_approval queues for a human and re-checks — it never approves; status reflects it', async () => {
    const runId = await startRun(w.runId);
    const draft = await tool('create_inquiry_draft', runId, truckDraft(), { 'idempotency-key': 'draft-h' }).expect(200);
    const messageId = draft.body.output.message.message_id;
    const requested = await tool('request_approval', runId, { message_id: messageId }, { 'idempotency-key': 'approve-h' }).expect(200);
    expect(requested.body).toMatchObject({ status: 'SUCCEEDED', output: { approval_requested: true, already_pending: false, message: { status: 'PENDING_APPROVAL', approval_ready: true } } });
    expect(await count('cera.message_approval WHERE message_id = $1', [messageId])).toBe(0);
    expect(await count("cera.audit_log WHERE action = 'APPROVAL_REQUESTED' AND target_id = $1", [messageId])).toBe(1);
    const again = await tool('request_approval', runId, { message_id: messageId }, { 'idempotency-key': 'approve-h2' }).expect(200);
    expect(again.body.output.already_pending).toBe(true);
    const status = await tool('get_communication_status', runId, {}).expect(200);
    expect(status.body.output.messages.find((m: { message_id: string }) => m.message_id === messageId)).toMatchObject({ status: 'PENDING_APPROVAL', dispatch_state: expect.any(String) });
    // 사람 승인 API 는 Agent 행위자를 거부한다(DB 도 승인 결정을 HUMAN 으로 막는다)
    const agentId = (await db.query("SELECT actor_id FROM cera.actor WHERE actor_type = 'AI_AGENT' ORDER BY actor_id LIMIT 1")).rows[0].actor_id;
    const content = (await http.get(`/communication/drafts/${messageId}`).expect(200)).body.message.content_hash;
    await http.post(`/communication/drafts/${messageId}/approve`).set('x-cera-actor-id', agentId).send({ content_hash: content }).expect(403);
  });
});

describe('records, concurrency and secrets', () => {
  it('L. concurrent identical side-effect calls make one draft and one succeeded call; reads each get a record', async () => {
    const runId = await startRun(w.runId);
    const results = await Promise.all(Array.from({ length: 6 }, () => tool('create_inquiry_draft', runId, truckDraft(), { 'idempotency-key': 'race-1' })));
    const bodies = results.map((r) => r.body);
    const ids = new Set(bodies.filter((b) => b.status === 'SUCCEEDED').map((b) => b.output.message.message_id));
    expect(ids.size).toBe(1);
    expect(bodies.every((b) => b.status === 'SUCCEEDED' || b.error.code === 'TOOL_CALL_IN_PROGRESS')).toBe(true);
    expect(await count("cera.agent_tool_call WHERE agent_run_id = $1 AND tool_name = 'create_inquiry_draft' AND status = 'SUCCEEDED'", [runId])).toBe(1);
    await Promise.all(Array.from({ length: 5 }, () => tool('get_information_gaps', runId, {}).expect(200)));
    expect(await count("cera.agent_tool_call WHERE agent_run_id = $1 AND tool_name = 'get_information_gaps' AND status = 'SUCCEEDED'", [runId])).toBe(5);
    const view = (await http.get(`/agent-runs/${runId}`).expect(200)).body;
    expect(view.tool_calls.every((c: { input_hash: string }) => /^sha256:/.test(c.input_hash))).toBe(true);
  });

  it('K. the service token is stored nowhere; tool calls keep hashes, not content; cancelled runs refuse calls', async () => {
    const needle = TOKEN.slice(0, 20);
    for (const table of ['agent_tool_call', 'agent_run', 'audit_log', 'system_error', 'raw_input', 'public_data_fetch']) {
      expect(await count(`cera.${table} t WHERE to_jsonb(t)::text LIKE $1`, [`%${needle}%`])).toBe(0);
    }
    expect(await count("cera.agent_tool_call t WHERE to_jsonb(t)::text LIKE '%15:00%'")).toBe(0); // 입력 값은 지문으로만
    const runId = await startRun(w.runId);
    await http.post(`/agent-runs/${runId}/cancel`).set('x-cera-actor-id', humanId).expect(200);
    expect((await tool('get_recovery_context', runId, {}).expect(409)).body.error.code).toBe('AGENT_RUN_NOT_ACTIVE');
  });
});
