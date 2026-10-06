import { describe, expect, it } from 'vitest';
import { sqlStateOf } from '../../src/db/sqlstate.js';
import { ApiErrorFilter } from '../../src/http/error.filter.js';
import { AUDIT_ACTION, CATALOG_FORMAT, SYSTEM_ERROR_CATEGORY, SYSTEM_ERROR_CODE } from '../../src/persistence/catalog.js';
import { eventIdempotencyKey } from '../../src/persistence/event-writer.js';
import { SystemErrorRecorder } from '../../src/persistence/system-error-recorder.js';
import { SEED_IDS } from '../../src/seed/slice1-fixture.js';
import { isUuidV7 } from '../../src/shared/id/uuid.js';

describe('seed fixture ids', () => {
  it('are fixed, unique, valid UUIDv7 values', () => {
    const ids = Object.values(SEED_IDS);
    expect(ids.every(isUuidV7)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('backend catalog', () => {
  it('every CATALOG value matches the DB format CHECK', () => {
    const values = [...Object.values(AUDIT_ACTION), ...Object.values(SYSTEM_ERROR_CATEGORY)];
    expect(values.every((v) => CATALOG_FORMAT.test(v))).toBe(true);
    expect(Object.values(SYSTEM_ERROR_CODE).every((v) => v.length <= 60)).toBe(true);
  });
});

describe('event idempotency key evk/1 (docs/24 9절)', () => {
  const base = {
    rawInputId: '01a0fb93-1c20-7d11-8a4e-0b6f5f2a9c02',
    claimLocator: '/',
    subject: { entityType: 'FACILITY', entityId: '01a0fb92-9b66-7544-aeb3-216d6e00eef3' },
    factKey: 'capacity.day(2026-10-13)',
    targets: null,
    scope: { type: 'GLOBAL', ref: '' },
    eventClass: 'OBSERVATION' as const,
  };

  it('is deterministic and does not depend on target order', () => {
    expect(eventIdempotencyKey(base)).toBe(eventIdempotencyKey({ ...base }));
    const v = { ...base, factKey: null, eventClass: 'VERIFICATION' as const };
    expect(eventIdempotencyKey({ ...v, targets: ['b', 'a'] })).toBe(eventIdempotencyKey({ ...v, targets: ['a', 'b'] }));
  });

  it('changes when the claim coordinate changes', () => {
    expect(eventIdempotencyKey({ ...base, claimLocator: '/asks/a1' })).not.toBe(eventIdempotencyKey(base));
    expect(eventIdempotencyKey({ ...base, factKey: 'capacity.day(2026-10-14)' })).not.toBe(eventIdempotencyKey(base));
  });
});

describe('sqlStateOf', () => {
  it('finds the SQLSTATE through wrapped causes, including CERA trigger codes', () => {
    expect(sqlStateOf({ code: 'CE004' })).toBe('CE004');
    expect(sqlStateOf(new Error('wrapped', { cause: { code: '23505' } }))).toBe('23505');
    expect(sqlStateOf(new Error('no code'))).toBeUndefined();
  });
});

describe('system_error recording never replaces the original error', () => {
  const entry = {
    serviceName: 'cera-test',
    componentName: 'test',
    operationName: 'op',
    errorBoundary: 'API_REQUEST' as const,
    errorCategory: SYSTEM_ERROR_CATEGORY.UNEXPECTED,
    errorCode: SYSTEM_ERROR_CODE.INTERNAL_ERROR,
    safeErrorMessage: 'safe',
    retryable: false,
  };
  const clock = { now: () => ({ toDb: () => new Date(0) }) };
  const ids = { newId: () => '01a10f87-67d4-7659-9714-546582d6861d' };
  const failingDb = { insert: () => ({ values: () => Promise.reject(new Error('connection refused')) }) };

  it('SystemErrorRecorder.record resolves null (does not throw) when the insert fails', async () => {
    const recorder = new SystemErrorRecorder(failingDb as never, clock as never, ids as never);
    await expect(recorder.record(entry)).resolves.toBeNull();
  });

  it('SystemErrorRecorder.record resolves null when id generation fails before the insert', async () => {
    const throwingIds = {
      newId: () => {
        throw new Error('entropy');
      },
    };
    const recorder = new SystemErrorRecorder(failingDb as never, clock as never, throwingIds as never);
    await expect(recorder.record(entry)).resolves.toBeNull();
  });

  it('ApiErrorFilter still answers with the original error when recording rejects, without an unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const recorder = { record: () => Promise.reject(new Error('recorder broke')) };
      const filter = new ApiErrorFilter(recorder as never);
      let status = 0;
      let body: unknown;
      const res = { status: (s: number) => ((status = s), res), json: (b: unknown) => (body = b) };
      const host = { switchToHttp: () => ({ getResponse: () => res }) };
      filter.catch(new TypeError('original failure'), host as never);
      expect(status).toBe(500);
      expect(body).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: null });
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
