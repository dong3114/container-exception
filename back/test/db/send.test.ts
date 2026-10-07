import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';
import request from 'supertest';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/app/create-api.js';
import { WorkerModule } from '../../src/app/worker.module.js';
import { CHANNEL_ADAPTERS } from '../../src/channel/channel-adapter.js';
import type { ChannelAdapters } from '../../src/channel/channel.module.js';
import type { MockChannelAdapter } from '../../src/channel/mock-channel-adapter.js';
import { type Claim, OutboxDispatcher } from '../../src/communication/outbox-dispatcher.js';
import { PlanSupersessionService } from '../../src/communication/plan-supersession.service.js';
import { RECONCILED_FOUND } from '../../src/communication/send-rules.js';
import type { Env } from '../../src/config/env.js';
import { TransactionRunner } from '../../src/db/transaction.js';
import { sql } from 'drizzle-orm';
import { T0, hashOf, registry, type Registry, transition } from './fixtures.js';
import { appPool, expectSqlState, testEnv } from './support.js';

/**
 * T-090 U5 — 발송 요청 → Outbox(QUEUED) → Worker(시도 선커밋 · 트랜잭션 밖 Mock 발송 · 결과 한 번) → SENT 를 실제 PostgreSQL 로.
 * Mock 채널은 임시 디렉터리를 "보낸 편지함"으로 쓴다 — 몇 통 나갔는지 직접 센다. 네트워크는 쓰지 않는다.
 */
const contentDir = mkdtempSync(join(tmpdir(), 'cera-send-content-'));
const mockDir = mkdtempSync(join(tmpdir(), 'cera-send-mock-'));
const ACTOR = 'X-CERA-Actor-Id';
const env = (extra: Partial<Record<keyof Env, string>> = {}) =>
  testEnv({ CERA_CONTENT_DIR: contentDir, CERA_MOCK_CHANNEL_DIR: mockDir, CERA_SEND_RETRY_BASE_MS: '0', CERA_SEND_MAX_ATTEMPTS: '3', ...extra });

let api: INestApplication;
let api2: INestApplication;
let http: ReturnType<typeof request>;
let http2: ReturnType<typeof request>;
let app: pg.Pool;
const workers: INestApplicationContext[] = [];

async function worker(extra: Partial<Record<keyof Env, string>> = {}) {
  const ctx = await NestFactory.createApplicationContext(WorkerModule.forRoot(env(extra)), { logger: false });
  workers.push(ctx);
  const mock = (ctx.get(CHANNEL_ADAPTERS) as ChannelAdapters).get('MOCK') as MockChannelAdapter;
  return { ctx, dispatcher: ctx.get(OutboxDispatcher), mock };
}

beforeAll(async () => {
  api = await createApiApp(env());
  api2 = await createApiApp(env());
  await api.init();
  await api2.init();
  http = request(api.getHttpServer());
  http2 = request(api2.getHttpServer());
  app = appPool();
});

afterAll(async () => {
  await api.close();
  await api2.close();
  for (const w of workers) await w.close();
  await app.end();
  rmSync(contentDir, { recursive: true, force: true });
  rmSync(mockDir, { recursive: true, force: true });
});

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
  await app.query("INSERT INTO cera.scenario (scenario_id, scenario_name, as_of_base, created_at) VALUES ($1, 'send scenario', $2, $2)", [scenarioId, T0]);
  await app.query(
    `INSERT INTO cera.planning_snapshot (snapshot_id, as_of, fact_fingerprint, rule_version, tariff_version, policy_version, contains_simulated, created_at, scenario_id)
     VALUES ($1, $2, $3, 'r1', 't1', 'p1', true, $2, $4)`,
    [snapshotId, T0, hashOf(`snap-${snapshotId}`), scenarioId],
  );
  await app.query(
    `INSERT INTO cera.recovery_run (run_id, snapshot_id, trigger_type, trigger_ref, objective_version, run_status, contains_simulated, executed_at)
     VALUES ($1, $2, 'EXCEPTION_DETECTED', 'RP-SEND', 'o1', 'FEASIBLE', true, $3)`,
    [runId, snapshotId, T0],
  );
  await app.query("INSERT INTO cera.truck_pool (truck_pool_id, pool_name, ownership, owner_counterparty_id) VALUES ($1, 'Test 셔틀', 'PARTNER', $2)", [
    truckPoolId,
    r.counterpartyId,
  ]);
  return { ...r, runId, truckPoolId };
}

