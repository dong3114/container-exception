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
import { hashPassword } from '../../src/auth/password.js';
import { CHANNEL_ADAPTERS } from '../../src/channel/channel-adapter.js';
import type { ChannelAdapters } from '../../src/channel/channel.module.js';
import type { MockChannelAdapter } from '../../src/channel/mock-channel-adapter.js';
import { ExtractionProcessor } from '../../src/communication/extraction-processor.js';
import { ExtractionRepository } from '../../src/communication/extraction.repository.js';
import { InboundProcessor } from '../../src/communication/inbound-processor.js';
import { OutboxDispatcher } from '../../src/communication/outbox-dispatcher.js';
import type { Env } from '../../src/config/env.js';
import { T0, actor, hashOf, registry, type Registry } from './fixtures.js';
import { appPool, testEnv } from './support.js';

/**
 * T-124 — 회신은 왔지만 값을 얻지 못했을 때: 사람 검토 상태 · 사람이 요청하는 추출 재시도 · 직접 입력으로 복구.
 * 자동 한도는 그대로이고, 사람의 요청 하나 = 새 시도 하나다. 이전 시도 기록은 지워지지 않는다.
 * 회신 문장은 2026-10-27 실제 Gmail 왕복에서 로컬 모델이 읽지 못한 문장과 같은 꼴의 **합성 문장**이다(실제 원문 · 주소 아님).
 */
type Handler = (req: ExtractionRequest) => { status: number; body: unknown };
let handler: Handler = () => ({ status: 503, body: { code: 'NOT_READY' } });
const calls: ExtractionRequest[] = [];
const aiServer: Server = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = JSON.parse(raw) as ExtractionRequest;
    calls.push(body);
    const out = handler(body);
    res.writeHead(out.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out.body));
  });
});

const contentDir = mkdtempSync(join(tmpdir(), 'cera-retry-content-'));
const mockDir = mkdtempSync(join(tmpdir(), 'cera-retry-mock-'));
const ACTOR = 'X-CERA-Actor-Id';
const PLAN_DATE = '2026-12-01'; // 시험 시계보다 뒤 — 사람이 넣은 사실이 계획 기준 시각에 유효하다
const AS_OF = '2026-12-01T00:00:00.000Z';
const REPLY = '네 12월 1일 오후 3시부터 차량 4대 받을 수 있습니다.';
let api: INestApplication;
let http: ReturnType<typeof request>;
let app: pg.Pool;
let worker: INestApplicationContext;
let mock: MockChannelAdapter;
let extractor: ExtractionProcessor;

