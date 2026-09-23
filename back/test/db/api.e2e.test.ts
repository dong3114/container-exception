/** API 프로세스 기동 · health · 공통 오류 응답 · 요청 문맥(실제 PostgreSQL). */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/app/create-api.js';
import { isUuidV7 } from '../../src/shared/id/uuid.js';
import { testEnv } from './support.js';

describe('API process (NestJS + PostgreSQL)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApiApp(testEnv());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health → 200 ok, db up, Asia/Seoul timestamp', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', app: 'up', db: 'up' });
    expect(res.body.checked_at).toMatch(/\+09:00$/);
    expect(isUuidV7(res.headers['x-request-id'])).toBe(true);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('GET /health/live → 200 without touching the DB', async () => {
    const res = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', app: 'up' });
    expect(res.body.db).toBeUndefined();
  });

  it('unknown route → common error body { code, message, request_id }', async () => {
    const res = await request(app.getHttpServer()).get('/does-not-exist').expect(404);
    expect(res.body).toEqual({ code: 'HTTP_404', message: expect.any(String), request_id: res.headers['x-request-id'] });
  });

  it('keeps a valid incoming X-Request-Id and replaces an invalid one', async () => {
    const good = '0199a8d0-8f00-7000-8000-00000000abcd';
    const kept = await request(app.getHttpServer()).get('/health/live').set('X-Request-Id', good);
    expect(kept.headers['x-request-id']).toBe(good);
    const replaced = await request(app.getHttpServer()).get('/health/live').set('X-Request-Id', 'not-a-uuid');
    expect(isUuidV7(replaced.headers['x-request-id'])).toBe(true);
  });
});

describe('API process with the database down', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApiApp(testEnv({ DATABASE_URL: 'postgres://cera_app:x@127.0.0.1:1/cera_test' }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health → 503 degraded, app still up', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(503);
    expect(res.body).toMatchObject({ status: 'degraded', app: 'up', db: 'down' });
  });
});
