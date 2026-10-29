import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { mkdtempSync, rmSync } from 'node:fs';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';
import request from 'supertest';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ExtractionRequest } from '../../src/ai/ai-client.js';
import { createApiApp } from '../../src/app/create-api.js';
import { WorkerModule } from '../../src/app/worker.module.js';
import { CHANNEL_ADAPTERS } from '../../src/channel/channel-adapter.js';
import type { ChannelAdapters } from '../../src/channel/channel.module.js';
import type { MockChannelAdapter } from '../../src/channel/mock-channel-adapter.js';
import { ExtractionProcessor } from '../../src/communication/extraction-processor.js';
import { InboundProcessor } from '../../src/communication/inbound-processor.js';
import { OutboxDispatcher } from '../../src/communication/outbox-dispatcher.js';
import { computeBaseline } from '../../src/planning/engine/baseline.js';
import { buildCostTable } from '../../src/planning/engine/cost-engine.js';
import { solveRecovery } from '../../src/planning/engine/solver.js';
import { truthToPlanningFacts } from '../../src/planning/recovery-plan.service.js';
import { Instant } from '../../src/shared/time/instant.js';
import { TruthService } from '../../src/truth/truth.service.js';
import { container, miniInput } from '../unit/planning-fixture.js';
import { T0, hashOf, registry } from './fixtures.js';
import { appPool, testEnv } from './support.js';

/**
 * T-137 — 실제 업체 회신(메일) → 원문 보존 → 스레드 연결 → AI 추출(HTTP AI Server) → 결정론 검증(식별자 · 인용 · 시각) → 사건(업체 주장 · 권한 W)
 * → 공공 관측(Port-MIS 입항 신고, 녹화 재생)과 교차 확인 → Truth → 할 일 → Cost · Solver. AI Server 자리에는 시험용 HTTP 서버(실제 HttpAiClient 를 지난다).
 * Mock 회신은 시뮬레이션이라 같은 시뮬레이션 구분의 공공 관측(녹화 재생)과 비교한다(실제 ↔ 시뮬레이션은 섞지 않는다 — 규칙 9).
 */
type Handler = (req: ExtractionRequest) => unknown[];
let handler: Handler = () => [];
const calls: ExtractionRequest[] = [];
const aiServer: Server = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = JSON.parse(raw) as ExtractionRequest;
    calls.push(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        schema_version: 'reply-extract/2',
        outcome: 'VALUES',
        answers: handler(body),
        unmapped_statements: [],
        ambiguity_flags: [],
        meta: { provider: 'replay', model_version: 'replay:t137', prompt_version: 'reply-extract-v3', latency_ms: 2, usage: null },
      }),
    );
  });
});

const FIXTURES = '../data/fixtures/public-data';
const contentDir = mkdtempSync(join(tmpdir(), 'cera-t137-content-'));
const mockDir = mkdtempSync(join(tmpdir(), 'cera-t137-mock-'));
const ACTOR = 'X-CERA-Actor-Id';
let api: INestApplication;
let http: ReturnType<typeof request>;
let app: pg.Pool;
let worker: INestApplicationContext;
let mock: MockChannelAdapter;
let vessels: { id: string; sign: string; at: string }[] = [];

beforeAll(async () => {
  await new Promise<void>((r) => aiServer.listen(0, '127.0.0.1', () => r()));
  const url = `http://127.0.0.1:${(aiServer.address() as AddressInfo).port}`;
  const env = testEnv({ CERA_CONTENT_DIR: contentDir, CERA_MOCK_CHANNEL_DIR: mockDir, CERA_AI_SERVER_URL: url, CERA_AI_TIMEOUT_MS: '2000', CERA_PUBLIC_DATA_MODE: 'replay', CERA_PUBLIC_DATA_REPLAY_DIR: FIXTURES });
  api = await createApiApp(env);
  await api.init();
  http = request(api.getHttpServer());
  app = appPool();
  worker = await NestFactory.createApplicationContext(WorkerModule.forRoot(env), { logger: false });
  mock = (worker.get(CHANNEL_ADAPTERS) as ChannelAdapters).get('MOCK') as MockChannelAdapter;
  const humanId = (await registry(app)).humanId;
  await http.post('/public-data/vessel-calls/fetch').set(ACTOR, humanId).send({ from: '2026-10-20', to: '2026-10-21' }).expect(200);
  // 공공 입항 신고가 있고, 호출부호가 한 입항 신고만 가리키는 배(어느 항차인지 정할 필요 없는 배)
  vessels = (
    await app.query<{ id: string; sign: string; at: Date }>(`
      SELECT DISTINCT ON (v.vessel_call_id) v.vessel_call_id AS id, v.call_sign AS sign, e.value_timestamp AS at
        FROM cera.vessel_call v
        JOIN cera.event_entity_link l ON l.entity_id = v.vessel_call_id AND l.link_role = 'SUBJECT'
        JOIN cera.event e ON e.event_id = l.event_id AND e.fact_key = 'declared_arrival' AND e.source_type = 'PUBLIC_API'
       WHERE v.is_simulated AND (SELECT count(*) FROM cera.vessel_call x WHERE x.is_simulated AND upper(x.call_sign) = upper(v.call_sign)) = 1
       ORDER BY v.vessel_call_id DESC, e.received_at DESC`) // T-136 시험(앞쪽 배)과 겹치지 않게 뒤쪽 배부터
  ).rows.map((r) => ({ id: r.id, sign: r.sign, at: Instant.ofEpochMs(r.at.getTime()).toSeoulIso() }));
});

