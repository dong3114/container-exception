import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';
import request from 'supertest';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/app/create-api.js';
import { DraftRepository } from '../../src/communication/draft.repository.js';
import { T0, hashOf, registry, type Registry } from './fixtures.js';
import { appPool, testEnv } from './support.js';

/**
 * T-088 U3 — 문의 초안 흐름을 실제 PostgreSQL · 앱 역할로. 등록부 · 계획 실행 · 트럭 풀은 시험마다 새로 만든다.
 */
const contentDir = mkdtempSync(join(tmpdir(), 'cera-drafts-'));
let api: INestApplication;
let app: pg.Pool;
let http: ReturnType<typeof request>;

beforeAll(async () => {
  api = await createApiApp(testEnv({ CERA_CONTENT_DIR: contentDir }));
  await api.init();
  app = appPool();
  http = request(api.getHttpServer());
});

afterAll(async () => {
  await api.close();
  await app.end();
  rmSync(contentDir, { recursive: true, force: true });
});

interface World extends Registry {
  scenarioId: string;
  runId: string;
  truckPoolId: string;
  facilityId: string;
}

/** 등록부(통과 주소) + 그 운송사의 트럭 풀 + 창고 + 가상 시나리오의 계획 실행. */
async function world(): Promise<World> {
  const r = await registry(app);
  const scenarioId = v7();
  const snapshotId = v7();
  const runId = v7();
  const truckPoolId = v7();
  const facilityId = v7();
  await app.query("INSERT INTO cera.scenario (scenario_id, scenario_name, as_of_base, created_at) VALUES ($1, 'test scenario', $2, $2)", [scenarioId, T0]);
  await app.query(
    `INSERT INTO cera.planning_snapshot (snapshot_id, as_of, fact_fingerprint, rule_version, tariff_version, policy_version, contains_simulated, created_at, scenario_id)
     VALUES ($1, $2, $3, 'r1', 't1', 'p1', true, $2, $4)`,
    [snapshotId, T0, hashOf(`snap-${snapshotId}`), scenarioId],
  );
  await app.query(
    `INSERT INTO cera.recovery_run (run_id, snapshot_id, trigger_type, trigger_ref, objective_version, run_status, contains_simulated, executed_at)
     VALUES ($1, $2, 'EXCEPTION_DETECTED', 'RP-TEST', 'o1', 'FEASIBLE', true, $3)`,
    [runId, snapshotId, T0],
  );
  await app.query("INSERT INTO cera.truck_pool (truck_pool_id, pool_name, ownership, owner_counterparty_id) VALUES ($1, 'Test 셔틀', 'PARTNER', $2)", [
    truckPoolId,
    r.counterpartyId,
  ]);
  await app.query("INSERT INTO cera.facility (facility_id, facility_type, facility_name) VALUES ($1, 'WAREHOUSE', '창고 B')", [facilityId]);
  return { ...r, scenarioId, runId, truckPoolId, facilityId };
}

const truckRequest = (w: World, overrides: Record<string, unknown> = {}) => ({
  address_id: w.addressId,
  intent: 'TRUCK_SLOT',
  target_id: w.truckPoolId,
  source_run_id: w.runId,
  values: [
    { key: 'quantity', value_number: 2, unit: 'TRUCK', source_path: 'resource_gaps[0].needed' },
    { key: 'date', value_text: '2026-10-13', source_path: 'as_of.date' },
    { key: 'window_from', value_text: '15:00', source_path: 'resource_gaps[0].window.from' },
    { key: 'window_to', value_text: '17:00', source_path: 'resource_gaps[0].window.to' },
  ],
  ...overrides,
});

const count = async (table: string, column: string, id: string) =>
  Number((await app.query(`SELECT count(*)::int AS n FROM cera.${table} WHERE ${column} = $1`, [id])).rows[0].n);

