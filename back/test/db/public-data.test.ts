import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';
import request from 'supertest';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApiApp } from '../../src/app/create-api.js';
import type { Env } from '../../src/config/env.js';
import { sha256Bytes } from '../../src/shared/hash/hash.js';
import { actor } from './fixtures.js';
import { appPool, expectSqlState, ownerPool, testEnv } from './support.js';

/**
 * (같은 DB 를 쓰는 다른 시험 — 예: Agent Tool 시험 — 이 같은 합성 fixture 를 먼저 넣을 수 있다. 개수는 이 시험 행위자의 호출 · 합성 식별자로 센다.)
 * T-102 — 공공데이터(DS-03 입항 건 · DS-02 적하목록): 전송 → 원문 보존(내용 저장소 + raw_input) → 호출 원장 → 정규화 →
 * 개체 · PUBLIC_API 사건 · 외부 식별자. replay(합성 fixture)로 전체 흐름, 가짜 fetch 로 LIVE 실패 · 키 누출 · 실제/시뮬레이션 분리.
 */
const FIXTURES = '../data/fixtures/public-data';
const contentDir = mkdtempSync(join(tmpdir(), 'cera-public-data-content-'));
const SECRET_KEY = 'TEST+KEY/never-store==SECRET-7f3a';
const ACTOR = 'X-CERA-Actor-Id';
const env = (extra: Partial<Record<keyof Env, string>> = {}) => testEnv({ CERA_CONTENT_DIR: contentDir, CERA_PUBLIC_DATA_REPLAY_DIR: FIXTURES, ...extra });

let replayApi: INestApplication;
let http: ReturnType<typeof request>;
let db: pg.Pool;
let humanId: string;
let systemId: string;

