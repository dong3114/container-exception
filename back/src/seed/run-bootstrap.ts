import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadDotEnvIfPresent, parseEnv } from '../config/env.js';
import { DATABASE, type Database } from '../db/database.js';
import { actor } from '../db/schema/index.js';
import { SEED_IDS } from './slice1-fixture.js';
import { SeedModule } from './seed.module.js';
import { SeedUsers, seedNow } from './seed-users.js';

/**
 * `npm run db:bootstrap` — 운영(Private Staging · Production) 배포의 첫 준비(T-132 Part A). **합성 시나리오 · 거래처 · 시설은 넣지 않는다.**
 *
 * - 시스템 행위자 두 개: SYSTEM(Worker 발송 · 수신 · 추출 · 예외 탐지) · AI_AGENT(Agent Runtime). 없으면 Worker 가 `SYSTEM_ACTOR_MISSING` 으로 멈춘다
 * - 사람 계정: `CERA_SEED_ADMIN_PASSWORD` · `CERA_SEED_OPERATOR_PASSWORD` · `CERA_SEED_FIELD_PASSWORD`(12자+)가 있는 역할만 만든다 — 비밀번호는 환경변수에만
 * - 어느 APP_ENV 에서나 돈다(데모 데이터가 없으므로). 반복 실행 안전(이미 있으면 그대로)
 * 시연 · 시험의 `db:seed` 는 이것에 더해 합성 시나리오를 넣는다(local · test · 포트폴리오만).
 */
async function main(): Promise<void> {
  loadDotEnvIfPresent();
  const env = parseEnv(process.env);
  const app = await NestFactory.createApplicationContext(SeedModule.forRoot(env), { logger: false });
  try {
    const db = app.get<Database>(DATABASE);
    const created = await db
      .insert(actor)
      .values([
        { actorId: SEED_IDS.actorSystem, actorType: 'SYSTEM', displayName: 'CERA System' },
        { actorId: SEED_IDS.actorAgent, actorType: 'AI_AGENT', displayName: 'CERA Agent Runtime' },
      ])
      .onConflictDoNothing()
      .returning({ id: actor.actorId });
    console.log(`System actors created: ${created.length} (already present: ${2 - created.length})`);
    const users = await app.get(SeedUsers).apply(seedNow());
    console.log(`Users created: ${users.length ? users.join(', ') : 'none (already present, or CERA_SEED_*_PASSWORD empty)'}`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
