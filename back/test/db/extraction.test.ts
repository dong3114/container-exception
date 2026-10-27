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
import type { Env } from '../../src/config/env.js';
import { T0, hashOf, registry, type Registry } from './fixtures.js';
import { appPool, testEnv } from './support.js';

/**
 * T-092 U7 — 정상 회신 → (Worker) → AI Server(HTTP) → 결정론 검증 → extraction 저장. AI Server 자리에 시험용 HTTP 서버를 둔다 —
 * 실제 HttpAiClient · 시간 제한 · 오류 분류를 그대로 지난다. 사실(Event)은 만들지 않는다.
 */
type Handler = (req: ExtractionRequest) => { status: number; body: unknown; delayMs?: number };
let handler: Handler = () => ({ status: 503, body: { code: 'NOT_READY' } });
const calls: ExtractionRequest[] = [];
const aiServer: Server = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = JSON.parse(raw) as ExtractionRequest;
    calls.push(body);
    const out = handler(body);
    setTimeout(() => {
      res.writeHead(out.status, { 'Content-Type': 'application/json' });
      res.end(typeof out.body === 'string' ? out.body : JSON.stringify(out.body));
    }, out.delayMs ?? 0);
  });
});

const contentDir = mkdtempSync(join(tmpdir(), 'cera-extract-content-'));
const mockDir = mkdtempSync(join(tmpdir(), 'cera-extract-mock-'));
const ACTOR = 'X-CERA-Actor-Id';
let env: (extra?: Partial<Record<keyof Env, string>>) => Env;
let api: INestApplication;
let http: ReturnType<typeof request>;
let app: pg.Pool;
let worker: INestApplicationContext;
let mock: MockChannelAdapter;
let extractor: ExtractionProcessor;

beforeAll(async () => {
  await new Promise<void>((r) => aiServer.listen(0, '127.0.0.1', () => r()));
  const url = `http://127.0.0.1:${(aiServer.address() as AddressInfo).port}`;
  env = (extra = {}) =>
    testEnv({ CERA_CONTENT_DIR: contentDir, CERA_MOCK_CHANNEL_DIR: mockDir, CERA_AI_SERVER_URL: url, CERA_AI_TIMEOUT_MS: '600', CERA_EXTRACTION_MAX_ATTEMPTS: '2', ...extra });
  api = await createApiApp(env());
  await api.init();
  http = request(api.getHttpServer());
  app = appPool();
  worker = await NestFactory.createApplicationContext(WorkerModule.forRoot(env()), { logger: false });
  mock = (worker.get(CHANNEL_ADAPTERS) as ChannelAdapters).get('MOCK') as MockChannelAdapter;
  extractor = worker.get(ExtractionProcessor);
});

afterAll(async () => {
  await api.close();
  await worker.close();
  await app.end();
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
    meta: { provider: 'replay', model_version: 'replay:test', prompt_version: 'reply-extract-v1', latency_ms: 3, usage: null },
    ...extra,
  },
});
const answer = (field: string, value: string, unit: string | null, quote: string) => ({ ask_id: 'Q1', field, raw_value: value, value, unit, evidence: { quote }, confidence: 0.9 });

interface World extends Registry {
  runId: string;
  truckPoolId: string;
}

async function world(): Promise<World> {
  const r = await registry(app);
  const scenarioId = v7();
  const snapshotId = v7();
  const runId = v7();
  const truckPoolId = v7();
  await app.query("INSERT INTO cera.scenario (scenario_id, scenario_name, as_of_base, created_at) VALUES ($1, 'extract scenario', $2, $2)", [scenarioId, T0]);
  await app.query(
    `INSERT INTO cera.planning_snapshot (snapshot_id, as_of, fact_fingerprint, rule_version, tariff_version, policy_version, contains_simulated, created_at, scenario_id)
     VALUES ($1, $2, $3, 'r1', 't1', 'p1', true, $2, $4)`,
    [snapshotId, T0, hashOf(`snap-${snapshotId}`), scenarioId],
  );
  await app.query(
    `INSERT INTO cera.recovery_run (run_id, snapshot_id, trigger_type, trigger_ref, objective_version, run_status, contains_simulated, executed_at)
     VALUES ($1, $2, 'EXCEPTION_DETECTED', 'RP-EX', 'o1', 'FEASIBLE', true, $3)`,
    [runId, snapshotId, T0],
  );
  await app.query("INSERT INTO cera.truck_pool (truck_pool_id, pool_name, ownership, owner_counterparty_id) VALUES ($1, 'Test 셔틀', 'PARTNER', $2)", [
    truckPoolId,
    r.counterpartyId,
  ]);
  return { ...r, runId, truckPoolId };
}