describe('POST /communication/drafts — plan-based inquiry', () => {
  it('creates thread · question · structured values · template message, and the passed draft is ready for approval', async () => {
    const w = await world();
    const res = await http.post('/communication/drafts').send(truckRequest(w)).expect(201);
    const d = res.body;
    expect(d.message).toMatchObject({ status: 'PENDING_APPROVAL', drafted_by: 'TEMPLATE', channel_type: 'MOCK', is_simulated: true });
    expect(d.message.subject).toBe('[문의 Q1] 10월 13일(화) 15:00~17:00 트럭 2대 추가 배차 가능 여부');
    expect(d.message.body).toContain('셔틀 트럭 2대를 추가로 배차할 수 있는지');
    expect(d.thread).toMatchObject({ purpose: 'SLOT_REQUEST', thread_status: 'OPEN', counterparty_id: w.counterpartyId, contact_id: w.contactId, related_run_id: w.runId });
    expect(d.question).toMatchObject({
      ask_id: 'Q1',
      question_type: 'SLOT',
      target_entity_type: 'TRUCK_POOL',
      target_entity_id: w.truckPoolId,
      target_fact_key: 'available.slot(2026-10-13T15:00-17:00)',
      expected_unit: 'TRUCK',
      question_status: 'DRAFTED',
    });
    expect(d.structured_values.find((v: { key: string }) => v.key === 'quantity')).toEqual({
      key: 'quantity',
      value_number: '2',
      value_text: null,
      unit: 'TRUCK',
      source_run_id: w.runId,
      source_path: 'resource_gaps[0].needed',
    });
    expect(d).toMatchObject({ plan_based: true, source_run: { run_id: w.runId, trigger_ref: 'RP-TEST' }, approval_ready: true, blocked_reasons: [] });
    expect(d.number_check).toMatchObject({ status: 'PASSED', passed: true, unmatched: [] });
    expect(d.contact_gate).toEqual({ eligible: true, reasons: [] });

    // DB 에 실제로 있다: 전이 DRAFTED → PENDING_APPROVAL, 내용 지문 = 행의 지문
    const { rows } = await app.query('SELECT status FROM cera.message_status_transition WHERE message_id = $1 ORDER BY occurred_at, transition_id', [d.message.message_id]);
    expect(rows.map((r) => r.status)).toEqual(['DRAFTED', 'PENDING_APPROVAL']);
    expect(await count('comm_message_structured_field', 'message_id', d.message.message_id)).toBe(4);
    expect(await count('comm_message_question', 'message_id', d.message.message_id)).toBe(1);
    const again = await http.get(`/communication/drafts/${d.message.message_id}`).expect(200);
    expect(again.body).toEqual(d);
  });

  it('values without source_path are plan-independent (no source_run_id), others keep the run', async () => {
    const w = await world();
    const body = truckRequest(w, {
      values: [
        { key: 'quantity', value_number: 2, unit: 'TRUCK', source_path: 'resource_gaps[0].needed' },
        { key: 'date', value_text: '2026-10-13' },
        { key: 'window_from', value_text: '15:00' },
        { key: 'window_to', value_text: '17:00' },
      ],
    });
    const d = (await http.post('/communication/drafts').send(body).expect(201)).body;
    const byKey = Object.fromEntries(d.structured_values.map((v: { key: string; source_run_id: string | null }) => [v.key, v.source_run_id]));
    expect(byKey).toEqual({ date: null, quantity: w.runId, window_from: null, window_to: null });
    expect(d.plan_based).toBe(true);
  });

  it('a fully operator-entered inquiry (no run) is plan-independent and still number-checked', async () => {
    const w = await world();
    const body = {
      address_id: w.addressId,
      intent: 'FACILITY_CAPACITY',
      target_id: w.facilityId,
      scenario_id: w.scenarioId,
      values: [
        { key: 'quantity', value_number: 5, unit: 'CONTAINER' },
        { key: 'date', value_text: '2026-10-07' },
      ],
    };
    const d = (await http.post('/communication/drafts').send(body).expect(201)).body;
    expect(d.message.body).toContain('10월 7일(수)에 창고 B에서 컨테이너 5대를 받을 수 있는지');
    expect(d).toMatchObject({ plan_based: false, source_run: null, approval_ready: true });
    expect(d.thread).toMatchObject({ purpose: 'CAPACITY_CHECK', related_run_id: null });
    expect(d.question).toMatchObject({ target_entity_type: 'FACILITY', target_fact_key: 'capacity.day(2026-10-07)', expected_unit: 'CONTAINER' });
    expect(d.structured_values.every((v: { source_run_id: string | null }) => v.source_run_id === null)).toBe(true);
  });
});

