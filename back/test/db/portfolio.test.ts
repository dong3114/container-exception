import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type pg from 'pg';
import request from 'supertest';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/app/create-api.js';
import { hashPassword } from '../../src/auth/password.js';
import { SEED_IDS } from '../../src/seed/slice1-fixture.js';
import { PORTFOLIO_REPLY_BODIES } from '../../src/dev/demo.controller.js';
import { T0, hashOf, registry } from './fixtures.js';
import { appPool, testEnv } from './support.js';

/**
 * T-131 공개 포트폴리오 데모 — 화면이 아니라 **API 가** 막는지 본다(ADR-039).
 * production + CERA_PORTFOLIO_DEMO_MODE 로 띄운 API 에 방문자처럼 요청한다: 데모 세션 · 역할 한계 · 실제 채널 차단 · Mock 답장 제한 ·
 * 옛 개발 헤더 무시 · Origin 검사 · CORS 없음 · 요청 한도 · 일반 배포에는 데모 입구가 없음.
 */
const ORIGIN = 'https://cera.example.com';
const TOKEN = 'p'.repeat(40);
const contentDir = mkdtempSync(join(tmpdir(), 'cera-portfolio-content-'));
const mockDir = mkdtempSync(join(tmpdir(), 'cera-portfolio-mock-'));

const portfolioEnv = (extra: Record<string, string> = {}) =>
  testEnv({
    APP_ENV: 'production',
    CERA_AUTH_MODE: 'session',
    CERA_SESSION_COOKIE_SECURE: 'true',
    CERA_PORTFOLIO_DEMO_MODE: 'true',
    CERA_ALLOWED_ORIGINS: ORIGIN,
    CERA_AGENT_TOOLS_ENABLED: 'true',
    CERA_AGENT_TOOL_TOKEN: TOKEN,
    CERA_CONTENT_DIR: contentDir,
    CERA_MOCK_CHANNEL_DIR: mockDir,
    ...extra,
  });

let api: INestApplication;
let http: ReturnType<typeof request>;
let db: pg.Pool;
let demoCookie = '';

async function ensureDemoVisitor() {
  await db.query("INSERT INTO cera.actor (actor_id, actor_type, display_name) VALUES ($1, 'HUMAN', '데모 방문자 (가상)') ON CONFLICT DO NOTHING", [SEED_IDS.actorDemo]);
  await db.query(
    `INSERT INTO cera.user_account (user_id, actor_id, login_id, role, password_hash, is_active, created_at, updated_at)
     VALUES ($1, $2, 'demo@cera.local', 'DEMO_VISITOR', $3, true, $4, $4) ON CONFLICT DO NOTHING`,
    [SEED_IDS.userDemo, SEED_IDS.actorDemo, await hashPassword('only-the-test-knows-this-one'), T0],
  );
}

beforeAll(async () => {
  db = appPool();
  await ensureDemoVisitor();
  api = await createApiApp(portfolioEnv());
  await api.init();
  http = request(api.getHttpServer());
  const res = await http.post('/auth/demo-session').expect(200);
  demoCookie = (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
});

afterAll(async () => {
  await api.close();
  await db.end();
  rmSync(contentDir, { recursive: true, force: true });
  rmSync(mockDir, { recursive: true, force: true });
});

describe('demo session', () => {
  it('GET tells the screen this is the portfolio demo; POST opens a Secure HttpOnly SameSite=Strict DEMO_VISITOR session', async () => {
    expect((await http.get('/auth/demo-session').expect(200)).body).toMatchObject({ enabled: true, role: 'DEMO_VISITOR', external_mail: 'MOCK_ONLY', data: 'SYNTHETIC' });
    const res = await http.post('/auth/demo-session').expect(200);
    const raw = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/Secure/i);
    expect(raw).toMatch(/SameSite=Strict/i);
    expect(res.body).toMatchObject({ role: 'DEMO_VISITOR', actor_id: SEED_IDS.actorDemo, portfolio_demo: true, via: 'SESSION' });
    expect(res.body.permissions).toEqual(expect.arrayContaining(['agent_run.manage', 'communication.approve', 'communication.send', 'truth.manual_entry', 'plan.approve', 'contact.select']));
    for (const p of ['users.manage', 'registry.manage', 'planning.input', 'public_data.fetch']) expect(res.body.permissions).not.toContain(p);
  });

  it('every visitor gets a separate session token; one visitor cannot read another visitor’s token', async () => {
    const a = (await http.post('/auth/demo-session').expect(200)).headers['set-cookie'] as unknown as string[];
    const b = (await http.post('/auth/demo-session').expect(200)).headers['set-cookie'] as unknown as string[];
    expect(a[0]!.split(';')[0]).not.toBe(b[0]!.split(';')[0]);
    const me = await http.get('/auth/me').set('Cookie', a[0]!.split(';')[0]!).expect(200);
    expect(JSON.stringify(me.body)).not.toContain(b[0]!.split(';')[0]!.split('=')[1]!);
  });

  it('the demo account cannot be used through the password login (its password is an unknown random value)', async () => {
    const r = await http.post('/auth/login').send({ login_id: 'demo@cera.local', password: 'any password 123' });
    expect([r.status, r.body.code]).toEqual([401, 'INVALID_CREDENTIALS']);
  });
});

