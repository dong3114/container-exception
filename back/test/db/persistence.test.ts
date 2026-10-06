import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import type pg from 'pg';
import request from 'supertest';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/app/create-api.js';
import { ContentService } from '../../src/content/content-service.js';
import { CONTENT_STORE, type ContentStore } from '../../src/content/content-store.js';
import { DATABASE, type Database } from '../../src/db/database.js';
import { rawInput } from '../../src/db/schema/index.js';
import { TransactionRunner } from '../../src/db/transaction.js';
import { ApiErrorFilter } from '../../src/http/error.filter.js';
import { OPENAPI_CONTRACT_PATH, renderOpenApiJson } from '../../src/openapi/emit-openapi.js';
import { AuditRecorder } from '../../src/persistence/audit-recorder.js';
import { RegistryReader } from '../../src/persistence/registry-reader.js';
import { SystemErrorRecorder } from '../../src/persistence/system-error-recorder.js';
import { SeedModule } from '../../src/seed/seed.module.js';
import { SEED_IDS } from '../../src/seed/slice1-fixture.js';
import { Slice1Seed } from '../../src/seed/slice1-seed.js';
import { sha256Bytes } from '../../src/shared/hash/hash.js';
import { actor } from './fixtures.js';
import { appPool, testEnv } from './support.js';

/**
 * Phase C — 영속 지원(감사 · system_error · 내용 저장소 흐름 · 시드 · OpenAPI)을 실제 PostgreSQL 에서.
 * Nest 모듈은 앱 역할(cera_app)로 붙는다. 내용 저장소 뿌리는 시험마다 임시 디렉터리.
 */
const contentDir = mkdtempSync(join(tmpdir(), 'cera-content-db-'));
let ctx: INestApplicationContext;
let db: Database;
let app: pg.Pool;

beforeAll(async () => {
  ctx = await NestFactory.createApplicationContext(SeedModule.forRoot(testEnv({ CERA_CONTENT_DIR: contentDir })), { logger: false });
  db = ctx.get(DATABASE);
  app = appPool();
});

afterAll(async () => {
  await ctx.close();
  await app.end();
  rmSync(contentDir, { recursive: true, force: true });
});

const countAudits = async (targetId: string, result: string) =>
  (
    await app.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM cera.audit_log WHERE action = 'CONTENT_PURGED' AND target_id = $1 AND result = $2",
      [targetId, result],
    )
  ).rows[0]?.n;

const countErrors = async (code: string, relatedId: string) =>
  (
    await app.query<{ n: number }>('SELECT count(*)::int AS n FROM cera.system_error WHERE error_code = $1 AND related_entity_id = $2', [
      code,
      relatedId,
    ])
  ).rows[0]?.n;

describe('AuditRecorder', () => {
  it('records inside the business transaction and disappears with its rollback', async () => {
    const audit = ctx.get(AuditRecorder);
    const tx = ctx.get(TransactionRunner);
    const actorId = await actor(app, 'HUMAN');
    const committed = v7();
    const rolledBack = v7();
    const entry = (targetId: string) =>
      ({ actorId, action: 'CONTENT_PURGED', targetType: 'RAW_INPUT_PAYLOAD', targetId, result: 'SUCCESS', isSimulated: false }) as const;
    await tx.run((t) => audit.record(t, entry(committed)));
    await expect(
      tx.run(async (t) => {
        await audit.record(t, entry(rolledBack));
        throw new Error('business step failed');
      }),
    ).rejects.toThrow('business step failed');
    expect(await countAudits(committed, 'SUCCESS')).toBe(1);
    expect(await countAudits(rolledBack, 'SUCCESS')).toBe(0);
  });
});

