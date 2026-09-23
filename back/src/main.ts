import 'reflect-metadata';
import { createApiApp } from './app/create-api.js';
import { createLogger } from './app/logger.js';
import { loadDotEnvIfPresent, parseEnv } from './config/env.js';

/** API 프로세스 진입점(ADR-033 — 같은 코드베이스의 API · Worker 중 API). */
async function bootstrap(): Promise<void> {
  loadDotEnvIfPresent();
  const env = parseEnv(process.env);
  const logger = createLogger(env, 'cera-api');
  const app = await createApiApp(env, logger);
  await app.listen(env.API_PORT);
  logger.log({ msg: 'api listening', port: env.API_PORT, app_env: env.APP_ENV });
}

bootstrap().catch((error: unknown) => {
  // 기동 실패: 설정 오류 메시지에는 값이 들어 있지 않다(env.ts).
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