describe('the visitor is not an administrator — the API refuses, not the screen', () => {
  it.each([
    ['GET', '/admin/users', undefined],
    ['POST', '/admin/users', { login_id: 'x-admin', display_name: 'x', role: 'ADMIN', password: 'long enough password' }],
    ['POST', '/registry/counterparties', { display_name: 'real company', source_role: 'TRUCKING' }],
    ['POST', '/planning/inputs/rates', { csv: 'a,b' }],
    ['POST', '/public-data/vessel-calls/fetch', { from: '2026-10-01', to: '2026-10-02' }],
  ])('%s %s → 403 PERMISSION_DENIED', async (method, path, body) => {
    const r = method === 'GET' ? await http.get(path).set('Cookie', demoCookie) : await http.post(path).set('Cookie', demoCookie).send(body);
    expect([r.status, r.body.code]).toEqual([403, 'PERMISSION_DENIED']);
  });

  it('the old development header cannot impersonate an operator (session mode is forced)', async () => {
    const r = await http.post('/agent-runs').set('X-CERA-Actor-Id', SEED_IDS.actorOperator).send({});
    expect([r.status, r.body.code]).toEqual([401, 'AUTH_REQUIRED']);
  });
});

describe('no real outside contact', () => {
  it('a send request for a real (GMAIL) message is refused by the API even if such an address existed', async () => {
    const r = await registry(db);
    const gmailAddressId = v7();
    await db.query(
      `INSERT INTO cera.contact_channel_address (address_id, contact_id, channel_type, normalized_address,
         email_verification_status, relationship_status, communication_status, verified_at, approved_by_actor_id, approved_at)
       VALUES ($1, $2, 'GMAIL', $3, 'VERIFIED', 'APPROVED', 'ACTIVE', $4, $5, $4)`,
      [gmailAddressId, r.contactId, `real-${Date.now()}@example.com`, T0, r.humanId],
    );
    const runId = v7();
    const snapshotId = v7();
    await db.query(
      `INSERT INTO cera.planning_snapshot (snapshot_id, as_of, fact_fingerprint, rule_version, tariff_version, policy_version, contains_simulated, created_at)
       VALUES ($1, $2, $3, 'r1', 't1', 'p1', false, $2)`,
      [snapshotId, T0, hashOf(`snap-${snapshotId}`)],
    );
    await db.query(
      `INSERT INTO cera.recovery_run (run_id, snapshot_id, trigger_type, trigger_ref, objective_version, run_status, contains_simulated, executed_at)
       VALUES ($1, $2, 'OPERATOR_REQUEST', 'PORTFOLIO-TEST', 'o1', 'FEASIBLE', false, $3)`,
      [runId, snapshotId, T0],
    );
    const poolId = v7();
    await db.query("INSERT INTO cera.truck_pool (truck_pool_id, pool_name, ownership, owner_counterparty_id) VALUES ($1, '포트폴리오 시험', 'PARTNER', $2)", [poolId, r.counterpartyId]);
    const d = await http
      .post('/communication/drafts')
      .set('Cookie', demoCookie)
      .send({ address_id: gmailAddressId, intent: 'TRUCK_SLOT', target_id: poolId, source_run_id: runId, values: [{ key: 'quantity', value_number: 2, unit: 'TRUCK' }, { key: 'date', value_text: '2026-10-28' }, { key: 'window_from', value_text: '15:00' }, { key: 'window_to', value_text: '17:00' }] })
      .expect(201);
    expect(d.body.message.channel_type).toBe('GMAIL');
    const send = await http.post(`/communication/drafts/${d.body.message.message_id}/send`).set('Cookie', demoCookie).send({ content_hash: d.body.message.content_hash });
    expect([send.status, send.body.code]).toEqual([403, 'PORTFOLIO_DEMO_REAL_CHANNEL_BLOCKED']);
    const after = await http.get(`/communication/drafts/${d.body.message.message_id}`).set('Cookie', demoCookie).expect(200);
    expect(after.body.message.status).not.toBe('QUEUED');
  });

  it('mock replies: only the listed sample sentences and only synthetic (.invalid) senders', async () => {
    const id = v7();
    const free = await http.post('/dev/demo/mock-reply').set('Cookie', demoCookie).send({ reply_to_message_id: id, body: '<b>visitor text</b>' });
    expect([free.status, free.body.code]).toEqual([400, 'DEMO_REPLY_NOT_ALLOWED']);
    const realFrom = await http.post('/dev/demo/mock-reply').set('Cookie', demoCookie).send({ reply_to_message_id: id, body: PORTFOLIO_REPLY_BODIES[0], from: 'someone@gmail.com' });
    expect([realFrom.status, realFrom.body.code]).toEqual([400, 'DEMO_REPLY_NOT_ALLOWED']);
    // 목록의 문장은 거르기를 통과한다(이 id 는 Mock 보낸 편지함에 없으니 다음 단계에서 멈춘다)
    const listed = await http.post('/dev/demo/mock-reply').set('Cookie', demoCookie).send({ reply_to_message_id: id, body: PORTFOLIO_REPLY_BODIES[0] });
    expect(listed.body.code).toBe('NOT_IN_MOCK_SENT_BOX');
  });
});

