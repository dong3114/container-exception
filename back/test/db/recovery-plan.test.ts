import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';
import request from 'supertest';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/app/create-api.js';
import { RecoveryPlanService } from '../../src/planning/recovery-plan.service.js';
import { actor, registry, type Registry } from './fixtures.js';
import { appPool, expectSqlState, ownerPool, testEnv } from './support.js';

/**
 * T-114 — 복구 계획: 결정론 Cost Engine + Solver → 제안 판(PROPOSED) · 판 관리 · 사실 변경 → OUTDATED → 다시 계산(v2) · 사람 승인 · Agent Tool.
 * 시나리오 팩(합성 30대)의 시설 · 풀 id 를 이 파일이 만든 행으로 바꿔 끼운다(시드 · 다른 시험 파일과 섞이지 않게).
 * 오늘(D0 = 2026-10-13) 창고 · ODCY 용량, 협력 트럭 가용은 Truth 사실(사람 직접 입력)에서만 온다.
 */
const contentDir = mkdtempSync(join(tmpdir(), 'cera-plan-content-'));
const TOKEN = 'plan-tool-token-for-tests-' + 'p'.repeat(24) + '-SECRET';
const ACTOR = 'X-CERA-Actor-Id';
const D0 = '2026-10-13';
const AS_OF = '2026-10-13T02:00:00.000Z'; // 11:00 KST — 시나리오 S1(창고 A 수용량 급감 직후)

let api: INestApplication;
let http: ReturnType<typeof request>;
let db: pg.Pool;
let humanId: string;
let agentId: string;
let plans: RecoveryPlanService;

interface World extends Registry {
  runId: string;
  scenarioId: string;
  ids: Record<string, string>;
}
let w: World;

async function newWorld(simulated = true, asOf = AS_OF): Promise<World> {
  const r = await registry(db);
  const scenarioId = v7();
  const snapshotId = v7();
  const runId = v7();
  await db.query("INSERT INTO cera.scenario (scenario_id, scenario_name, as_of_base, created_at) VALUES ($1, 'plan scenario', $2, $2)", [scenarioId, asOf]);
  await db.query(
    `INSERT INTO cera.planning_snapshot (snapshot_id, as_of, fact_fingerprint, rule_version, tariff_version, policy_version, contains_simulated, created_at, scenario_id)
     VALUES ($1, $2, $3, 'r1', 't1', 'p1', $4, $2, $5)`,
    [snapshotId, asOf, `sha256:${'0'.repeat(56)}${snapshotId.slice(-8).replace(/-/g, '0').padStart(8, '0')}`, simulated, simulated ? scenarioId : null],
  );
  await db.query(
    `INSERT INTO cera.recovery_run (run_id, snapshot_id, trigger_type, trigger_ref, objective_version, run_status, contains_simulated, executed_at)
     VALUES ($1, $2, 'EXCEPTION_DETECTED', 'PLAN-TEST', 'o1', 'FEASIBLE', $3, $4)`,
    [runId, snapshotId, simulated, asOf],
  );
  const ids: Record<string, string> = {};
  for (const [code, type, name] of [['WAREHOUSE_A', 'WAREHOUSE', '창고 A'], ['WAREHOUSE_B', 'WAREHOUSE', '창고 B'], ['ODCY_A', 'ODCY', 'ODCY A'], ['ODCY_B', 'ODCY', 'ODCY B']] as const) {
    ids[code] = v7();
    await db.query('INSERT INTO cera.facility (facility_id, facility_type, facility_name) VALUES ($1, $2, $3)', [ids[code], type, name]);
  }
  ids.OWN_FLEET = v7();
  ids.K_TRUCKING = v7();
  await db.query("INSERT INTO cera.truck_pool (truck_pool_id, pool_name, ownership) VALUES ($1, '자사 트럭', 'OWN')", [ids.OWN_FLEET]);
  await db.query("INSERT INTO cera.truck_pool (truck_pool_id, pool_name, ownership, owner_counterparty_id) VALUES ($1, 'K운송', 'PARTNER', $2)", [ids.K_TRUCKING, r.counterpartyId]);
  return { ...r, runId, scenarioId, ids };
}