/** 문의 → 승인 → 발송 → (회신 주입) → 수신 처리. 정상 회신의 INBOUND 메시지 id 를 돌려준다(보류면 null). */
async function repliedInquiry(w: World, reply: { body: string; from?: string }) {
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
  const r = await mock.simulateReply({ replyToCeraMessageId: d.message.message_id, body: reply.body, ...(reply.from ? { from: reply.from } : {}) });
  await worker.get(InboundProcessor).runCycle();
  const inbound = (await app.query("SELECT message_id FROM cera.comm_message WHERE direction = 'INBOUND' AND external_message_id = $1", [r.external_message_id])).rows[0];
  return { draftId: d.message.message_id as string, inboundId: (inbound?.message_id as string | undefined) ?? null, externalId: r.external_message_id };
}

const rowsOf = async (messageId: string) =>
  (await app.query('SELECT * FROM cera.extraction WHERE message_id = $1 ORDER BY ask_id, extraction_id', [messageId])).rows;
const replyView = async (draftId: string) => (await http.get(`/communication/drafts/${draftId}`).expect(200)).body.replies[0];

describe('A. a normal reply → AI candidates → backend validation → candidates; the passed quantity becomes a provisional event (T-093)', () => {
  it('question-scoped request, verbatim quotes checked, rows with validator results; promoted rows point to one OBSERVATION event', async () => {
    const w = await world();
    const text = '오후 3시 이후 차량 4대까지 가능합니다.\n단가는 대당 18만원입니다.';
    const { draftId, inboundId } = await repliedInquiry(w, { body: text });
    if (!inboundId) throw new Error('reply was not attached');
    handler = () => ok([answer('quantity', '4', 'TRUCK', '차량 4대까지 가능합니다'), answer('available_from', '15:00', null, '오후 3시 이후'), answer('rate_per_truck', '180000', 'KRW', '단가는 대당 18만원입니다')]);
    calls.length = 0;
    expect(await extractor.extractOne(inboundId)).toBe('EXTRACTED');

    // AI 에 간 것: 물은 질문 · 기준일 · 정확한 원문 텍스트 — DB 전체나 신원 판정은 가지 않는다
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ schema_version: 'reply-extract/2', inbound_message_id: inboundId, reference_date: '2026-10-13', message_text: text, timezone: 'Asia/Seoul' });
    expect(calls[0]?.reply_date).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/); // the reply's own (Q-44) date in Asia/Seoul — the base for "tomorrow"
    expect(calls[0]?.asks).toEqual([
      expect.objectContaining({ ask_id: 'Q1', answer_shape: 'QUANTITY_IN_TIME_WINDOW', window: { date: '2026-10-13', from: '15:00', to: '17:00' } }),
    ]);
    expect(Object.keys(calls[0] ?? {}).sort()).toEqual(['asks', 'counterparty_name', 'inbound_message_id', 'message_text', 'reference_date', 'reply_date', 'schema_version', 'timezone']);

    const rows = await rowsOf(inboundId);
    expect(rows).toHaveLength(3);
    const byValue = Object.fromEntries(rows.map((x) => [x.candidate_value_text, x]));
    // T-093: 검증을 통과한 수량 후보는 같은 트랜잭션에서 임시 사실(사건)로 올라간다 — 시간창 칸 후보는 그 사건에 반영된 것으로 본다
    expect(byValue['4']).toMatchObject({ review_status: 'ACCEPTED', candidate_unit: 'TRUCK', ask_id: 'Q1', model_version: 'replay:test', schema_version: 'reply-extract/1' });
    expect(byValue['4'].created_event_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(byValue['4'].input_hash).toMatch(/^sha256:/);
    expect(byValue['15:00']).toMatchObject({ review_status: 'ACCEPTED', candidate_unit: null, created_event_id: byValue['4'].created_event_id });
    expect(byValue['180000']).toMatchObject({ review_status: 'REJECTED' }); // 묻지 않은 단가 — 결정론 규칙이 거절(SYSTEM 주체)
    const reviewer = (await app.query('SELECT actor_type FROM cera.actor WHERE actor_id = $1', [byValue['180000'].reviewed_by_actor_id])).rows[0];
    expect(reviewer.actor_type).toBe('SYSTEM');
    expect(byValue['180000'].validator_result).toContainEqual({ check: 'QUESTION_SCOPE', passed: false, detail_code: 'FIELD_NOT_ASKED' });
    // 거절된 후보(묻지 않은 단가)는 사건이 되지 않는다 — 사건은 수량 하나뿐
    const events = (await app.query('SELECT event_class, extraction_method, value_number, fact_key FROM cera.event WHERE raw_input_id = $1', [rows[0].raw_input_id])).rows;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event_class: 'OBSERVATION', extraction_method: 'LLM_EXTRACTED', value_number: '4.0000' });

    const view = await replyView(draftId);
    expect(view.extraction.state).toBe('DONE');
    expect(view.extraction.candidates.map((c: { field: string; value: string; validation: string; evidence_quote: string; generated_by: string }) => [c.field, c.value, c.validation, c.evidence_quote, c.generated_by])).toEqual(
      expect.arrayContaining([
        ['quantity', '4', 'PASSED', '차량 4대까지 가능합니다', 'RECORDED_REPLAY'],
        ['available_from', '15:00', 'PASSED', '오후 3시 이후', 'RECORDED_REPLAY'],
        ['rate_per_truck', '180000', 'REJECTED', '단가는 대당 18만원입니다', 'RECORDED_REPLAY'],
      ]),
    );
  });
});

