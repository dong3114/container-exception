import 'reflect-metadata';
import type { INestApplication, LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Express, NextFunction, Request, Response } from 'express';
import type { Env } from '../config/env.js';
import { serveOpenApi } from '../http/openapi.js';
import { originCheck, portfolioRateLimit } from '../http/public-guards.js';
import { requestContextMiddleware } from '../http/request-context.middleware.js';
import { ApiModule } from './api.module.js';

/** API 응답에 붙이는 최소 보안 헤더(T-131). 화면 · HTTPS 쪽 헤더(CSP · HSTS)는 앞단 nginx · 프록시가 붙인다(infra/portfolio). */
function apiSecurityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
}

/** API 앱 생성(기동 · 시험 공용). `listen` 은 호출자가 한다. */
export async function createApiApp(env: Env, logger?: LoggerService | false): Promise<INestApplication> {
  const app = await NestFactory.create(ApiModule.forRoot(env), { logger: logger ?? false, bufferLogs: false });
  const express = app.getHttpAdapter().getInstance() as Express;
  express.disable('x-powered-by');
  // 요청 한도가 프록시가 아니라 방문자 IP 를 세게(앞단 프록시 단계 수만큼 X-Forwarded-For 를 믿는다)
  if (env.CERA_TRUST_PROXY_HOPS > 0) express.set('trust proxy', env.CERA_TRUST_PROXY_HOPS);
  app.use(requestContextMiddleware);
  app.use(apiSecurityHeaders);
  app.use(originCheck(env));
  app.use(portfolioRateLimit(env));
  serveOpenApi(app);
  app.enableShutdownHooks();
  return app;
}
