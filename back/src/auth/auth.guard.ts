import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { PERMISSION_KEY, PUBLIC_KEY } from './auth.decorators.js';
import type { AuthedRequest } from './auth.middleware.js';
import { AuthError } from './auth.service.js';
import { type Permission, can } from './permissions.js';

/**
 * 권한 강제(T-119) — 전역 Guard. 화면이 버튼을 숨기는 것과 상관없이 여기서 막는다.
 *
 * 1. `@Public()` 은 통과(상태 확인 · 로그인 · 계약 문서 · 서비스 토큰을 따로 검사하는 Agent 경로)
 * 2. 신원 없음 → session 모드는 401 `AUTH_REQUIRED`. dev-header 모드(local · test)는 옛 흐름대로 통과 — 서비스가 행위자를 따로 요구한다
 * 3. 필요한 권한: `@RequirePermission(...)`, 없으면 GET 은 `read`, **변경 요청은 선언이 없으면 거부**(실수로 열린 경로가 없게)
 * 4. 역할에 그 권한이 없으면 403 `PERMISSION_DENIED`
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ENV) private readonly env: Env,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const identity = req.ceraAuth ?? null;
    const declared = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, targets);
    const isRead = req.method === 'GET' || req.method === 'HEAD';
    if (!declared && !isRead) throw new AuthError('PERMISSION_NOT_DECLARED', 'This route has no declared permission', 403);
    if (!identity) {
      if (this.env.CERA_AUTH_MODE === 'dev-header') return true;
      throw new AuthError('AUTH_REQUIRED', 'Login required', 401);
    }
    const permission = declared ?? 'read';
    if (!can(identity.role, permission)) throw new AuthError('PERMISSION_DENIED', `Role ${identity.role} may not ${permission}`, 403);
    return true;
  }
}
