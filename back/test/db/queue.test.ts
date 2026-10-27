import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';
import request from 'supertest';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/app/create-api.js';
import { WorkerModule, WorkerRunner } from '../../src/app/worker.module.js';
import { CHANNEL_ADAPTERS } from '../../src/channel/channel-adapter.js';
import type { ChannelAdapters } from '../../src/channel/channel.module.js';
import type { MockChannelAdapter } from '../../src/channel/mock-channel-adapter.js';
import type { Env } from '../../src/config/env.js';
import { EXECUTION_QUEUE, type ExecutionQueue } from '../../src/queue/execution-queue.js';
import { T0, hashOf, registry } from './fixtures.js';
import { appPool, testEnv } from './support.js';

/**
 * T-121 — Redis 실행 큐. Redis 는 빠른 길일 뿐이고 정본은 PostgreSQL 이다:
 * 큐로 바로 나가고(폴링 없이) · 같은 작업이 두 번 와도 한 번만 나가고 · 재시도가 예약되고 · Redis 가 비워지거나 죽어도 폴링이 끝낸다.
 * 실제 Redis 가 필요하다(CERA_TEST_REDIS_URL, 기본 redis://127.0.0.1:56379 — `docker run -p 127.0.0.1:56379:6379 redis:7.4.2`).
 */
const REDIS_URL = process.env.CERA_TEST_REDIS_URL ?? 'redis://127.0.0.1:56379';
const QUEUE = `cera-test-${Date.now().toString(36)}`;
const contentDir = mkdtempSync(join(tmpdir(), 'cera-queue-content-'));
const mockDir = mkdtempSync(join(tmpdir(), 'cera-queue-mock-'));
const ACTOR = 'X-CERA-Actor-Id';
const env = (extra: Partial<Record<keyof Env, string>> = {}) =>
  testEnv({ CERA_CONTENT_DIR: contentDir, CERA_MOCK_CHANNEL_DIR: mockDir, CERA_REDIS_URL: REDIS_URL, CERA_QUEUE_NAME: QUEUE, CERA_SEND_RETRY_BASE_MS: '60000', ...extra });

let redisUp = false;
let api: INestApplication;
let http: ReturnType<typeof request>;
let db: pg.Pool;
let worker: INestApplicationContext;
let runner: WorkerRunner;
let mock: MockChannelAdapter;
let admin: Redis;

beforeAll(async () => {
  admin = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 1_000, lazyConnect: true });
  admin.on('error', () => undefined);
  redisUp = await admin.connect().then(() => admin.ping()).then((p) => p === 'PONG').catch(() => false);
  if (!redisUp) return;
  api = await createApiApp(env());
  await api.init();
  http = request(api.getHttpServer());
  db = appPool();
  worker = await NestFactory.createApplicationContext(WorkerModule.forRoot(env()), { logger: false });
  runner = worker.get(WorkerRunner);
  mock = (worker.get(CHANNEL_ADAPTERS) as ChannelAdapters).get('MOCK') as MockChannelAdapter;
});

afterAll(async () => {
  if (redisUp) {
    await new Promise((r) => setTimeout(r, 1_500)); // 커밋 뒤 알림 처리기(Agent 깨우기)가 끝나도록 — 앱을 닫은 뒤 DB 를 부르지 않게
    await runner.releaseLock();
    await api.close();
    await worker.close();
    await db.end();
    await new Queue(QUEUE, { connection: admin }).obliterate({ force: true }).catch(() => undefined);
  }
  admin.disconnect();
  rmSync(contentDir, { recursive: true, force: true });
  rmSync(mockDir, { recursive: true, force: true });
});

