import { describe, expect, it } from 'vitest';
import { type OverallInput, QUEUE_STALL_MS, WORKER_STALE_DOWN_MS, WORKER_STALE_WARN_MS, deploymentMode, overallStatus, redisLevel, workerLevel } from '../../src/ops/system-status.policy.js';

/** T-133 운영 화면의 시스템 상태 판정 — 순수 규칙(업무 영향 기준). */
const healthy: OverallInput = { database: 'HEALTHY', worker: 'HEALTHY', redis: 'HEALTHY', aiServer: 'HEALTHY', agentRuntime: 'HEALTHY', llm: 'HEALTHY', gmail: 'DISABLED', publicData: 'DISABLED', oldestPendingMs: null };

describe('worker heartbeat', () => {
  it('fresh → HEALTHY · late → DEGRADED · stale or missing → DOWN', () => {
    expect(workerLevel({ ageMs: 5_000, lastCycleErrors: 0 })).toBe('HEALTHY');
    expect(workerLevel({ ageMs: WORKER_STALE_WARN_MS + 15_000, lastCycleErrors: 0 })).toBe('DEGRADED');
    expect(workerLevel({ ageMs: WORKER_STALE_DOWN_MS + 30_000, lastCycleErrors: 0 })).toBe('DOWN');
    expect(workerLevel({ ageMs: null, lastCycleErrors: 0 })).toBe('DOWN');
  });
  it('a fresh heartbeat with failed steps is DEGRADED, not DOWN', () => {
    expect(workerLevel({ ageMs: 1_000, lastCycleErrors: 1 })).toBe('DEGRADED');
  });
});

describe('overall status reflects business impact', () => {
  it('everything up → HEALTHY', () => {
    expect(overallStatus(healthy)).toEqual({ status: 'HEALTHY', reasons: [] });
  });
  it('Redis down is a fallback (PostgreSQL polling) → DEGRADED, never DOWN', () => {
    expect(redisLevel('down')).toBe('DEGRADED');
    expect(redisLevel('up')).toBe('HEALTHY');
    expect(redisLevel('disabled')).toBe('DISABLED');
    expect(overallStatus({ ...healthy, redis: 'DEGRADED' })).toEqual({ status: 'DEGRADED', reasons: ['QUEUE_FALLBACK_POLLING'] });
    expect(overallStatus({ ...healthy, redis: 'DISABLED' }).status).toBe('HEALTHY');
  });
  it('AI down keeps the manual path → DEGRADED', () => {
    expect(overallStatus({ ...healthy, aiServer: 'DOWN', agentRuntime: 'DOWN', llm: 'DOWN' })).toEqual({ status: 'DEGRADED', reasons: ['AI_UNAVAILABLE'] });
  });
  it('PostgreSQL down is the only DOWN — nothing can be recorded', () => {
    expect(overallStatus({ ...healthy, database: 'DOWN', worker: 'DOWN', redis: 'DEGRADED' })).toEqual({ status: 'DOWN', reasons: ['DATABASE_DOWN'] });
  });
  it('a stopped worker or a rejected Gmail login needs a person → ACTION_REQUIRED', () => {
    expect(overallStatus({ ...healthy, worker: 'DOWN' })).toEqual({ status: 'ACTION_REQUIRED', reasons: ['WORKER_DOWN'] });
    expect(overallStatus({ ...healthy, gmail: 'DOWN' })).toEqual({ status: 'ACTION_REQUIRED', reasons: ['GMAIL_AUTH_FAILED'] });
  });
  it('work waiting longer than the stall threshold → DEGRADED', () => {
    expect(overallStatus({ ...healthy, oldestPendingMs: QUEUE_STALL_MS + 1 }).reasons).toEqual(['QUEUE_STALLED']);
    expect(overallStatus({ ...healthy, oldestPendingMs: 60_000 }).status).toBe('HEALTHY');
  });
  it('disabled integrations do not lower the status', () => {
    expect(overallStatus({ ...healthy, gmail: 'DISABLED', publicData: 'DISABLED', agentRuntime: 'DISABLED' }).status).toBe('HEALTHY');
  });
});

describe('deployment mode', () => {
  it('names where the operator is', () => {
    expect(deploymentMode('production', true)).toBe('PUBLIC_PORTFOLIO_DEMO');
    expect(deploymentMode('staging', false)).toBe('PRIVATE_STAGING');
    expect(deploymentMode('production', false)).toBe('PRODUCTION');
    expect(deploymentMode('local', false)).toBe('LOCAL');
    expect(deploymentMode('test', false)).toBe('LOCAL');
  });
});
