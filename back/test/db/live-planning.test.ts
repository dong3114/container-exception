import type { INestApplication } from '@nestjs/common';
import type pg from 'pg';
import request from 'supertest';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/app/create-api.js';
import { hashPassword } from '../../src/auth/password.js';
import { validContainerNo } from '../../src/planning/operational-import.js';
import { RecoveryPlanService } from '../../src/planning/recovery-plan.service.js';
import { T0, actor, hashOf } from './fixtures.js';
import { appPool, testEnv } from './support.js';

/**
 * T-123 LIVE 계획 — 시나리오 팩 없이: 실제 실행 → 시설 계획 정보 · 요율 · 컨테이너(일괄 · 검증만/저장) → Truth 직접 입력(수용량 · 트럭)
 * → 준비도 → 같은 Cost Engine · Solver → 제안 판 → 사람 승인 → 후속 초안 → 요율 변경 → OUTDATED → 다시 계산.
 * 값은 합성이지만(실제 회사 · 컨테이너 아님) 들어가는 길은 제품 그대로다.
 */
const ACTOR = 'X-CERA-Actor-Id';
let api: INestApplication;
let http: ReturnType<typeof request>;
let db: pg.Pool;
let plans: RecoveryPlanService;
let humanId: string;
let fieldId: string;

const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const day = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const tag = v7().slice(-6);
const WH = `라이브 창고 ${tag}`;
const OD = `라이브 ODCY ${tag}`;
let whId: string;
let odId: string;
let ownPool: string;
function cno(prefix10: string): string {
  for (let d = 0; d <= 9; d++) if (validContainerNo(`${prefix10}${d}`)) return `${prefix10}${d}`;
  throw new Error('no check digit');
}
// 실행마다 다른 번호(같은 DB 를 여러 번 돌려도 섞이지 않게) — 합성 소유자 코드 LVTU
const seq = Number.parseInt(tag, 16) % 900;
const nos = [1, 2, 3, 4, 5].map((k) => cno(`LVTU${String(seq * 10 + k).padStart(6, '0')}`));

beforeAll(async () => {
  api = await createApiApp(testEnv({}));
  await api.init();
  http = request(api.getHttpServer());
  db = appPool();
  humanId = await actor(db, 'HUMAN');
  await actor(db, 'SYSTEM');
  fieldId = await actor(db, 'HUMAN');
  await db.query(`INSERT INTO cera.user_account (user_id, actor_id, login_id, role, password_hash, is_active, created_at, updated_at) VALUES ($1, $2, $3, 'FIELD_OPERATOR', $4, true, $5, $5)`, [v7(), fieldId, `field-live-${tag}`, await hashPassword('field-live-password-1'), T0]);
  whId = v7();
  odId = v7();
  ownPool = v7();
  await db.query("INSERT INTO cera.facility (facility_id, facility_type, facility_name) VALUES ($1, 'WAREHOUSE', $2), ($3, 'ODCY', $4)", [whId, WH, odId, OD]);
  await db.query("INSERT INTO cera.truck_pool (truck_pool_id, pool_name, ownership) VALUES ($1, $2, 'OWN')", [ownPool, `라이브 자사 ${tag}`]);
  plans = api.get(RecoveryPlanService);
});

afterAll(async () => {
  await api.close();
  await db.end();
});

const containersCsv = (lfd1: string) =>
  [
    'container_no,size_type,carrier,pickup_ready,terminal,destination,planned_day,planned_depart_hour,lfd,priority',
    `${nos[0]},40DRY,LIVE_CARRIER,true,PNIT,${WH},${today},9,${lfd1},HIGH`,
    `${nos[1]},40DRY,LIVE_CARRIER,true,PNIT,${WH},${today},10,${day(1)},NORMAL`,
    `${nos[2]},40DRY,LIVE_CARRIER,true,PNIT,${WH},${today},11,${day(2)},NORMAL`,
    `${nos[3]},40DRY,LIVE_CARRIER,true,PNIT,${WH},${today},13,${day(1)},NORMAL`,
    `${nos[4]},40DRY,LIVE_CARRIER,true,PNIT,${WH},${today},14,${day(3)},CRITICAL`,
  ].join('\n');
