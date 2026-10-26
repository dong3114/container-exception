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
import { RecoveryContextService } from '../../src/agent-tools/context.service.js';
import type { ExtractionRequest } from '../../src/ai/ai-client.js';
import { createApiApp } from '../../src/app/create-api.js';
import { WorkerModule } from '../../src/app/worker.module.js';
import { CHANNEL_ADAPTERS } from '../../src/channel/channel-adapter.js';
import type { ChannelAdapters } from '../../src/channel/channel.module.js';
import type { MockChannelAdapter } from '../../src/channel/mock-channel-adapter.js';
import { ExtractionProcessor } from '../../src/communication/extraction-processor.js';
import { InboundProcessor } from '../../src/communication/inbound-processor.js';
import { OutboxDispatcher } from '../../src/communication/outbox-dispatcher.js';
import type { Env } from '../../src/config/env.js';
import { TransactionRunner } from '../../src/db/transaction.js';
import { PromotionService } from '../../src/truth/promotion.service.js';
import { Instant } from '../../src/shared/time/instant.js';
import { T0, actor, hashOf, registry, type Registry } from './fixtures.js';
import { appPool, testEnv } from './support.js';

/**
 * T-093 — 사실 파이프라인: 검증된 후보 → 임시 사실(PROVISIONAL) → 사람 확인(CONFIRMED) · 거절 · 정정 → 충돌 · 보류 → 공백 · 맥락.
 * AI Server 자리에 시험용 HTTP 서버를 둔다(실제 HttpAiClient 를 지난다). 모델은 틀릴 수 있다는 것을 정상으로 본다 — 틀린 값은 후보에서 멈추고 사실이 되지 않는다.
 */
type Handler = (req: ExtractionRequest) => { status: number; body: unknown };
let handler: Handler = () => ({ status: 503, body: { code: 'NOT_READY' } });
const aiServer: Server = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const out = handler(JSON.parse(raw) as ExtractionRequest);
    res.writeHead(out.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out.body));
  });
});

const contentDir = mkdtempSync(join(tmpdir(), 'cera-truth-content-'));
const mockDir = mkdtempSync(join(tmpdir(), 'cera-truth-mock-'));
const ACTOR = 'X-CERA-Actor-Id';
const PLAN_DATE = '2026-12-01'; // 시험 시계(실제 현재)보다 뒤 — 제안 시간창이 만료되지 않는다
const AS_OF = '2026-12-01T00:00:00.000Z'; // 계획 스냅샷 기준 시각(= Asia/Seoul 09:00, 계획 날짜 2026-12-01)

let env: Env;
let api: INestApplication;
let http: ReturnType<typeof request>;
let db: pg.Pool;
let worker: INestApplicationContext;
let mock: MockChannelAdapter;
let extractor: ExtractionProcessor;
let sysId: string;
let aiAgentId: string;

beforeAll(async () => {
  await new Promise<void>((r) => aiServer.listen(0, '127.0.0.1', () => r()));
  env = testEnv({ CERA_CONTENT_DIR: contentDir, CERA_MOCK_CHANNEL_DIR: mockDir, CERA_AI_SERVER_URL: `http://127.0.0.1:${(aiServer.address() as AddressInfo).port}`, CERA_AI_TIMEOUT_MS: '2000' });
  api = await createApiApp(env);
  await api.init();
  http = request(api.getHttpServer());
  db = appPool();
  worker = await NestFactory.createApplicationContext(WorkerModule.forRoot(env), { logger: false });
  mock = (worker.get(CHANNEL_ADAPTERS) as ChannelAdapters).get('MOCK') as MockChannelAdapter;
  extractor = worker.get(ExtractionProcessor);
  sysId = await actor(db, 'SYSTEM');
  aiAgentId = await actor(db, 'AI_AGENT');
});

afterAll(async () => {
  await api.close();
  await worker.close();
  await db.end();
  await new Promise<void>((r) => aiServer.close(() => r()));
  rmSync(contentDir, { recursive: true, force: true });
  rmSync(mockDir, { recursive: true, force: true });
});

const ok = (answers: unknown[], extra: Record<string, unknown> = {}) => ({
  status: 200,
  body: {
    schema_version: 'reply-extract/1',
    outcome: 'VALUES',
    answers,
    unmapped_statements: [],
    ambiguity_flags: [],
    meta: { provider: 'local', model_version: 'qwen3-test-model', prompt_version: 'reply-extract-v1', latency_ms: 3, usage: null },
    ...extra,
  },
});
const answer = (field: string, value: string, unit: string | null, quote: string) => ({ ask_id: 'Q1', field, raw_value: value, value, unit, evidence: { quote }, confidence: 0.9 });
const qty = (n: number, quote = `차량 ${n}대 가능합니다`) => answer('quantity', String(n), 'TRUCK', quote);

interface World extends Registry {
  runId: string;
  scenarioId: string;
  truckPoolId: string;
}

let sharedRun: { runId: string; scenarioId: string } | null = null;

async function newRun(): Promise<{ runId: string; scenarioId: string }> {
  const scenarioId = v7();
  const snapshotId = v7();
  const runId = v7();
  await db.query("INSERT INTO cera.scenario (scenario_id, scenario_name, as_of_base, created_at) VALUES ($1, 'truth scenario', $2, $2)", [scenarioId, T0]);
  await db.query(
    `INSERT INTO cera.planning_snapshot (snapshot_id, as_of, fact_fingerprint, rule_version, tariff_version, policy_version, contains_simulated, created_at, scenario_id)
     VALUES ($1, $2, $3, 'r1', 't1', 'p1', true, $2, $4)`,
    [snapshotId, AS_OF, hashOf(`snap-${snapshotId}`), scenarioId],
  );
  await db.query(
    `INSERT INTO cera.recovery_run (run_id, snapshot_id, trigger_type, trigger_ref, objective_version, run_status, contains_simulated, executed_at)
     VALUES ($1, $2, 'EXCEPTION_DETECTED', 'RP-TRUTH', 'o1', 'FEASIBLE', true, $3)`,
    [runId, snapshotId, AS_OF],
  );
  return { runId, scenarioId };
}

/** 새 차량 풀 + 새 거래처(좌표가 시험마다 다르다). 계획 실행은 파일 안에서 공유한다(다른 시험 파일의 "최근 실행 목록"을 밀어내지 않게). 풀의 소유 거래처 = 문의 상대. */
async function world(options: { ownRun?: boolean } = {}): Promise<World> {
  const r = await registry(db);
  const run = options.ownRun ? await newRun() : (sharedRun ??= await newRun());
  const truckPoolId = v7();
  await db.query("INSERT INTO cera.truck_pool (truck_pool_id, pool_name, ownership, owner_counterparty_id) VALUES ($1, '사실 셔틀', 'PARTNER', $2)", [truckPoolId, r.counterpartyId]);
  return { ...r, ...run, truckPoolId };
}

/** 문의 → 승인 → 발송. 보낸 초안 id. 질문 시간창 기본 15:00–17:00. */
async function sentInquiry(w: World, window: [string, string] = ['15:00', '17:00']): Promise<string> {
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
          { key: 'date', value_text: PLAN_DATE },
          { key: 'window_from', value_text: window[0] },
          { key: 'window_to', value_text: window[1] },
        ],
      })
      .expect(201)
  ).body;
  await http.post(`/communication/drafts/${d.message.message_id}/approve`).set(ACTOR, w.humanId).send({ content_hash: d.message.content_hash }).expect(200);
  await http.post(`/communication/drafts/${d.message.message_id}/send`).set(ACTOR, w.humanId).send({ content_hash: d.message.content_hash }).expect(200);
  await worker.get(OutboxDispatcher).processMessage(d.message.message_id);
  return d.message.message_id as string;
}