async function world() {
  const r = await registry(db);
  const scenarioId = v7();
  const snapshotId = v7();
  const runId = v7();
  const truckPoolId = v7();
  await db.query("INSERT INTO cera.scenario (scenario_id, scenario_name, as_of_base, created_at) VALUES ($1, 'queue scenario', $2, $2)", [scenarioId, T0]);
  await db.query(
    `INSERT INTO cera.planning_snapshot (snapshot_id, as_of, fact_fingerprint, rule_version, tariff_version, policy_version, contains_simulated, created_at, scenario_id) VALUES ($1, $2, $3, 'r1', 't1', 'p1', true, $2, $4)`,
    [snapshotId, T0, hashOf(`snap-${snapshotId}`), scenarioId],
  );
  await db.query(
    `INSERT INTO cera.recovery_run (run_id, snapshot_id, trigger_type, trigger_ref, objective_version, run_status, contains_simulated, executed_at) VALUES ($1, $2, 'EXCEPTION_DETECTED', 'RP-Q', 'o1', 'FEASIBLE', true, $3)`,
    [runId, snapshotId, T0],
  );
  await db.query("INSERT INTO cera.truck_pool (truck_pool_id, pool_name, ownership, owner_counterparty_id) VALUES ($1, 'Q 셔틀', 'PARTNER', $2)", [truckPoolId, r.counterpartyId]);
  return { ...r, runId, truckPoolId };
}

/** 초안 → 승인 → 발송 요청(QUEUED). 발송 요청이 SEND_REQUESTED 알림 → 큐 작업을 만든다. */
async function queuedMessage(): Promise<string> {
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
          { key: 'quantity', value_number: 2, unit: 'TRUCK' },
          { key: 'date', value_text: '2026-10-13' },
          { key: 'window_from', value_text: '15:00' },
          { key: 'window_to', value_text: '17:00' },
        ],
      })
      .expect(201)
  ).body;
  await http.post(`/communication/drafts/${d.message.message_id}/approve`).set(ACTOR, w.humanId).send({ content_hash: d.message.content_hash }).expect(200);
  await http.post(`/communication/drafts/${d.message.message_id}/send`).set(ACTOR, w.humanId).send({ content_hash: d.message.content_hash }).expect(200);
  return d.message.message_id as string;
}

