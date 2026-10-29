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
import { SystemStatusService } from '../../src/ops/system-status.service.js';
import { Instant } from '../../src/shared/time/instant.js';
import { CorroborationService } from '../../src/truth/corroboration.service.js';
import { TruthService } from '../../src/truth/truth.service.js';
import { actor, hashOf, inTx } from './fixtures.js';
import { appPool, testEnv } from './support.js';

/**
 * T-136 Phase 2 · 3 · 4 — 공공 관측(입항 신고) ↔ 업체 주장 교차 확인 · Truth 반영.
 * C MATCH · D CONFLICT · E NOT_COMPARABLE · F NO_PUBLIC_EVIDENCE. 공공 관측은 녹화 재생(합성 fixture)이다.
 */
const FIXTURES = '../data/fixtures/public-data';
const contentDir = mkdtempSync(join(tmpdir(), 'cera-t136-content-'));
const ACTOR = 'X-CERA-Actor-Id';
const env = (extra: Partial<Record<keyof Env, string>> = {}) => testEnv({ CERA_CONTENT_DIR: contentDir, CERA_PUBLIC_DATA_REPLAY_DIR: FIXTURES, ...extra });

let api: INestApplication;
let http: ReturnType<typeof request>;
let db: pg.Pool;
let humanId: string;
let corr: CorroborationService;
let truth: TruthService;
let calls: { id: string; at: string }[] = [];

beforeAll(async () => {
  api = await createApiApp(env({ CERA_PUBLIC_DATA_MODE: 'replay' }));
  await api.init();
  http = request(api.getHttpServer());
  db = appPool();
  humanId = await actor(db, 'HUMAN');
  corr = api.get(CorroborationService);
  truth = api.get(TruthService);
  await http.post('/public-data/vessel-calls/fetch').set(ACTOR, humanId).send({ from: '2026-10-20', to: '2026-10-21' }).expect(200);
  calls = (
    await db.query<{ id: string; at: Date }>(`
      SELECT DISTINCT ON (l.entity_id) l.entity_id AS id, e.value_timestamp AS at
        FROM cera.event e JOIN cera.event_entity_link l ON l.event_id = e.event_id AND l.link_role = 'SUBJECT'
       WHERE e.fact_key = 'declared_arrival' AND e.source_type = 'PUBLIC_API' AND e.payload->>'authority' = 'A'
       ORDER BY l.entity_id, e.received_at DESC`)
  ).rows.map((r) => ({ id: r.id, at: Instant.ofEpochMs(r.at.getTime()).toSeoulIso() }));
});

afterAll(async () => {
  await api.close();
  await db.end();
  rmSync(contentDir, { recursive: true, force: true });
});

const shift = (iso: string, minutes: number) => Instant.ofEpochMs(Instant.parseIso(iso).epochMs + minutes * 60_000).toSeoulIso();
const claim = (vesselCallId: string, arrivalAt: string) =>
  http.post('/truth/claims/partner-statement').set(ACTOR, humanId).send({ command_id: v7(), intent: 'PARTNER_STATEMENT', vessel_call_id: vesselCallId, arrival_at: arrivalAt, source_note: '선사 배차 담당 전화 — 입항 일시' });
const coordinate = (id: string) => ({ entityType: 'VESSEL_CALL', entityId: id, factKey: 'declared_arrival', scopeType: 'GLOBAL', scopeRef: '', isSimulated: true });
const latest = async (id: string) => (await corr.list({ entityIds: [id] }))[0];

describe('T-136 public observation → Truth (authority per fact domain)', () => {
  it('a Port-MIS arrival declaration is an OBSERVED fact (public authority A) — not a human CONFIRMED', async () => {
    expect(calls.length).toBeGreaterThanOrEqual(3);
    const live = await truth.liveForCoordinate(coordinate(calls[0]!.id));
    expect(live.state).toBe('OBSERVED');
    expect(live.result.verificationBasis).toBeNull();
  });

  it('public events outside the public domains get no authority (location · identity are observations, not Truth facts)', async () => {
    const { rows } = await db.query("SELECT DISTINCT fact_key, payload->>'authority' AS authority FROM cera.event WHERE source_type = 'PUBLIC_API' AND fact_key <> 'declared_arrival'");
    for (const r of rows) expect(r.authority).toBeNull();
  });
});