type Draft = {
  message: { message_id: string; content_hash: string; subject: string; body: string; status: string };
  approval: { current: { approval_id: string; subject: string; body: string } };
  dispatch: Record<string, unknown>;
};

async function approvedDraft(w: World): Promise<Draft> {
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
          { key: 'date', value_text: '2026-10-13', source_path: 'as_of.date' },
          { key: 'window_from', value_text: '15:00', source_path: 'resource_gaps[0].window.from' },
          { key: 'window_to', value_text: '17:00', source_path: 'resource_gaps[0].window.to' },
        ],
      })
      .expect(201)
  ).body;
  return (await http.post(`/communication/drafts/${d.message.message_id}/approve`).set(ACTOR, w.humanId).send({ content_hash: d.message.content_hash }).expect(200)).body;
}

const send = (w: World, d: Draft, client = http) =>
  client.post(`/communication/drafts/${d.message.message_id}/send`).set(ACTOR, w.humanId).send({ content_hash: d.message.content_hash });
const view = async (d: Draft) => (await http.get(`/communication/drafts/${d.message.message_id}`).expect(200)).body;
const statuses = async (messageId: string) =>
  (await app.query('SELECT status FROM cera.message_status_transition WHERE message_id = $1 ORDER BY occurred_at, transition_id', [messageId])).rows.map((r) => r.status);
const attemptsOf = async (messageId: string) =>
  (await app.query('SELECT * FROM cera.send_attempt WHERE message_id = $1 ORDER BY attempt_no', [messageId])).rows;
const sentCount = async (mock: MockChannelAdapter, messageId: string) => (await mock.sentRecords()).filter((r) => r.headers['X-CERA-Message'] === messageId).length;

describe('A. approved message → send request → Outbox → worker → Mock channel → SENT', () => {
  it('sends exactly the approved copy once and records the attempt with the live approval', async () => {
    const w = await world();
    const { dispatcher, mock } = await worker();
    const d = await approvedDraft(w);
    expect(d.dispatch).toMatchObject({ state: 'NOT_REQUESTED', can_request_send: true, blocked_reasons: [] });

    const queued = (await send(w, d).expect(200)).body;
    expect(queued.message.status).toBe('QUEUED');
    expect(queued.dispatch).toMatchObject({ state: 'QUEUED', can_request_send: false, attempts: [] });
    expect(queued.dispatch.queued_at).toMatch(/\+09:00$/);
    expect(await sentCount(mock, d.message.message_id)).toBe(0); // API 는 보내지 않는다

    const summary = await dispatcher.runCycle();
    expect(summary.processed.SENT).toBeGreaterThanOrEqual(1);
    const sent = await view(d);
    expect(sent.message.status).toBe('SENT');
    expect(sent.dispatch).toMatchObject({ state: 'SENT', approval_id_used: d.approval.current.approval_id });
    expect(sent.dispatch.sent_at).toMatch(/\+09:00$/);
    expect(sent.dispatch.attempts).toEqual([expect.objectContaining({ attempt_no: 1, result: 'SUCCESS', error_code: null, reconciled: false })]);
    expect(await statuses(d.message.message_id)).toEqual(['DRAFTED', 'PENDING_APPROVAL', 'APPROVED', 'QUEUED', 'SENT']);

    const [attempt] = await attemptsOf(d.message.message_id);
    expect(attempt).toMatchObject({ approval_id: d.approval.current.approval_id, attempt_no: 1, result: 'SUCCESS', sent_content_hash: d.message.content_hash });
    expect(attempt.provider_message_id).toMatch(/^mock-msg-/);

    // 보낸 것 = 승인 사본 그대로 · 수신자 · X-CERA-Message
    const records = (await mock.sentRecords()).filter((r) => r.headers['X-CERA-Message'] === d.message.message_id);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ subject: d.approval.current.subject, body_text: d.approval.current.body, content_hash: d.message.content_hash, to: `dispatch-${w.addressId}@example.invalid` });

    const thread = (await app.query('SELECT thread_status, external_thread_id FROM cera.comm_thread WHERE thread_id = $1', [sent.thread.thread_id])).rows[0];
    expect(thread).toEqual({ thread_status: 'WAITING_REPLY', external_thread_id: records[0]?.external_thread_id });
    const question = (await app.query('SELECT question_status FROM cera.question_item WHERE question_item_id = $1', [sent.question.question_item_id])).rows[0];
    expect(question.question_status).toBe('SENT');
  });
});

