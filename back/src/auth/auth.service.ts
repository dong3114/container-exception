import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE, type Database } from '../db/database.js';
import { actor, userAccount, userSession } from '../db/schema/index.js';
import { USER_ROLE } from '../db/schema/codes.js';
import { TransactionRunner } from '../db/transaction.js';
import { AuditRecorder } from '../persistence/audit-recorder.js';
import { AUDIT_ACTION } from '../persistence/catalog.js';
import { BusinessRuleError, CeraError, ValidationError } from '../shared/errors/cera-error.js';
import { sha256Bytes } from '../shared/hash/hash.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password.js';
import { ROLE_PERMISSIONS, type Permission, type UserRole } from './permissions.js';

/** 요청 하나의 사람 신원(세션에서 찾았거나, dev-header 모드의 옛 헤더에서). Agent · Worker 는 여기에 오지 않는다. */
export interface AuthIdentity {
  userId: string | null;
  actorId: string;
  loginId: string | null;
  displayName: string;
  role: UserRole;
  sessionId: string | null;
  /** 어떻게 정해졌나: SESSION(로그인) · DEV_HEADER(local · test 의 옛 헤더 — 계정 없는 HUMAN 은 OPERATOR 로 본다) */
  via: 'SESSION' | 'DEV_HEADER';
}

export class AuthError extends CeraError {
  readonly kind = 'BUSINESS' as const; // 권한 · 인증 거부는 기술 오류가 아니라 정책 거부다
  constructor(code: string, message: string, httpStatus: 401 | 403 | 429) {
    super(code, message, httpStatus);
  }
}

export const SESSION_COOKIE = 'cera_session';
const LOGIN_RE = /^[a-z0-9][a-z0-9._@-]{2,59}$/;

const loginBody = z.object({ login_id: z.string().min(1).max(60), password: z.string().min(1).max(200) }).strict();
const createUserBody = z
  .object({
    login_id: z.string().regex(LOGIN_RE),
    display_name: z.string().trim().min(1).max(60),
    role: z.enum(USER_ROLE),
    password: z.string().min(12).max(200),
  })
  .strict();
