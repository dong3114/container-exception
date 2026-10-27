import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createLogger } from './app/logger.js';
import { WorkerModule, WorkerRunner } from './app/worker.module.js';
import { loadDotEnvIfPresent, parseEnv } from './config/env.js';

/**
 * Worker 프로세스 진입점(ADR-033 — 같은 코드베이스, 별도 프로세스). HTTP 서버를 띄우지 않는다.
 * - 기본: 기동 점검 → `CERA_OUTBOX_POLL_MS` 마다 발송 주기(화해 → 픽업 · 발송). SIGINT/SIGTERM 에 잠금을 풀고 끝난다
 * - `--once`: 기동 점검 + 발송 주기 한 번 뒤 종료(로컬 확인 · 시험용)
 */
async function bootstrap(): Promise<void> {
  loadDotEnvIfPresent();
  const env = parseEnv(process.env);
  const logger = createLogger(env, 'cera-worker');
  const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(env), { logger });
  app.enableShutdownHooks();
  const runner = app.get(WorkerRunner);
  await runner.bootstrapCheck();

  if (process.argv.includes('--once')) {
    await runner.tick();
    await runner.releaseLock();
    await app.close();
    return;
  }

  runner.startQueueConsumer(); // Redis 가 있으면 빠른 경로 — 아래 폴링 루프는 그대로(정확성 · 복구 경로)
  let stopping = false;
  const stopped = new Promise<void>((resolve) => {
    const stop = () => {
      stopping = true;
      resolve();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  logger.log({ msg: 'outbox worker polling', every_ms: env.CERA_OUTBOX_POLL_MS });
  while (!stopping) {
    try {
      await runner.tick();
    } catch (error) {
      logger.error({ msg: 'outbox cycle failed — will retry next cycle', error: error instanceof Error ? error.message : String(error) });
    }
    await Promise.race([stopped, new Promise((r) => setTimeout(r, env.CERA_OUTBOX_POLL_MS))]);
  }
  await runner.releaseLock();
  await app.close();
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