describe('B. approval re-checked before sending', () => {
  it('no approval · revoked · invalidated (plan replaced) · expired · stale content hash are refused at the request', async () => {
    const w = await world();
    // 승인 없음
    const created = (
      await http
        .post('/communication/drafts')
        .send({ address_id: w.addressId, intent: 'TRUCK_SLOT', target_id: w.truckPoolId, source_run_id: w.runId, values: [{ key: 'quantity', value_number: 2, unit: 'TRUCK', source_path: 'a' }, { key: 'date', value_text: '2026-10-13' }, { key: 'window_from', value_text: '15:00' }, { key: 'window_to', value_text: '17:00' }] })
        .expect(201)
    ).body;
    expect((await send(w, created).expect(409)).body.code).toBe('NOT_APPROVED');
    expect(created.dispatch.can_request_send).toBe(false);

    // 취소된 승인
    const revoked = await approvedDraft(w);
    await http.post(`/communication/approvals/${revoked.approval.current.approval_id}/revoke`).set(ACTOR, w.humanId).send({}).expect(200);
    expect((await send(w, revoked).expect(409)).body.code).toBe('APPROVAL_REVOKED');

    // 오래된 지문
    const stale = await approvedDraft(w);
    expect((await send(w, { ...stale, message: { ...stale.message, content_hash: hashOf('old') } }).expect(409)).body.code).toBe('CONTENT_CHANGED');

    // 만료된 승인(과거에 결정 · 만료) — 메시지는 APPROVED
    const exp = (await http.post('/communication/drafts').send({ address_id: w.addressId, intent: 'TRUCK_SLOT', target_id: w.truckPoolId, values: [{ key: 'quantity', value_number: 2, unit: 'TRUCK' }, { key: 'date', value_text: '2026-10-13' }, { key: 'window_from', value_text: '15:00' }, { key: 'window_to', value_text: '17:00' }], scenario_id: (await app.query('SELECT scenario_id FROM cera.planning_snapshot s JOIN cera.recovery_run r USING (snapshot_id) WHERE r.run_id = $1', [w.runId])).rows[0].scenario_id }).expect(201)).body;
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      const expiredId = v7();
      await client.query(
        `INSERT INTO cera.message_approval (approval_id, message_id, decision, actor_id, decided_at, expires_at, approved_content_ref, approved_content_hash, approved_to_address_id)
         VALUES ($1, $2, 'APPROVED', $3, now() - interval '2 days', now() - interval '1 day', $4, $5, $6)`,
        [expiredId, exp.message.message_id, w.humanId, `cref:v1:MESSAGE_APPROVAL_CONTENT:${v7()}`, exp.message.content_hash, w.addressId],
      );
      await client.query(
        `INSERT INTO cera.message_approval_structured_field (approval_id, field_key, approved_value_text, approved_value_number, approved_unit)
         SELECT $1, field_key, value_text, value_number, unit FROM cera.comm_message_structured_field WHERE message_id = $2`,
        [expiredId, exp.message.message_id],
      );
      await client.query(
        "INSERT INTO cera.message_status_transition (transition_id, message_id, status, occurred_at, actor_id, is_simulated) VALUES ($1, $2, 'APPROVED', now() - interval '2 days', $3, true)",
        [v7(), exp.message.message_id, w.humanId],
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    expect((await send(w, exp).expect(409)).body.code).toBe('APPROVAL_EXPIRED');

    // 계획 교체로 무효화
    const planned = await approvedDraft(w);
    await api.get(TransactionRunner).run(async (t) => {
      const newRun = v7();
      await t.execute(
        sql`INSERT INTO cera.recovery_run (run_id, snapshot_id, trigger_type, previous_run_id, objective_version, run_status, contains_simulated, executed_at)
            SELECT ${newRun}::uuid, snapshot_id, 'OPERATOR_REQUEST', run_id, 'o1', 'FEASIBLE', contains_simulated, now() FROM cera.recovery_run WHERE run_id = ${w.runId}::uuid`,
      );
      await api.get(PlanSupersessionService).invalidateForNewRun(t, newRun, w.systemId);
    });
    const res = (await send(w, planned).expect(409)).body;
    expect(res.code).toBe('APPROVAL_INVALIDATED');
    expect(res.message).toContain('PLAN_SUPERSEDED');

    for (const m of [created, revoked, stale, exp, planned]) expect(await attemptsOf(m.message.message_id)).toEqual([]);
  });

  it('an approval revoked after queueing: the worker takes it off the queue and sends nothing (policy — not retried)', async () => {
    const w = await world();
    const { dispatcher, mock } = await worker();
    const d = await approvedDraft(w);
    await send(w, d).expect(200);
    await http.post(`/communication/approvals/${d.approval.current.approval_id}/revoke`).set(ACTOR, w.humanId).send({ reason: '대기 중 취소' }).expect(200);
    expect(await dispatcher.processMessage(d.message.message_id)).toBe('DEQUEUED');
    const after = await view(d);
    expect(after.message.status).toBe('APPROVED');
    expect(after.dispatch).toMatchObject({ state: 'NOT_REQUESTED', can_request_send: false });
    expect(after.dispatch.dequeued_reason).toContain('APPROVAL_REVOKED');
    expect(await attemptsOf(d.message.message_id)).toEqual([]);
    expect(await sentCount(mock, d.message.message_id)).toBe(0);
  });
});

describe('C. Contact Gate re-checked before sending', () => {
  it('a contact deactivated after approval → request refused (403)', async () => {
    const w = await world();
    const d = await approvedDraft(w);
    await app.query('UPDATE cera.counterparty_contact SET is_active = false WHERE contact_id = $1', [w.contactId]);
    expect((await send(w, d).expect(403)).body.code).toBe('RECIPIENT_NOT_ELIGIBLE');
  });

  it('address verification withdrawn after queueing → the worker refuses at the last check, nothing is sent', async () => {
    const w = await world();
    const { dispatcher, mock } = await worker();
    const d = await approvedDraft(w);
    await send(w, d).expect(200);
    await app.query("UPDATE cera.contact_channel_address SET email_verification_status = 'UNVERIFIED' WHERE address_id = $1", [w.addressId]);
    expect(await dispatcher.processMessage(d.message.message_id)).toBe('DEQUEUED');
    expect((await view(d)).dispatch.dequeued_reason).toContain('RECIPIENT_NOT_ELIGIBLE');
    expect(await sentCount(mock, d.message.message_id)).toBe(0);
  });
});

describe('D. never twice', () => {
  it('send requested twice (and concurrently on two API instances) → queued once, sent once', async () => {
    const w = await world();
    const { dispatcher, mock } = await worker();
    const d = await approvedDraft(w);
    const [a, b] = await Promise.all([send(w, d, http), send(w, d, http2)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    await send(w, d).expect(200);
    expect((await statuses(d.message.message_id)).filter((s) => s === 'QUEUED')).toHaveLength(1);
    await dispatcher.runCycle();
    await send(w, d).expect(200); // 보낸 뒤 다시 요청해도
    await dispatcher.runCycle();
    expect(await sentCount(mock, d.message.message_id)).toBe(1);
    expect(await attemptsOf(d.message.message_id)).toHaveLength(1);
  });

  it('two workers processing at the same time → one attempt, one send', async () => {
    const w = await world();
    const w1 = await worker();
    const w2 = await worker();
    for (let round = 0; round < 3; round += 1) {
      const d = await approvedDraft(w);
      await send(w, d).expect(200);
      const results = await Promise.all([w1.dispatcher.processMessage(d.message.message_id), w2.dispatcher.processMessage(d.message.message_id)]);
      expect(results.filter((r) => r === 'SENT')).toHaveLength(1);
      expect(await sentCount(w1.mock, d.message.message_id)).toBe(1);
      expect(await attemptsOf(d.message.message_id)).toHaveLength(1);
      expect((await view(d)).message.status).toBe('SENT');
    }
  });

  it('only one worker holds the outbox lock; the other stays idle', async () => {
    const { WorkerRunner } = await import('../../src/app/worker.module.js');
    const w1 = await worker();
    const w2 = await worker();
    const r1 = w1.ctx.get(WorkerRunner);
    const r2 = w2.ctx.get(WorkerRunner);
    expect(await r1.holdOutboxLock()).toBe(true);
    expect(await r2.holdOutboxLock()).toBe(false);
    await r1.releaseLock();
    expect(await r2.holdOutboxLock()).toBe(true);
    await r2.releaseLock();
  });
});

describe('E. crash after the channel accepted, before the result was recorded', () => {
  it('restart → reconciliation finds it in the channel (lookup_sent) → SUCCESS, no second send', async () => {
    const w = await world();
    const before = await worker();
    const d = await approvedDraft(w);
    await send(w, d).expect(200);
    const claim = (await before.dispatcher.claim(d.message.message_id)) as Claim;
    expect(typeof claim).toBe('object');
    await before.dispatcher.transmit(claim); // 채널은 받았다 — 그리고 결과를 적기 전에 프로세스가 죽었다(record 를 부르지 않는다)
    expect(await sentCount(before.mock, d.message.message_id)).toBe(1);
    expect((await view(d)).dispatch.state).toBe('SENDING');

    // 재기동 직후: 화해 대기 시간 안에서는 다시 보내지도, 정리하지도 않는다(다른 워커가 아직 보내는 중일 수 있다)
    const after = await worker();
    expect(await after.dispatcher.processMessage(d.message.message_id)).toBe('SKIPPED');
    expect((await after.dispatcher.runCycle({ reconcileAfterMs: 60_000 })).reconciled).toBe(0);
    // 대기 시간이 지난 뒤의 주기: 먼저 조회한다
    const summary = await after.dispatcher.runCycle({ reconcileAfterMs: 0 });
    expect(summary.reconciled).toBeGreaterThanOrEqual(1);
    const v = await view(d);
    expect(v.message.status).toBe('SENT');
    expect(v.dispatch.attempts).toEqual([expect.objectContaining({ attempt_no: 1, result: 'SUCCESS', reconciled: true })]);
    const [attempt] = await attemptsOf(d.message.message_id);
    expect(attempt.error_message).toBe(RECONCILED_FOUND);
    expect(attempt.provider_message_id).toBe((await after.mock.sentRecords()).find((r) => r.headers['X-CERA-Message'] === d.message.message_id)?.provider_message_id);
    await after.dispatcher.runCycle({ reconcileAfterMs: 0 });
    expect(await sentCount(after.mock, d.message.message_id)).toBe(1);
  });
});

describe('F. UNKNOWN and retry rules', () => {
  it('UNKNOWN (sent, answer lost) → reconciliation → SUCCESS, still one send', async () => {
    const w = await world();
    const { dispatcher, mock } = await worker();
    const d = await approvedDraft(w);
    await send(w, d).expect(200);
    mock.setFault('timeout_after_send');
    expect(await dispatcher.processMessage(d.message.message_id)).toBe('UNKNOWN');
    mock.setFault('none');
    expect((await view(d)).dispatch.state).toBe('SENDING');
    expect(await dispatcher.processMessage(d.message.message_id)).toBe('SKIPPED'); // 미확정이 있으면 재전송하지 않는다
    await dispatcher.runCycle({ reconcileAfterMs: 0 });
    const [attempt] = await attemptsOf(d.message.message_id);
    expect(attempt).toMatchObject({ result: 'SUCCESS', error_code: null, error_message: RECONCILED_FOUND });
    expect((await view(d)).message.status).toBe('SENT');
    expect(await sentCount(mock, d.message.message_id)).toBe(1);
  });

  it('UNKNOWN (never reached the channel) → reconciliation proves not sent → RETRYABLE_FAILURE → retried once → SENT', async () => {
    const w = await world();
    const { dispatcher, mock } = await worker();
    const d = await approvedDraft(w);
    await send(w, d).expect(200);
    const claim = (await dispatcher.claim(d.message.message_id)) as Claim;
    await dispatcher.record(claim, { kind: 'UNKNOWN', code: 'MOCK_TIMEOUT', message: 'no answer' }); // 채널에는 아무것도 없다
    await dispatcher.reconcile(0);
    const first = (await attemptsOf(d.message.message_id))[0];
    expect(first).toMatchObject({ result: 'RETRYABLE_FAILURE', error_code: 'RECONCILED_NOT_SENT' });
    expect(await dispatcher.processMessage(d.message.message_id)).toBe('SENT');
    expect((await attemptsOf(d.message.message_id)).map((a) => [a.attempt_no, a.result])).toEqual([
      [1, 'RETRYABLE_FAILURE'],
      [2, 'SUCCESS'],
    ]);
    expect(await sentCount(mock, d.message.message_id)).toBe(1);
  });

  it('temporary failure → RETRY_WAIT then retried; permanent failure → DELIVERY_FAILED, never retried; retries exhausted → DELIVERY_FAILED', async () => {
    const w = await world();
    const { dispatcher, mock } = await worker();

    const t = await approvedDraft(w);
    await send(w, t).expect(200);
    mock.setFault('transient');
    expect(await dispatcher.processMessage(t.message.message_id)).toBe('RETRY_SCHEDULED');
    expect((await view(t)).dispatch).toMatchObject({ state: 'RETRY_WAIT' });
    mock.setFault('none');
    expect(await dispatcher.processMessage(t.message.message_id)).toBe('SENT');

    const p = await approvedDraft(w);
    await send(w, p).expect(200);
    mock.setFault('permanent');
    expect(await dispatcher.processMessage(p.message.message_id)).toBe('FAILED');
    mock.setFault('none');
    const pv = await view(p);
    expect(pv.message.status).toBe('DELIVERY_FAILED');
    expect(pv.dispatch).toMatchObject({ state: 'FAILED' });
    await send(w, p).expect(200); // 다시 요청해도 다시 넣지 않는다
    await dispatcher.runCycle();
    expect(await attemptsOf(p.message.message_id)).toHaveLength(1);

    const x = await approvedDraft(w);
    await send(w, x).expect(200);
    mock.setFault('transient');
    for (let n = 0; n < 3; n += 1) await dispatcher.processMessage(x.message.message_id); // 최대 3회(시험 설정)
    mock.setFault('none');
    expect(await dispatcher.processMessage(x.message.message_id)).toBe('SKIPPED'); // 이미 실패로 확정
    expect((await view(x)).message.status).toBe('DELIVERY_FAILED');
    expect(await attemptsOf(x.message.message_id)).toHaveLength(3);
    expect(await sentCount(mock, x.message.message_id)).toBe(0);
  });

  it('kill switch on: send requests still queue, the worker sends nothing', async () => {
    const w = await world();
    const paused = await worker({ CERA_SENDING_PAUSED: 'true' });
    const d = await approvedDraft(w);
    await send(w, d).expect(200);
    expect(await paused.dispatcher.processMessage(d.message.message_id)).toBe('PAUSED');
    expect((await view(d)).dispatch.state).toBe('QUEUED');
    expect(await sentCount(paused.mock, d.message.message_id)).toBe(0);
  });
});

describe('G. message lifecycle enforced by the database (M13)', () => {
  it('no QUEUED without a valid approval, no SENT without a successful attempt, no way back from SENT', async () => {
    const w = await world();
    const { dispatcher } = await worker();
    const d = await approvedDraft(w);
    const pending = (
      await http
        .post('/communication/drafts')
        .send({ address_id: w.addressId, intent: 'TRUCK_SLOT', target_id: w.truckPoolId, source_run_id: w.runId, values: [{ key: 'quantity', value_number: 2, unit: 'TRUCK', source_path: 'a' }, { key: 'date', value_text: '2026-10-13' }, { key: 'window_from', value_text: '15:00' }, { key: 'window_to', value_text: '17:00' }] })
        .expect(201)
    ).body;
    await expectSqlState(transition(app, pending.message.message_id, 'QUEUED', w.humanId), 'CE005'); // PENDING_APPROVAL → QUEUED
    await expectSqlState(transition(app, d.message.message_id, 'SENT', w.systemId), 'CE005'); // APPROVED → SENT 건너뛰기
    await send(w, d).expect(200);
    await expectSqlState(transition(app, d.message.message_id, 'SENT', w.systemId), 'CE005'); // 성공 시도 없음
    await dispatcher.processMessage(d.message.message_id);
    await expectSqlState(transition(app, d.message.message_id, 'DRAFTED', w.systemId), 'CE005');
    await expectSqlState(transition(app, d.message.message_id, 'QUEUED', w.systemId), 'CE005');
    expect(await statuses(d.message.message_id)).toEqual(['DRAFTED', 'PENDING_APPROVAL', 'APPROVED', 'QUEUED', 'SENT']);
  });
});