afterAll(async () => {
  await api.close();
  await worker.close();
  await app.end();
  await new Promise<void>((r) => aiServer.close(() => r()));
  rmSync(contentDir, { recursive: true, force: true });
  rmSync(mockDir, { recursive: true, force: true });
});

async function world() {
  const r = await registry(app);
  const scenarioId = v7();
  const snapshotId = v7();
  const runId = v7();
  const truckPoolId = v7();
  await app.query("INSERT INTO cera.scenario (scenario_id, scenario_name, as_of_base, created_at) VALUES ($1, 't137 scenario', $2, $2)", [scenarioId, T0]);
  await app.query(
    `INSERT INTO cera.planning_snapshot (snapshot_id, as_of, fact_fingerprint, rule_version, tariff_version, policy_version, contains_simulated, created_at, scenario_id)
     VALUES ($1, $2, $3, 'r1', 't1', 'p1', true, $2, $4)`,
    [snapshotId, T0, hashOf(`snap-${snapshotId}`), scenarioId],
  );
  await app.query(
    `INSERT INTO cera.recovery_run (run_id, snapshot_id, trigger_type, trigger_ref, objective_version, run_status, contains_simulated, executed_at)
     VALUES ($1, $2, 'EXCEPTION_DETECTED', 'RP-T137', 'o1', 'FEASIBLE', true, $3)`,
    [runId, snapshotId, T0],
  );
  await app.query("INSERT INTO cera.truck_pool (truck_pool_id, pool_name, ownership, owner_counterparty_id) VALUES ($1, 'T137 셔틀', 'PARTNER', $2)", [truckPoolId, r.counterpartyId]);
  return { ...r, runId, truckPoolId };
}

/** 문의 → 사람 승인 → 발송 → 업체 회신(Mock 수신함) → 수신 처리(원문 · 스레드 연결) → Worker 추출. 회신의 근거 시각(Date 헤더)을 정할 수 있다 */
async function reply(body: string, sentAt: string) {
  const w = await world();
  const d = (
    await http
      .post('/communication/drafts')
      .send({
        address_id: w.addressId,
        intent: 'TRUCK_SLOT',
        target_id: w.truckPoolId,
        source_run_id: w.runId,
        values: [
          { key: 'quantity', value_number: 2, unit: 'TRUCK', source_path: 'resource_gaps[0].needed' },
          { key: 'date', value_text: '2026-10-13' },
          { key: 'window_from', value_text: '15:00' },
          { key: 'window_to', value_text: '17:00' },
        ],
      })
      .expect(201)
  ).body;
  await http.post(`/communication/drafts/${d.message.message_id}/approve`).set(ACTOR, w.humanId).send({ content_hash: d.message.content_hash }).expect(200);
  await http.post(`/communication/drafts/${d.message.message_id}/send`).set(ACTOR, w.humanId).send({ content_hash: d.message.content_hash }).expect(200);
  await worker.get(OutboxDispatcher).processMessage(d.message.message_id);
  const r = await mock.simulateReply({ replyToCeraMessageId: d.message.message_id, body, dateHeader: new Date(Instant.parseIso(sentAt).epochMs).toUTCString() });
  await worker.get(InboundProcessor).runCycle();
  const inbound = (await app.query("SELECT message_id FROM cera.comm_message WHERE direction = 'INBOUND' AND external_message_id = $1", [r.external_message_id])).rows[0];
  if (!inbound) throw new Error('reply was not attached to the thread');
  calls.length = 0;
  const extracted = await worker.get(ExtractionProcessor).extractOne(inbound.message_id);
  return { ...w, inboundId: inbound.message_id as string, extracted };
}

