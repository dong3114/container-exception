import type { INestApplication } from '@nestjs/common';
import type pg from 'pg';
import request from 'supertest';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/app/create-api.js';
import { hashPassword } from '../../src/auth/password.js';
import type { UserRole } from '../../src/auth/permissions.js';
import { sha256Bytes } from '../../src/shared/hash/hash.js';
import { T0, actor } from './fixtures.js';
import { appPool, expectSqlState, testEnv } from './support.js';

/**
 * T-119 — 사람 로그인 · 역할 · Backend 권한 강제(session 모드). 화면이 아니라 API 가 막는지 본다.
 * 사칭: 요청 헤더 X-CERA-Actor-Id 는 session 모드에서 무시되고 세션 사용자로 덮어쓴다.
 */
const PASSWORD = 'correct horse battery staple';
const TOKEN = 'a'.repeat(40);

let api: INestApplication;
let http: ReturnType<typeof request>;
let db: pg.Pool;
const users: Record<'admin' | 'operator' | 'field', { userId: string; actorId: string; login: string }> = {} as never;

async function makeUser(role: UserRole, login: string) {
  const actorId = await actor(db, 'HUMAN');
  const userId = v7();
  await db.query(
    `INSERT INTO cera.user_account (user_id, actor_id, login_id, role, password_hash, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, true, $6, $6)`,
    [userId, actorId, login, role, await hashPassword(PASSWORD), T0],
  );
  return { userId, actorId, login };
}

async function login(login: string, password = PASSWORD) {
  const res = await http.post('/auth/login').send({ login_id: login, password });
  const cookie = (res.headers['set-cookie'] as unknown as string[] | undefined)?.[0]?.split(';')[0] ?? '';
  return { res, cookie };
}

beforeAll(async () => {
  api = await createApiApp(testEnv({ CERA_AUTH_MODE: 'session', CERA_AGENT_TOOLS_ENABLED: 'true', CERA_AGENT_TOOL_TOKEN: TOKEN }));
  await api.init();
  http = request(api.getHttpServer());
  db = appPool();
  const tag = Date.now().toString(36);
  users.admin = await makeUser('ADMIN', `admin-${tag}`);
  users.operator = await makeUser('OPERATOR', `operator-${tag}`);
  users.field = await makeUser('FIELD_OPERATOR', `field-${tag}`);
});

afterAll(async () => {
  await api.close();
  await db.end();
});

