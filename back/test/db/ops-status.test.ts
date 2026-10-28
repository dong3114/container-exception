import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type pg from 'pg';
import request from 'supertest';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/app/create-api.js';
import { WorkerModule, WorkerRunner } from '../../src/app/worker.module.js';
import { hashPassword } from '../../src/auth/password.js';
import type { UserRole } from '../../src/auth/permissions.js';
import { T0, actor, approve, outboundMessage, registry, thread, transition } from './fixtures.js';
import { appPool, testEnv } from './support.js';

/**
 * T-133 운영 화면의 시스템 상태 — 실제 PostgreSQL · API · Worker 로:
 * 권한(ADMIN · OPERATOR 만, 데모 방문자 · 현장 담당자 403) · Worker heartbeat(주기마다 DB 에 남김 → 정상, 오래되면 멈춤 = 사람 조치 필요) ·
 * Redis 없음 = 대체(폴링) 표시 · AI 미응답 = DEGRADED(업무 사실 그대로) · 대기 작업은 PostgreSQL 기준 · 응답에 주소 · 키 · 경로 없음 · 배포 모드.
 */
const PASSWORD = 'correct horse battery staple';
const CLOSED_PORT = 'http://127.0.0.1:9'; // 닫힌 포트 — AI Server 가 없는 상태

let api: INestApplication;
let http: ReturnType<typeof request>;
let worker: INestApplicationContext;
let db: pg.Pool;
const cookies: Partial<Record<UserRole, string>> = {};

async function sessionFor(role: UserRole): Promise<string> {
  const actorId = await actor(db, 'HUMAN');
  const login = `ops-${role.toLowerCase()}-${v7().slice(-8)}`;
  await db.query(
    `INSERT INTO cera.user_account (user_id, actor_id, login_id, role, password_hash, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, true, $6, $6)`,
    [v7(), actorId, login, role, await hashPassword(PASSWORD), T0],
  );
  const res = await http.post('/auth/login').send({ login_id: login, password: PASSWORD }).expect(200);
  return (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
}

const status = async (role: UserRole = 'ADMIN') => (await http.get('/ops/system-status').set('Cookie', cookies[role]!).expect(200)).body;

beforeAll(async () => {
  const env = testEnv({ CERA_AUTH_MODE: 'session', CERA_AI_SERVER_URL: CLOSED_PORT, CERA_AGENT_RUNTIME_URL: CLOSED_PORT, CERA_BUILD_COMMIT: 'abc1234' });
  api = await createApiApp(env);
  await api.init();
  http = request(api.getHttpServer());
  db = appPool();
  await actor(db, 'SYSTEM');
  for (const role of ['ADMIN', 'OPERATOR', 'FIELD_OPERATOR', 'DEMO_VISITOR'] as const) cookies[role] = await sessionFor(role);
  worker = await NestFactory.createApplicationContext(WorkerModule.forRoot(testEnv({ CERA_AI_SERVER_URL: CLOSED_PORT, CERA_AGENT_RUNTIME_URL: CLOSED_PORT })), { logger: false });
});

afterAll(async () => {
  await worker?.get(WorkerRunner).releaseLock();
  await worker?.close();
  await api.close();
  await db.end();
});

describe('T-133 operations system status', () => {
  it('only ADMIN and OPERATOR may read it — the demo visitor and field operator get 403 from the Backend', async () => {
    await status('ADMIN');
    await status('OPERATOR');
    expect((await http.get('/ops/system-status').set('Cookie', cookies.DEMO_VISITOR!)).status).toBe(403);
    expect((await http.get('/ops/system-status').set('Cookie', cookies.FIELD_OPERATOR!)).status).toBe(403);
    expect((await http.get('/ops/system-status')).status).toBe(401);
    const me = (await http.get('/auth/me').set('Cookie', cookies.DEMO_VISITOR!).expect(200)).body;
    expect(me.permissions).not.toContain('system.monitor');
    expect(me.deployment_mode).toBe('LOCAL');
  });

  it('a worker cycle leaves a heartbeat → worker HEALTHY; Redis off shows the PostgreSQL fallback; AI down is DEGRADED, not DOWN', async () => {
    await worker.get(WorkerRunner).tick();
    const s = await status();
    expect(s.mode).toBe('LOCAL');
    expect(s.core.api).toMatchObject({ level: 'HEALTHY', commit: 'abc1234' });
    expect(s.core.database).toMatchObject({ level: 'HEALTHY', connected: true });
    expect(s.core.worker.level).toBe('HEALTHY');
    expect(s.core.worker.last_seen_seconds_ago).toBeLessThan(30);
    expect(s.core.redis).toMatchObject({ level: 'DISABLED', fallback: 'POSTGRES_POLLING' });
    expect(s.core.ai_server).toMatchObject({ level: 'DOWN', reachable: false });
    expect(s.integrations.llm.level).toBe('DOWN');
    expect(s.integrations.gmail.level).toBe('DISABLED');
    expect(s.overall.status).toBe('DEGRADED');
    expect(s.overall.reasons).toContain('AI_UNAVAILABLE');
  });

  it('a stale heartbeat means the worker stopped → worker DOWN, overall ACTION_REQUIRED; the next cycle brings it back', async () => {
    await db.query("UPDATE cera.runtime_heartbeat SET started_at = now() - interval '10 minutes', last_seen_at = now() - interval '2 minutes' WHERE component = 'WORKER'");
    let s = await status();
    expect(s.core.worker.level).toBe('DOWN');
    expect(s.core.worker.last_seen_seconds_ago).toBeGreaterThanOrEqual(110);
    expect(s.overall).toMatchObject({ status: 'ACTION_REQUIRED', reasons: ['WORKER_DOWN'] });
    await db.query("UPDATE cera.runtime_heartbeat SET last_seen_at = now() - interval '45 seconds' WHERE component = 'WORKER'");
    expect((await status()).core.worker.level).toBe('DEGRADED');
    await worker.get(WorkerRunner).tick();
    s = await status();
    expect(s.core.worker.level).toBe('HEALTHY');
    expect(s.overall.status).not.toBe('ACTION_REQUIRED');
  });

  it('waiting work is counted from PostgreSQL (the source), with the oldest age', async () => {
    const before = (await status()).queues.send.count as number;
    const r = await registry(db);
    const m = await outboundMessage(db, r, await thread(db, r));
    await approve(db, r, m);
    await transition(db, m.messageId, 'APPROVED', r.humanId);
    await transition(db, m.messageId, 'QUEUED', r.humanId);
    const s = await status();
    expect(s.queues.send.count).toBe(before + 1);
    expect(s.queues.send.oldest_age_seconds).toBeGreaterThan(0);
    for (const k of ['extraction', 'extraction_retry', 'agent_retry']) expect(s.queues[k]).toHaveProperty('count');
  });

  it('never exposes hosts, ports, paths, URLs or secrets', async () => {
    const text = JSON.stringify(await status());
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).not.toMatch(/127\.0\.0\.1|localhost|postgres(ql)?:|redis:/i);
    expect(text).not.toMatch(/[A-Za-z]:\\|\/home\/|\/var\//);
    expect(text).not.toMatch(/token|password|secret|api_key/i);
    const rt = (await http.get('/agent-runs/runtime').set('Cookie', cookies.ADMIN!).expect(200)).body;
    expect(rt).not.toHaveProperty('runtime_url');
  });
});
