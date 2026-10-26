import { existsSync } from 'node:fs';
import pg from 'pg';
import { applyMigrations } from '../../src/db/migrate.js';

/**
 * DB 시험 전역 준비(docs/24 20절 "적용 뒤 스키마 검사"):
 * 1. 소유 역할로 cera_test 의 제품 스키마(cera)와 이력 스키마(cera_meta)를 지운다 — 앞선 실행의 상태에 기대지 않는다
 * 2. 비어 있음을 확인한 뒤 M01 → M20 을 처음부터 적용한다
 * 3. 한 번 더 적용한다 — 반복 실행이 아무것도 바꾸지 않아야 한다(시험 migration-history 가 이력 10행을 확인)
 */
export default async function setup(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const ownerUrl = process.env.TEST_OWNER_DATABASE_URL;
  if (!ownerUrl) throw new Error('TEST_OWNER_DATABASE_URL is required for DB tests (back/.env)');

  const owner = new pg.Client({ connectionString: ownerUrl, application_name: 'cera-test-setup' });
  await owner.connect();
  try {
    await owner.query('DROP SCHEMA IF EXISTS cera CASCADE');
    await owner.query('DROP SCHEMA IF EXISTS cera_meta CASCADE');
    const { rows } = await owner.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_namespace WHERE nspname IN ('cera', 'cera_meta')",
    );
    if (rows[0]?.n !== 0) throw new Error('cera_test is not empty after reset');
  } finally {
    await owner.end();
  }

  await applyMigrations(ownerUrl);
  await applyMigrations(ownerUrl);
}