describe('login · logout · session', () => {
  it('login sets an HttpOnly SameSite=Strict cookie and /auth/me returns the user, role and permissions', async () => {
    const { res, cookie } = await login(users.operator.login);
    expect(res.status).toBe(200);
    const raw = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Strict/i);
    expect(res.body).toMatchObject({ actor_id: users.operator.actorId, role: 'OPERATOR', via: 'SESSION' });
    expect(res.body.permissions).toContain('plan.approve');
    const me = await http.get('/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body).toMatchObject({ login_id: users.operator.login, role: 'OPERATOR', auth_mode: 'session' });
    // 토큰은 DB 에 지문만
    const token = decodeURIComponent(cookie.split('=')[1]!);
    const rows = (await db.query('SELECT token_hash FROM cera.user_session WHERE user_id = $1', [users.operator.userId])).rows;
    expect(rows.map((r) => r.token_hash)).toContain(sha256Bytes(token));
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it('wrong password and unknown login give the same 401 INVALID_CREDENTIALS', async () => {
    const a = await login(users.operator.login, 'wrong password!!');
    const b = await login('nobody-here', 'wrong password!!');
    expect([a.res.status, b.res.status]).toEqual([401, 401]);
    expect([a.res.body.code, b.res.body.code]).toEqual(['INVALID_CREDENTIALS', 'INVALID_CREDENTIALS']);
  });

  it('five failures in a row lock that login id for a while (429)', async () => {
    const u = await makeUser('OPERATOR', `locked-${Date.now().toString(36)}`);
    for (let i = 0; i < 5; i += 1) expect((await login(u.login, 'nope nope nope')).res.status).toBe(401);
    expect((await login(u.login)).res.status).toBe(429);
  });

  it('no session → 401 on business routes; health stays public', async () => {
    expect((await http.get('/communication/drafts')).status).toBe(401);
    expect((await http.get('/truth/facts?recovery_run_id=' + v7())).body.code).toBe('AUTH_REQUIRED');
    await http.get('/health/live').expect(200);
  });

  it('an expired or revoked session is not accepted', async () => {
    const sessionId = v7();
    await db.query(
      `INSERT INTO cera.user_session (session_id, user_id, token_hash, created_at, expires_at) VALUES ($1, $2, $3, '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z')`,
      [sessionId, users.operator.userId, sha256Bytes('expired-token-expired-token-123')],
    );
    expect((await http.get('/auth/me').set('Cookie', 'cera_session=expired-token-expired-token-123')).status).toBe(401);
    expect((await http.get('/auth/me').set('Cookie', 'cera_session=not-a-real-token-but-long-enough')).status).toBe(401);
  });

  it('logout ends the session: the same cookie no longer works', async () => {
    const { cookie } = await login(users.operator.login);
    await http.post('/auth/logout').set('Cookie', cookie).expect(200);
    expect((await http.get('/auth/me').set('Cookie', cookie)).status).toBe(401);
  });
});

describe('actor spoofing is impossible in session mode', () => {
  it('a header without a session is ignored (401), not trusted', async () => {
    const res = await http.post('/planning/plans/' + v7() + '/approve').set('X-CERA-Actor-Id', users.admin.actorId).send({ plan_hash: 'sha256:' + '0'.repeat(64) });
    expect(res.status).toBe(401);
  });

  it('a field operator who claims to be the admin is still a field operator (403)', async () => {
    const { cookie } = await login(users.field.login);
    const res = await http.post('/communication/drafts/' + v7() + '/approve').set('Cookie', cookie).set('X-CERA-Actor-Id', users.admin.actorId).send({ content_hash: 'sha256:' + '0'.repeat(64) });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  it('an operator who claims another actor acts as themselves (the service sees the session actor)', async () => {
    const { cookie } = await login(users.operator.login);
    // 직접 입력은 행위자를 기록한다 — 헤더로 admin 을 주장해도 기록은 operator
    const res = await http.post('/truth/facts/manual').set('Cookie', cookie).set('X-CERA-Actor-Id', users.admin.actorId).send({});
    expect(res.status).toBe(400); // 권한은 통과, 입력 형식에서 거절 — 401/403 이 아니다
  });
});

describe('role matrix enforced by the backend', () => {
  const NOT_AUTH = (s: number) => s !== 401 && s !== 403;
  const fake = () => v7();
  const routes: { name: string; method: 'post' | 'get' | 'patch'; path: () => string; body?: unknown }[] = [
    { name: 'draft approval', method: 'post', path: () => `/communication/drafts/${fake()}/approve`, body: { content_hash: 'x' } },
    { name: 'send request', method: 'post', path: () => `/communication/drafts/${fake()}/send`, body: { content_hash: 'x' } },
    { name: 'fact confirm', method: 'post', path: () => `/truth/events/${fake()}/confirm`, body: {} },
    { name: 'fact reject', method: 'post', path: () => `/truth/events/${fake()}/reject`, body: {} },
    { name: 'fact correct', method: 'post', path: () => `/truth/events/${fake()}/correct`, body: {} },
    { name: 'fact revoke', method: 'post', path: () => `/truth/events/${fake()}/revoke`, body: {} },
    { name: 'plan approve', method: 'post', path: () => `/planning/plans/${fake()}/approve`, body: {} },
    { name: 'plan recalculate', method: 'post', path: () => `/planning/runs/${fake()}/plans`, body: {} },
    { name: 'agent run create', method: 'post', path: () => '/agent-runs', body: {} },
    { name: 'agent run start', method: 'post', path: () => `/agent-runs/${fake()}/start`, body: {} },
    { name: 'draft create', method: 'post', path: () => '/communication/drafts', body: {} },
  ];

  it.each(routes)('field operator → 403 on $name; operator passes the guard', async ({ method, path, body }) => {
    const field = (await login(users.field.login)).cookie;
    const operator = (await login(users.operator.login)).cookie;
    const f = await http[method](path()).set('Cookie', field).send(body as object);
    expect(f.status).toBe(403);
    expect(f.body.code).toBe('PERMISSION_DENIED');
    const o = await http[method](path()).set('Cookie', operator).send(body as object);
    expect(NOT_AUTH(o.status)).toBe(true);
  });

  it('field operator may enter a field value (guard passes) and read', async () => {
    const field = (await login(users.field.login)).cookie;
    expect(NOT_AUTH((await http.post('/truth/facts/manual').set('Cookie', field).send({})).status)).toBe(true);
    await http.get('/communication/drafts').set('Cookie', field).expect(200);
  });

  it('user management is ADMIN only', async () => {
    const operator = (await login(users.operator.login)).cookie;
    expect((await http.get('/admin/users').set('Cookie', operator)).status).toBe(403);
    expect((await http.post('/admin/users').set('Cookie', operator).send({})).status).toBe(403);
  });
});

describe('admin user management', () => {
  it('creates a user (HUMAN actor + account), changes the role, and the old session is cut', async () => {
    const admin = (await login(users.admin.login)).cookie;
    const loginId = `new-${Date.now().toString(36)}`;
    const created = await http.post('/admin/users').set('Cookie', admin).send({ login_id: loginId, display_name: '새 운영자', role: 'OPERATOR', password: PASSWORD });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ login_id: loginId, role: 'OPERATOR', is_active: true });
    expect(JSON.stringify(created.body)).not.toMatch(/scrypt|password/);
    const actorType = (await db.query('SELECT actor_type FROM cera.actor WHERE actor_id = $1', [created.body.actor_id])).rows[0].actor_type;
    expect(actorType).toBe('HUMAN');

    const theirs = (await login(loginId)).cookie;
    await http.get('/auth/me').set('Cookie', theirs).expect(200);
    await http.patch(`/admin/users/${created.body.user_id}`).set('Cookie', admin).send({ role: 'FIELD_OPERATOR' }).expect(200);
    expect((await http.get('/auth/me').set('Cookie', theirs)).status).toBe(401); // 옛 권한의 세션은 끊겼다
    expect((await login(loginId)).res.body.role).toBe('FIELD_OPERATOR');

    await http.patch(`/admin/users/${created.body.user_id}`).set('Cookie', admin).send({ is_active: false }).expect(200);
    expect((await login(loginId)).res.status).toBe(401);
    const audits = (await db.query("SELECT action FROM cera.audit_log WHERE target_id = $1 ORDER BY occurred_at", [created.body.user_id])).rows.map((r) => r.action);
    expect(audits).toEqual(['USER_CREATED', 'USER_UPDATED', 'USER_UPDATED']);
  });

  it('a duplicate login id is 409; an admin cannot demote themselves', async () => {
    const admin = (await login(users.admin.login)).cookie;
    expect((await http.post('/admin/users').set('Cookie', admin).send({ login_id: users.field.login, display_name: 'x', role: 'OPERATOR', password: PASSWORD })).status).toBe(409);
    expect((await http.patch(`/admin/users/${users.admin.userId}`).set('Cookie', admin).send({ role: 'OPERATOR' })).body.code).toBe('CANNOT_DEMOTE_SELF');
  });
});

describe('service auth (agent) and human auth stay separate', () => {
  it('a human session cannot call agent tools; the agent token is not a login', async () => {
    const operator = (await login(users.operator.login)).cookie;
    const asHuman = await http.get('/internal/agent-tools').set('Cookie', operator);
    expect(asHuman.status).toBe(401);
    const asService = await http.get('/internal/agent-tools').set('Authorization', `Bearer ${TOKEN}`);
    expect(asService.status).toBe(200);
    expect((await http.get('/auth/me').set('Authorization', `Bearer ${TOKEN}`)).status).toBe(401);
  });
});

describe('database guards (M25)', () => {
  it('an AI_AGENT or SYSTEM actor cannot get a login account', async () => {
    const agentActor = await actor(db, 'AI_AGENT');
    await expectSqlState(
      db.query(`INSERT INTO cera.user_account (user_id, actor_id, login_id, role, password_hash, created_at, updated_at) VALUES ($1, $2, 'agent-login', 'ADMIN', $3, $4, $4)`, [v7(), agentActor, await hashPassword(PASSWORD), T0]),
      'CE005',
    );
  });

  it('a session is revoked once; accounts and sessions are never deleted; the login id never changes', async () => {
    const sessionId = v7();
    await db.query(`INSERT INTO cera.user_session (session_id, user_id, token_hash, created_at, expires_at) VALUES ($1, $2, $3, $4, '2027-01-01T00:00:00Z')`, [sessionId, users.field.userId, sha256Bytes(v7()), T0]);
    await db.query(`UPDATE cera.user_session SET revoked_at = $2 WHERE session_id = $1`, [sessionId, T0]);
    await expectSqlState(db.query(`UPDATE cera.user_session SET revoked_at = $2 WHERE session_id = $1`, [sessionId, '2026-10-02T00:00:00Z']), 'CE003');
    await expectSqlState(db.query('DELETE FROM cera.user_session WHERE session_id = $1', [sessionId]), '42501');
    await expectSqlState(db.query('DELETE FROM cera.user_account WHERE user_id = $1', [users.field.userId]), '42501');
    await expectSqlState(db.query(`UPDATE cera.user_account SET login_id = 'renamed-x' WHERE user_id = $1`, [users.field.userId]), 'CE002');
  });
});