const ratesCsv = (transportWh: number | null) =>
  [
    'rate_type,carrier,from,to,size_type,amount,effective_from,source_note',
    `DEMURRAGE_PER_DAY,LIVE_CARRIER,,,40DRY,150000,${day(-30)},합성 계약 요율(시험)`,
    `TERMINAL_STORAGE_PER_DAY,,,,40DRY,40000,${day(-30)},합성 계약 요율(시험)`,
    `DETENTION_FREE_DAYS,,,,,7,${day(-30)},합성 계약 요율(시험)`,
    ...(transportWh === null ? [] : [`TRANSPORT,,PNIT,${WH},40DRY,${transportWh},${day(-30)},합성 계약 요율(시험)`]),
    `TRANSPORT,,PNIT,${OD},40DRY,90000,${day(-30)},합성 계약 요율(시험)`,
    `TRANSPORT,,${OD},${WH},40DRY,140000,${day(-30)},합성 계약 요율(시험)`,
    `ODCY_HANDLING_IN_OUT,,,${OD},40DRY,50000,${day(-30)},합성 계약 요율(시험)`,
    `ODCY_STORAGE_PER_DAY,,,${OD},40DRY,30000,${day(-30)},합성 계약 요율(시험)`,
  ].join('\n');
const readiness = async (runId: string) => (await http.get(`/planning/runs/${runId}/input-readiness`).expect(200)).body;
const codes = (r: { missing_inputs: { code: string; severity: string }[] }) => r.missing_inputs.filter((m) => m.severity === 'BLOCKING').map((m) => m.code);