/** 회신을 주입하고 수신 처리. 근거 시각을 정하려면 `at`(발신 · 수신 시각 ISO) 을 준다. 정상 회신의 INBOUND 메시지 id. */
async function reply(draftId: string, body: string, at?: string): Promise<string> {
  const r = await mock.simulateReply({
    replyToCeraMessageId: draftId,
    body,
    ...(at ? { dateHeader: new Date(at).toUTCString(), channelReceivedAt: new Date(at).toISOString() } : {}),
  });
  await worker.get(InboundProcessor).runCycle();
  const inbound = (await db.query("SELECT message_id FROM cera.comm_message WHERE direction = 'INBOUND' AND external_message_id = $1", [r.external_message_id])).rows[0];
  if (!inbound) throw new Error('reply was not attached to its thread');
  return inbound.message_id as string;
}

async function extractWith(inboundId: string, answers: unknown[], extra: Record<string, unknown> = {}) {
  handler = () => ok(answers, extra);
  return extractor.extractOne(inboundId);
}

const factsOf = async (w: World) => ((await http.get(`/truth/facts?recovery_run_id=${w.runId}`).expect(200)).body.facts as FactView[]).filter((f) => f.entity_id === w.truckPoolId);
interface FactView {
  entity_id: string;
  fact_key: string;
  fact_state: string;
  conflict_status: string;
  hold_status: string;
  decision_usability: string;
  applied_rule: string | null;
  held_event_id: string | null;
  current: { event_id: string; value: number; unit: string; verified_by_human: boolean; verification_basis: string | null } | null;
  candidates: { event_id: string; role: string; value: number; verification: string; verified_by_human: boolean; evidence_strength: number; evidence_quote: string | null; generated_by: string; model_version: string | null; supersedes_event_id: string | null; extraction_id: string | null }[];
}
const eventsOf = async (poolId: string) =>
  (await db.query("SELECT e.* FROM cera.event e JOIN cera.event_entity_link l ON l.event_id = e.event_id AND l.link_role = 'SUBJECT' WHERE l.entity_id = $1 ORDER BY e.received_at, e.event_id", [poolId])).rows;
const blockedOf = async (inboundId: string) =>
  (await db.query("SELECT action FROM cera.audit_log WHERE action LIKE 'FACT_PROMOTION_BLOCKED_%' AND target_id IN (SELECT extraction_id::text FROM cera.extraction WHERE message_id = $1) ORDER BY action", [inboundId])).rows.map((r) => r.action as string);
const canonical = async (poolId: string) => (await db.query('SELECT * FROM cera.canonical_fact WHERE entity_id = $1', [poolId])).rows;

describe('A · J · G. a validated candidate becomes a provisional fact — with its evidence trail, once', () => {
  it('PROVISIONAL, not confirmed: the event keeps the extraction link, model provenance and quote hash; no raw text is copied', async () => {
    const w = await world();
    const draft = await sentInquiry(w);
    const text = `12월 1일 오후 3시 이후 차량 4대 가능합니다.\n단가 문의는 별도입니다.`;
    const inbound = await reply(draft, text);
    expect(await extractWith(inbound, [qty(4), answer('available_from', '15:00', null, '오후 3시 이후')])).toBe('EXTRACTED');

    const events = await eventsOf(w.truckPoolId);
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e).toMatchObject({ event_class: 'OBSERVATION', event_type: 'TRUCK_AVAILABILITY_REPORTED', fact_kind: 'OFFER', value_number: '4.0000', value_unit: 'TRUCK', source_type: 'EMAIL', extraction_method: 'LLM_EXTRACTED', input_quality: 'UNSTRUCTURED', input_confidence_level: 'MEDIUM', is_simulated: true });
    expect(e.fact_key).toBe(`available.slot(${PLAN_DATE}T15:00-17:00)`);
    // 시간: 질문이 정한 시간창(Asia/Seoul 15–17시 = 06–08시 UTC)이 적용 범위로 남는다
    expect(new Date(e.valid_from).toISOString()).toBe('2026-12-01T06:00:00.000Z');
    expect(new Date(e.valid_until).toISOString()).toBe('2026-12-01T08:00:00.000Z');
    const ex = (await db.query("SELECT * FROM cera.extraction WHERE message_id = $1 AND candidate_value_text = '4'", [inbound])).rows[0];
    expect(e.extraction_id).toBe(ex.extraction_id);
    expect(e.raw_input_id).toBe(ex.raw_input_id);
    expect(e.payload.extraction).toMatchObject({ extraction_id: ex.extraction_id, model_version: 'qwen3-test-model', prompt_version: 'reply-extract-v1', schema_version: 'reply-extract/1', source_quote_ref: ex.source_quote_ref, source_quote_hash: ex.source_quote_hash, input_hash: ex.input_hash });
    expect(e.payload.authority).toBe('A'); // 풀의 소유 거래처가 말했다
    // O: 원문 · 인용 본문은 사건에 복제되지 않는다
    const blob = JSON.stringify(e);
    expect(blob).not.toContain('차량 4대 가능합니다');
    expect(blob).not.toContain('단가 문의');
    expect(blob).not.toContain('오후 3시');
    // 후보는 사건에 이어졌다(ACCEPTED) — 시간창 칸 후보도 같은 사건에
    const rows = (await db.query('SELECT candidate_value_text, review_status, created_event_id, reviewed_by_actor_id FROM cera.extraction WHERE message_id = $1', [inbound])).rows;
    expect(rows.every((x) => x.review_status === 'ACCEPTED' && x.created_event_id === e.event_id)).toBe(true);
    expect((await db.query('SELECT actor_type FROM cera.actor WHERE actor_id = $1', [rows[0].reviewed_by_actor_id])).rows[0].actor_type).toBe('SYSTEM');
    // 파생 표: 임시 사실 — 확인 근거 없음
    const c = (await canonical(w.truckPoolId))[0];
    expect(c).toMatchObject({ value_status: 'PROVISIONAL', verification_basis: null, conflict_status: 'NONE', hold_status: 'NONE', decision_usability: 'USABLE_WITH_WARNING', evidence_strength: '1', winning_event_id: e.event_id, fact_name: 'available.slot' });
    // 화면 · Agent 가 보는 모양
    const [f] = await factsOf(w);
    expect(f).toMatchObject({ fact_state: 'PROVISIONAL', decision_usability: 'USABLE_WITH_WARNING', current: { value: 4, unit: 'TRUCK', verified_by_human: false, verification_basis: null } });
    expect(f?.candidates[0]).toMatchObject({ role: 'WINNER', evidence_quote: '차량 4대 가능합니다', generated_by: 'LLM', model_version: 'qwen3-test-model', verified_by_human: false });
    expect((await db.query("SELECT 1 FROM cera.audit_log WHERE action = 'FACT_PROVISIONAL_CREATED' AND target_id = $1", [e.event_id])).rowCount).toBe(1);
  });

  it('G. the same reply again — sequentially, concurrently, or through the promotion step itself — leaves one event', async () => {
    const w = await world();
    const inbound = await reply(await sentInquiry(w), '차량 4대 가능합니다.');
    handler = () => ok([qty(4)]);
    const results = await Promise.all([extractor.extractOne(inbound), extractor.extractOne(inbound)]);
    expect(results.sort()).toEqual(['DUPLICATE', 'EXTRACTED']);
    expect(await extractor.extractOne(inbound)).toBe('DUPLICATE');
    // 승격 단계만 다시 불러도(재시도) 이미 사건이 된 후보는 건드리지 않는다
    await worker.get(TransactionRunner).run((tx) => worker.get(PromotionService).promoteMessage(tx, inbound, sysId, ''));
    expect(await eventsOf(w.truckPoolId)).toHaveLength(1);
    expect(await canonical(w.truckPoolId)).toHaveLength(1);
  });
});