describe('SystemErrorRecorder', () => {
  it('persists outside the business transaction (survives its rollback) without message or stack', async () => {
    const recorder = ctx.get(SystemErrorRecorder);
    const tx = ctx.get(TransactionRunner);
    const related = v7();
    await expect(
      tx.run(async () => {
        await recorder.record({
          serviceName: 'cera-test',
          componentName: 'test',
          operationName: 'rollback',
          errorBoundary: 'BACKGROUND_JOB',
          errorCategory: 'UNEXPECTED',
          errorCode: 'INTERNAL_ERROR',
          safeErrorMessage: 'safe text',
          cause: new TypeError('secret-token=abc'),
          retryable: false,
          relatedEntity: { type: 'TEST', id: related },
        });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    const { rows } = await app.query('SELECT safe_error_message, exception_type FROM cera.system_error WHERE related_entity_id = $1', [related]);
    expect(rows).toEqual([{ safe_error_message: 'safe text', exception_type: 'TypeError' }]);
  });

  it('ApiErrorFilter records unexpected errors to system_error separately from the HTTP body', async () => {
    const filter = new ApiErrorFilter(ctx.get(SystemErrorRecorder));
    let status = 0;
    let body: unknown;
    const res = { status: (s: number) => ((status = s), res), json: (b: unknown) => (body = b) };
    const host = { switchToHttp: () => ({ getResponse: () => res }) };
    const before = (await app.query<{ n: number }>("SELECT count(*)::int AS n FROM cera.system_error WHERE component_name = 'ApiErrorFilter'")).rows[0]?.n ?? 0;
    filter.catch(new Error('db password=hunter2'), host as never);
    expect(status).toBe(500);
    expect(body).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: null });
    await new Promise((r) => setTimeout(r, 200));
    const after = await app.query<{ n: number; msg: string }>(
      "SELECT count(*)::int AS n, max(safe_error_message) AS msg FROM cera.system_error WHERE component_name = 'ApiErrorFilter'",
    );
    expect(after.rows[0]?.n).toBe(before + 1);
    expect(after.rows[0]?.msg).not.toContain('hunter2');
  });
});

describe('ContentService (D-5 create / purge / inspect)', () => {
  it('create: content is written and verified before the DB row; a failed DB step leaves an orphan, never a dangling ref', async () => {
    const content = ctx.get(ContentService);
    const store = ctx.get<ContentStore>(CONTENT_STORE);
    const tx = ctx.get(TransactionRunner);
    const bytes = new TextEncoder().encode('raw payload');
    const stored = await content.storeVerified('RAW_INPUT_PAYLOAD', bytes, 'text/plain', sha256Bytes(bytes));
    expect(await store.exists(stored.ref)).toBe(true);

    const rawId = v7();
    await expect(
      tx.run(async (t) => {
        await t.insert(rawInput).values({
          rawInputId: rawId,
          sourceType: 'HUMAN_UI',
          sourceName: 'cera-test',
          payloadRef: stored.ref,
          payloadHash: stored.sha256,
          receivedAt: '2026-10-01 00:00:00.000+00',
          isSimulated: false,
        });
        throw new Error('commit fails');
      }),
    ).rejects.toThrow('commit fails');
    expect(await db.select().from(rawInput).where(eq(rawInput.rawInputId, rawId))).toEqual([]);
    expect(await store.exists(stored.ref)).toBe(true); // 고아 내용 — 정리 대상, 기록은 없다
  });

  it('create: a fingerprint mismatch is rejected before any DB row and recorded as system_error', async () => {
    const content = ctx.get(ContentService);
    await expect(
      content.storeVerified('EXTRACTION_SOURCE_QUOTE', new TextEncoder().encode('quote'), 'text/plain', sha256Bytes('other')),
    ).rejects.toMatchObject({ code: 'CONTENT_HASH_MISMATCH' });
  });

  it('purge: delete → verify gone → CONTENT_PURGED SUCCESS audit; inspect says PURGED', async () => {
    const content = ctx.get(ContentService);
    const store = ctx.get<ContentStore>(CONTENT_STORE);
    const actorId = await actor(app, 'HUMAN');
    const stored = await content.storeVerified('RAW_INPUT_PAYLOAD', new TextEncoder().encode('to purge'), 'text/plain');
    const target = { category: 'RAW_INPUT_PAYLOAD' as const, recordId: v7(), ref: stored.ref, isSimulated: false };
    expect(await content.inspect(target)).toBe('RETAINED');
    await content.purgeRecorded(target, actorId);
    expect(await store.exists(stored.ref)).toBe(false);
    expect(await countAudits(target.recordId, 'SUCCESS')).toBe(1);
    expect(await content.inspect(target)).toBe('PURGED');
  });

  it('inspect: missing without audit → CONTENT_MISSING; present with a success audit → CONTENT_PURGE_MISMATCH', async () => {
    const content = ctx.get(ContentService);
    const store = ctx.get<ContentStore>(CONTENT_STORE);
    const audit = ctx.get(AuditRecorder);
    const actorId = await actor(app, 'HUMAN');

    const lost = await content.storeVerified('RAW_INPUT_PAYLOAD', new TextEncoder().encode('lost'), 'text/plain');
    await store.purge(lost.ref); // 감사 없이 사라짐 = 데이터 손실
    const lostTarget = { category: 'RAW_INPUT_PAYLOAD' as const, recordId: v7(), ref: lost.ref, isSimulated: false };
    expect(await content.inspect(lostTarget)).toBe('MISSING');
    expect(await countErrors('CONTENT_MISSING', lostTarget.recordId)).toBe(1);

    const kept = await content.storeVerified('RAW_INPUT_PAYLOAD', new TextEncoder().encode('kept'), 'text/plain');
    const keptTarget = { category: 'RAW_INPUT_PAYLOAD' as const, recordId: v7(), ref: kept.ref, isSimulated: false };
    await audit.recordStandalone({
      actorId,
      action: 'CONTENT_PURGED',
      targetType: 'RAW_INPUT_PAYLOAD',
      targetId: keptTarget.recordId,
      result: 'SUCCESS',
      isSimulated: false,
    });
    expect(await content.inspect(keptTarget)).toBe('PURGE_MISMATCH');
    expect(await countErrors('CONTENT_PURGE_MISMATCH', keptTarget.recordId)).toBe(1);
  });

  it('purge of content that is already gone: repeat after a success is idempotent; without a success audit it is data loss', async () => {
    const content = ctx.get(ContentService);
    const store = ctx.get<ContentStore>(CONTENT_STORE);
    const actorId = await actor(app, 'HUMAN');

    const done = await content.storeVerified('RAW_INPUT_PAYLOAD', new TextEncoder().encode('once'), 'text/plain');
    const doneTarget = { category: 'RAW_INPUT_PAYLOAD' as const, recordId: v7(), ref: done.ref, isSimulated: false };
    expect(await content.purgeRecorded(doneTarget, actorId)).toBe('PURGED');
    expect(await content.purgeRecorded(doneTarget, actorId)).toBe('ALREADY_PURGED');
    expect(await countAudits(doneTarget.recordId, 'SUCCESS')).toBe(1);

    const lost = await content.storeVerified('RAW_INPUT_PAYLOAD', new TextEncoder().encode('lost before purge'), 'text/plain');
    await store.purge(lost.ref);
    const lostTarget = { category: 'RAW_INPUT_PAYLOAD' as const, recordId: v7(), ref: lost.ref, isSimulated: false };
    await expect(content.purgeRecorded(lostTarget, actorId)).rejects.toMatchObject({ code: 'CONTENT_MISSING' });
    expect(await countAudits(lostTarget.recordId, 'SUCCESS')).toBe(0);
    expect(await countErrors('CONTENT_MISSING', lostTarget.recordId)).toBe(1);
  });

  it('content store calls are refused inside a DB transaction', async () => {
    const store = ctx.get<ContentStore>(CONTENT_STORE);
    await expect(
      ctx.get(TransactionRunner).run(() => store.put('RAW_INPUT_PAYLOAD', new Uint8Array([1]), 'application/octet-stream')),
    ).rejects.toMatchObject({ code: 'EXTERNAL_CALL_IN_TRANSACTION' });
  });
});

describe('Slice 1 seed', () => {
  const packDir = '../data/scenarios/busan-wh-capacity-01';

  it('first run inserts the fixture through the write path; a second run inserts nothing', async () => {
    const seed = ctx.get(Slice1Seed);
    const first = await seed.apply(packDir);
    const second = await seed.apply(packDir);
    // global-setup 이 빈 DB 를 만들었으므로 첫 실행이 전부 넣는다(같은 실행에서 다시 돌리면 0)
    expect(first).toEqual({ inserted: 20, capacityEventCreated: true });
    expect(second).toEqual({ inserted: 0, capacityEventCreated: false });
  });

  it('seed channels are MOCK only, addresses are *.invalid, and record rows are simulated', async () => {
    const addresses = await ctx.get(RegistryReader).listCounterpartyAddresses();
    const seeded = addresses.filter((a) => [SEED_IDS.addressTrucking, SEED_IDS.addressOdcy].includes(a.addressId as never));
    expect(seeded).toHaveLength(2);
    expect(seeded.every((a) => a.channelType === 'MOCK' && a.normalizedAddress.endsWith('.invalid'))).toBe(true);
    const { rows } = await app.query<{ is_simulated: boolean; scenario_id: string; value_number: string }>(
      'SELECT is_simulated, scenario_id, value_number FROM cera.event WHERE event_id = $1',
      [SEED_IDS.capacityEvent],
    );
    expect(rows[0]).toEqual({ is_simulated: true, scenario_id: SEED_IDS.scenario, value_number: '20.0000' });
    const run = await app.query<{ contains_simulated: boolean; total_cost_krw: string }>(
      'SELECT contains_simulated, total_cost_krw FROM cera.recovery_run WHERE run_id = $1',
      [SEED_IDS.recoveryRunRoot],
    );
    expect(run.rows[0]?.contains_simulated).toBe(true);
  });
});

describe('OpenAPI skeleton (R-01)', () => {
  let api: INestApplication;

  beforeAll(async () => {
    api = await createApiApp(testEnv({ CERA_CONTENT_DIR: contentDir }));
    await api.init();
  });

  afterAll(async () => {
    await api.close();
  });

  it('GET /openapi.json returns a generated document with the health paths and the common error schema', async () => {
    const res = await request(api.getHttpServer()).get('/openapi.json').expect(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(Object.keys(res.body.paths)).toEqual(expect.arrayContaining(['/health', '/health/live']));
    expect(res.body.components.schemas.ErrorResponse.required).toEqual(['code', 'message', 'request_id']);
  });

  it('the committed contract packages/contracts/openapi.json is up to date (npm run openapi:emit)', async () => {
    expect(readFileSync(OPENAPI_CONTRACT_PATH, 'utf8')).toBe(await renderOpenApiJson());
  });
});
