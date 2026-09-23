import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// U0 검증 전용(제품 설정은 ../../drizzle.config.ts). 결과물은 gitignore 된 .spike/ 에만 생긴다.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  dialect: 'postgresql',
  schema: './test/spike/spike-schema.ts',
  out: './.spike/migrations',
  schemaFilter: ['cera_spike_kit'],
  dbCredentials: { url: process.env.TEST_OWNER_DATABASE_URL ?? '' },
  migrations: { schema: 'cera_spike_meta', table: 'drizzle_migrations' },
  strict: true,
  verbose: true,
});
