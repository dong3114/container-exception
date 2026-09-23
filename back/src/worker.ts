import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createLogger } from './app/logger.js';
import { WorkerModule, WorkerRunner } from './app/worker.module.js';
import { loadDotEnvIfPresent, parseEnv } from './config/env.js';

/**
 * Worker 프로세스 진입점(ADR-033 — 같은 코드베이스, 별도 프로세스). HTTP 서버를 띄우지 않는다.
 * `--once`: 기동 점검 뒤 바로 종료(시험 · 배포 확인용).
 */
async function bootstrap(): Promise<void> {
  loadDotEnvIfPresent();
  const env = parseEnv(process.env);
  const logger = createLogger(env, 'cera-worker');
  const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(env), { logger });
  app.enableShutdownHooks();
  await app.get(WorkerRunner).bootstrapCheck();

  if (process.argv.includes('--once')) {
    await app.close();
    return;
  }
  logger.log({ msg: 'worker idle — no jobs registered yet (U5/U6)' });
  // 작업이 붙기 전까지 종료 신호를 기다린다. enableShutdownHooks 가 SIGINT/SIGTERM 에 app.close() 를 부른다.
  await new Promise<void>((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
