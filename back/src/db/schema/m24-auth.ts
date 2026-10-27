import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, primaryKey, text, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { cera, ckHash, ckIn, hash, n, tstz } from './_common.js';
import { USER_ROLE } from './codes.js';
import { actor } from './m01-foundation.js';

/**
 * M24 사람 로그인(T-119). 사용자 계정 하나 = HUMAN actor 하나 — 승인 · 확인 · 감사가 믿는 주체는 여전히 `actor` 다.
 * - 비밀번호는 해시만(scrypt, `back/src/auth/password.ts`). 평문 · 되돌릴 수 있는 값은 저장하지 않는다
 * - 세션 토큰은 지문(sha256)만 저장한다 — DB 를 읽어도 세션을 쓸 수 없다
 * - Agent(AI_AGENT) · Worker(SYSTEM) 는 계정이 없다. 서비스 인증(Agent Tool 토큰)과 섞지 않는다
 * 트리거 · 권한은 M25(custom).
 */
export const userAccount = cera.table(
  'user_account',
  {
    userId: uuid('user_id').notNull(),
    actorId: uuid('actor_id').notNull(),
    loginId: varchar('login_id', { length: 60 }).notNull(),
    role: text('role').notNull(),
    passwordHash: varchar('password_hash', { length: 200 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: tstz('created_at').notNull(),
    updatedAt: tstz('updated_at').notNull(),
  },
  (t) => [
    primaryKey({ name: n('pk_user_account'), columns: [t.userId] }),
    foreignKey({ name: n('fk_user_account__actor_id'), columns: [t.actorId], foreignColumns: [actor.actorId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_user_account__actor_id')).on(t.actorId),
    unique(n('uq_user_account__login_id')).on(t.loginId),
    ckIn('user_account', t.role, USER_ROLE),
    check(n('ck_user_account__login_id_format'), sql`${t.loginId} ~ '^[a-z0-9][a-z0-9._@-]{2,59}$'`),
    check(n('ck_user_account__password_hash_format'), sql`${t.passwordHash} ~ '^scrypt[$][0-9]+[$][0-9]+[$][0-9]+[$][A-Za-z0-9_-]+[$][A-Za-z0-9_-]+$'`),
    check(n('ck_user_account__updated_after_created'), sql`${t.updatedAt} >= ${t.createdAt}`),
  ],
);

export const userSession = cera.table(
  'user_session',
  {
    sessionId: uuid('session_id').notNull(),
    userId: uuid('user_id').notNull(),
    tokenHash: hash('token_hash').notNull(),
    createdAt: tstz('created_at').notNull(),
    expiresAt: tstz('expires_at').notNull(),
    revokedAt: tstz('revoked_at'),
  },
  (t) => [
    primaryKey({ name: n('pk_user_session'), columns: [t.sessionId] }),
    foreignKey({ name: n('fk_user_session__user_id'), columns: [t.userId], foreignColumns: [userAccount.userId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_user_session__token_hash')).on(t.tokenHash),
    ckHash('user_session', t.tokenHash),
    check(n('ck_user_session__expires_after_created'), sql`${t.expiresAt} > ${t.createdAt}`),
    check(n('ck_user_session__revoked_after_created'), sql`${t.revokedAt} IS NULL OR ${t.revokedAt} >= ${t.createdAt}`),
    index(n('ix_user_session__user_id')).on(t.userId),
  ],
);