describe('number check blocks a revised draft whose numbers drift (FR-COM-07 · FR-COM-12)', () => {
  it('an operator edit with a wrong quantity is a new DRAFTED message, not approval-ready; the old one is CLOSED', async () => {
    const w = await world();
    const first = (await http.post('/communication/drafts').send(truckRequest(w)).expect(201)).body;
    const revised = await http
      .post(`/communication/drafts/${first.message.message_id}/revisions`)
      .send({ subject: first.message.subject, body: first.message.body.replace('셔틀 트럭 2대', '셔틀 트럭 8대') })
      .expect(201);
    const d = revised.body;
    expect(d.message.message_id).not.toBe(first.message.message_id);
    expect(d.message).toMatchObject({ status: 'DRAFTED', drafted_by: 'HUMAN', thread_id: first.message.thread_id });
    expect(d.number_check.status).toBe('BLOCKED_NUMBER_CHECK');
    expect(d.number_check.unmatched).toEqual([{ text: '8', kind: 'QUANTITY', matched_field: null }]);
    expect(d.approval_ready).toBe(false);
    expect(d.blocked_reasons).toEqual(['BLOCKED_NUMBER_CHECK', 'NOT_PENDING_APPROVAL']);
    expect(d.structured_values.find((v: { key: string }) => v.key === 'quantity').value_number).toBe('2'); // 정본은 구조화 값
    const old = (await http.get(`/communication/drafts/${first.message.message_id}`).expect(200)).body;
    expect(old.message.status).toBe('CLOSED');
    expect(old.approval_ready).toBe(false);
  });

  it('a wrong date is blocked too; a correct edit passes again', async () => {
    const w = await world();
    const first = (await http.post('/communication/drafts').send(truckRequest(w)).expect(201)).body;
    const wrongDate = (
      await http
        .post(`/communication/drafts/${first.message.message_id}/revisions`)
        .send({ subject: first.message.subject, body: first.message.body.replace('10월 13일(화)', '10월 14일(수)') })
        .expect(201)
    ).body;
    expect(wrongDate.number_check.unmatched).toEqual([{ text: '10월 14일', kind: 'DATE', matched_field: null }]);
    expect(wrongDate.message.status).toBe('DRAFTED');
    const fixed = (
      await http
        .post(`/communication/drafts/${wrongDate.message.message_id}/revisions`)
        .send({ subject: first.message.subject, body: `${first.message.body}\n\n추가: 15:00 이전 도착이면 더 좋습니다.` })
        .expect(201)
    ).body;
    expect(fixed).toMatchObject({ approval_ready: true, message: { status: 'PENDING_APPROVAL', drafted_by: 'HUMAN' } });
  });

  it('a superseded (CLOSED) draft cannot be revised again (409 DRAFT_NOT_EDITABLE)', async () => {
    const w = await world();
    const first = (await http.post('/communication/drafts').send(truckRequest(w)).expect(201)).body;
    await http.post(`/communication/drafts/${first.message.message_id}/revisions`).send({ subject: 's', body: '트럭 2대' }).expect(201);
    const res = await http.post(`/communication/drafts/${first.message.message_id}/revisions`).send({ subject: 's', body: '트럭 2대' }).expect(409);
    expect(res.body.code).toBe('DRAFT_NOT_EDITABLE');
  });
});

describe('Contact Gate and request validation', () => {
  it('a blocked recipient gets 403 RECIPIENT_NOT_ELIGIBLE with the reason codes, and nothing is written', async () => {
    const w = await world();
    await app.query("UPDATE cera.contact_channel_address SET email_verification_status = 'UNVERIFIED' WHERE address_id = $1", [w.addressId]);
    const res = await http.post('/communication/drafts').send(truckRequest(w)).expect(403);
    expect(res.body).toMatchObject({ code: 'RECIPIENT_NOT_ELIGIBLE' });
    expect(res.body.message).toContain('NOT_VERIFIED');
    expect(await count('comm_thread', 'counterparty_id', w.counterpartyId)).toBe(0);
  });

  it('malformed or incomplete values are rejected before anything is written (400)', async () => {
    const w = await world();
    const missing = await http.post('/communication/drafts').send(truckRequest(w, { values: [{ key: 'quantity', value_number: 2, unit: 'TRUCK' }] })).expect(400);
    expect(missing.body.code).toBe('INVALID_DRAFT_VALUES');
    const wrongShape = await http.post('/communication/drafts').send({ ...truckRequest(w), extra: true }).expect(400);
    expect(wrongShape.body.code).toBe('INVALID_DRAFT_REQUEST');
    const pathWithoutRun = await http.post('/communication/drafts').send(truckRequest(w, { source_run_id: null, scenario_id: w.scenarioId })).expect(400);
    expect(pathWithoutRun.body.code).toBe('SOURCE_RUN_REQUIRED');
    expect(await count('comm_thread', 'counterparty_id', w.counterpartyId)).toBe(0);
  });

  it('asking a trucker about another company’s trucks is refused (422 TARGET_COUNTERPARTY_MISMATCH)', async () => {
    const w = await world();
    const other = await world();
    const res = await http.post('/communication/drafts').send(truckRequest(w, { target_id: other.truckPoolId })).expect(422);
    expect(res.body.code).toBe('TARGET_COUNTERPARTY_MISMATCH');
  });

  it('unknown address, run and draft ids → 404; malformed id → 400', async () => {
    const w = await world();
    expect((await http.post('/communication/drafts').send(truckRequest(w, { address_id: v7() })).expect(404)).body.code).toBe('ADDRESS_NOT_FOUND');
    expect((await http.post('/communication/drafts').send(truckRequest(w, { source_run_id: v7() })).expect(404)).body.code).toBe('RUN_NOT_FOUND');
    expect((await http.get(`/communication/drafts/${v7()}`).expect(404)).body.code).toBe('DRAFT_NOT_FOUND');
    expect((await http.get('/communication/drafts/nope').expect(400)).body.code).toBe('INVALID_ID');
  });
});