const updateUserBody = z
  .object({
    role: z.enum(USER_ROLE).optional(),
    is_active: z.boolean().optional(),
    password: z.string().min(12).max(200).optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'nothing to change');

/** 로그인 실패 제한(계정 이름별, 프로세스 메모리) — 15분에 5번 [ASSUMPTION]. 여러 API 인스턴스면 인스턴스마다 따로 센다. */
const FAIL_WINDOW_MS = 15 * 60_000;
const FAIL_LIMIT = 5;

/**
 * 사람 로그인 · 세션 · 사용자 관리(T-119).
 * - 세션 토큰은 32바이트 난수. 브라우저에는 HttpOnly 쿠키로만, DB 에는 sha256 지문만 둔다 → 서명 비밀키가 필요 없다
 * - 로그아웃 · 비활성 · 역할 변경 · 비밀번호 변경은 그 사용자의 열린 세션을 모두 끊는다
 * - 실패 사유는 밖으로 하나(INVALID_CREDENTIALS)만 — 계정이 있는지 알려 주지 않는다
 */
@Injectable()
export class AuthService {
  private readonly failures = new Map<string, number[]>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(AuditRecorder) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async login(body: unknown): Promise<{ token: string; expiresAt: string; me: ReturnType<AuthService['me']> }> {
    const parsed = loginBody.safeParse(body);
    if (!parsed.success) throw new ValidationError('INVALID_LOGIN_REQUEST', 'login_id and password are required', ['login_id', 'password']);
    const loginId = parsed.data.login_id.trim().toLowerCase();
    const now = this.clock.now();
    const recent = (this.failures.get(loginId) ?? []).filter((t) => t > now.epochMs - FAIL_WINDOW_MS);
    if (recent.length >= FAIL_LIMIT) throw new AuthError('LOGIN_RATE_LIMITED', 'Too many failed attempts — try again later', 429);

    const rows = await this.db
      .select({ u: userAccount, displayName: actor.displayName, actorActive: actor.isActive, actorType: actor.actorType })
      .from(userAccount)
      .innerJoin(actor, eq(actor.actorId, userAccount.actorId))
      .where(eq(userAccount.loginId, loginId))
      .limit(1);
    const row = rows[0];
    const ok = await verifyPassword(parsed.data.password, row?.u.passwordHash ?? DUMMY_HASH);
    if (!row || !ok || !row.u.isActive || !row.actorActive || row.actorType !== 'HUMAN') {
      this.failures.set(loginId, [...recent, now.epochMs]);
      throw new AuthError('INVALID_CREDENTIALS', 'Login failed', 401);
    }
    this.failures.delete(loginId);

    const token = randomBytes(32).toString('base64url');
    const sessionId = this.ids.newId();
    const expiresAt = now.plusMs(this.env.CERA_SESSION_TTL_MINUTES * 60_000);
    await this.tx.run(async (tx) => {
      await tx.insert(userSession).values({ sessionId, userId: row.u.userId, tokenHash: sha256Bytes(token), createdAt: now.toDb(), expiresAt: expiresAt.toDb() });
      await this.audit.record(tx, { actorId: row.u.actorId, action: AUDIT_ACTION.AUTH_LOGIN, targetType: 'USER_SESSION', targetId: sessionId, result: 'SUCCESS', isSimulated: false });
    });
    const identity: AuthIdentity = { userId: row.u.userId, actorId: row.u.actorId, loginId, displayName: row.displayName, role: row.u.role as UserRole, sessionId, via: 'SESSION' };
    return { token, expiresAt: expiresAt.toSeoulIso(), me: this.me(identity) };
  }

  /** 쿠키의 토큰 → 살아 있는 세션 · 활성 사용자 · 활성 HUMAN actor. 아니면 null(401 은 Guard 가 정한다). */
  async resolveSession(token: string): Promise<AuthIdentity | null> {
    if (token.length < 20 || token.length > 100) return null;
    const now = this.clock.now().toDb();
    const rows = await this.db
      .select({ s: userSession, u: userAccount, displayName: actor.displayName, actorActive: actor.isActive, actorType: actor.actorType })
      .from(userSession)
      .innerJoin(userAccount, eq(userAccount.userId, userSession.userId))
      .innerJoin(actor, eq(actor.actorId, userAccount.actorId))
      .where(and(eq(userSession.tokenHash, sha256Bytes(token)), isNull(userSession.revokedAt), gt(userSession.expiresAt, now)))
      .limit(1);
    const r = rows[0];
    if (!r || !r.u.isActive || !r.actorActive || r.actorType !== 'HUMAN') return null;
    return { userId: r.u.userId, actorId: r.u.actorId, loginId: r.u.loginId, displayName: r.displayName, role: r.u.role as UserRole, sessionId: r.s.sessionId, via: 'SESSION' };
  }

  /** dev-header 모드(local · test): 헤더의 actor 가 활성 HUMAN 이면 그 계정의 역할, 계정이 없으면 OPERATOR(옛 개발 흐름). */
  async resolveDevHeader(actorId: string): Promise<AuthIdentity | null> {
    if (!z.string().uuid().safeParse(actorId).success) return null;
    const rows = await this.db
      .select({ actorId: actor.actorId, displayName: actor.displayName, isActive: actor.isActive, actorType: actor.actorType, role: userAccount.role, userId: userAccount.userId, loginId: userAccount.loginId, userActive: userAccount.isActive })
      .from(actor)
      .leftJoin(userAccount, eq(userAccount.actorId, actor.actorId))
      .where(eq(actor.actorId, actorId))
      .limit(1);
    const r = rows[0];
    if (!r || !r.isActive || r.actorType !== 'HUMAN' || r.userActive === false) return null;
    return { userId: r.userId, actorId: r.actorId, loginId: r.loginId, displayName: r.displayName, role: (r.role as UserRole | null) ?? 'OPERATOR', sessionId: null, via: 'DEV_HEADER' };
  }

  async logout(identity: AuthIdentity): Promise<void> {
    if (!identity.sessionId) return;
    const now = this.clock.now().toDb();
    await this.tx.run(async (tx) => {
      await tx.update(userSession).set({ revokedAt: now }).where(and(eq(userSession.sessionId, identity.sessionId!), isNull(userSession.revokedAt)));
      await this.audit.record(tx, { actorId: identity.actorId, action: AUDIT_ACTION.AUTH_LOGOUT, targetType: 'USER_SESSION', targetId: identity.sessionId!, result: 'SUCCESS', isSimulated: false });
    });
  }

  me(identity: AuthIdentity) {
    return {
      user_id: identity.userId,
      actor_id: identity.actorId,
      login_id: identity.loginId,
      display_name: identity.displayName,
      role: identity.role,
      permissions: [...ROLE_PERMISSIONS[identity.role]] as Permission[],
      via: identity.via,
    };
  }

  // ── 사용자 관리(ADMIN) ──

  async listUsers() {
    const rows = await this.db
      .select({ u: userAccount, displayName: actor.displayName })
      .from(userAccount)
      .innerJoin(actor, eq(actor.actorId, userAccount.actorId))
      .orderBy(asc(userAccount.loginId));
    return { users: rows.map((r) => this.userView(r.u, r.displayName)) };
  }

  async createUser(body: unknown, by: AuthIdentity) {
    const parsed = createUserBody.safeParse(body);
    if (!parsed.success) throw new ValidationError('INVALID_USER_REQUEST', 'login_id (a-z0-9._@-), display_name, role, password (12+) are required', parsed.error.issues.map((i) => i.path.join('.')));
    const b = parsed.data;
    const now = this.clock.now().toDb();
    const passwordHash = await hashPassword(b.password);
    const userId = this.ids.newId();
    const actorId = this.ids.newId();
    try {
      await this.tx.run(async (tx) => {
        await tx.insert(actor).values({ actorId, actorType: 'HUMAN', displayName: b.display_name, isActive: true });
        await tx.insert(userAccount).values({ userId, actorId, loginId: b.login_id, role: b.role, passwordHash, isActive: true, createdAt: now, updatedAt: now });
        await this.audit.record(tx, { actorId: by.actorId, action: AUDIT_ACTION.USER_CREATED, targetType: 'USER_ACCOUNT', targetId: userId, result: 'SUCCESS', isSimulated: false });
      });
    } catch (error) {
      if (String((error as { cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code) === '23505') throw new BusinessRuleError('LOGIN_ID_TAKEN', 'This login id is already used', 409);
      throw error;
    }
    return this.userView({ userId, actorId, loginId: b.login_id, role: b.role, isActive: true, createdAt: now, updatedAt: now }, b.display_name);
  }

  async updateUser(userId: string, body: unknown, by: AuthIdentity) {
    if (!z.string().uuid().safeParse(userId).success) throw new ValidationError('INVALID_ID', 'user id must be a UUID', ['userId']);
    const parsed = updateUserBody.safeParse(body);
    if (!parsed.success) throw new ValidationError('INVALID_USER_REQUEST', 'role, is_active or password (12+)', parsed.error.issues.map((i) => i.path.join('.')));
    const b = parsed.data;
    // 마지막 활성 ADMIN 을 스스로 잠그지 않게 — 자기 자신의 역할 낮추기 · 비활성은 막는다
    if (userId === by.userId && ((b.role && b.role !== 'ADMIN') || b.is_active === false)) {
      throw new BusinessRuleError('CANNOT_DEMOTE_SELF', 'An admin cannot remove their own admin access', 409);
    }
    const now = this.clock.now().toDb();
    const passwordHash = b.password ? await hashPassword(b.password) : undefined;
    const updated = await this.tx.run(async (tx) => {
      const rows = await tx
        .update(userAccount)
        .set({ ...(b.role ? { role: b.role } : {}), ...(b.is_active !== undefined ? { isActive: b.is_active } : {}), ...(passwordHash ? { passwordHash } : {}), updatedAt: now })
        .where(eq(userAccount.userId, userId))
        .returning();
      const u = rows[0];
      if (!u) return null;
      // 권한이 바뀌면 열린 세션을 끊는다 — 옛 권한으로 계속 일하지 못하게
      await tx.update(userSession).set({ revokedAt: now }).where(and(eq(userSession.userId, userId), isNull(userSession.revokedAt)));
      await this.audit.record(tx, { actorId: by.actorId, action: AUDIT_ACTION.USER_UPDATED, targetType: 'USER_ACCOUNT', targetId: userId, result: 'SUCCESS', isSimulated: false });
      const a = await tx.select({ displayName: actor.displayName }).from(actor).where(eq(actor.actorId, u.actorId)).limit(1);
      return this.userView(u, a[0]?.displayName ?? '');
    });
    if (!updated) throw new BusinessRuleError('USER_NOT_FOUND', 'No user with this id', 404);
    return updated;
  }

  private userView(u: { userId: string; actorId: string; loginId: string; role: string; isActive: boolean; createdAt: string; updatedAt: string }, displayName: string) {
    return { user_id: u.userId, actor_id: u.actorId, login_id: u.loginId, display_name: displayName, role: u.role as UserRole, is_active: u.isActive, created_at: u.createdAt, updated_at: u.updatedAt };
  }
}