async function enter(world: World, body: Record<string, unknown>): Promise<string> {
  const view = (
    await http
      .post('/truth/facts/manual')
      .set(ACTOR, humanId)
      .send({ intent: 'OPERATOR_DIRECT_ENTRY', date: D0, source_note: '전화 확인(시험)', scenario_id: world.scenarioId, ...body })
      .expect(200)
  ).body as { current: { event_id: string } };
  return view.current.event_id;
}

/** 오늘 사실 6개(시나리오 S7 과 같은 값, 모두 사람 직접 입력 = CONFIRMED). ODCY A 사건 id 를 돌려준다. */
async function todayFacts(world: World): Promise<{ odcyA: string; whA: string }> {
  const whA = await enter(world, { kind: 'FACILITY_CAPACITY', target_id: world.ids.WAREHOUSE_A, value: 8 });
  await enter(world, { kind: 'FACILITY_CAPACITY', target_id: world.ids.WAREHOUSE_B, value: 10 });
  const odcyA = await enter(world, { kind: 'FACILITY_CAPACITY', target_id: world.ids.ODCY_A, size_type: '40DRY', value: 4 });
  await enter(world, { kind: 'FACILITY_CAPACITY', target_id: world.ids.ODCY_B, value: 6 });
  await enter(world, { kind: 'TRUCK_SLOT', target_id: world.ids.K_TRUCKING, window_from: '15:00', window_to: '17:00', value: 2 });
  await enter(world, { kind: 'TRUCK_SLOT', target_id: world.ids.K_TRUCKING, window_from: '17:00', window_to: '19:00', value: 1 });
  return { odcyA, whA };
}

const tool = (name: string, runId: string, body: unknown, key?: string) => {
  let req = http.post(`/internal/agent-tools/${name}`).set('authorization', `Bearer ${TOKEN}`).set('x-cera-agent-run-id', runId);
  if (key) req = req.set('idempotency-key', key);
  return req.send(body as object);
};

beforeAll(async () => {
  api = await createApiApp(testEnv({ CERA_CONTENT_DIR: contentDir, CERA_AGENT_TOOLS_ENABLED: 'true', CERA_AGENT_TOOL_TOKEN: TOKEN }));
  await api.init();
  http = request(api.getHttpServer());
  db = appPool();
  humanId = await actor(db, 'HUMAN');
  agentId = await actor(db, 'AI_AGENT');
  await actor(db, 'SYSTEM');
  plans = api.get(RecoveryPlanService);
  w = await newWorld();
  plans.packIds = w.ids;
});

afterAll(async () => {
  await api.close();
  await db.end();
  rmSync(contentDir, { recursive: true, force: true });
});

