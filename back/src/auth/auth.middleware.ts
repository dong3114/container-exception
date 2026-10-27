import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { type AuthIdentity, AuthService, SESSION_COOKIE } from './auth.service.js';

export const ACTOR_HEADER = 'x-cera-actor-id';

export type AuthedRequest = Request & { ceraAuth?: AuthIdentity | null };

export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/**
 * 요청의 사람 신원을 정한다(T-119) — Guard 보다 먼저 돈다.
 *
 * - session 모드: **요청이 보낸 `X-CERA-Actor-Id` 는 지운다.** 로그인 세션이 있으면 그 사용자의 actor id 로 다시 채운다.
 *   그래서 기존 서비스가 그 헤더로 행위자를 읽어도 값은 언제나 서버가 정한 것이다(사칭 불가)
 * - dev-header 모드(local · test): 세션이 있으면 세션, 없으면 헤더의 HUMAN actor(옛 개발 흐름)
 * - Agent Tool 경로(`/internal/*`)는 사람 신원을 쓰지 않는다 — 서비스 토큰을 그 컨트롤러가 따로 검사한다
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async use(req: AuthedRequest, _res: Response, next: NextFunction): Promise<void> {
    try {
      const claimed = typeof req.headers[ACTOR_HEADER] === 'string' ? (req.headers[ACTOR_HEADER] as string) : null;
      const token = readCookie(req, SESSION_COOKIE);
      let identity = token ? await this.auth.resolveSession(token) : null;
      if (!identity && this.env.CERA_AUTH_MODE === 'dev-header' && claimed) identity = await this.auth.resolveDevHeader(claimed);
      if (this.env.CERA_AUTH_MODE === 'session' || identity) delete req.headers[ACTOR_HEADER];
      if (identity) req.headers[ACTOR_HEADER] = identity.actorId;
      req.ceraAuth = identity;
      next();
    } catch (error) {
      next(error);
    }
  }
}
