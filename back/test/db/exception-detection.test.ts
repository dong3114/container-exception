import type { INestApplication } from '@nestjs/common';
import type pg from 'pg';
import request from 'supertest';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/app/create-api.js';
import { ExceptionDetectorService } from '../../src/detection/exception-detector.service.js';
import { validContainerNo } from '../../src/planning/operational-import.js';
import { actor } from './fixtures.js';
import { appPool, expectSqlState, ownerPool, testEnv } from './support.js';

/**
 * T-132 운영 예외 탐지(결정론) — 실제 PostgreSQL · API 로:
 * 운영 기준 계획(실행 없이 넣은 컨테이너) + Truth 수용량 → 예외 · 복구 실행 자동 생성 → 같은 입력 반복 · 동시 실행 · 재시작에도 하나 →
 * 수용량 8→6 같은 예외의 근거 변화 → 해소(수용량 증가 · 예정 감소) → 재발은 새 예외 → 사실 없음은 단정하지 않음 → 사람이 만든 실행은 그대로 → DB 가드.
 */
const ACTOR = 'X-CERA-Actor-Id';
let api: INestApplication;
let http: ReturnType<typeof request>;
let db: pg.Pool;
let detector: ExceptionDetectorService;
let humanId: string;

const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const tag = v7().slice(-6);
const WH = `탐지 창고 ${tag}`;
const WH_NOFACT = `탐지 사실없음 창고 ${tag}`;
let whId: string;
let whNoFactId: string;
const seq = Number.parseInt(tag, 16) % 900;
function cno(prefix10: string): string {
  for (let d = 0; d <= 9; d++) if (validContainerNo(`${prefix10}${d}`)) return `${prefix10}${d}`;
  throw new Error('no check digit');
}
const nos = Array.from({ length: 12 }, (_, k) => cno(`DTCU${String(seq * 100 + k).padStart(6, '0')}`));
const csv = (rows: { no: string; wh: string; hour: number; status?: string }[]) =>
  ['container_no,size_type,carrier,pickup_ready,terminal,destination,planned_day,planned_depart_hour,status', ...rows.map((r) => `${r.no},40DRY,DET_CARRIER,true,PNIT,${r.wh},${today},${r.hour},${r.status ?? 'ACTIVE'}`)].join('\n');
// 처음 값은 직접 입력, 그 뒤 값 변경은 정식 경로인 정정(같은 좌표에 직접 입력을 또 하면 Truth 는 두 확정 값의 충돌로 본다 — NEEDS_REVIEW)
const winnerOf = (view: { candidates: { role: string; event_id: string }[] }) => view.candidates.find((c) => c.role === 'WINNER')!.event_id;
const current = new Map<string, string>();
const capacity = async (facilityId: string, value: number) => {
  const prev = current.get(facilityId);
  const res = prev
    ? await http.post(`/truth/events/${prev}/correct`).set(ACTOR, humanId).send({ command_id: v7(), value, reason_code: 'OPERATOR_CORRECTION', note: '시험: 현장 재확인(합성)' }).expect(200)
    : await http.post('/truth/facts/manual').set(ACTOR, humanId).send({ command_id: v7(), intent: 'OPERATOR_DIRECT_ENTRY', kind: 'FACILITY_CAPACITY', target_id: facilityId, date: today, value, source_note: '시험: 현장 확인(합성)' }).expect(200);
  current.set(facilityId, winnerOf(res.body));
  return res;
};
const mine = async () => (await db.query('SELECT * FROM cera.operational_exception WHERE facility_id = $1 ORDER BY detected_at, exception_id', [whId])).rows;
const observations = async (exceptionId: string) => (await db.query('SELECT * FROM cera.operational_exception_observation WHERE exception_id = $1 ORDER BY observed_at, observation_id', [exceptionId])).rows;