const count = async (sql: string, params: unknown[] = []) => Number((await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${sql}`, params)).rows[0]?.n);

beforeAll(async () => {
  replayApi = await createApiApp(env({ CERA_PUBLIC_DATA_MODE: 'replay' }));
  await replayApi.init();
  http = request(replayApi.getHttpServer());
  db = appPool();
  humanId = await actor(db, 'HUMAN');
  systemId = await actor(db, 'SYSTEM');
});

afterAll(async () => {
  await replayApi.close();
  await db.end();
  rmSync(contentDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('public data — replay (synthetic fixtures)', () => {
  let vesselCallId = '';

  it('reports the mode and callable datasets without keys', async () => {
    const res = await http.get('/public-data/status').expect(200);
    expect(res.body).toEqual({
      mode: 'REPLAY',
      max_pages: 20,
      datasets: [
        { dataset: 'MOF_VESSEL_CALL', operation: '1192000/VsslEtrynd5/Info5', available: true },
        { dataset: 'MOF_CONTAINER_MANIFEST', operation: '1192000/CargFrghtContnOut/ContnInfo', available: true },
      ],
    });
  });

  it('requires an active human operator and valid dates', async () => {
    await http.post('/public-data/vessel-calls/fetch').send({ from: '2026-10-20', to: '2026-10-21' }).expect(400);
    await http.post('/public-data/vessel-calls/fetch').set(ACTOR, systemId).send({ from: '2026-10-20', to: '2026-10-21' }).expect(403);
    const bad = await http.post('/public-data/vessel-calls/fetch').set(ACTOR, humanId).send({ from: '2026-10-21', to: '2026-10-20' }).expect(400);
    expect(bad.body.code).toBe('INVALID_DATE_RANGE');
    const missing = await http.post('/public-data/vessel-calls/fetch').set(ACTOR, humanId).send({ from: '2026-09-01', to: '2026-09-02' }).expect(422);
    expect(missing.body.code).toBe('REPLAY_FIXTURE_NOT_FOUND');
    expect(await count('cera.public_data_fetch WHERE requested_by_actor_id = $1', [humanId])).toBe(0);
  });

  it('DS-03: keeps the raw page, writes the ledger, registers vessel calls and records arrival · berth events', async () => {
    const res = await http.post('/public-data/vessel-calls/fetch').set(ACTOR, humanId).send({ from: '2026-10-20', to: '2026-10-21' }).expect(200);
    const { summary, vessel_calls } = res.body;
    expect(summary).toMatchObject({ dataset: 'MOF_VESSEL_CALL', mode: 'REPLAY', outcome: 'SUCCESS', total_count: 5, truncated: false });
    expect(summary.pages).toHaveLength(1);
    expect(summary.issues).toEqual([
      { item_index: 3, code: 'BERTH_CODE_NONSTANDARD' },
      { item_index: 4, code: 'VESSEL_CALL_KEY_INVALID' },
    ]);
    expect(vessel_calls).toHaveLength(4);
    const express = vessel_calls.find((v: { call_sign: string }) => v.call_sign === 'D7CR01');
    vesselCallId = express.vessel_call_id;
    expect(express).toMatchObject({
      port_authority_code: '020',
      call_year: 2026,
      call_seq: '041',
      vessel_name: 'CERA SYNTH EXPRESS',
      is_simulated: true,
      manifest_no: '26SYNT0041I',
      declared_arrival: { value: { at: '2026-10-20T06:30:00.000+09:00', request_kind: '최종', relative_to_received: 'PAST' } },
      latest_berth: { value: { code: 'SYA_02', name: '합성 터미널 A 2선석' } },
    });
    const fixture = readFileSync(`${FIXTURES}/ds03/busan-20261020-20261021-p1.xml`);
    expect(express.registered_from).toMatchObject({
      source_type: 'PUBLIC_API',
      dataset: 'MOF_VESSEL_CALL',
      mode: 'REPLAY',
      is_simulated: true,
      result_kind: 'SCENARIO_RESULT',
      payload_hash: sha256Bytes(fixture),
    });

    // 원문: 내용 저장소의 바이트 = fixture 바이트, raw_input 은 PUBLIC_API · 안전한 요청 표현
    const raw = await db.query('SELECT source_type, source_name, request_ref, payload_ref, payload_hash, is_simulated FROM cera.raw_input WHERE raw_input_id = $1', [
      express.registered_from.raw_input_id,
    ]);
    expect(raw.rows[0]).toMatchObject({
      source_type: 'PUBLIC_API',
      source_name: 'DATA_GO_KR/MOF_VESSEL_CALL',
      request_ref: '1192000/VsslEtrynd5/Info5?deGb=I&ede=20261021&numOfRows=50&pageNo=1&prtAgCd=020&sde=20261020',
      is_simulated: true,
    });
    const ledger = await db.query('SELECT mode, outcome, http_status, result_code, total_count, item_count, request_params, requested_by_actor_id FROM cera.public_data_fetch WHERE requested_by_actor_id = $1', [humanId]);
    expect(ledger.rows).toEqual([
      {
        mode: 'REPLAY',
        outcome: 'SUCCESS',
        http_status: 200,
        result_code: '00',
        total_count: 5,
        item_count: 5,
        request_params: { prtAgCd: '020', sde: '20261020', ede: '20261021', deGb: 'I', numOfRows: '50', pageNo: '1' },
        requested_by_actor_id: humanId,
      },
    ]);
    expect(await count("cera.audit_log WHERE action = 'PUBLIC_DATA_FETCHED' AND actor_id = $1", [humanId])).toBe(1);
    expect(await count("cera.event e JOIN cera.public_data_fetch f ON f.raw_input_id = e.raw_input_id WHERE f.requested_by_actor_id = $1 AND e.event_type = 'LOCATION_REPORTED'", [humanId])).toBe(4);
    expect(await count("cera.event e JOIN cera.public_data_fetch f ON f.raw_input_id = e.raw_input_id WHERE f.requested_by_actor_id = $1 AND e.event_type = 'ARRIVAL_DECLARED' AND e.fact_key = 'declared_arrival'", [humanId])).toBe(4);
    // 입항 신고는 마일스톤이 아니다 — milestone.arrived 사건은 만들지 않는다
    expect(await count("cera.event WHERE source_type = 'PUBLIC_API' AND fact_key = 'milestone.arrived'")).toBe(0);
    // 최종이 아닌 신고(D7CR02 최초 · D7CR04 변경)는 신뢰도 LOW
    expect(await count("cera.event e JOIN cera.public_data_fetch f ON f.raw_input_id = e.raw_input_id WHERE f.requested_by_actor_id = $1 AND e.event_type = 'ARRIVAL_DECLARED' AND e.input_confidence_level = 'LOW'", [humanId])).toBe(2);
    const bulk = await db.query("SELECT e.payload FROM cera.event e JOIN cera.event_entity_link l ON l.event_id = e.event_id JOIN cera.vessel_call v ON v.vessel_call_id = l.entity_id WHERE v.call_sign = 'D7CR04' AND e.event_type = 'ARRIVAL_DECLARED'");
    expect(bulk.rows[0]?.payload).toMatchObject({ tz_assumed: true, basis: 'PORT_MIS_ENTRY_DECLARATION' });
  });

  it('a repeated fetch is new evidence (new raw + events) but does not duplicate vessel calls or identifiers', async () => {
    await http.post('/public-data/vessel-calls/fetch').set(ACTOR, humanId).send({ from: '2026-10-20', to: '2026-10-21' }).expect(200);
    expect(await count("cera.vessel_call WHERE call_sign LIKE 'D7CR%'")).toBe(4);
    expect(await count('cera.public_data_fetch WHERE requested_by_actor_id = $1', [humanId])).toBe(2);
    expect(await count("cera.raw_input WHERE source_type = 'PUBLIC_API' AND collected_by_actor_id = $1", [humanId])).toBe(2);
    expect(await count("cera.event e JOIN cera.public_data_fetch f ON f.raw_input_id = e.raw_input_id WHERE f.requested_by_actor_id = $1 AND e.event_type = 'LOCATION_REPORTED'", [humanId])).toBe(8);
    expect(await count("cera.external_identifier WHERE id_type = 'MANIFEST_NO' AND id_value LIKE '26SYNT%'")).toBe(3);
  });

  it('DS-02: two pages, 51 import containers, B/L links, MSN identifiers and identity events', async () => {
    const res = await http.post(`/public-data/vessel-calls/${vesselCallId}/manifest/fetch`).set(ACTOR, humanId).expect(200);
    const { summary, containers, vessel_call } = res.body;
    expect(summary).toMatchObject({ dataset: 'MOF_CONTAINER_MANIFEST', outcome: 'SUCCESS', total_count: 53, truncated: false });
    expect(summary.pages.map((p: { item_count: number }) => p.item_count)).toEqual([50, 3]);
    expect(summary.issues.map((i: { code: string }) => i.code).sort()).toEqual(['CONTAINER_CHECK_DIGIT_MISMATCH', 'CONTAINER_NO_INVALID', 'NOT_IMPORT_LINE']);
    expect(containers).toHaveLength(51);
    expect(vessel_call.container_count).toBe(51);
    expect(containers.filter((c: { check_digit_valid: boolean }) => !c.check_digit_valid)).toHaveLength(1);
    const first = containers.find((c: { container_no: string }) => c.container_no === 'ZZZU0001009');
    expect(first ?? containers[0]).toMatchObject({ bl_type: 'UNKNOWN', is_simulated: true });
    expect(new Set(containers.map((c: { size_type: string }) => c.size_type))).toEqual(new Set(['20DRY', '40HC', '40DRY', '40RF']));
    expect(containers.every((c: { iso_size_type: string | null; msn: string | null; bl_no: string | null }) => c.iso_size_type && c.msn && c.bl_no)).toBe(true);
    expect(await count("cera.bl WHERE bl_no LIKE 'SYNBL%'")).toBe(11);
    expect(await count("cera.container_bl cb JOIN cera.container c ON c.container_id = cb.container_id WHERE cb.link_role = 'PRIMARY' AND c.container_no LIKE 'ZZZU%'")).toBe(51);
    expect(await count("cera.external_identifier WHERE id_type = 'MSN' AND id_value LIKE '26SYNT%'")).toBe(11);
    expect(await count("cera.event e JOIN cera.public_data_fetch f ON f.raw_input_id = e.raw_input_id WHERE f.requested_by_actor_id = $1 AND e.event_type IN ('VESSEL_CALL_LINKED', 'BL_LINKED', 'EQUIPMENT_REPORTED')", [humanId])).toBe(153);
    expect(await count("cera.event e JOIN cera.public_data_fetch f ON f.raw_input_id = e.raw_input_id WHERE f.requested_by_actor_id = $1 AND e.event_type = 'BL_LINKED' AND e.input_confidence_level = 'LOW'", [humanId])).toBe(1);
    expect(await count("cera.event_entity_link l JOIN cera.event e ON e.event_id = l.event_id JOIN cera.public_data_fetch f ON f.raw_input_id = e.raw_input_id WHERE f.requested_by_actor_id = $1 AND l.link_role = 'CONTEXT'", [humanId])).toBe(102);
  });

  it('DS-02 NO_DATA and unknown vessel calls', async () => {
    const list = (await http.get('/public-data/vessel-calls').expect(200)).body.vessel_calls;
    const bridge = list.find((v: { call_sign: string }) => v.call_sign === 'D7CR02');
    const res = await http.post(`/public-data/vessel-calls/${bridge.vessel_call_id}/manifest/fetch`).set(ACTOR, humanId).expect(200);
    expect(res.body.summary).toMatchObject({ outcome: 'NO_DATA', total_count: 0 });
    expect(res.body.containers).toEqual([]);
    await http.post(`/public-data/vessel-calls/${v7()}/manifest/fetch`).set(ACTOR, humanId).expect(404);
    await http.get('/public-data/vessel-calls/not-a-uuid').expect(400);
    const detail = await http.get(`/public-data/vessel-calls/${vesselCallId}`).expect(200);
    expect(detail.body.containers).toHaveLength(51);
    const fetches = await http.get('/public-data/fetches?limit=10').expect(200);
    expect(fetches.body.fetches.length).toBeGreaterThanOrEqual(5);
  });
});

describe('public data — live transport (stubbed fetch, never the network)', () => {
  let liveApi: INestApplication;
  let live: ReturnType<typeof request>;
  const replies: (() => Response | Promise<Response>)[] = [];

  beforeAll(async () => {
    vi.stubGlobal('fetch', async () => {
      const next = replies.shift();
      if (!next) throw new Error('unexpected fetch');
      return next();
    });
    liveApi = await createApiApp(env({ CERA_PUBLIC_DATA_MODE: 'live', DATA_GO_KR_SERVICE_KEY: SECRET_KEY }));
    await liveApi.init();
    live = request(liveApi.getHttpServer());
  });

  afterAll(async () => {
    await liveApi.close();
  });

  it('records a gateway error page with its raw body and a system_error, and a transport failure without one', async () => {
    replies.push(
      () =>
        new Response(
          '<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>',
          { status: 200, headers: { 'content-type': 'text/xml' } },
        ),
    );
    const gw = await live.post('/public-data/vessel-calls/fetch').set(ACTOR, humanId).send({ from: '2026-10-01', to: '2026-10-01' }).expect(200);
    expect(gw.body.summary).toMatchObject({ mode: 'LIVE', outcome: 'UPSTREAM_ERROR' });
    expect(gw.body.summary.pages[0]).toMatchObject({ result_code: 'GW_30', http_status: 200 });
    expect(gw.body.summary.pages[0].raw_input_id).toBeTruthy();

    replies.push(() => {
      throw new TypeError(`fetch failed: https://apis.data.go.kr/x?serviceKey=${SECRET_KEY}`);
    });
    const tr = await live.post('/public-data/vessel-calls/fetch').set(ACTOR, humanId).send({ from: '2026-10-02', to: '2026-10-02' }).expect(200);
    expect(tr.body.summary.pages[0]).toMatchObject({ outcome: 'TRANSPORT_ERROR', raw_input_id: null, result_code: 'NETWORK' });
    expect(await count("cera.system_error WHERE error_category = 'PUBLIC_DATA_INTEGRATION'")).toBe(2);
  });

  it('keeps live and replayed records apart: a live response about replayed vessel calls registers nothing', async () => {
    replies.push(() => new Response(readFileSync(`${FIXTURES}/ds03/busan-20261020-20261021-p1.xml`), { status: 200, headers: { 'content-type': 'text/xml' } }));
    const res = await live.post('/public-data/vessel-calls/fetch').set(ACTOR, humanId).send({ from: '2026-10-20', to: '2026-10-21' }).expect(200);
    expect(res.body.summary.outcome).toBe('SUCCESS');
    expect(res.body.summary.issues.filter((i: { code: string }) => i.code === 'VESSEL_CALL_SIMULATION_MISMATCH')).toHaveLength(4);
    expect(res.body.vessel_calls).toEqual([]);
    expect(await count("cera.vessel_call WHERE call_sign LIKE 'D7CR%'")).toBe(4);
    expect(await count('cera.public_data_fetch WHERE is_simulated = false AND raw_input_id IS NOT NULL')).toBe(2);
  });

  it('the service key appears nowhere in the database or the stored raw content metadata', async () => {
    const needle = SECRET_KEY.slice(0, 12);
    for (const table of ['raw_input', 'public_data_fetch', 'audit_log', 'system_error', 'event']) {
      expect(await count(`cera.${table} t WHERE to_jsonb(t)::text LIKE $1`, [`%${needle}%`])).toBe(0);
    }
    expect(await count(`cera.public_data_fetch WHERE request_params ? 'serviceKey'`)).toBe(0);
  });
});

