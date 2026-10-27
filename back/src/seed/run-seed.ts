import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadDotEnvIfPresent, parseEnv } from '../config/env.js';
import { DEFAULT_DATA_PACK } from './slice1-fixture.js';
import { SeedModule } from './seed.module.js';
import { SeedUsers, seedNow } from './seed-users.js';
import { Slice1Seed } from './slice1-seed.js';

/**
 * `npm run db:seed [팩 경로]` — Slice 1 시드(docs/24 21절). migration 과 분리된 명령이다.
 * **APP_ENV 가 local · test 가 아니면 거부한다.** 앱 역할(DATABASE_URL = cera_app)로 쓴다. 반복 실행해도 같은 결과.
 */
async function main(): Promise<void> {
  loadDotEnvIfPresent();
  const env = parseEnv(process.env);
  if (env.APP_ENV !== 'local' && env.APP_ENV !== 'test') {
    throw new Error(`Seeding is allowed only in local or test (APP_ENV=${env.APP_ENV})`);
  }
  const app = await NestFactory.createApplicationContext(SeedModule.forRoot(env), { logger: false });
  try {
    const summary = await app.get(Slice1Seed).apply(process.argv[2] ?? DEFAULT_DATA_PACK);
    console.log(`Seed applied: inserted=${summary.inserted} capacity_event_created=${summary.capacityEventCreated}`);
    const users = await app.get(SeedUsers).apply(seedNow());
    console.log(`Seed users created: ${users.length ? users.join(', ') : 'none (already present, or CERA_SEED_*_PASSWORD empty)'}`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