describe('T-114 recovery plan — deterministic engine on Truth facts, versioned, outdated by fact changes, approved by a human only', () => {
  let v1: { plan_id: string; plan_hash: string };
  let odcyAEvent: string;

  it('A. the cost preview uses Truth facts for today and the data pack for the rest — and stores nothing', async () => {
    const before = (await http.get(`/planning/runs/${w.runId}/costs`).expect(200)).body;
    // 오늘 사실이 아직 없다 → 오늘 창고 · ODCY 사실 없음(FACT_MISSING) — 숫자를 지어내지 않는다
    expect(before.candidates).toHaveLength(23);
    const keep = before.options.find((o: { option_id: string }) => o.option_id === `C001|KEEP_CURRENT_PLAN|${w.ids.WAREHOUSE_A}|${D0}`);
    expect(keep.feasible).toBe(false);
    expect(keep.infeasible_reasons.map((r: { code: string }) => r.code)).toContain('FACT_MISSING');
    ({ odcyA: odcyAEvent } = await todayFacts(w));
    const c = (await http.get(`/planning/runs/${w.runId}/costs`).expect(200)).body;
    expect(c.as_of).toBe('2026-10-13T11:00:00.000+09:00');
    expect(c.feasible_option_count).toBeGreaterThan(100);
    const truth = c.facts.filter((f: { source: string }) => f.source === 'TRUTH');
    expect(truth.map((f: { fact_key: string }) => f.fact_key).sort()).toEqual(
      ['available.slot(2026-10-13T15:00-17:00)', 'available.slot(2026-10-13T17:00-19:00)', 'capacity.day(2026-10-13)', 'capacity.day(2026-10-13)', 'capacity.day(2026-10-13)', 'capacity.size_type(40DRY).day(2026-10-13)'].sort(),
    );
    expect(truth.every((f: { fact_state: string; usage: string }) => f.fact_state === 'CONFIRMED' && f.usage === 'USED')).toBe(true);
    // 다음 날 창고 용량은 팩(시나리오) 값 — 출처가 다르게 표시된다
    expect(c.facts.find((f: { fact_key: string; subject_id: string }) => f.subject_id === w.ids.WAREHOUSE_A && f.fact_key === 'capacity.day(2026-10-14)')).toMatchObject({ source: 'SCENARIO', value: 11 });
    // 영향 12대의 Baseline(같은 엔진) = 시나리오 Baseline 과 같은 규칙
    expect(c.baseline.base_cost).toBeGreaterThan(0);
    expect(Number((await db.query('SELECT count(*) FROM cera.recovery_plan WHERE case_run_id = $1', [w.runId])).rows[0].count)).toBe(0);
  });

  it('B. propose → v1 PROPOSED: numbers are the engine output, the snapshot records the facts (event ids · states · as_of · policy); same inputs → the same version', async () => {
    const p = (await http.post(`/planning/runs/${w.runId}/plans`).set(ACTOR, humanId).expect(200)).body;
    expect(p).toMatchObject({ version: 1, plan_status: 'PROPOSED', solver_status: 'OPTIMAL', result_kind: 'ENGINE_RESULT', contains_simulated: true, candidate_count: 23 });
    expect(p.items).toHaveLength(23);
    expect(p.objective_krw).toBe(p.items.reduce((s: number, i: { total_krw: number }) => s + i.total_krw, 0));
    expect(p.base_cost_krw + p.risk_penalty_krw).toBe(p.objective_krw);
    expect(p.saving_krw).toBe(p.baseline_total_krw - p.objective_krw);
    expect(p.objective_krw).toBeLessThanOrEqual(p.baseline_total_krw);
    expect(p.items.filter((i: { action: string; destination_id: string }) => i.action === 'KEEP_CURRENT_PLAN' && i.destination_id === w.ids.WAREHOUSE_A)).toHaveLength(8);
    expect(p.items.filter((i: { target_id: string }) => i.target_id === w.ids.ODCY_A).length).toBeLessThanOrEqual(4);
    expect(p.problem.warehouses.find((x: { facility_id: string }) => x.facility_id === w.ids.WAREHOUSE_A)).toMatchObject({ planned: 20, capacity: 8, shortfall: 12 });
    const item = p.items.find((i: { action: string }) => i.action === 'MOVE_TO_ODCY');
    expect(item.detail.cost.lines.length).toBeGreaterThan(2);
    expect(item.reason_codes.length).toBeGreaterThan(0);
    const scope = (await db.query('SELECT s.scope_ref, s.policy_version, s.as_of FROM cera.recovery_plan p JOIN cera.planning_snapshot s USING (snapshot_id) WHERE p.plan_id = $1', [p.plan_id])).rows[0];
    expect(scope.policy_version).toBe('cost-policy/1');
    expect(scope.scope_ref.truth_facts.find((f: { fact_key: string }) => f.fact_key === 'capacity.size_type(40DRY).day(2026-10-13)')).toMatchObject({ fact_ref: `event:${odcyAEvent}`, fact_state: 'CONFIRMED', value: 4 });
    expect((await db.query("SELECT count(*) FROM cera.audit_log WHERE action = 'PLAN_PROPOSED' AND target_id = $1", [p.plan_id])).rows[0].count).toBe('1');
    const again = (await http.post(`/planning/runs/${w.runId}/plans`).set(ACTOR, humanId).expect(200)).body;
    expect(again.plan_id).toBe(p.plan_id);
    expect((await http.get(`/planning/runs/${w.runId}/plans`).expect(200)).body).toMatchObject({ current_plan_id: p.plan_id, plans: [{ version: 1, plan_status: 'PROPOSED' }] });
    v1 = p;
  });

  it('C. a fact the plan relied on is withdrawn → v1 OUTDATED (why) → recalculation → v2 PROPOSED without that resource, v1 SUPERSEDED', async () => {
    await http.post(`/truth/events/${odcyAEvent}/revoke`).set(ACTOR, humanId).send({ reason_code: 'SOURCE_WITHDREW', note: 'ODCY A 취소' }).expect(200);
    await plans.refreshOutdated(w.runId);
    const outdated = (await http.get(`/planning/plans/${v1.plan_id}`).expect(200)).body;
    expect(outdated.plan_status).toBe('OUTDATED');
    expect(outdated.outdated_reasons).toEqual([expect.objectContaining({ code: 'FACT_REVOKED', subject_id: w.ids.ODCY_A, fact_key: 'capacity.size_type(40DRY).day(2026-10-13)' })]);
    // OUTDATED 판은 승인할 수 없다
    expect((await http.post(`/planning/plans/${v1.plan_id}/approve`).set(ACTOR, humanId).send({ plan_hash: v1.plan_hash }).expect(409)).body.code).toBe('PLAN_OUTDATED');
    const v2 = (await http.post(`/planning/runs/${w.runId}/plans`).set(ACTOR, humanId).expect(200)).body;
    expect(v2).toMatchObject({ version: 2, plan_status: 'PROPOSED' });
    expect(v2.items.filter((i: { target_id: string }) => i.target_id === w.ids.ODCY_A)).toHaveLength(0);
    expect(v2.facts.find((f: { fact_key: string; subject_id: string }) => f.subject_id === w.ids.ODCY_A && f.fact_key.startsWith('capacity'))).toMatchObject({ fact_state: 'REVOKED', usage: 'EXCLUDED', reason: 'FACT_REVOKED' });
    expect(v2.objective_krw).toBeGreaterThanOrEqual((await http.get(`/planning/plans/${v1.plan_id}`)).body.objective_krw);
    const old = (await http.get(`/planning/plans/${v1.plan_id}`).expect(200)).body;
    expect(old).toMatchObject({ plan_status: 'SUPERSEDED', superseded_by_plan_id: v2.plan_id });
    v1 = v2;
  });

  it('D. approval: a human only, quoting the plan hash; approval is recorded and not dispatch; DB guards hold', async () => {
    expect((await http.post(`/planning/plans/${v1.plan_id}/approve`).set(ACTOR, humanId).send({ plan_hash: `sha256:${'f'.repeat(64)}` }).expect(409)).body.code).toBe('PLAN_HASH_MISMATCH');
    await http.post(`/planning/plans/${v1.plan_id}/approve`).set(ACTOR, agentId).send({ plan_hash: v1.plan_hash }).expect(403);
    await http.post(`/planning/plans/${v1.plan_id}/approve`).send({ plan_hash: v1.plan_hash }).expect(400);
    const approved = (await http.post(`/planning/plans/${v1.plan_id}/approve`).set(ACTOR, humanId).send({ plan_hash: v1.plan_hash }).expect(200)).body;
    expect(approved).toMatchObject({ plan_status: 'APPROVED', approved_by_actor_id: humanId });
    expect((await db.query("SELECT count(*) FROM cera.audit_log WHERE action = 'PLAN_APPROVED' AND target_id = $1", [v1.plan_id])).rows[0].count).toBe('1');
    // DB: 숫자 · 배정은 바꿀 수 없고, 사람 아닌 행위자는 승인하지 못하며, 승인 상태로 만들 수 없다
    await expectSqlState(db.query('UPDATE cera.recovery_plan SET objective_krw = 1 WHERE plan_id = $1', [v1.plan_id]), 'CE002');
    // 앱 역할에는 권한이 없고(42501), 소유 역할이어도 트리거가 막는다(CE001)
    await expectSqlState(db.query('UPDATE cera.recovery_plan_item SET total_krw = 1, base_cost_krw = 1, risk_penalty_krw = 0 WHERE plan_id = $1', [v1.plan_id]), '42501');
    await expectSqlState(db.query('DELETE FROM cera.recovery_plan WHERE plan_id = $1', [v1.plan_id]), '42501');
    const owner = ownerPool();
    try {
      await expectSqlState(owner.query('UPDATE cera.recovery_plan_item SET total_krw = 1, base_cost_krw = 1, risk_penalty_krw = 0 WHERE plan_id = $1', [v1.plan_id]), 'CE001');
      await expectSqlState(owner.query('DELETE FROM cera.recovery_plan_item WHERE plan_id = $1', [v1.plan_id]), 'CE001');
      await expectSqlState(owner.query('DELETE FROM cera.recovery_plan WHERE plan_id = $1', [v1.plan_id]), 'CE001');
    } finally {
      await owner.end();
    }
    await expectSqlState(db.query("UPDATE cera.recovery_plan SET plan_status = 'PROPOSED' WHERE plan_id = $1", [v1.plan_id]), 'CE004');
    const other = (await http.get(`/planning/runs/${w.runId}/plans`).expect(200)).body.plans.find((p: { version: number }) => p.version === 1);
    await expectSqlState(db.query("UPDATE cera.recovery_plan SET plan_status = 'PROPOSED' WHERE plan_id = $1", [other.plan_id]), 'CE004');
  });

  it('E. AI actors cannot approve a plan even in SQL; a plan cannot be inserted as APPROVED', async () => {
    const x = await newWorld();
    plans.packIds = x.ids;
    try {
      await todayFacts(x);
      const p = (await http.post(`/planning/runs/${x.runId}/plans`).set(ACTOR, humanId).expect(200)).body;
      await expectSqlState(db.query("UPDATE cera.recovery_plan SET plan_status = 'APPROVED', approved_by_actor_id = $2, approved_at = now() WHERE plan_id = $1", [p.plan_id, agentId]), 'CE005');
    } finally {
      plans.packIds = w.ids;
    }
  });
});