const seoul = (iso: string) => ({ day: iso.slice(0, 10), h: Number(iso.slice(11, 13)), m: Number(iso.slice(14, 16)) });
const hhmm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
const spoken = (h: number, m: number) => `${h}시${m ? ` ${m}분` : ''}`;
/** AI 자리: 백엔드가 보낸 선박 질문(ARRIVAL_DATETIME)에 인용과 함께 답한다 — 일치 · 충돌 판정은 하지 않는다 */
const answerVessel = (quote: string, time: string) => (req: ExtractionRequest) => {
  const ask = req.asks.find((a) => a.answer_shape === 'ARRIVAL_DATETIME');
  return ask ? [{ ask_id: ask.ask_id, field: 'arrival_time', raw_value: time, value: time, unit: null, evidence: { quote }, confidence: 0.9 }] : [];
};
const coordinate = (id: string) => ({ entityType: 'VESSEL_CALL', entityId: id, factKey: 'declared_arrival', scopeType: 'GLOBAL', scopeRef: '', isSimulated: true });
const corroborations = async (id: string) => (await http.get(`/truth/corroborations?entity_id=${id}`).expect(200)).body.corroborations;

/** 작은 합성 계획의 날짜(2026-10-13 · 14 · 15)를 입항 신고 날짜로 옮긴다 — 공공 관측(녹화 재생)의 날짜에 맞춘 계획일 */
function onDay<T>(input: T, day: string): T {
  const shift = (d: number) => new Date(Date.parse(`${day}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
  return JSON.parse(JSON.stringify(input).replaceAll('2026-10-13', shift(0)).replaceAll('2026-10-14', shift(1)).replaceAll('2026-10-15', shift(2))) as T;
}

/** Truth → 계획 입력(실제 매핑 함수) → Cost Engine → HiGHS. 컨테이너 하나가 그 입항 신고에 연결된 작은 계획(계획일 = 공공 입항 신고 날짜) */
async function plan(vesselId: string, day: string) {
  const live = await api.get(TruthService).liveForCoordinate(coordinate(vesselId));
  const facts = truthToPlanningFacts([live], day, [day], new Map([[vesselId, 'VESSEL_CALL' as const]]));
  const input = { ...onDay(miniInput({ containers: [container('C1', { vessel_call_id: vesselId })] }), day), facts: [...onDay(miniInput(), day).facts, ...facts] };
  const table = buildCostTable(input);
  const result = await solveRecovery(input, table, computeBaseline(input, table));
  return { live, facts, table, result };
}

describe('T-137 MATCH — a partner email states the same arrival as the public declaration', () => {
  it('reply → AI (only the asks the backend made) → validated claim → corroboration MATCH → fact stays OBSERVED, no review, solver uses the public arrival', async () => {
    const v = vessels[0]!;
    const p = seoul(v.at);
    const m = Math.min(59, p.m + 20); // 같은 날 20분 이내 차이 — 허용 오차(60분 [ASSUMPTION]) 안
    const quote = `오늘 ${spoken(p.h, m)}에 입항했습니다`;
    handler = answerVessel(quote, hhmm(p.h, m));
    const w = await reply(`안녕하세요. ${v.sign} 선박은 ${quote}.\n차량은 오후 3시 이후 2대 가능합니다.`, `${p.day}T${hhmm(Math.min(23, p.h + 1), 0)}:00+09:00`);

    // AI 에 간 질문: 문의 질문 + 백엔드가 고른 그 배의 입항 질문(배 id 는 백엔드가 정함 — AI 는 다른 배를 지어낼 수 없다)
    const vesselAsk = calls[0]!.asks.find((a) => a.answer_shape === 'ARRIVAL_DATETIME')!;
    expect(vesselAsk.ask_id).toBe(`v:${v.id}`);
    expect(calls[0]!.asks.map((a) => a.answer_shape).sort()).toEqual(['ARRIVAL_DATETIME', 'QUANTITY_IN_TIME_WINDOW']);

    // 업체 근거: 추출 행(ACCEPTED) → 사건(EMAIL · LLM_EXTRACTED · 권한 W · 원문 인용 연결)
    const ex = (await app.query("SELECT * FROM cera.extraction WHERE message_id = $1 AND ask_id = $2", [w.inboundId, `v:${v.id}`])).rows[0];
    expect(ex).toMatchObject({ review_status: 'ACCEPTED', candidate_value_text: hhmm(p.h, m) });
    expect(ex.validator_result).toContainEqual({ check: 'IDENTIFIER_IN_SOURCE', passed: true, detail_code: null });
    const claim = (await app.query('SELECT * FROM cera.event WHERE event_id = $1', [ex.created_event_id])).rows[0];
    expect(claim).toMatchObject({ source_type: 'EMAIL', extraction_method: 'LLM_EXTRACTED', fact_key: 'declared_arrival', event_type: 'ARRIVAL_DECLARED' });
    expect(claim.payload).toMatchObject({ authority: 'W', claim_kind: 'PARTNER_REPLY', ask_id: `v:${v.id}` });
    expect(claim.value_timestamp.getTime()).toBe(Instant.parseIso(`${p.day}T${hhmm(p.h, m)}:00+09:00`).epochMs);

    // 교차 확인(결정론): 업체 근거 + 공공 근거를 함께 남긴다
    const [c] = await corroborations(v.id);
    expect(c).toMatchObject({ result: 'MATCH', claim_event_id: claim.event_id, claim_source: 'EMAIL', tolerance_minutes: 60 });
    expect(c.public_event_id).not.toBeNull();

    // Truth: 공공 관측(OBSERVED)이 현재 값 — 사람 검토 없음 · 할 일 없음 · 실행의 사실 목록에 보인다
    const { live, facts, table, result } = await plan(v.id, p.day);
    expect(live.state).toBe('OBSERVED');
    expect((await http.get('/truth/corroborations/open-conflicts').expect(200)).body.conflicts.map((x: { entity_id: string }) => x.entity_id)).not.toContain(v.id);
    const runFacts = (await http.get(`/truth/facts?recovery_run_id=${w.runId}`).expect(200)).body.facts;
    expect(runFacts.find((f: { entity_id: string }) => f.entity_id === v.id)).toMatchObject({ fact_key: 'declared_arrival', fact_state: 'OBSERVED' });

    // Solver: 공공 입항 일시(일치 확인됨)를 제약으로 쓴다 — 그날 입항 정시 이후로만 출발(또는 출발 시간이 없으면 그 이유) · 검증 위험 벌점 없음
    expect(facts[0]).toMatchObject({ fact_state: 'OBSERVED' });
    const keep = table.options.find((o) => o.container_id === 'C1' && o.action === 'KEEP_CURRENT_PLAN')!;
    expect(keep.evidence_refs).toContain(facts[0]!.fact_ref);
    if (keep.truck_job) expect(keep.truck_job.earliest_hour).toBeGreaterThanOrEqual(p.h);
    else expect(keep.infeasible_reasons.map((r) => r.code)).toContain('NO_DEPARTURE_WINDOW');
    expect(table.options.some((o) => o.warning_refs.some((r) => r.reason === 'CONFLICTED'))).toBe(false);
    expect(['OPTIMAL', 'FEASIBLE']).toContain(result.status);
  });
});

describe('T-137 CONFLICT — a partner email contradicts the public declaration', () => {
  it('→ CONFLICT, NEEDS_REVIEW + approval blocked, both evidences kept, an operator to-do appears, the solver does not use the disputed value', async () => {
    const v = vessels[1]!;
    const p = seoul(v.at);
    const next = new Date(Date.parse(`${p.day}T00:00:00Z`) + 86_400_000);
    const quote = `${next.getUTCMonth() + 1}월 ${next.getUTCDate()}일 ${spoken(p.h, p.m)}에 입항합니다`; // 하루 뒤 — 명백히 다르다
    handler = answerVessel(quote, hhmm(p.h, p.m));
    const w = await reply(`${v.sign} 선박은 ${quote}.`, `${p.day}T08:00:00+09:00`);

    const [c] = await corroborations(v.id);
    expect(c).toMatchObject({ result: 'CONFLICT', reason_code: 'VALUE_DIFFERS_BEYOND_TOLERANCE', difference_minutes: 1440, claim_source: 'EMAIL' });

    const { live, facts, table, result } = await plan(v.id, p.day);
    expect(live.state).toBe('NEEDS_REVIEW'); // 자동 CONFIRMED 없음 — 공공도 업체도 이기지 않는다
    expect(live.result.conflictType).toBe('PUBLIC_EVIDENCE_CONFLICT');
    expect(live.result.usability).toBe('APPROVAL_BLOCKED');
    expect(live.data.rows.map((r) => r.sourceType)).toEqual(expect.arrayContaining(['EMAIL', 'PUBLIC_API'])); // 두 근거 보존

    // 운영자 할 일: 사람이 아직 판단하지 않은 충돌로 나온다(실행 연결 · 두 값 · 차이)
    const open = (await http.get('/truth/corroborations/open-conflicts').expect(200)).body.conflicts.find((x: { entity_id: string }) => x.entity_id === v.id);
    expect(open).toMatchObject({ entity_type: 'VESSEL_CALL', fact_key: 'declared_arrival', recovery_run_id: w.runId, difference_minutes: 1440, tolerance_minutes: 60 });
    expect(open.claim_value).not.toBe(open.public_value);

    // Solver: 충돌한 값을 제약으로 조용히 쓰지 않는다(입항 전 판정 없음) — 대신 검증 위험 정책 벌점 [ASSUMPTION]
    expect(facts[0]).toMatchObject({ fact_state: 'NEEDS_REVIEW' });
    const keep = table.options.find((o) => o.container_id === 'C1' && o.action === 'KEEP_CURRENT_PLAN')!;
    expect(keep.feasible).toBe(true);
    expect(keep.infeasible_reasons.some((r) => r.code === 'VESSEL_NOT_ARRIVED')).toBe(false);
    expect(keep.warning_refs.some((r) => r.reason === 'CONFLICTED')).toBe(true);
    expect(['OPTIMAL', 'FEASIBLE']).toContain(result.status);

    // 사람이 판단하면(공공 기록이 맞다 = 업체 주장 거절) 충돌은 할 일에서 빠진다 — 판정은 Truth 규칙, 화면이 정하지 않는다
    await http.post(`/truth/events/${c.claim_event_id}/reject`).set(ACTOR, w.humanId).send({ reason_code: 'CONFLICTING_EVIDENCE', note: 'Port-MIS 입항 신고와 다름 — 운송사에 재확인' }).expect(200);
    expect((await api.get(TruthService).liveForCoordinate(coordinate(v.id))).state).toBe('OBSERVED');
    const after = (await http.get('/truth/corroborations/open-conflicts').expect(200)).body.conflicts.map((x: { entity_id: string }) => x.entity_id);
    expect(after).not.toContain(v.id);
  });
});

describe('T-137 unclear time — no guessing', () => {
  it('"입항이 오후 3시로 지연" (no day) stays a candidate for a person: no event, no corroboration', async () => {
    const v = vessels[2]!;
    const quote = '입항이 오후 3시로 지연됐습니다';
    handler = answerVessel(quote, '15:00');
    const w = await reply(`${v.sign} 선박 ${quote}.`, `${seoul(v.at).day}T09:00:00+09:00`);
    const ex = (await app.query('SELECT review_status, created_event_id FROM cera.extraction WHERE message_id = $1 AND ask_id = $2', [w.inboundId, `v:${v.id}`])).rows[0];
    expect(ex).toMatchObject({ review_status: 'PENDING', created_event_id: null });
    const blocked = (await app.query("SELECT action FROM cera.audit_log WHERE action LIKE 'FACT_PROMOTION_BLOCKED_%' AND target_type = 'EXTRACTION' AND target_id IN (SELECT extraction_id::text FROM cera.extraction WHERE message_id = $1)", [w.inboundId])).rows.map((r) => r.action);
    expect(blocked).toContain('FACT_PROMOTION_BLOCKED_DATE_UNVERIFIED');
    const claims = (await app.query("SELECT count(*)::int AS n FROM cera.event WHERE raw_input_id = (SELECT raw_input_id FROM cera.extraction WHERE message_id = $1 LIMIT 1) AND fact_key = 'declared_arrival'", [w.inboundId])).rows[0].n;
    expect(claims).toBe(0);
  });

  it('a reply that names no vessel adds no vessel ask (no extra AI question)', async () => {
    handler = () => [];
    expect((await reply('차량은 오후 3시 이후 2대 가능합니다.', '2026-10-20T09:00:00+09:00')).extracted).toBe('NO_CANDIDATE');
    expect(calls[0]?.asks.every((a) => a.answer_shape !== 'ARRIVAL_DATETIME')).toBe(true);
  });
});