beforeAll(async () => {
  api = await createApiApp(testEnv({ CERA_EXCEPTION_DETECTION: 'on' }));
  await api.init();
  http = request(api.getHttpServer());
  db = appPool();
  detector = api.get(ExceptionDetectorService);
  humanId = await actor(db, 'HUMAN');
  await actor(db, 'SYSTEM');
  whId = v7();
  whNoFactId = v7();
  await db.query("INSERT INTO cera.facility (facility_id, facility_type, facility_name) VALUES ($1, 'WAREHOUSE', $2), ($3, 'WAREHOUSE', $4)", [whId, WH, whNoFactId, WH_NOFACT]);
});

afterAll(async () => {
  await api.close();
  await db.end();
});

describe('T-132 deterministic warehouse capacity exception → automatic recovery run', () => {
  it('detects, opens one run, records why, and never duplicates', async () => {
    // 운영 기준 계획: 창고에 오늘 10대 · 사실 없는 창고에 3대 — 사람이 복구 실행을 먼저 만들지 않는다
    const rows = nos.slice(0, 10).map((no, i) => ({ no, wh: WH, hour: 8 + i }));
    const stored = (await http.post('/planning/inputs/containers').set(ACTOR, humanId).send({ command_id: v7(), csv: csv([...rows, ...nos.slice(10, 12).map((no, i) => ({ no, wh: WH_NOFACT, hour: 9 + i }))]) }).expect(200)).body;
    expect(stored).toMatchObject({ stored: true, recovery_run_id: null, changes: { new: 12 } });
    expect((await http.get('/planning/inputs/containers').expect(200)).body.records.filter((r: { container_no: string }) => nos.includes(r.container_no))).toHaveLength(12);
    // A: 수용량 10 → 부족 없음
    await capacity(whId, 10);
    await detector.detect();
    expect(await mine()).toHaveLength(0);

    // B: 수용량 4 → 예외(예정 10 / 가능 4 / 부족 6) + 복구 실행 자동 생성
    await capacity(whId, 4);
    // 정정 알림(FACT_CHANGED)이 이미 탐지를 돌렸을 수 있다 — 여기서 한 번 더 불러도 결과는 같다
    await detector.detect();
    const [ex] = await mine();
    expect(ex).toMatchObject({ exception_type: 'WAREHOUSE_CAPACITY_SHORTAGE', scope: 'LIVE', status: 'ACTIVE', basis: 'CONFIRMED', scheduled_demand: 10, capacity: 4, shortage: 6, is_simulated: false });
    expect(ex.recovery_run_id).toBeTruthy();
    const [obs] = await observations(ex.exception_id);
    expect(obs).toMatchObject({ kind: 'DETECTED', scheduled_demand: 10, capacity: 4, capacity_state: 'CONFIRMED', shortage: 6 });
    expect(obs.capacity_event_id).toBeTruthy();
    expect(obs.evidence.affected).toEqual(nos.slice(4, 10)); // 계획 순서의 뒤쪽 6대
    expect(obs.evidence.input_batch_ids).toEqual([stored.batch_id]);
    expect(obs.evidence.fact_key).toBe(`capacity.day(${today})`);

    // 실행: 트리거 EXCEPTION_DETECTED · 실제(시뮬레이션 아님) · 운영 기준 계획이 그 실행의 계획 입력으로 옮겨짐(원본은 그대로)
    const run = (await db.query('SELECT * FROM cera.recovery_run WHERE run_id = $1', [ex.recovery_run_id])).rows[0];
    expect(run).toMatchObject({ trigger_type: 'EXCEPTION_DETECTED', trigger_ref: `EXCEPTION:${ex.exception_id}`, contains_simulated: false });
    const copied = (await http.get(`/planning/runs/${ex.recovery_run_id}/inputs/containers`).expect(200)).body.records.map((r: { container_no: string }) => r.container_no);
    expect(copied).toEqual(expect.arrayContaining(nos.slice(0, 12)));
    const ready = (await http.get(`/planning/runs/${ex.recovery_run_id}/input-readiness`).expect(200)).body;
    expect(ready).toMatchObject({ mode: 'LIVE' });
    // I: 실행 목록의 출처 = AUTO_DETECTED + 문제 한 줄
    const listed = (await http.get('/planning/runs').expect(200)).body.runs.find((r: { run_id: string }) => r.run_id === ex.recovery_run_id);
    expect(listed).toMatchObject({ source: 'AUTO_DETECTED', exception: { exception_id: ex.exception_id, facility_name: WH, scheduled_demand: 10, capacity: 4, shortage: 6, status: 'ACTIVE' } });
    // 감사(행위자 SYSTEM)
    const audits = (await db.query("SELECT action FROM cera.audit_log WHERE target_id IN ($1, $2) ORDER BY occurred_at", [ex.exception_id, ex.recovery_run_id])).rows.map((r) => r.action);
    expect(audits).toEqual(expect.arrayContaining(['EXCEPTION_DETECTED', 'EXCEPTION_RUN_CREATED']));

    // E: 같은 입력 반복 · 동시 실행 · 새 프로세스(재시작) → 예외 · 실행 · 관측 그대로
    await detector.detect();
    await Promise.all([detector.detect(), detector.detect(), http.post('/exceptions/detect').set(ACTOR, humanId).expect(200)]);
    const restarted = await createApiApp(testEnv({ CERA_EXCEPTION_DETECTION: 'on' }));
    await restarted.init();
    try {
      await restarted.get(ExceptionDetectorService).detect();
    } finally {
      await restarted.close();
    }
    expect(await mine()).toHaveLength(1);
    expect(await observations(ex.exception_id)).toHaveLength(1);
    expect((await db.query("SELECT count(*)::int AS n FROM cera.recovery_run WHERE trigger_ref = $1", [`EXCEPTION:${ex.exception_id}`])).rows[0].n).toBe(1);

    // C: 사실이 없는 창고는 예정이 있어도 부족이라고 단정하지 않는다
    expect((await db.query('SELECT count(*)::int AS n FROM cera.operational_exception WHERE facility_id = $1', [whNoFactId])).rows[0].n).toBe(0);

    // GET /exceptions · 상세(관측 기록)
    const list = (await http.get('/exceptions?status=ACTIVE').expect(200)).body;
    expect(list.exceptions.some((e: { exception_id: string }) => e.exception_id === ex.exception_id)).toBe(true);
    expect(list.summary.active).toBeGreaterThanOrEqual(1);
    const detail = (await http.get(`/exceptions/${ex.exception_id}`).expect(200)).body;
    expect(detail).toMatchObject({ facility_name: WH, observations: [expect.objectContaining({ kind: 'DETECTED' })] });
  });

  it('F: capacity 4 → 2 updates the same exception (new observation), still one run', async () => {
    const [before] = await mine();
    await capacity(whId, 2);
    await detector.detect();
    const all = await mine();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ exception_id: before.exception_id, status: 'ACTIVE', capacity: 2, shortage: 8, recovery_run_id: before.recovery_run_id });
    expect((await observations(before.exception_id)).map((o) => o.kind)).toEqual(['DETECTED', 'CHANGED']);
  });

  it('G: capacity becomes enough → RESOLVED; the run and its records stay. A new shortage later is a new exception with a new run', async () => {
    const [before] = await mine();
    await capacity(whId, 12);
    await detector.detect();
    const [resolved] = await mine();
    expect(resolved).toMatchObject({ exception_id: before.exception_id, status: 'RESOLVED', shortage: 0 });
    expect(resolved.resolved_at).toBeTruthy();
    expect((await db.query('SELECT count(*)::int AS n FROM cera.recovery_run WHERE run_id = $1', [before.recovery_run_id])).rows[0].n).toBe(1);
    expect((await observations(before.exception_id)).map((o) => o.kind)).toEqual(['DETECTED', 'CHANGED', 'RESOLVED']);

    await capacity(whId, 3);
    await detector.detect();
    const all = await mine();
    expect(all).toHaveLength(2);
    const again = all.find((e) => e.status === 'ACTIVE')!;
    expect(again.exception_id).not.toBe(before.exception_id);
    expect(again.recovery_run_id).not.toBe(before.recovery_run_id);
    expect(again).toMatchObject({ scheduled_demand: 10, capacity: 3, shortage: 7 });
  });

  it('G: scheduled demand drops (rows withdrawn in a new baseline version) → RESOLVED by the input change signal', async () => {
    const rows = nos.slice(0, 10).map((no, i) => ({ no, wh: WH, hour: 8 + i, status: i < 2 ? 'ACTIVE' : 'WITHDRAWN' }));
    await http.post('/planning/inputs/containers').set(ACTOR, humanId).send({ command_id: v7(), csv: csv(rows) }).expect(200);
    // 운영 입력 변경 알림만으로(직접 detect 를 부르지 않고) 해소된다 — Worker 주기가 놓친 경우도 같은 결과
    const deadline = Date.now() + 10_000;
    let active = (await mine()).filter((e) => e.status === 'ACTIVE');
    while (active.length > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
      active = (await mine()).filter((e) => e.status === 'ACTIVE');
    }
    expect(active).toHaveLength(0);
    const last = (await mine()).at(-1)!;
    expect(last).toMatchObject({ status: 'RESOLVED', scheduled_demand: 2 });
  });

  it('H: a person-made live run stays MANUAL and is not touched by the detector', async () => {
    const run = (await http.post('/planning/runs').set(ACTOR, humanId).send({ command_id: v7() }).expect(200)).body;
    await detector.detect();
    const listed = (await http.get('/planning/runs').expect(200)).body.runs.find((r: { run_id: string }) => r.run_id === run.recovery_run_id);
    expect(listed).toMatchObject({ source: 'MANUAL', exception: null });
    expect((await db.query('SELECT count(*)::int AS n FROM cera.operational_exception WHERE recovery_run_id = $1', [run.recovery_run_id])).rows[0].n).toBe(0);
  });

  it('DB guards: identity is immutable, resolved is final, the run is filled once, observations are append-only, nothing is deleted', async () => {
    const [resolved] = (await mine()).filter((e) => e.status === 'RESOLVED');
    await expectSqlState(db.query("UPDATE cera.operational_exception SET status = 'ACTIVE', resolved_at = NULL WHERE exception_id = $1", [resolved.exception_id]), 'CE002');
    await expectSqlState(db.query('UPDATE cera.operational_exception SET window_day = window_day + 1 WHERE exception_id = $1', [resolved.exception_id]), 'CE002');
    // 앱 역할에는 DELETE 권한부터 없다(42501) — 소유 역할도 트리거가 막는다(CE001)
    await expectSqlState(db.query('DELETE FROM cera.operational_exception WHERE exception_id = $1', [resolved.exception_id]), '42501');
    const [obs] = await observations(resolved.exception_id);
    await expectSqlState(db.query('UPDATE cera.operational_exception_observation SET shortage = 0 WHERE observation_id = $1', [obs.observation_id]), '42501');
    // 권한을 가진 소유 역할도 트리거가 막는다
    const owner = ownerPool();
    try {
      await expectSqlState(owner.query('UPDATE cera.operational_exception_observation SET shortage = 0 WHERE observation_id = $1', [obs.observation_id]), 'CE001');
      await expectSqlState(owner.query('DELETE FROM cera.operational_exception WHERE exception_id = $1', [resolved.exception_id]), 'CE001');
    } finally {
      await owner.end();
    }
    // 진행 중 예외가 정체마다 하나라는 것은 DB 가 막는다
    const facilityA = v7();
    await db.query("INSERT INTO cera.facility (facility_id, facility_type, facility_name) VALUES ($1, 'WAREHOUSE', $2)", [facilityA, `중복 시험 ${tag}`]);
    const insert = (id: string) => db.query("INSERT INTO cera.operational_exception (exception_id, exception_type, scope, facility_id, window_day, status, basis, scheduled_demand, capacity, shortage, is_simulated, detected_at, updated_at) VALUES ($1, 'WAREHOUSE_CAPACITY_SHORTAGE', 'LIVE', $2, $3, 'ACTIVE', 'CONFIRMED', 5, 1, 4, false, now(), now())", [id, facilityA, today]);
    await insert(v7());
    await expectSqlState(insert(v7()), '23505');
  });
});