describe('B. a candidate that does not qualify never becomes a fact', () => {
  it('validation failures and wrong-sender / ambiguous / narrower-window replies stay candidates with a recorded reason', async () => {
    // 모델이 틀렸다(인용에 없는 값) → 검증 탈락 → 후보 REJECTED, 사건 없음
    const a = await world();
    const ia = await reply(await sentInquiry(a), '확인 후 다시 연락드리겠습니다.');
    await extractWith(ia, [qty(4, '차량 4대 가능합니다')]);
    expect(await eventsOf(a.truckPoolId)).toHaveLength(0);
    expect((await db.query('SELECT review_status FROM cera.extraction WHERE message_id = $1', [ia])).rows[0].review_status).toBe('REJECTED');

    // 남의 자원에 대한 말(문의를 보낸 뒤 풀의 소유 거래처가 바뀌었다 — 보낸 상대가 더는 소유자가 아님) → 권한 없음 → PENDING 으로 남고 사유가 감사에 남는다
    const b = await world();
    const draftB = await sentInquiry(b);
    const other = v7();
    await db.query("INSERT INTO cera.counterparty (counterparty_id, display_name, source_role) VALUES ($1, 'Other Trucking', 'TRUCKING')", [other]);
    await db.query('UPDATE cera.truck_pool SET owner_counterparty_id = $1 WHERE truck_pool_id = $2', [other, b.truckPoolId]);
    const ib = await reply(draftB, '차량 4대 가능합니다.');
    await extractWith(ib, [qty(4)]);
    expect(await eventsOf(b.truckPoolId)).toHaveLength(0);
    expect(await canonical(b.truckPoolId)).toHaveLength(0);
    const pending = (await db.query("SELECT extraction_id, review_status, created_event_id FROM cera.extraction WHERE message_id = $1", [ib])).rows[0];
    expect(pending).toMatchObject({ review_status: 'PENDING', created_event_id: null });
    expect((await db.query("SELECT action FROM cera.audit_log WHERE target_type = 'EXTRACTION' AND target_id = $1", [pending.extraction_id])).rows.map((r) => r.action)).toEqual(['FACT_PROMOTION_BLOCKED_SENDER_NOT_AUTHORITY']);
    const view = (await http.get(`/communication/drafts/${draftB}`).expect(200)).body.replies[0].extraction.candidates[0];
    expect(view).toMatchObject({ validation: 'PASSED', review_status: 'PENDING', fact_event_id: null, promotion_blocked_reasons: ['SENDER_NOT_AUTHORITY'] });

    // 모호한 표현 → 사람이 읽어야 한다
    const c = await world();
    const ic = await reply(await sentInquiry(c), '아마 차량 4대 가능할 것 같습니다.');
    await extractWith(ic, [qty(4, '차량 4대 가능할 것 같습니다')], { ambiguity_flags: ['HEDGED'] });
    expect(await eventsOf(c.truckPoolId)).toHaveLength(0);
    expect((await db.query("SELECT action FROM cera.audit_log WHERE action LIKE 'FACT_PROMOTION_BLOCKED_%' AND target_id IN (SELECT extraction_id::text FROM cera.extraction WHERE message_id = $1)", [ic])).rows[0].action).toBe('FACT_PROMOTION_BLOCKED_AMBIGUOUS_REPLY');

    // 질문 시간창 밖(질문 15–17시 · 회신 "17시 이후") → 겹치는 시간이 없다 → 자동 승격 안 함
    const d = await world();
    const id = await reply(await sentInquiry(d), '오후 5시 이후 차량 4대 가능합니다.');
    await extractWith(id, [qty(4), answer('available_from', '17:00', null, '오후 5시 이후')]);
    expect(await eventsOf(d.truckPoolId)).toHaveLength(0);
    expect(await blockedOf(id)).toEqual(['FACT_PROMOTION_BLOCKED_WINDOW_OUT_OF_SCOPE']);

    // C: 표현할 수 없는 날짜 — 계약에 답의 날짜 칸이 없다. "모레" 는 질문 날짜가 아니다 → 질문 날짜로 임의 해석하지 않는다
    const e = await world();
    const ie = await reply(await sentInquiry(e), '모레 차량 4대 가능합니다.');
    await extractWith(ie, [qty(4)]);
    expect(await eventsOf(e.truckPoolId)).toHaveLength(0);
    expect(await blockedOf(ie)).toEqual(['FACT_PROMOTION_BLOCKED_DATE_OUT_OF_SCOPE']);
    const f = await world();
    const iff = await reply(await sentInquiry(f), '다음 주 화요일에 차량 4대 가능합니다.');
    await extractWith(iff, [qty(4)]);
    expect(await blockedOf(iff)).toEqual(['FACT_PROMOTION_BLOCKED_DATE_UNVERIFIED']);
  });

  it('A. a narrower reply window inside the asked window is a normal, more specific answer: the fact holds for the narrower window', async () => {
    const w = await world();
    const inbound = await reply(await sentInquiry(w, ['09:00', '18:00']), '오후 3시 이후 차량 4대 가능합니다.');
    await extractWith(inbound, [qty(4), answer('available_from', '15:00', null, '오후 3시 이후')]);
    const [e] = await eventsOf(w.truckPoolId);
    expect(e?.fact_key).toBe(`available.slot(${PLAN_DATE}T09:00-18:00)`); // 질문 좌표 그대로
    expect(new Date(e?.valid_from).toISOString()).toBe('2026-12-01T06:00:00.000Z'); // 15:00 KST
    expect(new Date(e?.valid_until).toISOString()).toBe('2026-12-01T09:00:00.000Z'); // 18:00 KST
    expect((await factsOf(w))[0]).toMatchObject({ fact_state: 'PROVISIONAL', current: { value: 4, valid_from: '2026-12-01T15:00:00.000+09:00', valid_until: '2026-12-01T18:00:00.000+09:00' } });
  });

  it('G. a very confident model gets no extra authority: confidence 0.99 is still a PROVISIONAL, strength-1 value', async () => {
    const w = await world();
    const inbound = await reply(await sentInquiry(w), '12월 1일 차량 4대 가능합니다.');
    await extractWith(inbound, [{ ...qty(4), confidence: 0.99 }]);
    const [f] = await factsOf(w);
    expect(f).toMatchObject({ fact_state: 'PROVISIONAL', current: { verified_by_human: false, evidence_strength: 1 } });
    expect((await canonical(w.truckPoolId))[0]).toMatchObject({ value_status: 'PROVISIONAL', evidence_strength: '1' });
    // 4. 확신도 0.55 도 같은 출처 · 같은 권한이면 같은 강도
    const w2 = await world();
    await extractWith(await reply(await sentInquiry(w2), '12월 1일 차량 4대 가능합니다.'), [{ ...qty(4), confidence: 0.55 }]);
    expect((await factsOf(w2))[0]).toMatchObject({ fact_state: 'PROVISIONAL', current: { evidence_strength: 1 } });
  });

  it('3. a SYSTEM actor value from a source with no authority for this field cannot overwrite a human-confirmed fact', async () => {
    const w = await world();
    await extractWith(await reply(await sentInquiry(w), '12월 1일 차량 4대 가능합니다.'), [qty(4)]);
    const first = (await factsOf(w))[0]?.current?.event_id as string;
    await http.post(`/truth/events/${first}/confirm`).set(ACTOR, w.humanId).send({}).expect(200);
    // 시스템이 넣은 더 새로운 파트너 시스템 값(이 계열의 권한 판정 없음) — 서비스 경로가 없어 SQL 로 직접
    const raw = (await db.query('SELECT raw_input_id FROM cera.event WHERE event_id = $1', [first])).rows[0].raw_input_id;
    const e = v7();
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO cera.event (event_id, schema_version, raw_input_id, event_class, event_type, fact_kind, fact_key, value_number, value_unit, valid_from, valid_until, received_at, source_type, extraction_method, input_quality, input_confidence_level,
           entered_by_actor_id, idempotency_key, payload, recorded_at, is_simulated, scenario_id)
         VALUES ($1, 'ev-1', $2, 'OBSERVATION', 'TRUCK_AVAILABILITY_REPORTED', 'OFFER', $3, 9, 'TRUCK', '2026-12-01T06:00:00Z', '2026-12-01T08:00:00Z', now(), 'PARTNER_SYSTEM', 'DIRECT', 'STRUCTURED', 'HIGH', $4, $5, '{}'::jsonb, now(), true, $6)`,
        [e, raw, `available.slot(${PLAN_DATE}T15:00-17:00)`, sysId, hashOf(`sys-${e}`), w.scenarioId],
      );
      await client.query("INSERT INTO cera.event_entity_link (event_id, entity_type, entity_id, link_role) VALUES ($1, 'TRUCK_POOL', $2, 'SUBJECT')", [e, w.truckPoolId]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const [f] = await factsOf(w);
    expect(f).toMatchObject({ fact_state: 'CONFIRMED', conflict_status: 'NONE', current: { value: 4, verified_by_human: true } });
    expect(f?.candidates.find((c) => c.event_id === e)).toMatchObject({ role: 'INELIGIBLE', evidence_strength: 0 });
  });

  it('I. a reply to a question of a superseded plan is not promoted automatically', async () => {
    const w = await world({ ownRun: true });
    const draft = await sentInquiry(w);
    const inbound = await reply(draft, '차량 4대 가능합니다.');
    // 계획이 교체되었다(같은 실행을 이은 새 실행)
    const snapshotId = v7();
    await db.query(
      `INSERT INTO cera.planning_snapshot (snapshot_id, as_of, fact_fingerprint, rule_version, tariff_version, policy_version, contains_simulated, created_at, scenario_id)
       VALUES ($1, $2, $3, 'r1', 't1', 'p1', true, $2, $4)`,
      [snapshotId, AS_OF, hashOf(`snap2-${snapshotId}`), w.scenarioId],
    );
    await db.query(
      `INSERT INTO cera.recovery_run (run_id, snapshot_id, trigger_type, trigger_ref, objective_version, run_status, contains_simulated, executed_at, previous_run_id)
       VALUES ($1, $2, 'EXCEPTION_DETECTED', 'RP-TRUTH-2', 'o1', 'FEASIBLE', true, $3, $4)`,
      [v7(), snapshotId, AS_OF, w.runId],
    );
    await extractWith(inbound, [qty(4)]);
    expect(await eventsOf(w.truckPoolId)).toHaveLength(0);
    expect((await db.query("SELECT action FROM cera.audit_log WHERE action LIKE 'FACT_PROMOTION_BLOCKED_%' AND target_id IN (SELECT extraction_id::text FROM cera.extraction WHERE message_id = $1)", [inbound])).rows[0].action).toBe('FACT_PROMOTION_BLOCKED_PLAN_SUPERSEDED');
  });
});

describe('C. only a human can confirm — the service and the database both refuse everyone else', () => {
  it('AI agent / system / unknown / missing actor are refused over HTTP; the database refuses a non-human VERIFICATION and an unbacked CONFIRMED fact', async () => {
    const w = await world();
    const inbound = await reply(await sentInquiry(w), '차량 4대 가능합니다.');
    await extractWith(inbound, [qty(4)]);
    const [f] = await factsOf(w);
    const eventId = f?.current?.event_id as string;
    for (const who of [aiAgentId, sysId, v7()]) await http.post(`/truth/events/${eventId}/confirm`).set(ACTOR, who).send({}).expect(403);
    await http.post(`/truth/events/${eventId}/confirm`).send({}).expect(400);
    expect((await factsOf(w))[0]?.fact_state).toBe('PROVISIONAL');

    // DB 가드(M20): 서비스를 우회해 SQL 로 해도 사람이 아닌 행위자의 확인 사건 · 근거 없는 CONFIRMED 는 들어가지 않는다
    const raw = (await db.query('SELECT raw_input_id FROM cera.event WHERE event_id = $1', [eventId])).rows[0].raw_input_id;
    const insertVerification = (actorId: string) =>
      db.query(
        `INSERT INTO cera.event (event_id, schema_version, raw_input_id, event_class, event_type, received_at, source_type, extraction_method, input_quality, input_confidence_level,
           entered_by_actor_id, verification_action, verification_method, idempotency_key, recorded_at, is_simulated, scenario_id)
         VALUES ($1, 'ev-1', $2, 'VERIFICATION', 'VERIFICATION_RECORDED', now(), 'HUMAN_UI', 'DIRECT', 'STRUCTURED', 'HIGH', $3, 'CONFIRM', 'DIRECT_REVIEW', $4, now(), true, $5)`,
        [v7(), raw, actorId, hashOf(`vk-${v7()}`), w.scenarioId],
      );
    await expect(insertVerification(aiAgentId)).rejects.toMatchObject({ code: 'CE005' });
    await expect(insertVerification(sysId)).rejects.toMatchObject({ code: 'CE005' });
    await expect(
      db.query(
        `UPDATE cera.canonical_fact SET value_status = 'CONFIRMED', verification_basis = 'HUMAN_VERIFICATION' WHERE entity_id = $1`,
        [w.truckPoolId],
      ),
    ).rejects.toMatchObject({ code: 'CE005' });
    await expect(
      db.query(`UPDATE cera.canonical_fact SET value_status = 'CONFIRMED', verification_basis = 'POLICY_EVIDENCE' WHERE entity_id = $1`, [w.truckPoolId]),
    ).rejects.toMatchObject({ code: 'CE005' });
    // 사람이 아닌 행위자의 HUMAN_UI 사건도 거부
    await expect(
      db.query(
        `INSERT INTO cera.event (event_id, schema_version, raw_input_id, event_class, event_type, fact_kind, fact_key, value_number, value_unit, received_at, source_type, extraction_method, input_quality, input_confidence_level,
           entered_by_actor_id, idempotency_key, recorded_at, is_simulated, scenario_id)
         VALUES ($1, 'ev-1', $2, 'OBSERVATION', 'TRUCK_AVAILABILITY_REPORTED', 'OFFER', 'available.slot(x)', 9, 'TRUCK', now(), 'HUMAN_UI', 'DIRECT', 'STRUCTURED', 'HIGH', $3, $4, now(), true, $5)`,
        [v7(), raw, sysId, hashOf(`hk-${v7()}`), w.scenarioId],
      ),
    ).rejects.toMatchObject({ code: 'CE005' });
  });
});

describe('D · E · F. a human confirms, rejects or corrects — always as a new event', () => {
  it('D. confirm → CONFIRMED (human verification), idempotent, the gap closes', async () => {
    const w = await world();
    const inbound = await reply(await sentInquiry(w), '차량 4대 가능합니다.');
    await extractWith(inbound, [qty(4)]);
    const eventId = (await factsOf(w))[0]?.current?.event_id as string;
    const confirmed = (await http.post(`/truth/events/${eventId}/confirm`).set(ACTOR, w.humanId).send({ note: '전화로도 확인' }).expect(200)).body as FactView;
    expect(confirmed).toMatchObject({ fact_state: 'CONFIRMED', current: { value: 4, verified_by_human: true, verification_basis: 'HUMAN_VERIFICATION' } });
    const ev = await eventsOf(w.truckPoolId);
    expect(ev.map((e) => e.event_class)).toEqual(['OBSERVATION', 'VERIFICATION']);
    expect(ev[1]).toMatchObject({ verification_action: 'CONFIRM', verification_method: 'DIRECT_REVIEW', source_type: 'HUMAN_UI', entered_by_actor_id: w.humanId, fact_key: null });
    expect((await db.query('SELECT target_event_id, target_role FROM cera.event_verification_target WHERE verification_event_id = $1', [ev[1].event_id])).rows).toEqual([{ target_event_id: eventId, target_role: 'TARGET' }]);
    // 승격 사건 자체는 그대로(append-only) — 상태만 새 사건이 바꾼다
    expect(ev[0].source_type).toBe('EMAIL');
    expect((await canonical(w.truckPoolId))[0]).toMatchObject({ value_status: 'CONFIRMED', verification_basis: 'HUMAN_VERIFICATION', decision_usability: 'USABLE', evidence_strength: '2' });
    // 같은 확인을 또 눌러도 사건은 하나
    await http.post(`/truth/events/${eventId}/confirm`).set(ACTOR, w.humanId).send({}).expect(200);
    expect(await eventsOf(w.truckPoolId)).toHaveLength(2);
    expect((await db.query("SELECT count(*)::int AS n FROM cera.audit_log WHERE action = 'FACT_CONFIRMED' AND actor_id = $1 AND target_id = $2", [w.humanId, ev[1].event_id])).rows[0].n).toBe(1);
    // K · L: 임시 사실일 때는 공백이 PROVISIONAL_AVAILABLE, 확인 뒤에는 닫힌다(known)
    const gaps = await worker.get(RecoveryContextService, { strict: false }).informationGaps(w.runId);
    expect(gaps.gaps.find((g) => g.subject_id === w.truckPoolId)).toBeUndefined();
    expect(gaps.known.find((k) => k.subject_id === w.truckPoolId)).toMatchObject({ fact: { fact_state: 'CONFIRMED', verified_by_human: true, value_number: '4.0000' } });
  });

  it('E. reject → the value leaves the judgement; the event and its quote stay on record; the gap opens again', async () => {
    const w = await world();
    const inbound = await reply(await sentInquiry(w), '차량 4대 가능합니다.');
    await extractWith(inbound, [qty(4)]);
    const eventId = (await factsOf(w))[0]?.current?.event_id as string;
    const rejected = (await http.post(`/truth/events/${eventId}/reject`).set(ACTOR, w.humanId).send({ reason_code: 'CONDITIONAL_ANSWER' }).expect(200)).body as FactView;
    expect(rejected).toMatchObject({ fact_state: 'UNKNOWN', current: null });
    expect(rejected.candidates[0]).toMatchObject({ event_id: eventId, role: 'REJECTED', verification: 'REJECTED' });
    expect((await eventsOf(w.truckPoolId))[1]).toMatchObject({ verification_action: 'REJECT' });
    expect((await eventsOf(w.truckPoolId))[1].payload).toMatchObject({ reason_code: 'CONDITIONAL_ANSWER' });
    expect(await canonical(w.truckPoolId)).toHaveLength(0); // 자격 있는 값이 없다 = 행이 없다
    await http.post(`/truth/events/${eventId}/reject`).set(ACTOR, w.humanId).send({ reason_code: 'CONDITIONAL_ANSWER' }).expect(200);
    expect(await eventsOf(w.truckPoolId)).toHaveLength(2);
    await http.post(`/truth/events/${eventId}/confirm`).set(ACTOR, w.humanId).send({}).expect(409); // 거절한 것을 조용히 되살리지 않는다
    await http.post(`/truth/events/${eventId}/reject`).set(ACTOR, w.humanId).send({ reason_code: 'NOT_A_REASON' }).expect(400);
    const gaps = await worker.get(RecoveryContextService, { strict: false }).informationGaps(w.runId);
    expect(gaps.gaps.find((g) => g.subject_id === w.truckPoolId)).toMatchObject({ state: 'ASKED', fact: null });
  });

  it('F. correct → the AI value is superseded (kept), the operator’s value is a new CONFIRMED event with the chain intact', async () => {
    const w = await world();
    const inbound = await reply(await sentInquiry(w), '차량 4대 가능합니다.');
    await extractWith(inbound, [qty(4)]);
    const original = (await factsOf(w))[0]?.current?.event_id as string;
    await http.post(`/truth/events/${original}/correct`).set(ACTOR, w.humanId).send({ value: 4, reason_code: 'MODEL_MISREAD' }).expect(422); // 같은 값은 정정이 아니라 확인
    const corrected = (await http.post(`/truth/events/${original}/correct`).set(ACTOR, w.humanId).send({ value: 3, reason_code: 'MODEL_MISREAD', note: '회신은 3대' }).expect(200)).body as FactView;
    expect(corrected).toMatchObject({ fact_state: 'CONFIRMED', current: { value: 3, verified_by_human: true, verification_basis: 'HUMAN_VERIFICATION' } });
    const roles = Object.fromEntries(corrected.candidates.map((c) => [c.value, c.role]));
    expect(roles).toEqual({ 4: 'SUPERSEDED', 3: 'WINNER' });
    const ev = await eventsOf(w.truckPoolId);
    expect(ev).toHaveLength(2);
    const correction = ev.find((e) => e.event_class === 'CORRECTION');
    expect(correction).toMatchObject({ supersedes_event_id: original, source_type: 'HUMAN_UI', extraction_method: 'DIRECT', value_number: '3.0000', entered_by_actor_id: w.humanId, fact_kind: 'OFFER', supersede_reason: 'MODEL_MISREAD' });
    expect(correction.payload).toMatchObject({ correction_reason: 'MODEL_MISREAD', corrected_event_id: original });
    expect(new Date(correction.valid_from).toISOString()).toBe('2026-12-01T06:00:00.000Z'); // 적용 시간은 대상의 것을 이어받는다
    // 원래 사건은 그대로 — 모델이 낸 값과 사람이 읽은 값의 연결이 남는다(추출 → 사건 → 정정)
    const originalRow = ev.find((e) => e.event_id === original);
    expect(originalRow).toMatchObject({ value_number: '4.0000', extraction_method: 'LLM_EXTRACTED' });
    expect(originalRow.extraction_id).toBeTruthy();
    expect((await canonical(w.truckPoolId))[0]).toMatchObject({ value_status: 'CONFIRMED', winning_event_id: correction.event_id });
    // 이미 대체된 것을 다시 고치거나 확인할 수 없다
    await http.post(`/truth/events/${original}/correct`).set(ACTOR, w.humanId).send({ value: 2, reason_code: 'MODEL_MISREAD' }).expect(409);
    await http.post(`/truth/events/${original}/confirm`).set(ACTOR, w.humanId).send({}).expect(409);
  });
});

describe('H. conflicting replies are never silently overwritten', () => {
  const at = (hhmm: string) => `2026-10-20T${hhmm}:00.000Z`;

  it('a big adverse change by a weaker source is held — the current value stays; a rise simply replaces it (both on record)', async () => {
    const w = await world();
    const draft = await sentInquiry(w);
    await extractWith(await reply(draft, '차량 4대 가능합니다.', at('01:00')), [qty(4)]);
    // 10:30 "2대만" — 50% 감소: 약한 근거(이메일)의 불리한 큰 변경 → 보류
    await extractWith(await reply(draft, '차량 2대만 가능합니다.', at('01:30')), [qty(2, '차량 2대만 가능합니다')]);
    let [f] = await factsOf(w);
    expect(f).toMatchObject({ fact_state: 'NEEDS_REVIEW', hold_status: 'HELD', decision_usability: 'APPROVAL_BLOCKED', applied_rule: 'R10', current: { value: 4 } });
    expect(f?.candidates.map((c) => [c.value, c.role]).sort()).toEqual([[2, 'HELD_CANDIDATE'], [4, 'WINNER']].sort());
    expect(f?.held_event_id).toBe(f?.candidates.find((c) => c.value === 2)?.event_id);
    expect(await eventsOf(w.truckPoolId)).toHaveLength(2); // 덮어쓰기 없음
    expect((await canonical(w.truckPoolId))[0]).toMatchObject({ hold_status: 'HELD', decision_usability: 'APPROVAL_BLOCKED' });
    // 보류가 풀리는 길은 사람이다: 거절하면 현직이 그대로, 확인하면 새 값이 된다
    const held = f?.held_event_id as string;
    await http.post(`/truth/events/${held}/confirm`).set(ACTOR, w.humanId).send({}).expect(200);
    [f] = await factsOf(w);
    expect(f).toMatchObject({ fact_state: 'CONFIRMED', hold_status: 'NONE', current: { value: 2, verified_by_human: true } });
    expect(f?.candidates.find((c) => c.value === 4)?.role).toBe('OUTDATED');

    // 올라가는 변경은 보류 대상이 아니다 — 최근 우선, 이전 값은 이력으로 남는다
    const w2 = await world();
    const d2 = await sentInquiry(w2);
    await extractWith(await reply(d2, '차량 2대 가능합니다.', at('01:00')), [qty(2)]);
    await extractWith(await reply(d2, '차량 5대로 늘었습니다.', at('02:00')), [qty(5, '차량 5대로')]);
    const [g] = await factsOf(w2);
    expect(g).toMatchObject({ fact_state: 'PROVISIONAL', hold_status: 'NONE', applied_rule: 'R4-a', current: { value: 5 } });
    expect(g?.candidates.find((c) => c.value === 2)?.role).toBe('OUTDATED');
  });

  it('a newer email that disagrees with a human-confirmed value opens a conflict — the confirmed value stays until a person decides', async () => {
    const w = await world();
    const draft = await sentInquiry(w);
    await extractWith(await reply(draft, '차량 4대 가능합니다.', at('01:00')), [qty(4)]);
    const first = (await factsOf(w))[0]?.current?.event_id as string;
    await http.post(`/truth/events/${first}/confirm`).set(ACTOR, w.humanId).send({}).expect(200);
    await extractWith(await reply(draft, '차량 5대 가능합니다.', at('03:00')), [qty(5)]);
    const [f] = await factsOf(w);
    expect(f).toMatchObject({ fact_state: 'NEEDS_REVIEW', conflict_status: 'OPEN', decision_usability: 'APPROVAL_BLOCKED', applied_rule: 'R4-b', current: { value: 4, verified_by_human: true } });
    expect(f?.candidates.find((c) => c.value === 5)?.role).toBe('CONTESTING');
    const conflict = (await db.query('SELECT event_ids, blocks_automation, detected_rule FROM cera.conflict WHERE entity_id = $1', [w.truckPoolId])).rows;
    expect(conflict).toHaveLength(1);
    expect(conflict[0]).toMatchObject({ blocks_automation: true, detected_rule: 'R4-b' });
    expect(conflict[0].event_ids).toHaveLength(2);
    expect((await canonical(w.truckPoolId))[0]).toMatchObject({ conflict_status: 'OPEN', value_status: 'CONFIRMED' });
    // 사람이 새 값을 확인하면 충돌이 풀린다
    await http.post(`/truth/events/${f?.candidates.find((c) => c.value === 5)?.event_id}/confirm`).set(ACTOR, w.humanId).send({}).expect(200);
    const [after] = await factsOf(w);
    expect(after).toMatchObject({ fact_state: 'CONFIRMED', conflict_status: 'NONE', current: { value: 5 } });
    expect(await db.query('SELECT 1 FROM cera.conflict WHERE entity_id = $1', [w.truckPoolId]).then((r) => r.rowCount)).toBe(0);
  });

  it('two equally strong, different answers at the same moment are a conflict — not an overwrite, not a coin toss', async () => {
    const w = await world();
    const draft = await sentInquiry(w);
    await extractWith(await reply(draft, '차량 4대 가능합니다.', at('01:00')), [qty(4)]);
    await extractWith(await reply(draft, '차량 3대 가능합니다.', at('01:02')), [qty(3)]);
    const [f] = await factsOf(w);
    expect(f).toMatchObject({ fact_state: 'NEEDS_REVIEW', conflict_status: 'OPEN', applied_rule: 'R6', current: { value: 4 } }); // 먼저 받은 값이 현직
    expect(f?.candidates.find((c) => c.value === 3)?.role).toBe('CONTESTING');
  });
});

describe('K · L. the recovery context and the information gaps follow the fact state', () => {
  it('candidate only → ASKED · provisional → PROVISIONAL_AVAILABLE (gap stays) · confirmed → known', async () => {
    const w = await world();
    const context = worker.get(RecoveryContextService, { strict: false });
    const draft = await sentInquiry(w);
    const mine = async () => (await context.informationGaps(w.runId)).gaps.find((g) => g.subject_id === w.truckPoolId);
    expect(await mine()).toMatchObject({ state: 'ASKED', fact: null });

    await extractWith(await reply(draft, '차량 4대 가능합니다.'), [qty(4)]);
    expect(await mine()).toMatchObject({ state: 'PROVISIONAL_AVAILABLE', fact: { fact_state: 'PROVISIONAL', value_number: '4.0000', verified_by_human: false, decision_usability: 'USABLE_WITH_WARNING' } });
    const facts = await context.facts([w.truckPoolId], { isSimulated: true, scenarioId: w.scenarioId }, (await import('../../src/shared/time/instant.js')).Instant.parseIso(AS_OF));
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ fact_state: 'PROVISIONAL', conflict_status: 'NONE', hold_status: 'NONE', evidence: { source_type: 'EMAIL', generated_by: 'LLM' } });

    const eventId = (await factsOf(w))[0]?.current?.event_id as string;
    await http.post(`/truth/events/${eventId}/confirm`).set(ACTOR, w.humanId).send({}).expect(200);
    expect(await mine()).toBeUndefined();
    const known = (await context.informationGaps(w.runId)).known.find((k) => k.subject_id === w.truckPoolId);
    expect(known?.fact).toMatchObject({ fact_state: 'CONFIRMED', verified_by_human: true, verification_basis: 'HUMAN_VERIFICATION' });
  });

  it('the derived table is a rebuildable projection: wiping canonical_fact does not change the live answer', async () => {
    const w = await world();
    await extractWith(await reply(await sentInquiry(w), '차량 4대 가능합니다.'), [qty(4)]);
    const before = await factsOf(w);
    await db.query('DELETE FROM cera.canonical_fact WHERE entity_id = $1', [w.truckPoolId]);
    expect(await factsOf(w)).toEqual(before);
  });
});

// ───────────────────────── T-111 Truth Lifecycle Hardening ─────────────────────────
const factsAt = async (w: World, asOf: string) =>
  ((await http.get(`/truth/facts?recovery_run_id=${w.runId}&as_of=${encodeURIComponent(asOf)}`).expect(200)).body.facts as (FactView & { freshness_status: string; revoked_by_event_id: string | null; evaluated_as_of: string })[]).filter(
    (f) => f.entity_id === w.truckPoolId,
  );
const gapOf = async (w: World, asOf?: string) => {
  const ctx = worker.get(RecoveryContextService, { strict: false });
  const out = await ctx.informationGaps(w.runId, asOf ? Instant.parseIso(asOf) : null);
  return { gap: out.gaps.find((g) => g.subject_id === w.truckPoolId), known: out.known.find((k) => k.subject_id === w.truckPoolId) };
};
const manual = (w: World, over: Record<string, unknown> = {}) => ({
  intent: 'OPERATOR_DIRECT_ENTRY',
  kind: 'TRUCK_SLOT',
  target_id: w.truckPoolId,
  date: PLAN_DATE,
  window_from: '15:00',
  window_to: '17:00',
  value: 6,
  source_note: '전화 확인 — 배차 담당',
  scenario_id: w.scenarioId,
  ...over,
});

describe('T-111 A · C · D · R. a confirmed fact can be withdrawn without a new value — it stops being current truth, nothing is deleted', () => {
  it('revoke → REVOKED (no current value), older values do not come back, the gap reopens, a newer reply competes again', async () => {
    const w = await world();
    const draft = await sentInquiry(w);
    await extractWith(await reply(draft, '12월 1일 차량 3대 가능합니다.', '2026-10-20T01:00:00.000Z'), [qty(3)]);
    await extractWith(await reply(draft, '12월 1일 차량 4대 가능합니다.', '2026-10-20T02:00:00.000Z'), [qty(4)]);
    const current = (await factsOf(w))[0]?.current?.event_id as string;
    await http.post(`/truth/events/${current}/confirm`).set(ACTOR, w.humanId).send({}).expect(200);
    const revoked = (await http.post(`/truth/events/${current}/revoke`).set(ACTOR, w.humanId).send({ reason_code: 'SOURCE_WITHDREW', note: '아까 정보 취소 — 확답 불가' }).expect(200)).body;
    expect(revoked).toMatchObject({ fact_state: 'REVOKED', current: null, decision_usability: 'UNUSABLE' });
    expect(revoked.revoked_by_event_id).toMatch(/^[0-9a-f-]{36}$/);
    // 옛 3대도 되살아나지 않는다(그 시점까지의 값이 모두 현재 사실에서 빠진다)
    expect(revoked.candidates.filter((c: { role: string }) => c.role === 'REVOKED').map((c: { value: number }) => c.value).sort()).toEqual([3, 4]);
    const events = await eventsOf(w.truckPoolId);
    const withdrawal = events.find((e) => e.event_id === revoked.revoked_by_event_id);
    expect(withdrawal).toMatchObject({ event_class: 'CORRECTION', value_number: null, supersedes_event_id: current, source_type: 'HUMAN_UI', entered_by_actor_id: w.humanId, supersede_reason: 'SOURCE_WITHDREW' });
    expect(withdrawal.payload).toMatchObject({ withdrawal: true, revoke_reason: 'SOURCE_WITHDREW', revoked_event_id: current });
    expect(events.filter((e) => e.event_class === 'OBSERVATION')).toHaveLength(2); // 삭제 · 덮어쓰기 없음
    expect(await canonical(w.truckPoolId)).toHaveLength(0);
    expect((await db.query("SELECT 1 FROM cera.audit_log WHERE action = 'FACT_REVOKED' AND actor_id = $1", [w.humanId])).rowCount).toBe(1);
    // D: 공백이 다시 열린다 — 근거 = 철회
    expect((await gapOf(w)).gap).toMatchObject({ state: 'NEEDS_REFRESH', refresh_basis_event_id: revoked.revoked_by_event_id });
    // R: 같은 철회를 다시 눌러도 사건 하나, 철회된 값은 확인 · 정정할 수 없다
    await http.post(`/truth/events/${current}/revoke`).set(ACTOR, w.humanId).send({ reason_code: 'SOURCE_WITHDREW' }).expect(200);
    expect((await eventsOf(w.truckPoolId)).filter((e) => e.event_class === 'CORRECTION')).toHaveLength(1);
    await http.post(`/truth/events/${current}/confirm`).set(ACTOR, w.humanId).send({}).expect(409);
    // 철회 뒤의 새 회신은 정상 경쟁한다
    await extractWith(await reply(draft, '12월 1일 차량 2대 가능합니다.', '2026-11-30T00:00:00.000Z'), [qty(2)]);
    expect((await factsOf(w))[0]).toMatchObject({ fact_state: 'PROVISIONAL', current: { value: 2 } });
  });

  it('B. AI agents, the system and unknown actors cannot revoke — over HTTP or in SQL', async () => {
    const w = await world();
    await extractWith(await reply(await sentInquiry(w), '12월 1일 차량 4대 가능합니다.'), [qty(4)]);
    const id = (await factsOf(w))[0]?.current?.event_id as string;
    for (const who of [aiAgentId, sysId, v7()]) await http.post(`/truth/events/${id}/revoke`).set(ACTOR, who).send({ reason_code: 'OPERATOR_INVALIDATED' }).expect(403);
    const raw = (await db.query('SELECT raw_input_id FROM cera.event WHERE event_id = $1', [id])).rows[0].raw_input_id;
    const withdrawal = (sourceType: string, actorId: string) =>
      db.query(
        `INSERT INTO cera.event (event_id, schema_version, raw_input_id, event_class, event_type, fact_kind, fact_key, received_at, source_type, extraction_method, input_quality, input_confidence_level,
           entered_by_actor_id, supersedes_event_id, idempotency_key, recorded_at, is_simulated, scenario_id)
         VALUES ($1, 'ev-1', $2, 'CORRECTION', 'CORRECTION', 'OFFER', $3, now(), $4, 'DIRECT', 'STRUCTURED', 'HIGH', $5, $6, $7, now(), true, $8)`,
        [v7(), raw, `available.slot(${PLAN_DATE}T15:00-17:00)`, sourceType, actorId, id, hashOf(`wd-${v7()}`), w.scenarioId],
      );
    await expect(withdrawal('PARTNER_SYSTEM', sysId)).rejects.toMatchObject({ code: 'CE005' }); // M21: 철회는 사람(HUMAN_UI)만
    await expect(withdrawal('HUMAN_UI', aiAgentId)).rejects.toMatchObject({ code: 'CE005' }); // M20: HUMAN_UI 는 HUMAN 행위자만
    expect((await factsOf(w))[0]?.fact_state).toBe('PROVISIONAL');
  });
});

describe('T-111 F · G · H · I. facts age against an explicit as_of — stale is not wrong, it is just not current', () => {
  it('a slot past its valid_until is STALE (expired) at that as_of, not deleted, not shown as fresh, and the judgement is reproducible', async () => {
    const w = await world();
    await extractWith(await reply(await sentInquiry(w), '12월 1일 차량 4대 가능합니다.'), [qty(4)]);
    const before = '2026-12-01T14:00:00+09:00';
    const after = '2026-12-01T17:00:00+09:00'; // 질문 시간창 15–17시가 끝난 순간
    let [f] = await factsAt(w, before);
    expect(f).toMatchObject({ fact_state: 'PROVISIONAL', freshness_status: 'FRESH', evaluated_as_of: '2026-12-01T14:00:00.000+09:00' });
    [f] = await factsAt(w, after);
    expect(f).toMatchObject({ fact_state: 'STALE', value_status: 'PROVISIONAL', freshness_status: 'EXPIRED', decision_usability: 'UNUSABLE', current: { value: 4 } }); // 값은 그대로 남는다
    expect((await gapOf(w, after)).gap).toMatchObject({ state: 'NEEDS_REFRESH', fact: { fact_state: 'STALE', freshness_status: 'EXPIRED' } });
    expect((await gapOf(w, before)).gap).toMatchObject({ state: 'PROVISIONAL_AVAILABLE' });
    // I: 같은 as_of 는 같은 답(시계를 읽지 않는다)
    expect(await factsAt(w, before)).toEqual(await factsAt(w, before));
    // G: 사건 · 파생 행은 지워지지 않는다
    expect(await eventsOf(w.truckPoolId)).toHaveLength(1);
    expect(await canonical(w.truckPoolId)).toHaveLength(1);
  });

  it('a confirmed fact that went stale does not close the gap', async () => {
    const w = await world();
    const [f0] = (await http.post('/truth/facts/manual').set(ACTOR, w.humanId).send(manual(w)).expect(200).then((r) => [r.body])) as FactView[];
    expect(f0).toMatchObject({ fact_state: 'CONFIRMED' });
    expect((await gapOf(w, '2026-12-01T10:00:00+09:00')).known).toMatchObject({ fact: { fact_state: 'CONFIRMED' } });
    expect((await gapOf(w, '2026-12-01T18:00:00+09:00')).gap).toMatchObject({ state: 'NEEDS_REFRESH', fact: { fact_state: 'STALE' } });
  });
});

describe('T-111 J · K · L. an operator enters a fact directly (phone, visit) — CONFIRMED with provenance; corrections supersede', () => {
  it('manual entry → CONFIRMED (human source, note, audit), gap resolved; a correction supersedes it; a revoke reopens the gap; a retried command is one event', async () => {
    const w = await world();
    const commandId = v7();
    const entered = (await http.post('/truth/facts/manual').set(ACTOR, w.humanId).send(manual(w, { command_id: commandId, observed_at: '2026-10-26T09:30:00+09:00' })).expect(200)).body;
    expect(entered).toMatchObject({ fact_state: 'CONFIRMED', value_status: 'CONFIRMED', current: { value: 6, verified_by_human: true, verification_basis: 'HUMAN_VERIFICATION' } });
    expect(entered.candidates[0]).toMatchObject({ generated_by: 'HUMAN', source_type: 'HUMAN_UI', extraction_id: null });
    const [ev] = await eventsOf(w.truckPoolId);
    expect(ev).toMatchObject({ event_class: 'OBSERVATION', source_type: 'HUMAN_UI', extraction_method: 'DIRECT', entered_by_actor_id: w.humanId, value_number: '6.0000', fact_key: `available.slot(${PLAN_DATE}T15:00-17:00)` });
    expect(ev.payload).toMatchObject({ entry: 'OPERATOR_DIRECT_ENTRY', source_note: '전화 확인 — 배차 담당', authority: 'S' });
    expect(new Date(ev.source_event_time).toISOString()).toBe('2026-10-26T00:30:00.000Z');
    expect((await db.query("SELECT 1 FROM cera.audit_log WHERE action = 'FACT_ENTERED_MANUALLY' AND target_id = $1", [ev.event_id])).rowCount).toBe(1);
    expect((await gapOf(w)).known).toMatchObject({ fact: { fact_state: 'CONFIRMED' } });
    // R: 같은 명령의 재시도 → 사건 하나
    await http.post('/truth/facts/manual').set(ACTOR, w.humanId).send(manual(w, { command_id: commandId })).expect(200);
    expect(await eventsOf(w.truckPoolId)).toHaveLength(1);
    // L: 고칠 때는 대체(UPDATE 없음)
    const corrected = (await http.post(`/truth/events/${ev.event_id}/correct`).set(ACTOR, w.humanId).send({ value: 5, reason_code: 'OPERATOR_CORRECTION' }).expect(200)).body;
    expect(corrected).toMatchObject({ fact_state: 'CONFIRMED', current: { value: 5 } });
    expect(corrected.candidates.find((c: { event_id: string }) => c.event_id === ev.event_id)).toMatchObject({ role: 'SUPERSEDED', value: 6 });
    // 철회 → 공백 다시 열림
    await http.post(`/truth/events/${corrected.current.event_id}/revoke`).set(ACTOR, w.humanId).send({ reason_code: 'OUTDATED_OPERATIONAL_STATE' }).expect(200);
    expect((await gapOf(w)).gap).toMatchObject({ state: 'NEEDS_REFRESH' });
  });

  it('K. only an active human with the explicit intent and a source note can enter a fact', async () => {
    const w = await world();
    for (const who of [aiAgentId, sysId]) await http.post('/truth/facts/manual').set(ACTOR, who).send(manual(w)).expect(403);
    await http.post('/truth/facts/manual').set(ACTOR, w.humanId).send(manual(w, { intent: 'AGENT_SUGGESTION' })).expect(400);
    await http.post('/truth/facts/manual').set(ACTOR, w.humanId).send(manual(w, { source_note: '' })).expect(400);
    await http.post('/truth/facts/manual').set(ACTOR, w.humanId).send(manual(w, { window_from: '17:00', window_to: '15:00' })).expect(400);
    await http.post('/truth/facts/manual').set(ACTOR, w.humanId).send(manual(w, { observed_at: '2099-01-01T00:00:00+09:00' })).expect(400);
    expect(await eventsOf(w.truckPoolId)).toHaveLength(0);
  });
});

describe('T-111 M · N · O · P. the reply contract carries a date (reply-extract/2) — the model date is a candidate, CERA re-derives it', () => {
  const dated = (value: string, quote: string) => answer('answer_date', value, null, quote);
  const v2 = (answers: unknown[]) => ({ ...ok(answers), body: { ...ok(answers).body, schema_version: 'reply-extract/2', meta: { ...ok(answers).body.meta, prompt_version: 'reply-extract-v2' } } });

  it('M · N. an explicit or relative date that CERA derives to the asked day is accepted with the quantity', async () => {
    const w = await world();
    const draft = await sentInquiry(w);
    // "내일" 은 회신 근거 시각(11-30 KST)의 다음 날 = 질문 날짜 12-01
    const inbound = await reply(draft, '내일 차량 4대 가능합니다.', '2026-11-30T03:00:00.000Z');
    handler = () => v2([qty(4), dated('2026-12-01', '내일')]);
    expect(await extractor.extractOne(inbound)).toBe('EXTRACTED');
    const rows = (await db.query('SELECT candidate_value_text, review_status, created_event_id, schema_version FROM cera.extraction WHERE message_id = $1', [inbound])).rows;
    expect(rows.every((r) => r.review_status === 'ACCEPTED' && r.created_event_id !== null && r.schema_version === 'reply-extract/2')).toBe(true);
    expect((await factsOf(w))[0]).toMatchObject({ fact_state: 'PROVISIONAL', current: { value: 4 } });
  });

  it('N · O. a model date CERA cannot back, or a different day, blocks the value', async () => {
    const a = await world();
    const ia = await reply(await sentInquiry(a), '내일 차량 4대 가능합니다.', '2026-11-30T03:00:00.000Z');
    handler = () => v2([qty(4), dated('2026-12-02', '내일')]); // 모델이 "내일"을 잘못 정규화
    await extractor.extractOne(ia);
    expect(await eventsOf(a.truckPoolId)).toHaveLength(0);
    expect(await blockedOf(ia)).toEqual(['FACT_PROMOTION_BLOCKED_DATE_UNVERIFIED']);

    const b = await world();
    const ib = await reply(await sentInquiry(b), '모레 차량 4대 가능합니다.', '2026-11-30T03:00:00.000Z');
    handler = () => v2([qty(4), dated('2026-12-02', '모레')]);
    await extractor.extractOne(ib);
    expect(await eventsOf(b.truckPoolId)).toHaveLength(0);
    expect(await blockedOf(ib)).toEqual(['FACT_PROMOTION_BLOCKED_DATE_OUT_OF_SCOPE']);
  });

  it('P. a v1 AI Server reply (no date field) still works', async () => {
    const w = await world();
    const inbound = await reply(await sentInquiry(w), '12월 1일 차량 4대 가능합니다.');
    handler = () => ok([qty(4)]); // schema_version reply-extract/1
    expect(await extractor.extractOne(inbound)).toBe('EXTRACTED');
    expect((await db.query('SELECT schema_version FROM cera.extraction WHERE message_id = $1', [inbound])).rows[0].schema_version).toBe('reply-extract/1');
    expect((await factsOf(w))[0]).toMatchObject({ fact_state: 'PROVISIONAL' });
  });
});