describe('one transaction per draft', () => {
  it('a failure after the thread insert rolls back thread, question, message and values together', async () => {
    const w = await world();
    const repo = api.get(DraftRepository);
    const original = repo.insertDraftMessage.bind(repo);
    repo.insertDraftMessage = async () => {
      throw new Error('simulated failure inside the draft transaction');
    };
    try {
      await http.post('/communication/drafts').send(truckRequest(w)).expect(500);
    } finally {
      repo.insertDraftMessage = original;
    }
    expect(await count('comm_thread', 'counterparty_id', w.counterpartyId)).toBe(0);
    const questions = await app.query(
      'SELECT count(*)::int AS n FROM cera.question_item q JOIN cera.comm_thread t ON t.thread_id = q.thread_id WHERE t.counterparty_id = $1',
      [w.counterpartyId],
    );
    expect(questions.rows[0].n).toBe(0);
  });
});

describe('question target resolution', () => {
  it('without target_id a truck inquiry uses the counterparty’s only truck pool; a capacity inquiry needs a facility', async () => {
    const w = await world();
    const d = (await http.post('/communication/drafts').send(truckRequest(w, { target_id: undefined })).expect(201)).body;
    expect(d.question).toMatchObject({ target_entity_type: 'TRUCK_POOL', target_entity_id: w.truckPoolId, target_name: 'Test 셔틀' });
    const noFacility = await http
      .post('/communication/drafts')
      .send({ address_id: w.addressId, intent: 'FACILITY_CAPACITY', scenario_id: w.scenarioId, values: [{ key: 'quantity', value_number: 5, unit: 'CONTAINER' }, { key: 'date', value_text: '2026-10-07' }] })
      .expect(400);
    expect(noFacility.body.code).toBe('TARGET_REQUIRED');
  });

  it('GET /registry/facilities lists active facilities for the capacity target picker', async () => {
    const w = await world();
    const list = (await http.get('/registry/facilities').expect(200)).body;
    expect(list.facilities).toEqual(expect.arrayContaining([{ facility_id: w.facilityId, facility_type: 'WAREHOUSE', facility_name: '창고 B', area: null }]));
  });
});

describe('GET /communication/drafts and /planning/runs', () => {
  it('lists drafts newest first and the recovery runs a draft can cite', async () => {
    const w = await world();
    const d = (await http.post('/communication/drafts').send(truckRequest(w)).expect(201)).body;
    const list = (await http.get('/communication/drafts').expect(200)).body;
    expect(list.drafts[0].message.message_id).toBe(d.message.message_id);
    const runs = (await http.get('/planning/runs').expect(200)).body;
    expect(runs.runs.some((r: { run_id: string; trigger_ref: string }) => r.run_id === w.runId && r.trigger_ref === 'RP-TEST')).toBe(true);
  });

  it('OpenAPI carries the draft contract', async () => {
    const doc = (await http.get('/openapi.json').expect(200)).body;
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/communication/drafts', '/communication/drafts/{messageId}', '/communication/drafts/{messageId}/revisions', '/planning/runs']),
    );
    expect(doc.paths['/communication/drafts'].post.requestBody.content['application/json'].schema.$ref).toContain('CreateDraftRequestDto');
    expect(doc.components.schemas.NumberCheckDto.properties.status.enum).toEqual(['PASSED', 'BLOCKED_NUMBER_CHECK']);
  });
});
