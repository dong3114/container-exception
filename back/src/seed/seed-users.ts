import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { hashPassword } from '../auth/password.js';
import type { UserRole } from '../auth/permissions.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE, type Database } from '../db/database.js';
import { actor, userAccount } from '../db/schema/index.js';
import { Instant } from '../shared/time/instant.js';
import { SEED_IDS } from './slice1-fixture.js';

/**
 * 개발 시드 사용자(T-119) — local · test 의 `db:seed` 만. 비밀번호는 `.env` 의 CERA_SEED_*_PASSWORD 에서 읽는다(저장소에 없다).
 * 비어 있는 역할은 만들지 않는다. 이미 있으면 그대로 둔다(비밀번호를 바꾸려면 관리자 화면 · API).
 * operator 계정은 기존 시드의 "운영자 (가상)" actor 에 붙는다 — 그동안의 승인 · 확인 기록과 같은 사람이다.
 */
const USERS: { key: 'CERA_SEED_ADMIN_PASSWORD' | 'CERA_SEED_OPERATOR_PASSWORD' | 'CERA_SEED_FIELD_PASSWORD'; userId: string; actorId: string; loginId: string; displayName: string; role: UserRole }[] = [
  { key: 'CERA_SEED_ADMIN_PASSWORD', userId: SEED_IDS.userAdmin, actorId: SEED_IDS.actorAdmin, loginId: 'admin', displayName: '관리자 (가상)', role: 'ADMIN' },
  { key: 'CERA_SEED_OPERATOR_PASSWORD', userId: SEED_IDS.userOperator, actorId: SEED_IDS.actorOperator, loginId: 'operator', displayName: '운영자 (가상)', role: 'OPERATOR' },
  { key: 'CERA_SEED_FIELD_PASSWORD', userId: SEED_IDS.userField, actorId: SEED_IDS.actorField, loginId: 'field', displayName: '현장 담당자 (가상)', role: 'FIELD_OPERATOR' },
];

@Injectable()
export class SeedUsers {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async apply(at: Instant): Promise<string[]> {
    const created: string[] = [];
    for (const u of USERS) {
      const password = this.env[u.key];
      if (!password) continue;
      const passwordHash = await hashPassword(password);
      await this.db.transaction(async (tx) => {
        await tx.insert(actor).values({ actorId: u.actorId, actorType: 'HUMAN', displayName: u.displayName }).onConflictDoNothing();
        const rows = await tx
          .insert(userAccount)
          .values({ userId: u.userId, actorId: u.actorId, loginId: u.loginId, role: u.role, passwordHash, isActive: true, createdAt: at.toDb(), updatedAt: at.toDb() })
          .onConflictDoNothing()
          .returning({ id: userAccount.userId });
        if (rows.length > 0) created.push(u.loginId);
      });
    }
    return created;
  }

  /**
   * 공개 포트폴리오 데모 방문자(T-131) — `CERA_PORTFOLIO_DEMO_MODE` 의 시드만 부른다(run-seed.ts).
   * 비밀번호는 매번 새로 만든 난수의 해시이고 어디에도 남기지 않는다 → 로그인 화면으로는 들어올 수 없고 데모 세션 경로로만 쓴다.
   */
  async applyDemoVisitor(at: Instant): Promise<boolean> {
    const passwordHash = await hashPassword(randomBytes(32).toString('base64url'));
    return this.db.transaction(async (tx) => {
      await tx.insert(actor).values({ actorId: SEED_IDS.actorDemo, actorType: 'HUMAN', displayName: '데모 방문자 (가상)' }).onConflictDoNothing();
      const rows = await tx
        .insert(userAccount)
        .values({ userId: SEED_IDS.userDemo, actorId: SEED_IDS.actorDemo, loginId: 'demo@cera.local', role: 'DEMO_VISITOR', passwordHash, isActive: true, createdAt: at.toDb(), updatedAt: at.toDb() })
        .onConflictDoNothing()
        .returning({ id: userAccount.userId });
      return rows.length > 0;
    });
  }
}

export const seedNow = () => Instant.ofEpochMs(Date.now());
