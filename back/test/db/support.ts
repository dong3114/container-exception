import { existsSync } from 'node:fs';
import pg from 'pg';
import { type Env, parseEnv } from '../../src/config/env.js';
import { createPool } from '../../src/db/database.js';

/**
 * DB 시험 공용. 로컬 PostgreSQL(infra/local/compose.yaml)의 `cera_test` DB 를 쓴다.
 * - TEST_DATABASE_URL       : 앱 역할(cera_app)
 * - TEST_OWNER_DATABASE_URL : 소유 역할(cera_owner) — 시험용 스키마 생성·삭제
 */
if (existsSync('.env')) process.loadEnvFile('.env');

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? '';
export const TEST_OWNER_DATABASE_URL = process.env.TEST_OWNER_DATABASE_URL ?? '';

if (!TEST_DATABASE_URL || !TEST_OWNER_DATABASE_URL) {
  throw new Error(
    'DB tests need TEST_DATABASE_URL and TEST_OWNER_DATABASE_URL (back/.env — see .env.example) and a running infra/local PostgreSQL',
  );
}

export function testEnv(overrides: Partial<Record<keyof Env, string>> = {}): Env {
  // Agent 재조정은 기본으로 끈다 — Worker 를 쓰는 다른 시험이 Agent 시험의 실행을 건드리지 않게(Agent 시험이 켠다)
  return parseEnv({ APP_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL, LOG_LEVEL: 'error', CERA_AGENT_RECONCILE_ENABLED: 'false', CERA_AUTH_MODE: 'dev-header', CERA_EXTRACTION_RETRY_BASE_MS: '0', ...overrides });
}

export function appPool(): pg.Pool {
  return createPool({ connectionString: TEST_DATABASE_URL, applicationName: 'cera-test-app', max: 4 });
}

export function ownerPool(): pg.Pool {
  return createPool({ connectionString: TEST_OWNER_DATABASE_URL, applicationName: 'cera-test-owner', max: 2 });
}

/** PostgreSQL 오류 코드(SQLSTATE)를 꺼낸다. Drizzle 은 드라이버 오류를 `cause` 로 감싼다. */
export function sqlState(error: unknown): string | undefined {
  let e: unknown = error;
  for (let i = 0; i < 5 && e; i += 1) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

export async function expectSqlState(promise: Promise<unknown>, state: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    const actual = sqlState(error);
    if (actual !== state) throw new Error(`expected SQLSTATE ${state}, got ${actual ?? 'none'}: ${String(error)}`);
    return;
  }
  throw new Error(`expected SQLSTATE ${state}, but the statement succeeded`);
}