beforeAll(async () => {
  await new Promise<void>((r) => aiServer.listen(0, '127.0.0.1', () => r()));
  const url = `http://127.0.0.1:${(aiServer.address() as AddressInfo).port}`;
  const env = (): Env => testEnv({ CERA_CONTENT_DIR: contentDir, CERA_MOCK_CHANNEL_DIR: mockDir, CERA_AI_SERVER_URL: url, CERA_AI_TIMEOUT_MS: '600', CERA_EXTRACTION_MAX_ATTEMPTS: '2' });
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

const noRecording = () => ({ status: 502, body: { code: 'NO_RECORDING', retryable: false } });
const down = () => ({ status: 503, body: { code: 'MODEL_LOADING', retryable: true } }); // 일시 실패(콜드 스타트 · 장애)
const unparseable = () => ({
  status: 200,
  body: { schema_version: 'reply-extract/1', outcome: 'UNPARSEABLE', answers: [], unmapped_statements: [REPLY], ambiguity_flags: [], meta: { provider: 'local', model_version: 'test-local', prompt_version: 'reply-extract-v1', latency_ms: 5, usage: null } },
});
const four = () => ({
  status: 200,
  body: {
    schema_version: 'reply-extract/1',
    outcome: 'VALUES',
    answers: [{ ask_id: 'Q1', field: 'quantity', raw_value: '4대', value: '4', unit: 'TRUCK', evidence: { quote: '차량 4대 받을 수 있습니다' }, confidence: 0.9 }],
    unmapped_statements: [],
    ambiguity_flags: [],
    meta: { provider: 'local', model_version: 'test-local', prompt_version: 'reply-extract-v1', latency_ms: 5, usage: null },
  },
});

interface World extends Registry {
  runId: string;
  scenarioId: string;
  truckPoolId: string;
  fieldId: string;
}

async function world(): Promise<World> {
  const r = await registry(app);
  const scenarioId = v7();
  const snapshotId = v7();
  const runId = v7();
  const truckPoolId = v7();
  await app.query("INSERT INTO cera.scenario (scenario_id, scenario_name, as_of_base, created_at) VALUES ($1, 'retry scenario', $2, $3)", [scenarioId, AS_OF, T0]);
  await app.query(
    `INSERT INTO cera.planning_snapshot (snapshot_id, as_of, fact_fingerprint, rule_version, tariff_version, policy_version, contains_simulated, created_at, scenario_id)
     VALUES ($1, $2, $3, 'r1', 't1', 'p1', true, $2, $4)`,
    [snapshotId, AS_OF, hashOf(`snap-${snapshotId}`), scenarioId],
  );
  await app.query(
    `INSERT INTO cera.recovery_run (run_id, snapshot_id, trigger_type, trigger_ref, objective_version, run_status, contains_simulated, executed_at)
     VALUES ($1, $2, 'EXCEPTION_DETECTED', 'RP-RETRY', 'o1', 'FEASIBLE', true, $3)`,
    [runId, snapshotId, AS_OF],
  );
  await app.query("INSERT INTO cera.truck_pool (truck_pool_id, pool_name, ownership, owner_counterparty_id) VALUES ($1, 'Retry 셔틀', 'PARTNER', $2)", [truckPoolId, r.counterpartyId]);
  // 현장 담당자(FIELD_OPERATOR) — 직접 입력은 되지만 재시도 권한은 없다
  const fieldId = await actor(app, 'HUMAN');
  await app.query(
    `INSERT INTO cera.user_account (user_id, actor_id, login_id, role, password_hash, is_active, created_at, updated_at) VALUES ($1, $2, $3, 'FIELD_OPERATOR', $4, true, $5, $5)`,
    [v7(), fieldId, `field-${fieldId.slice(-8)}`, await hashPassword('field-test-password-1'), T0],
  );
  return { ...r, runId, scenarioId, truckPoolId, fieldId };
}

async function repliedInquiry(w: World, body = REPLY) {
  const d = (
    await http
      .post('/communication/drafts')
      .send({
        address_id: w.addressId,
        intent: 'TRUCK_SLOT',
        target_id: w.truckPoolId,
        source_run_id: w.runId,
        values: [
          { key: 'quantity', value_number: 4, unit: 'TRUCK', source_path: 'resource_gaps[0].needed' },
          { key: 'date', value_text: PLAN_DATE },
          { key: 'window_from', value_text: '15:00' },
          { key: 'window_to', value_text: '17:00' },
        ],
      })
      .expect(201)
  ).body;
  await http.post(`/communication/drafts/${d.message.message_id}/approve`).set(ACTOR, w.humanId).send({ content_hash: d.message.content_hash }).expect(200);
  await http.post(`/communication/drafts/${d.message.message_id}/send`).set(ACTOR, w.humanId).send({ content_hash: d.message.content_hash }).expect(200);
  await worker.get(OutboxDispatcher).processMessage(d.message.message_id);
  return { draftId: d.message.message_id as string, inboundId: await reply(d.message.message_id, body) };
}

async function reply(draftId: string, body: string): Promise<string> {
  const r = await mock.simulateReply({ replyToCeraMessageId: draftId, body });
  await worker.get(InboundProcessor).runCycle();
  return (await app.query("SELECT message_id FROM cera.comm_message WHERE direction = 'INBOUND' AND external_message_id = $1", [r.external_message_id])).rows[0].message_id as string;
}

const view = async (draftId: string, inboundId: string) =>
  ((await http.get(`/communication/drafts/${draftId}`).expect(200)).body.replies as { message_id: string; extraction: Record<string, unknown> & { attempts: Record<string, unknown>[] } }[]).find((r) => r.message_id === inboundId)!.extraction;
const retry = (inboundId: string, who: string, commandId = v7()) => http.post(`/communication/inbound/${inboundId}/extraction/retry`).set(ACTOR, who).send({ command_id: commandId });
const errorsOf = async (inboundId: string) =>
  (await app.query("SELECT error_code, operation_name FROM cera.system_error WHERE related_entity_type = 'COMM_MESSAGE' AND related_entity_id = $1 ORDER BY occurred_at, error_id", [inboundId])).rows;

describe('T-124 A. automatic retries exhausted → a person reviews → asks again; every attempt stays recorded', () => {
  it('FAILED needs review; only an active OPERATOR/ADMIN human may retry; one request = one new attempt; success flows through the usual validation', async () => {
    const w = await world();
    handler = down;
    const { draftId, inboundId } = await repliedInquiry(w);
    await extractor.runCycle();
    await extractor.runCycle();
    await extractor.runCycle(); // 한도(2) 뒤에는 자동으로 부르지 않는다
    let x = await view(draftId, inboundId);
    expect(x).toMatchObject({ state: 'FAILED', failed_attempts: 2, last_error_code: 'AI_SERVER_UNAVAILABLE', provider_code: 'MODEL_LOADING', failure_kind: 'AI_CALL_FAILED', needs_review: true, retry: { available: true, blocked_reason: null } });
    handler = noRecording;
    expect(x.attempts.map((a) => [a.attempt_no, a.trigger, a.result])).toEqual([
      [1, 'AUTO', 'FAILED'],
      [2, 'AUTO', 'FAILED'],
    ]);

    // 권한: 현장 담당자 · Agent · 시스템 · 머리말 없음은 못 한다 — 요청 행이 생기지 않는다
    expect((await retry(inboundId, w.fieldId)).status).toBe(403);
    const agentId = await actor(app, 'AI_AGENT');
    expect([401, 403]).toContain((await retry(inboundId, agentId)).status);
    expect([401, 403]).toContain((await retry(inboundId, w.systemId)).status);
    expect((await http.post(`/communication/inbound/${inboundId}/extraction/retry`).send({ command_id: v7() })).status).toBeGreaterThanOrEqual(400);
    expect((await retry(inboundId, w.humanId).send({ command_id: 'not-a-uuid' })).status).toBe(400);
    expect((await app.query('SELECT count(*)::int AS n FROM cera.extraction_retry_request WHERE message_id = $1', [inboundId])).rows[0].n).toBe(0);

    // 사람의 요청 → 시도 하나가 열린다(RUNNING). 같은 명령 id 는 같은 요청 · 다른 명령은 409(진행 중)
    const command = v7();
    const first = await retry(inboundId, w.humanId, command).expect(200);
    expect(first.body).toMatchObject({ replayed: false, reply: { extraction: { state: 'RETRYING', retry: { available: false, blocked_reason: 'EXTRACTION_IN_PROGRESS' } } } });
    expect(first.body.reply.extraction.attempts.at(-1)).toMatchObject({ attempt_no: 3, trigger: 'HUMAN_RETRY', result: 'RUNNING', requested_by_actor_id: w.humanId });
    const again = await retry(inboundId, w.humanId, command).expect(200);
    expect(again.body).toMatchObject({ replayed: true, retry_request_id: first.body.retry_request_id });
    expect((await retry(inboundId, w.humanId).expect(409)).body.code).toBe('EXTRACTION_IN_PROGRESS');
    const audit = await app.query("SELECT actor_id FROM cera.audit_log WHERE action = 'REPLY_EXTRACTION_RETRY_REQUESTED' AND target_id = $1", [inboundId]);
    expect(audit.rows).toEqual([{ actor_id: w.humanId }]);
    const [req] = (await app.query('SELECT prior_state, prior_failed_attempts, requested_by_actor_id FROM cera.extraction_retry_request WHERE message_id = $1', [inboundId])).rows;
    expect(req).toEqual({ prior_state: 'FAILED', prior_failed_attempts: 2, requested_by_actor_id: w.humanId });

    // 공급자가 또 실패 → 그 시도만 FAILED(자동으로 다시 돌지 않는다), 이전 기록은 그대로
    calls.length = 0;
    await extractor.runCycle();
    await extractor.runCycle();
    expect(calls.filter((c) => c.inbound_message_id === inboundId)).toHaveLength(1);
    x = await view(draftId, inboundId);
    expect(x).toMatchObject({ state: 'FAILED', failed_attempts: 3, needs_review: true, retry: { available: true } });
    expect(x.attempts.map((a) => [a.trigger, a.result])).toEqual([
      ['AUTO', 'FAILED'],
      ['AUTO', 'FAILED'],
      ['HUMAN_RETRY', 'FAILED'],
    ]);
    expect((await errorsOf(inboundId)).map((e) => e.operation_name)).toEqual(['extractReply', 'extractReply', 'extractReplyRetry']);

    // 다시 요청 → 이번엔 읽었다 → 기존 검증 · 승격 경로(임시 사실). 이전 실패 3건은 남는다
    await retry(inboundId, w.humanId).expect(200);
    handler = four;
    await extractor.runCycle();
    x = await view(draftId, inboundId);
    expect(x).toMatchObject({ state: 'DONE', failure_kind: null, needs_review: false, retry: { available: false, blocked_reason: 'EXTRACTION_NOT_REQUIRED' } });
    expect((x.candidates as { validation: string; review_status: string }[])[0]).toMatchObject({ validation: 'PASSED', review_status: 'ACCEPTED' });
    expect(x.attempts.map((a) => [a.attempt_no, a.trigger, a.result])).toEqual([
      [1, 'AUTO', 'FAILED'],
      [2, 'AUTO', 'FAILED'],
      [3, 'HUMAN_RETRY', 'FAILED'],
      [4, 'HUMAN_RETRY', 'DONE'],
    ]);
    expect(await errorsOf(inboundId)).toHaveLength(3);
    expect((await retry(inboundId, w.humanId).expect(409)).body.code).toBe('EXTRACTION_NOT_REQUIRED');
    // 다른 회신에 같은 명령 id 를 쓰면 거절
    const other = await repliedInquiry(w);
    handler = unparseable;
    await extractor.runCycle();
    expect((await retry(other.inboundId, w.humanId, command).expect(409)).body.code).toBe('COMMAND_ID_REUSED');
  });
});

describe('T-124 B. the model found no answer → the operator enters the fact directly → retry is no longer needed', () => {
  it('NO_CANDIDATE is told apart from an AI call failure; after a confirmed direct entry the retry is refused (GAP_ALREADY_RESOLVED)', async () => {
    const w = await world();
    handler = unparseable;
    const { draftId, inboundId } = await repliedInquiry(w);
    await extractor.runCycle();
    expect(await view(draftId, inboundId)).toMatchObject({ state: 'NO_CANDIDATE', no_candidate_outcome: 'UNPARSEABLE', failure_kind: 'NO_ANSWER_FOUND', needs_review: true, failed_attempts: 0, retry: { available: true } });

    const entered = await http
      .post('/truth/facts/manual')
      .set(ACTOR, w.fieldId) // 현장 담당자도 직접 입력은 할 수 있다(복구 경로 B)
      .send({ command_id: v7(), intent: 'OPERATOR_DIRECT_ENTRY', kind: 'TRUCK_SLOT', target_id: w.truckPoolId, date: PLAN_DATE, window_from: '15:00', window_to: '17:00', value: 4, source_note: '회신 원문을 사람이 읽음 — AI 추출 실패', scenario_id: w.scenarioId })
      .expect(200);
    expect(entered.body).toMatchObject({ fact_state: 'CONFIRMED' });
    expect((await retry(inboundId, w.humanId).expect(409)).body.code).toBe('GAP_ALREADY_RESOLVED');
    // T-136: 화면은 "다시 추출 가능"을 보이지 않고(누르면 409 이던 문제), 회신 단위 결과(needs_review)와 업무 검토(review_pending)를 나눠 보인다
    expect(await view(draftId, inboundId)).toMatchObject({ needs_review: true, review_pending: false, retry: { available: false, blocked_reason: 'GAP_ALREADY_RESOLVED' } });
    // 실패 기록 · 회신은 그대로 — 평가 데이터(회신 → 모델 실패 → 사람 입력)로 남는다
    expect(await view(draftId, inboundId)).toMatchObject({ state: 'NO_CANDIDATE', attempts: [expect.objectContaining({ trigger: 'AUTO', result: 'NO_CANDIDATE', outcome: 'UNPARSEABLE' })] });
  });
});

describe('T-124 C. an old reply cannot be re-read once a newer reply exists; concurrent requests open one attempt', () => {
  it('REPLY_SUPERSEDED for the older reply; two different commands at once → one 200, one 409', async () => {
    const w = await world();
    handler = unparseable;
    const { draftId, inboundId } = await repliedInquiry(w);
    await extractor.runCycle();
    const newer = await reply(draftId, '다시 확인하고 연락드리겠습니다.');
    await extractor.runCycle();
    expect((await retry(inboundId, w.humanId).expect(409)).body.code).toBe('REPLY_SUPERSEDED');

    const results = await Promise.all([retry(newer, w.humanId), retry(newer, w.humanId)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await app.query('SELECT count(*)::int AS n FROM cera.extraction_retry_request WHERE message_id = $1', [newer])).rows[0].n).toBe(1);
    // append-only: 요청 기록은 고치거나 지울 수 없다
    await expect(app.query('DELETE FROM cera.extraction_retry_request WHERE message_id = $1', [newer])).rejects.toThrow();
  });
});

describe('T-125 automatic retry spacing — from stored failure times, so a restart or a missing Redis changes nothing', () => {
  it('a transient failure waits base × 3^(n−1) before the next automatic attempt; a failure that would repeat is not retried; a human retry has no wait', async () => {
    const w = await world();
    const repo = worker.get(ExtractionRepository);
    const backoff = { baseMs: 60_000, maxMs: 120_000 };
    const pending = async (id: string, offsetMs: number) => (await repo.pendingMessageIds(500, 3, new Date(Date.now() + offsetMs).toISOString(), backoff)).includes(id);

    handler = down;
    const transient = (await repliedInquiry(w)).inboundId;
    expect(await pending(transient, 0)).toBe(true); // 아직 시도 전 — 바로
    expect(await extractor.extractOne(transient)).toBe('FAILED');
    expect(await pending(transient, 5_000)).toBe(false); // 60초가 지나기 전에는 다시 부르지 않는다
    expect(await pending(transient, 61_000)).toBe(true);
    expect(await extractor.extractOne(transient)).toBe('FAILED');
    expect(await pending(transient, 61_000)).toBe(false); // 두 번째 실패 뒤 = 180초 → 상한 120초
    expect(await pending(transient, 121_000)).toBe(true);

    handler = noRecording;
    const repeat = (await repliedInquiry(w)).inboundId;
    expect(await extractor.extractOne(repeat)).toBe('FAILED');
    expect(await pending(repeat, 3_600_000)).toBe(false); // 다시 해도 같은 실패 — 자동으로 부르지 않는다(사람 검토)
    await retry(repeat, w.humanId).expect(200);
    expect(await pending(repeat, 0)).toBe(true); // 사람이 연 시도는 바로
  });
});

