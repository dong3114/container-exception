import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit 설정(ADR-034): Drizzle 스키마 → `generate` 로 SQL migration 생성 → 사람 검토 → 커밋 → `npm run db:migrate`.
 * `push` 스크립트는 두지 않는다. 연결은 migration 소유 역할(cera_owner).
 */
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle/migrations',
  schemaFilter: ['cera'],
  dbCredentials: { url: process.env.MIGRATION_DATABASE_URL ?? '' },
  migrations: { schema: 'cera_meta', table: 'drizzle_migrations' },
  strict: true,
  verbose: true,
});