describe('T-123 LIVE planning — operational inputs → readiness → engine → plan → approval → follow-ups → re-plan, no scenario pack', () => {
  it('runs end to end with exact missing inputs, idempotent batches, provenance and OUTDATED on an operational change', async () => {
    // 1. 실제 실행(같은 명령 id = 같은 실행)
    const cmd = v7();
    const run = (await http.post('/planning/runs').set(ACTOR, humanId).send({ command_id: cmd }).expect(200)).body;
    expect(run).toMatchObject({ created: true, mode: 'LIVE', plan_day: today });
    expect((await http.post('/planning/runs').set(ACTOR, humanId).send({ command_id: cmd }).expect(200)).body).toMatchObject({ recovery_run_id: run.recovery_run_id, created: false });
    const runId = run.recovery_run_id as string;

    // 2. 권한: 현장 담당자는 운영 기록을 넣지 못한다(사실 직접 입력만)
    expect((await http.post(`/planning/runs/${runId}/inputs/containers`).set(ACTOR, fieldId).send({ command_id: v7(), csv: containersCsv(day(1)) })).status).toBe(403);

    // 3. 시설 계획 정보 · 요율(운송 터미널→창고 요율은 일부러 빼 둔다)
    const prof = (await http.post('/planning/inputs/facility-profiles').set(ACTOR, humanId).send({ command_id: v7(), csv: `facility,accepts,open_from_hour,last_departure_hour,trip_hours,max_storage_days\n${WH},40DRY,8,16,2,\n${OD},40DRY|20DRY,0,20,1,3` }).expect(200)).body;
    expect(prof).toMatchObject({ stored: true, changes: { new: 2, changed: 0, unchanged: 0 } });
    expect((await http.post('/planning/inputs/rates').set(ACTOR, humanId).send({ command_id: v7(), csv: ratesCsv(null) }).expect(200)).body).toMatchObject({ stored: true });

    // 4. 컨테이너: 검증만(오류 행) → 저장 시도(오류 = 아무것도 저장 안 함, 422) → 정상 파일(LFD 하나 비움)
    const bad = `${containersCsv(day(1))}\n${nos[0]},40DRY,LIVE_CARRIER,true,PNIT,${WH},${today},9,2026-02-30,HIGH`;
    const dry = (await http.post(`/planning/runs/${runId}/inputs/containers`).set(ACTOR, humanId).send({ command_id: v7(), dry_run: true, csv: bad }).expect(200)).body;
    expect(dry).toMatchObject({ dry_run: true, stored: false, valid_rows: 5, invalid_rows: 1 });
    expect(dry.errors).toEqual([expect.objectContaining({ row: 7, column: 'lfd', code: 'INVALID_DATE' })]);
    const refused = await http.post(`/planning/runs/${runId}/inputs/containers`).set(ACTOR, humanId).send({ command_id: v7(), csv: bad }).expect(422);
    expect(refused.body).toMatchObject({ code: 'INVALID_PLANNING_INPUT', details: { stored: false, invalid_rows: 1 } });
    expect((await http.get(`/planning/runs/${runId}/inputs/containers`).expect(200)).body.records).toHaveLength(0);
    const noLfd = containersCsv('');
    const ccmd = v7();
    const stored = (await http.post(`/planning/runs/${runId}/inputs/containers`).set(ACTOR, humanId).send({ command_id: ccmd, csv: noLfd, source_label: 'TMS export (synthetic)' }).expect(200)).body;
    expect(stored).toMatchObject({ stored: true, changes: { new: 5, changed: 0, unchanged: 0 } });
    // 같은 명령 = 같은 묶음 · 다른 명령 같은 내용 = 새 판 없음 · 같은 명령 다른 내용 = 409
    expect((await http.post(`/planning/runs/${runId}/inputs/containers`).set(ACTOR, humanId).send({ command_id: ccmd, csv: noLfd }).expect(200)).body).toMatchObject({ replayed: true, batch_id: stored.batch_id });
    expect((await http.post(`/planning/runs/${runId}/inputs/containers`).set(ACTOR, humanId).send({ command_id: v7(), csv: noLfd }).expect(200)).body).toMatchObject({ stored: true, changes: { new: 0, changed: 0, unchanged: 5 } });
    expect((await http.post(`/planning/runs/${runId}/inputs/containers`).set(ACTOR, humanId).send({ command_id: ccmd, csv: containersCsv(day(1)) }).expect(409)).body.code).toBe('COMMAND_ID_REUSED');
    expect((await db.query('SELECT count(*)::int AS n FROM cera.planning_container_record WHERE recovery_run_id = $1', [runId])).rows[0].n).toBe(5);
    const batch = (await http.get(`/planning/inputs/batches/${stored.batch_id}`).expect(200)).body;
    expect(batch).toMatchObject({ kind: 'CONTAINERS', source_type: 'CSV', source_label: 'TMS export (synthetic)', row_count: 5, accepted_count: 5, submitted_by_actor_id: humanId });

    // 5. 준비도: LFD 1 · 창고 그날 수용량 · 트럭 — 필드 단위로. 계산 요청은 409 + 같은 목록
    let r = await readiness(runId);
    expect(r).toMatchObject({ mode: 'LIVE', status: 'NOT_READY' });
    // 트럭 가용은 등록부 전체(공유 시험 DB 의 다른 풀 포함)로 판정하므로 여기서는 개수 변화만 본다
    expect(codes(r)).toEqual(expect.arrayContaining(['CONTAINER_LFD', 'FACILITY_CAPACITY']));
    const ownBefore = r.available.own_trucks as number;
    expect(r.missing_inputs.find((m: { code: string }) => m.code === 'CONTAINER_LFD')).toMatchObject({ count: 1, fields: [`container.${nos[0]}.lfd`], group: 'LFD' });
    const unavailable = await http.post(`/planning/runs/${runId}/plans`).set(ACTOR, humanId).send({}).expect(409);
    expect(unavailable.body.code).toBe('PLANNING_INPUT_UNAVAILABLE');
    expect(unavailable.body.details.missing_inputs.map((m: { code: string }) => m.code)).toContain('CONTAINER_LFD');

    // 6. LFD 고침(새 판이 옛 판을 밀어낸다) · Truth 직접 입력(창고 · ODCY 수용량 · 자사 트럭)
    expect((await http.post(`/planning/runs/${runId}/inputs/containers`).set(ACTOR, humanId).send({ command_id: v7(), csv: containersCsv(day(1)) }).expect(200)).body).toMatchObject({ changes: { new: 0, changed: 1, unchanged: 4 } });
    const fact = (body: Record<string, unknown>) => http.post('/truth/facts/manual').set(ACTOR, humanId).send({ intent: 'OPERATOR_DIRECT_ENTRY', source_note: '현장 확인(합성 시험)', ...body }).expect(200);
    await fact({ kind: 'FACILITY_CAPACITY', target_id: whId, date: today, value: 3 });
    await fact({ kind: 'FACILITY_CAPACITY', target_id: whId, date: day(1), value: 5 });
    await fact({ kind: 'FACILITY_CAPACITY', target_id: odId, date: today, value: 4 });
    await fact({ kind: 'TRUCK_SLOT', target_id: ownPool, date: today, window_from: '08:00', window_to: '18:00', value: 4 });

    // 7. 이제 요율 하나가 빠진 것만 남는다 — 0 원으로 계산하지 않는다
    r = await readiness(runId);
    expect(r.available.own_trucks).toBe(ownBefore + 4);
    expect(r.status).toBe('NOT_READY');
    expect(r.missing_inputs.filter((m: { severity: string }) => m.severity === 'BLOCKING')).toEqual([expect.objectContaining({ code: 'RATE_MISSING', group: 'RATE', fields: [`rate.transport.PNIT__${WH}.40DRY`] })]);
    await http.post('/planning/inputs/rates').set(ACTOR, humanId).send({ command_id: v7(), csv: ratesCsv(200000) }).expect(200);
    r = await readiness(runId);
    expect(r.status).toBe('READY');

    // 8. 같은 엔진 · Solver → 제안 판(LIVE · 운영 기록 출처) → 사람 승인 → 후속 초안
    const t0 = performance.now();
    const v1 = (await http.post(`/planning/runs/${runId}/plans`).set(ACTOR, humanId).send({}).expect(200)).body;
    const ms = performance.now() - t0;
    expect(v1).toMatchObject({ version: 1, plan_status: 'PROPOSED' });
    expect(ms).toBeLessThan(30_000);
    const [snap1] = (await db.query('SELECT s.scope_ref, s.contains_simulated, s.scenario_id, s.tariff_version FROM cera.recovery_plan p JOIN cera.planning_snapshot s ON s.snapshot_id = p.snapshot_id WHERE p.plan_id = $1', [v1.plan_id])).rows;
    expect(snap1).toMatchObject({ contains_simulated: false, scenario_id: null });
    expect(snap1.tariff_version).toMatch(/^live:/);
    expect(snap1.scope_ref).toMatchObject({ input_mode: 'LIVE', scenario_pack: null });
    expect(snap1.scope_ref.operational_inputs.container_records).toHaveLength(5);
    expect(snap1.scope_ref.operational_inputs.rate_records).toContainEqual(expect.objectContaining({ key: `transport.PNIT__${whId}.40DRY`, amount: 200000 }));
    expect(snap1.scope_ref.facts.every((f: { source: string }) => f.source !== 'SCENARIO')).toBe(true);
    expect(snap1.scope_ref.truth_facts.length).toBeGreaterThanOrEqual(4);
    const items = (await db.query('SELECT container_ref, action FROM cera.recovery_plan_item WHERE plan_id = $1 ORDER BY container_ref', [v1.plan_id])).rows;
    expect(items.map((i) => i.container_ref).sort()).toEqual([...nos].sort());
    // 같은 입력 · 같은 as_of → 같은 입력 지문(재현)
    const asOf = new Date().toISOString();
    expect((await plans.solve(runId, asOf)).result.input_hash).toBe((await plans.solve(runId, asOf)).result.input_hash);
    // T-136 1-7: LIVE 에서 아무것도 바뀌지 않았는데 다시 계산하면 새 판을 만들지 않는다(실행 시각이 지문에 들어가 매번 새 판이 생기던 문제)
    const again = (await http.post(`/planning/runs/${runId}/plans`).set(ACTOR, humanId).send({}).expect(200)).body;
    expect(again).toMatchObject({ plan_id: v1.plan_id, version: 1 });

    await http.post(`/planning/plans/${v1.plan_id}/approve`).set(ACTOR, humanId).send({ plan_hash: v1.plan_hash }).expect(200);
    const fu = (await http.post(`/planning/plans/${v1.plan_id}/follow-ups`).set(ACTOR, humanId).send({}).expect(200)).body;
    expect(fu.plan_status).toBe('APPROVED');
    expect(Array.isArray(fu.actions)).toBe(true);

    // 9. 운영 기록 변경(운송 요율 인상) → 승인된 판이 OUTDATED(이유 = 바뀐 요율) → 다시 계산 = v2, v1 스냅숏은 옛 금액 그대로
    await http.post('/planning/inputs/rates').set(ACTOR, humanId).send({ command_id: v7(), csv: ratesCsv(260000) }).expect(200);
    await plans.refreshOutdated(runId);
    const [after] = (await db.query('SELECT plan_status, outdated_reasons FROM cera.recovery_plan WHERE plan_id = $1', [v1.plan_id])).rows;
    expect(after.plan_status).toBe('OUTDATED');
    expect(after.outdated_reasons).toContainEqual(expect.objectContaining({ code: 'OPERATIONAL_RECORD_CHANGED', kind: 'RATE', key: `transport.PNIT__${whId}.40DRY` }));
    const v2 = (await http.post(`/planning/runs/${runId}/plans`).set(ACTOR, humanId).send({}).expect(200)).body;
    expect(v2).toMatchObject({ version: 2, plan_status: 'PROPOSED' });
    const amounts = async (planId: string) =>
      (await db.query('SELECT s.scope_ref FROM cera.recovery_plan p JOIN cera.planning_snapshot s ON s.snapshot_id = p.snapshot_id WHERE p.plan_id = $1', [planId])).rows[0].scope_ref.operational_inputs.rate_records.find((x: { key: string }) => x.key === `transport.PNIT__${whId}.40DRY`).amount;
    expect(await amounts(v1.plan_id)).toBe(200000);
    expect(await amounts(v2.plan_id)).toBe(260000);
    // 옛 요율 판은 지워지지 않고 밀렸을 뿐이다
    expect((await db.query("SELECT count(*)::int AS n FROM cera.tariff_rate WHERE rate_type = 'TRANSPORT' AND to_ref = $1 AND from_ref = 'PNIT'", [whId])).rows[0].n).toBe(2);
    await expect(db.query('DELETE FROM cera.tariff_rate WHERE to_ref = $1', [whId])).rejects.toThrow();
  });

  it('a simulated (scenario) run never takes operational records; unauthenticated or non-human callers cannot write', async () => {
    const snapshotId = v7();
    const runId = v7();
    const scenarioId = v7();
    await db.query("INSERT INTO cera.scenario (scenario_id, scenario_name, as_of_base, created_at) VALUES ($1, 'live-guard', $2, $2)", [scenarioId, T0]);
    await db.query(
      `INSERT INTO cera.planning_snapshot (snapshot_id, as_of, fact_fingerprint, rule_version, tariff_version, policy_version, contains_simulated, created_at, scenario_id) VALUES ($1, $2, $3, 'r1', 't1', 'p1', true, $2, $4)`,
      [snapshotId, T0, hashOf(`snap-${snapshotId}`), scenarioId],
    );
    await db.query(`INSERT INTO cera.recovery_run (run_id, snapshot_id, trigger_type, trigger_ref, objective_version, run_status, contains_simulated, executed_at) VALUES ($1, $2, 'EXCEPTION_DETECTED', 'SIM-GUARD', 'o1', 'FEASIBLE', true, $3)`, [runId, snapshotId, T0]);
    expect((await http.post(`/planning/runs/${runId}/inputs/containers`).set(ACTOR, humanId).send({ command_id: v7(), csv: containersCsv(day(1)) }).expect(409)).body.code).toBe('NOT_A_LIVE_RUN');
    const agent = await actor(db, 'AI_AGENT');
    expect([401, 403]).toContain((await http.post('/planning/inputs/rates').set(ACTOR, agent).send({ command_id: v7(), csv: ratesCsv(1) })).status);
    // 머리말 없음: dev-header 시험 모드는 서비스가 400 ACTOR_REQUIRED(session 모드는 Guard 가 401)
    expect([400, 401]).toContain((await http.post('/planning/inputs/rates').send({ command_id: v7(), csv: ratesCsv(1) })).status);
  });
});