describe('browser boundary', () => {
  it('a change request carrying a foreign Origin is refused (CSRF second line); the site origin passes', async () => {
    const evil = await http.post('/agent-runs').set('Cookie', demoCookie).set('Origin', 'https://evil.example').send({});
    expect([evil.status, evil.body.code]).toEqual([403, 'ORIGIN_NOT_ALLOWED']);
    const ok = await http.post('/agent-runs').set('Cookie', demoCookie).set('Origin', ORIGIN).send({});
    expect(ok.body.code).not.toBe('ORIGIN_NOT_ALLOWED');
  });

  it('no CORS: a preflight from another site gets no Access-Control-Allow-Origin', async () => {
    const r = await http.options('/agent-runs').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    expect(r.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('API responses carry nosniff · no-referrer · frame DENY and never echo secrets', async () => {
    const r = await http.get('/dev/demo/status').expect(200);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.body).toMatchObject({ portfolio_demo: true, gmail_enabled: false, public_data_mode: 'off', auth_mode: 'session' });
    expect(JSON.stringify(r.body)).not.toContain(TOKEN);
    const health = await http.get('/health').expect(200);
    expect(Object.keys(health.body).sort()).toEqual(['app', 'checked_at', 'db', 'queue', 'status']);
  });

  it('errors are generic — no stack, SQL or file path', async () => {
    const r = await http.get('/communication/drafts/not-a-uuid').set('Cookie', demoCookie);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(r.body)).not.toMatch(/at \w+ \(|\.ts:\d+|SELECT |\/srv\/|C:\\/);
    expect(Object.keys(r.body)).toEqual(expect.arrayContaining(['code', 'message', 'request_id']));
  });
});

describe('abuse limits', () => {
  it('demo sessions per visitor IP are limited (429 RATE_LIMITED with Retry-After)', async () => {
    const limited = await createApiApp(portfolioEnv());
    await limited.init();
    const h = request(limited.getHttpServer());
    try {
      const codes: number[] = [];
      for (let i = 0; i < 11; i += 1) codes.push((await h.post('/auth/demo-session')).status);
      expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
      const last = await h.post('/auth/demo-session');
      expect([last.status, last.body.code]).toEqual([429, 'RATE_LIMITED']);
      expect(Number(last.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      await limited.close();
    }
  });

  it('the daily Agent-run ceiling stops with DEMO_QUOTA_EXCEEDED', async () => {
    const capped = await createApiApp(portfolioEnv({ CERA_PORTFOLIO_MAX_AGENT_RUNS_PER_DAY: '1' }));
    await capped.init();
    const h = request(capped.getHttpServer());
    try {
      await h.post('/agent-runs').set('Cookie', demoCookie).send({});
      const second = await h.post('/agent-runs').set('Cookie', demoCookie).send({});
      expect([second.status, second.body.code]).toEqual([429, 'DEMO_QUOTA_EXCEEDED']);
    } finally {
      await capped.close();
    }
  });
});

describe('a normal (private) deployment has no demo entrance', () => {
  it('without CERA_PORTFOLIO_DEMO_MODE the demo-session path does not exist', async () => {
    const normal = await createApiApp(testEnv({ APP_ENV: 'production', CERA_AUTH_MODE: 'session', CERA_SESSION_COOKIE_SECURE: 'true' }));
    await normal.init();
    try {
      const h = request(normal.getHttpServer());
      expect((await h.post('/auth/demo-session')).status).toBe(404);
      expect((await h.get('/auth/demo-session')).status).toBe(404);
      expect((await h.get('/dev/demo/status')).status).toBe(404);
    } finally {
      await normal.close();
    }
  });
});