describe('public data — M15 guards', () => {
  it('ledger, identifiers and container links are append-only; masters keep their identity columns', async () => {
    // 앱 역할: 권한(GRANT)이 먼저 막는다
    await expectSqlState(db.query("UPDATE cera.public_data_fetch SET outcome = 'SUCCESS'"), '42501');
    await expectSqlState(db.query('DELETE FROM cera.external_identifier'), '42501');
    await expectSqlState(db.query('DELETE FROM cera.vessel_call'), '42501');
    // 소유 역할로도 트리거가 막는다(두 겹)
    const owner = ownerPool();
    try {
      await expectSqlState(owner.query("UPDATE cera.public_data_fetch SET outcome = 'SUCCESS'"), 'CE001');
      await expectSqlState(owner.query('DELETE FROM cera.external_identifier'), 'CE001');
      await expectSqlState(owner.query("UPDATE cera.container_bl SET link_role = 'CONSOLIDATED'"), 'CE001');
      await expectSqlState(owner.query('DELETE FROM cera.vessel_call'), 'CE001');
      await expectSqlState(owner.query('TRUNCATE cera.public_data_fetch CASCADE'), 'CE001');
    } finally {
      await owner.end();
    }
    // 마스터: 허용 열 밖은 CE002
    await expectSqlState(db.query("UPDATE cera.container SET container_no = 'ZZZU9999999'"), 'CE002');
    await expectSqlState(db.query('UPDATE cera.vessel_call SET call_seq = 1'), 'CE002');
    await db.query('UPDATE cera.container SET is_active = is_active'); // 허용 열만 바뀌면 통과
  });

  it('entity links accept CONTAINER · BL · VESSEL_CALL only when the row exists; identifier owners must exist', async () => {
    const [raw] = (await db.query('SELECT raw_input_id FROM cera.raw_input WHERE is_simulated = true LIMIT 1')).rows;
    await expectSqlState(
      db.query(
        `INSERT INTO cera.external_identifier (external_identifier_id, owner_type, owner_id, issuing_system, id_type, id_value, source_raw_input_id, is_simulated)
         VALUES ($1, 'CONTAINER', $2, 'MOF', 'MANIFEST_NO', 'X1', $3, true)`,
        [v7(), v7(), raw.raw_input_id],
      ),
      'CE005',
    );
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const [ev] = (await client.query("SELECT event_id FROM cera.event WHERE event_type = 'BL_LINKED' LIMIT 1")).rows;
      await expectSqlState(client.query("INSERT INTO cera.event_entity_link (event_id, entity_type, entity_id, link_role) VALUES ($1, 'BL', $2, 'CONTEXT')", [ev.event_id, v7()]), 'CE005');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