describe('T-114 agent tools — COMPUTE (nothing stored) · PROPOSE (idempotent) · READ; no approve tool', () => {
  it('calculate → solve → propose → get: numbers come from the engine, the agent is recorded as the proposer, retries return the same plan', async () => {
    const x = await newWorld();
    plans.packIds = x.ids;
    try {
      await todayFacts(x);
      const runId = (await http.post('/agent-runs').set(ACTOR, humanId).send({ recovery_run_id: x.runId, goal: 'propose a recovery plan', runtime_version: 'test', parameters: { plan_recovery: true } }).expect(201)).body.agent_run_id as string;
      const costs = (await tool('calculate_recovery_costs', runId, {}).expect(200)).body;
      expect(costs).toMatchObject({ status: 'SUCCEEDED', output: { result_kind: 'ENGINE_RESULT', candidate_count: 23 } });
      const solved = (await tool('solve_recovery', runId, {}).expect(200)).body.output;
      expect(solved.status).toBe('OPTIMAL');
      expect(Number((await db.query('SELECT count(*) FROM cera.recovery_plan WHERE case_run_id = $1', [x.runId])).rows[0].count)).toBe(0);
      expect((await tool('propose_recovery_plan', runId, {}).expect(200)).body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      const proposed = (await tool('propose_recovery_plan', runId, { expected_input_hash: solved.input_hash }, `${runId}:plan:1`).expect(200)).body.output;
      expect(proposed).toMatchObject({ version: 1, plan_status: 'PROPOSED', input_hash: solved.input_hash, objective_krw: solved.objective_krw, approved: false });
      const retry = (await tool('propose_recovery_plan', runId, { expected_input_hash: solved.input_hash }, `${runId}:plan:1`).expect(200)).body;
      expect(retry.output.plan_id).toBe(proposed.plan_id);
      // 만든 이 = 이 실행의 AI_AGENT 행위자(입력으로 받지 않는다)
      const row = (await db.query('SELECT p.created_by_actor_id, p.agent_run_id, r.agent_actor_id FROM cera.recovery_plan p JOIN cera.agent_run r USING (agent_run_id) WHERE p.plan_id = $1', [proposed.plan_id])).rows[0];
      expect(row.agent_run_id).toBe(runId);
      expect(row.created_by_actor_id).toBe(row.agent_actor_id);
      expect((await tool('get_recovery_plan', runId, {}).expect(200)).body.output.plan).toMatchObject({ plan_id: proposed.plan_id, plan_status: 'PROPOSED' });
      for (const name of ['approve_plan', 'approve_recovery_plan', 'select_final_plan']) expect((await tool(name, runId, {}).expect(404)).body.error.code).toBe('TOOL_NOT_FOUND');
    } finally {
      plans.packIds = w.ids;
    }
  });

  it('a real (not simulated) run has no container data yet → the planning API refuses and the tool says so (no invented numbers)', async () => {
    const real = await newWorld(false);
    expect((await http.get(`/planning/runs/${real.runId}/costs`).expect(409)).body.code).toBe('PLANNING_INPUT_UNAVAILABLE');
    const runId = (await http.post('/agent-runs').set(ACTOR, humanId).send({ recovery_run_id: real.runId, goal: 'plan', runtime_version: 'test' }).expect(201)).body.agent_run_id as string;
    expect((await tool('solve_recovery', runId, {}).expect(200)).body).toMatchObject({ status: 'REJECTED', error: { code: 'CAPABILITY_NOT_AVAILABLE' } });
  });

  it('T-115: a real run reports exactly what is missing; an operator entry flows Truth → planning input (no invented numbers)', async () => {
    // 실제 실행의 계획 날짜 = 오늘(서울). 지난 날짜의 그날 수용량은 Truth 가 만료로 보므로 쓰지 않는다
    const nowIso = new Date().toISOString();
    const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
    const real = await newWorld(false, nowIso);
    const before = (await http.get(`/planning/runs/${real.runId}/input-readiness`).expect(200)).body;
    expect(before).toMatchObject({ ready: false, source: 'REAL_SOURCES', plan_day: today });
    const codes = (r: { missing_inputs: { code: string }[] }) => r.missing_inputs.map((m) => m.code);
    expect(codes(before)).toEqual(expect.arrayContaining(['CONTAINER_SCOPE_EMPTY', 'RATE_TABLE', 'FACILITY_CAPACITY', 'OWN_TRUCK_ROSTER']));
    const blocking = before.missing_inputs.filter((m: { severity: string }) => m.severity === 'BLOCKING').map((m: { code: string }) => m.code);
    expect(blocking).not.toContain('PARTNER_TRUCK_SLOTS'); // 협력 차량은 없어도 계산은 된다(그 풀을 안 쓸 뿐)
    const capBefore = before.missing_inputs.find((m: { code: string }) => m.code === 'FACILITY_CAPACITY').count as number;

    // 운영자 직접 입력(실제 — 시나리오 없음) → Truth → 준비도
    await http.post('/truth/facts/manual').set(ACTOR, humanId).send({ intent: 'OPERATOR_DIRECT_ENTRY', kind: 'FACILITY_CAPACITY', target_id: real.ids.ODCY_A, date: today, value: 3, source_note: '전화 확인(실제 실행 시험)' }).expect(200);
    await http.post('/truth/facts/manual').set(ACTOR, humanId).send({ intent: 'OPERATOR_DIRECT_ENTRY', kind: 'TRUCK_SLOT', target_id: real.ids.OWN_FLEET, date: today, window_from: '09:00', window_to: '18:00', value: 5, source_note: '배차 담당 확인(시험)' }).expect(200);
    const after = (await http.get(`/planning/runs/${real.runId}/input-readiness`).expect(200)).body;
    expect(after.missing_inputs.find((m: { code: string }) => m.code === 'FACILITY_CAPACITY').count).toBe(capBefore - 1);
    expect(after.available.facilities_with_capacity).toBe(before.available.facilities_with_capacity + 1);
    expect(after.available.truth_facts).toBeGreaterThanOrEqual(before.available.truth_facts + 2);
    // 시나리오 요율 · 값은 실제 실행에 쓰지 않는다 — 여전히 계산 거부(무엇이 빠졌는지 메시지에)
    const refused = (await http.get(`/planning/runs/${real.runId}/costs`).expect(409)).body;
    expect(refused.message).toMatch(/RATE_TABLE/);
    expect(refused.message).toMatch(/CONTAINER_SCOPE_EMPTY/);

    // 시뮬레이션 실행은 시나리오 팩으로 늘 준비됨
    const sim = await newWorld(true);
    expect((await http.get(`/planning/runs/${sim.runId}/input-readiness`).expect(200)).body).toMatchObject({ ready: true, source: 'SCENARIO_PACK' });
  });
});