describe('detection switch', () => {
  it('off (the default): the API refuses an on-demand run and nothing is detected', async () => {
    const off = await createApiApp(testEnv({}));
    await off.init();
    try {
      const h = request(off.getHttpServer());
      const r = await h.post('/exceptions/detect').set(ACTOR, humanId);
      expect([r.status, r.body.code]).toEqual([409, 'EXCEPTION_DETECTION_OFF']);
      expect((await h.get('/exceptions').expect(200)).body).toHaveProperty('summary');
    } finally {
      await off.close();
    }
  });
});

describe('T-132 staging registry: facilities and truck pools (no scenario seed in staging)', () => {
  it('an admin registers a warehouse and a partner truck pool; duplicates 409; a person without registry.manage cannot', async () => {
    const admin = await actor(db, 'HUMAN');
    const name = `스테이징 창고 ${tag}`;
    // dev-header 모드 — 계정 없는 HUMAN 은 OPERATOR 로 본다(registry.manage 없음)
    expect((await http.post('/registry/facilities').set(ACTOR, admin).send({ facility_type: 'WAREHOUSE', facility_name: name })).status).toBe(403);
    const adminUser = v7();
    await db.query(`INSERT INTO cera.user_account (user_id, actor_id, login_id, role, password_hash, is_active, created_at, updated_at) VALUES ($1, $2, $3, 'ADMIN', $4, true, now(), now())`, [adminUser, admin, `admin-det-${tag}`, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA']);
    const created = (await http.post('/registry/facilities').set(ACTOR, admin).send({ facility_type: 'WAREHOUSE', facility_name: name }).expect(201)).body;
    expect(created).toMatchObject({ facility_type: 'WAREHOUSE', facility_name: name, operator_counterparty_id: null });
    expect((await http.post('/registry/facilities').set(ACTOR, admin).send({ facility_type: 'WAREHOUSE', facility_name: name.toUpperCase() })).body.code).toBe('FACILITY_ALREADY_REGISTERED');
    expect((await http.get('/registry/facilities').expect(200)).body.facilities.some((f: { facility_id: string }) => f.facility_id === created.facility_id)).toBe(true);
    const cp = (await http.post('/registry/counterparties').set(ACTOR, admin).send({ display_name: `스테이징 운송 ${tag}`, source_role: 'TRUCKING' }).expect(201)).body;
    expect((await http.post('/registry/truck-pools').set(ACTOR, admin).send({ pool_name: `협력 ${tag}`, ownership: 'PARTNER' })).status).toBe(400);
    const pool = (await http.post('/registry/truck-pools').set(ACTOR, admin).send({ pool_name: `협력 ${tag}`, ownership: 'PARTNER', owner_counterparty_id: cp.counterparty_id }).expect(201)).body;
    expect(pool).toMatchObject({ ownership: 'PARTNER', owner_counterparty_id: cp.counterparty_id });
    const audits = (await db.query('SELECT action FROM cera.audit_log WHERE target_id IN ($1, $2)', [created.facility_id, pool.truck_pool_id])).rows.map((r) => r.action).sort();
    expect(audits).toEqual(['FACILITY_CREATED', 'TRUCK_POOL_CREATED']);
  });
});
