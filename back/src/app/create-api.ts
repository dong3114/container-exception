import 'reflect-metadata';
import type { INestApplication, LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Env } from '../config/env.js';
import { serveOpenApi } from '../http/openapi.js';
import { requestContextMiddleware } from '../http/request-context.middleware.js';
import { ApiModule } from './api.module.js';

/** API 앱 생성(기동 · 시험 공용). `listen` 은 호출자가 한다. */
export async function createApiApp(env: Env, logger?: LoggerService | false): Promise<INestApplication> {
  const app = await NestFactory.create(ApiModule.forRoot(env), { logger: logger ?? false, bufferLogs: false });
  (app.getHttpAdapter().getInstance() as { disable(setting: string): void }).disable('x-powered-by');
  app.use(requestContextMiddleware);
  serveOpenApi(app);
  app.enableShutdownHooks();
  return app;
}
