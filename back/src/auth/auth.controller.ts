import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { Public, RequirePermission } from './auth.decorators.js';
import type { AuthedRequest } from './auth.middleware.js';
import { AuthError, type AuthIdentity, AuthService, SESSION_COOKIE } from './auth.service.js';

function identityOf(req: AuthedRequest): AuthIdentity {
  if (!req.ceraAuth) throw new AuthError('AUTH_REQUIRED', 'Login required', 401);
  return req.ceraAuth;
}

/**
 * 사람 로그인(T-119): `POST /auth/login` → HttpOnly · SameSite=Strict 세션 쿠키, `POST /auth/logout`, `GET /auth/me`.
 * Agent · Worker 는 이 경로를 쓰지 않는다(서비스 토큰 · SYSTEM actor).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(body);
    res.cookie(SESSION_COOKIE, r.token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.env.CERA_SESSION_COOKIE_SECURE,
      path: '/',
      maxAge: this.env.CERA_SESSION_TTL_MINUTES * 60_000,
    });
    return { ...r.me, expires_at: r.expiresAt };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    if (req.ceraAuth) await this.auth.logout(req.ceraAuth);
    res.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'strict', secure: this.env.CERA_SESSION_COOKIE_SECURE });
    return { logged_out: true };
  }

  @Get('me')
  me(@Req() req: AuthedRequest) {
    return { ...this.auth.me(identityOf(req)), auth_mode: this.env.CERA_AUTH_MODE };
  }
}

/** 사용자 · 역할 관리(ADMIN 만). 역할 · 활성 · 비밀번호가 바뀌면 그 사용자의 세션이 끊긴다. */
@ApiTags('admin')
@Controller('admin/users')
export class AdminUsersController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @RequirePermission('users.manage')
  @Get()
  list() {
    return this.auth.listUsers();
  }

  @RequirePermission('users.manage')
  @Post()
  create(@Body() body: unknown, @Req() req: AuthedRequest) {
    return this.auth.createUser(body, identityOf(req));
  }

  @RequirePermission('users.manage')
  @Patch(':userId')
  @ApiParam({ name: 'userId', required: true, schema: { type: 'string', format: 'uuid' } })
  update(@Param('userId') userId: string, @Body() body: unknown, @Req() req: AuthedRequest) {
    return this.auth.updateUser(userId, body, identityOf(req));
  }
}