describe('T-136 corroboration — partner statement vs public observation (deterministic)', () => {
  it('C MATCH: a statement within tolerance of the declaration is recorded with both evidences; the fact stays OBSERVED (no review)', async () => {
    const c = calls[0]!;
    const res = (await claim(c.id, shift(c.at, 20)).expect(200)).body;
    expect(res.fact_state).toBe('OBSERVED'); // 공공 관측이 이긴다 — 업체 진술(임시)이 사실을 바꾸지 않는다
    await corr.sweep();
    const m = await latest(c.id);
    expect(m).toMatchObject({ result: 'MATCH', reason_code: 'WITHIN_TOLERANCE', difference_minutes: 20, tolerance_minutes: 60, claim_source: 'HUMAN_UI' });
    expect(m!.public_event_id).not.toBeNull();
    expect((await truth.liveForCoordinate(coordinate(c.id))).state).toBe('OBSERVED');
    // 다시 돌려도 행이 늘지 않는다
    const before = (await corr.list({ entityIds: [c.id] })).length;
    await corr.sweep();
    expect((await corr.list({ entityIds: [c.id] })).length).toBe(before);
  });

  it('D CONFLICT: a statement far from the declaration → CONFLICT, the fact needs human review (never silently CONFIRMED), both evidences are kept', async () => {
    const c = calls[1]!;
    await claim(c.id, shift(c.at, 600)).expect(200);
    await corr.sweep();
    expect(await latest(c.id)).toMatchObject({ result: 'CONFLICT', reason_code: 'VALUE_DIFFERS_BEYOND_TOLERANCE', difference_minutes: 600 });
    const live = await truth.liveForCoordinate(coordinate(c.id));
    expect(live.state).toBe('NEEDS_REVIEW');
    expect(live.result.conflictType).toBe('PUBLIC_EVIDENCE_CONFLICT');
    expect(live.result.usability).toBe('APPROVAL_BLOCKED');
    expect([...new Set(live.data.rows.map((r) => r.sourceType))].sort()).toEqual(['HUMAN_UI', 'PUBLIC_API']); // 둘 다 보존(공유 시험 DB 에서는 같은 공공 관측이 여러 번 들어와 있을 수 있다)
  });

  it('E NOT_COMPARABLE: a partner reply about internal warehouse capacity is never compared with (or overwritten by) public data', async () => {
    const facilityId = v7();
    await db.query("INSERT INTO cera.facility (facility_id, facility_type, facility_name) VALUES ($1, 'WAREHOUSE', 'T-136 창고')", [facilityId]);
    const rawId = v7();
    const eventId = v7();
    const now = new Date().toISOString();
    await inTx(db, async (t) => {
      await t.query(`INSERT INTO cera.raw_input (raw_input_id, source_type, source_name, payload_ref, payload_hash, source_record_key, received_at, is_simulated) VALUES ($1, 'EMAIL', 'MOCK', $2, $3, $4, $5, false)`, [rawId, `cref:v1:RAW_INPUT_PAYLOAD:${v7()}`, hashOf(`t136-${rawId}`), rawId, now]);
      await t.query(
        `INSERT INTO cera.event (event_id, schema_version, raw_input_id, event_class, event_type, fact_kind, fact_key, value_number, value_unit, received_at, source_type, extraction_method, input_quality, input_confidence_level, idempotency_key, recorded_at, is_simulated, payload)
         VALUES ($1, 'ev-1', $2, 'OBSERVATION', 'WAREHOUSE_CAPACITY_CHANGED', 'STATE', 'capacity.day(2026-10-21)', 8, 'CONTAINER', $3, 'EMAIL', 'RULE_PARSED', 'STRUCTURED', 'MEDIUM', $4, $3, false, '{"authority":"A"}')`,
        [eventId, rawId, now, hashOf(`t136-evk-${eventId}`)],
      );
      await t.query("INSERT INTO cera.event_entity_link (event_id, entity_type, entity_id, link_role) VALUES ($1, 'FACILITY', $2, 'SUBJECT')", [eventId, facilityId]);
    });
    await corr.sweep({ entityId: facilityId });
    expect(await latest(facilityId)).toMatchObject({ result: 'NOT_COMPARABLE', reason_code: 'PUBLIC_DATA_DOES_NOT_COVER_FACT', public_event_id: null, claim_source: 'EMAIL' });
  });

  it('F NO_PUBLIC_EVIDENCE: a statement about a vessel call without a public declaration is only "no external evidence" — not treated as false', async () => {
    const [raw] = (await db.query("SELECT first_raw_input_id AS r FROM cera.vessel_call WHERE vessel_call_id = $1", [calls[0]!.id])).rows;
    const id = v7();
    await db.query(
      "INSERT INTO cera.vessel_call (vessel_call_id, port_authority_code, call_year, call_seq, call_sign, vessel_name, first_raw_input_id, is_simulated, registered_at) VALUES ($1, '020', 2026, 998, 'NOPUB1', 'NO PUBLIC', $2, true, now())",
      [id, raw.r],
    );
    const res = (await claim(id, '2026-10-21T09:00:00+09:00').expect(200)).body;
    expect(res.fact_state).toBe('PROVISIONAL'); // 업체 진술은 임시 — 확인이 아니다
    await corr.sweep({ entityId: id });
    expect(await latest(id)).toMatchObject({ result: 'NO_PUBLIC_EVIDENCE', reason_code: 'NO_PUBLIC_OBSERVATION', public_event_id: null });
    expect((await truth.liveForCoordinate(coordinate(id))).state).toBe('PROVISIONAL'); // 기존 Truth 정책 그대로
  });

  it('the list API returns the cross-check with both values and no secrets', async () => {
    const body = (await http.get(`/truth/corroborations?entity_id=${calls[1]!.id}`).expect(200)).body;
    expect(body.corroborations[0]).toMatchObject({ result: 'CONFLICT', fact_key: 'declared_arrival' });
    expect(JSON.stringify(body)).not.toMatch(/serviceKey|api[_ ]?key/i);
  });

  it('system health shows the cross-check summary (counts and time only — no values, no ids)', async () => {
    const pd = (await api.get(SystemStatusService).status()).integrations.public_data as { corroboration?: { last_at: string | null; last_24h: Record<string, number> } };
    expect(pd.corroboration?.last_at).not.toBeNull();
    expect(pd.corroboration?.last_24h.MATCH).toBeGreaterThanOrEqual(1);
    expect(pd.corroboration?.last_24h.CONFLICT).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(pd.corroboration)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});