describe('B · C. hallucinated quote and a wrong value are rejected', () => {
  it('quote not in the reply → REJECTED (QUOTE_NOT_IN_SOURCE); money as quantity → REJECTED', async () => {
    const w = await world();
    const a = await repliedInquiry(w, { body: '확인 후 다시 연락드리겠습니다.' });
    handler = () => ok([answer('quantity', '4', 'TRUCK', '차량 4대 가능합니다')]);
    await extractor.extractOne(a.inboundId as string);
    const [h] = await rowsOf(a.inboundId as string);
    expect(h).toMatchObject({ review_status: 'REJECTED', quote_location: null });
    expect((await replyView(a.draftId)).extraction.candidates[0]).toMatchObject({ validation: 'REJECTED', failed_reasons: ['QUOTE_NOT_IN_SOURCE'] });

    const b = await repliedInquiry(w, { body: '대당 18만원이면 가능합니다.' });
    handler = () => ok([answer('quantity', '180000', 'KRW', '18만원')]);
    await extractor.extractOne(b.inboundId as string);
    expect((await replyView(b.draftId)).extraction.candidates[0].failed_reasons).toEqual(['UNIT_MISMATCH:KRW', 'VALUE_NOT_IN_QUOTE']);
  });
});

describe('E · F. technical failures never touch the reply and are retried up to the limit', () => {
  it('timeout → retry (transient); malformed output → EXTRACTION_OUTPUT_INVALID stops at once (T-125 — it would repeat); reply stays', async () => {
    const w = await world();
    const a = await repliedInquiry(w, { body: '시험용 — 깨진 응답' });
    handler = () => ({ ...ok([]), delayMs: 1500 }); // 시간 제한 600ms
    expect(await extractor.extractOne(a.inboundId as string)).toBe('FAILED');
    let view = await replyView(a.draftId);
    expect(view.extraction).toMatchObject({ state: 'RETRYING', failed_attempts: 1, last_error_code: 'EXTRACTION_TIMEOUT', candidates: [], needs_review: false });

    handler = () => ({ status: 200, body: { schema_version: 'reply-extract/1', outcome: 'VALUES', answers: [{ ask_id: 'Q1' }] } });
    expect(await extractor.extractOne(a.inboundId as string)).toBe('FAILED');
    view = await replyView(a.draftId);
    expect(view.extraction).toMatchObject({ state: 'FAILED', failed_attempts: 2, last_error_code: 'EXTRACTION_OUTPUT_INVALID', needs_review: true, next_attempt_at: null });
    // 한도에 닿으면 주기가 더 부르지 않는다
    calls.length = 0;
    await extractor.runCycle();
    expect(calls.filter((c) => c.inbound_message_id === a.inboundId)).toHaveLength(0);
    // 회신과 원문은 그대로
    expect(view).toMatchObject({ status: 'NORMAL', content_available: true });
    const errors = (await app.query("SELECT error_code, retryable FROM cera.system_error WHERE related_entity_type = 'COMM_MESSAGE' AND related_entity_id = $1 ORDER BY occurred_at", [a.inboundId])).rows;
    expect(errors).toEqual([
      { error_code: 'EXTRACTION_TIMEOUT', retryable: true },
      { error_code: 'EXTRACTION_OUTPUT_INVALID', retryable: false },
    ]);
  });

  it('AI Server down → RETRYING; it comes back → extracted on the next cycle', async () => {
    const w = await world();
    const a = await repliedInquiry(w, { body: '오후 3시 이후 차량 4대 가능합니다.' });
    handler = () => ({ status: 503, body: { code: 'DOWN' } });
    expect(await extractor.extractOne(a.inboundId as string)).toBe('FAILED');
    handler = () => ok([answer('quantity', '4', 'TRUCK', '차량 4대 가능합니다')]);
    await extractor.runCycle();
    expect((await replyView(a.draftId)).extraction).toMatchObject({ state: 'DONE', failed_attempts: 1 });
  });
});