const status = async (id: string) => (await http.get(`/communication/drafts/${id}`).expect(200)).body.message.status as string;
const successes = async (id: string) => (await db.query("SELECT count(*)::int AS n FROM cera.send_attempt WHERE message_id = $1 AND result = 'SUCCESS'", [id])).rows[0].n as number;
const sentCount = async (id: string) => (await mock.sentRecords()).filter((r) => r.headers['X-CERA-Message'] === id).length;
async function until(check: () => Promise<boolean>, ms = 5_000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

describe('Redis execution queue (T-121)', () => {
  it('requires a reachable Redis for this file', () => {
    if (!redisUp) console.warn(`Redis not reachable at ${REDIS_URL} — queue tests skipped`);
    expect(true).toBe(true);
  });

  it('a send request is delivered through the queue without waiting for the poll (no tick)', async () => {
    if (!redisUp) return;
    expect(runner.startQueueConsumer()).toBe(true);
    const id = await queuedMessage();
    const t0 = Date.now();
    expect(await until(async () => (await status(id)) === 'SENT')).toBe(true);
    expect(Date.now() - t0).toBeLessThan(5_000);
    expect(await successes(id)).toBe(1);
    expect(await sentCount(id)).toBe(1);
  });

  it('the same job delivered twice (and concurrently) sends once — DB idempotency, not the queue', async () => {
    if (!redisUp) return;
    const id = await queuedMessage();
    const job = { job_type: 'OUTBOX_SEND' as const, entity_id: id, trace_id: null, attempt: 1 };
    await Promise.all([runner.handleJob(job), runner.handleJob(job), runner.handleJob(job)]);
    await runner.handleJob(job);
    await until(async () => (await status(id)) === 'SENT');
    expect(await successes(id)).toBe(1);
    expect(await sentCount(id)).toBe(1);
  });

  it('a transient failure schedules a delayed retry job in Redis (reference only, no content)', async () => {
    if (!redisUp) return;
    mock.setFault('transient');
    try {
      const id = await queuedMessage();
      await runner.handleJob({ job_type: 'OUTBOX_SEND', entity_id: id, trace_id: null, attempt: 1 });
      const q = new Queue(QUEUE, { connection: admin });
      expect(await until(async () => (await q.getDelayed()).some((j) => j.data.entity_id === id))).toBe(true);
      const delayed = (await q.getDelayed()).find((j) => j.data.entity_id === id)!;
      expect(Object.keys(delayed.data).sort()).toEqual(['attempt', 'entity_id', 'job_type', 'trace_id']);
      expect(delayed.data).toMatchObject({ job_type: 'OUTBOX_SEND', attempt: 2 });
      expect(delayed.opts.delay).toBeGreaterThan(50_000); // 재시도 간격(CERA_SEND_RETRY_BASE_MS 60초) 뒤
      expect(await status(id)).toBe('QUEUED'); // DB 정본: 재시도 대기
    } finally {
      mock.setFault('none');
    }
  });

  it('Redis wiped (restart without persistence) → the lost job is recovered by PostgreSQL polling', async () => {
    if (!redisUp) return;
    const consumerless = await NestFactory.createApplicationContext(WorkerModule.forRoot(env({ CERA_QUEUE_NAME: `${QUEUE}-lost` })), { logger: false });
    const apiLost = await createApiApp(env({ CERA_QUEUE_NAME: `${QUEUE}-lost` }));
    await apiLost.init();
    try {
      const h = request(apiLost.getHttpServer());
      const w = await world();
      const d = (
        await h.post('/communication/drafts').send({ address_id: w.addressId, intent: 'TRUCK_SLOT', target_id: w.truckPoolId, source_run_id: w.runId, values: [{ key: 'quantity', value_number: 1, unit: 'TRUCK' }, { key: 'date', value_text: '2026-10-13' }, { key: 'window_from', value_text: '15:00' }, { key: 'window_to', value_text: '17:00' }] }).expect(201)
      ).body;
      await h.post(`/communication/drafts/${d.message.message_id}/approve`).set(ACTOR, w.humanId).send({ content_hash: d.message.content_hash }).expect(200);
      await h.post(`/communication/drafts/${d.message.message_id}/send`).set(ACTOR, w.humanId).send({ content_hash: d.message.content_hash }).expect(200);
      const q = new Queue(`${QUEUE}-lost`, { connection: admin });
      expect(await until(async () => (await q.getWaitingCount()) > 0)).toBe(true);
      await q.obliterate({ force: true }); // 작업 유실(=Redis 초기화)
      expect(await q.getWaitingCount()).toBe(0);
      expect(await status(d.message.message_id)).toBe('QUEUED'); // 업무 상태는 DB 에 그대로
      await runner.tick(); // 폴링(정확성 경로)
      expect(await status(d.message.message_id)).toBe('SENT');
      expect(await successes(d.message.message_id)).toBe(1);
    } finally {
      await new Promise((r) => setTimeout(r, 1_000)); // 승인 알림 처리기가 끝난 뒤 닫는다
      await apiLost.close();
      await consumerless.close();
    }
  });

  it('Redis down: the business request still succeeds (enqueue fails quietly) and polling sends', async () => {
    if (!redisUp) return;
    const apiDown = await createApiApp(env({ CERA_REDIS_URL: 'redis://127.0.0.1:1', CERA_QUEUE_NAME: `${QUEUE}-down` }));
    await apiDown.init();
    try {
      const queue = apiDown.get<ExecutionQueue>(EXECUTION_QUEUE);
      expect(await queue.status()).toBe('down');
      const h = request(apiDown.getHttpServer());
      const w = await world();
      const d = (
        await h.post('/communication/drafts').send({ address_id: w.addressId, intent: 'TRUCK_SLOT', target_id: w.truckPoolId, source_run_id: w.runId, values: [{ key: 'quantity', value_number: 1, unit: 'TRUCK' }, { key: 'date', value_text: '2026-10-13' }, { key: 'window_from', value_text: '15:00' }, { key: 'window_to', value_text: '17:00' }] }).expect(201)
      ).body;
      await h.post(`/communication/drafts/${d.message.message_id}/approve`).set(ACTOR, w.humanId).send({ content_hash: d.message.content_hash }).expect(200);
      const t0 = Date.now();
      await h.post(`/communication/drafts/${d.message.message_id}/send`).set(ACTOR, w.humanId).send({ content_hash: d.message.content_hash }).expect(200);
      expect(Date.now() - t0).toBeLessThan(3_000); // 큐가 죽어도 업무 요청을 붙잡지 않는다
      await runner.tick();
      expect(await status(d.message.message_id)).toBe('SENT');
    } finally {
      await new Promise((r) => setTimeout(r, 1_000));
      await apiDown.close();
    }
  });
});