describe('G · H. held mail is never sent to AI; repeats do not duplicate', () => {
  it('a held reply makes no AI call', async () => {
    const w = await world();
    calls.length = 0;
    handler = () => ok([answer('quantity', '4', 'TRUCK', '4대')]);
    const held = await repliedInquiry(w, { body: '4대 됩니다', from: 'stranger@example.invalid' });
    expect(held.inboundId).toBeNull();
    await extractor.runCycle();
    expect(calls.filter((c) => c.message_text === '4대 됩니다')).toHaveLength(0);
  });

  it('extracting the same reply again — sequentially or concurrently — leaves one set of rows', async () => {
    const w = await world();
    const a = await repliedInquiry(w, { body: '오후 3시 이후 차량 4대 가능합니다.' });
    handler = () => ok([answer('quantity', '4', 'TRUCK', '차량 4대 가능합니다')]);
    const results = await Promise.all([extractor.extractOne(a.inboundId as string), extractor.extractOne(a.inboundId as string)]);
    expect(results.sort()).toEqual(['DUPLICATE', 'EXTRACTED']);
    expect(await extractor.extractOne(a.inboundId as string)).toBe('DUPLICATE');
    await extractor.runCycle();
    expect(await rowsOf(a.inboundId as string)).toHaveLength(1);
  });

  it('a reply that answers nothing → NO_CANDIDATE, done once', async () => {
    const w = await world();
    const a = await repliedInquiry(w, { body: '확인했습니다. 요청하신 대로 가능합니다.' });
    handler = () => ok([], { outcome: 'UNPARSEABLE', ambiguity_flags: ['IMPLICIT_REFERENCE'] });
    expect(await extractor.extractOne(a.inboundId as string)).toBe('NO_CANDIDATE');
    expect((await replyView(a.draftId)).extraction).toMatchObject({ state: 'NO_CANDIDATE', no_candidate_outcome: 'UNPARSEABLE', candidates: [] });
    calls.length = 0;
    await extractor.runCycle();
    expect(calls.filter((c) => c.inbound_message_id === a.inboundId)).toHaveLength(0);
  });
});
