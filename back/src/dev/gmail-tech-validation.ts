import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { and, eq } from 'drizzle-orm';
import { loadDotEnvIfPresent, parseEnv } from '../config/env.js';
import { DATABASE, type Database } from '../db/database.js';
import { contactChannelAddress, planningSnapshot, recoveryRun } from '../db/schema/index.js';
import { TransactionRunner } from '../db/transaction.js';
import { SeedModule } from '../seed/seed.module.js';
import { SEED_IDS } from '../seed/slice1-fixture.js';
import { canonicalHash } from '../shared/hash/hash.js';
import { UuidV7Generator } from '../shared/id/uuid.js';
import { SystemClock } from '../shared/time/clock.js';
import { normalizeAddress } from '../registry/contact-gate.js';

/**
 * Gmail 기술검증 준비(T-118 · ADR-027 Tech Validation) — **local · test 전용 개발 명령**. 제품 API 가 아니다.
 *
 *   npm run gmail:tech-validation -- --recipient partner-test@gmail.com
 *
 * 1. 외부 **테스트** 계정 주소를 ODCY 연락처의 GMAIL 주소로 등록한다(확인 · 승인 · 활성 — 사람이 그 계정을 직접 만들고 확인했다는 전제).
 *    실제 거래처 주소를 넣지 않는다. 주소는 DB(로컬)에만 있고 저장소에 남지 않는다
 * 2. **시뮬레이션이 아닌** 계획 실행(오늘 날짜)을 만든다. 합성 30대 시나리오 실행의 값은 실채널로 나갈 수 없으므로(J.3 · G-06),
 *    실제 Gmail 왕복은 이 실행에서 한다. 이 실행의 사실은 시나리오 사실과 섞이지 않는다(is_simulated 구분)
 *
 * 개발 안전장치는 따로다: 주소가 `CERA_TEST_RECIPIENT_ALLOWLIST` 에 없으면 승인 · 발송이 막힌다(두 겹 — docs/18 G.5).
 */
const GMAIL_ADDRESS_ID = '01a2b0c0-1150-7a15-8b15-6d0a11000115';

async function main(): Promise<void> {
  loadDotEnvIfPresent();
  const env = parseEnv(process.env);
  if (env.APP_ENV !== 'local' && env.APP_ENV !== 'test') throw new Error(`Tech validation setup is allowed only in local or test (APP_ENV=${env.APP_ENV})`);
  const i = process.argv.indexOf('--recipient');
  const recipient = i > 0 ? normalizeAddress(process.argv[i + 1] ?? '') : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) throw new Error('usage: npm run gmail:tech-validation -- --recipient <external test gmail address>');
  if (env.GMAIL_ACCOUNT_EMAIL && normalizeAddress(env.GMAIL_ACCOUNT_EMAIL) === recipient) throw new Error('recipient must be a different (external test) account than the CERA Gmail account');

  const app = await NestFactory.createApplicationContext(SeedModule.forRoot(env), { logger: false });
  try {
    const db = app.get<Database>(DATABASE);
    const tx = app.get(TransactionRunner);
    const ids = new UuidV7Generator();
    const now = new SystemClock().now();
    const day = now.toSeoulIso().slice(0, 10);
    const triggerRef = `TECH-VALIDATION-${day}`;

    const result = await tx.run(async (t) => {
      const existingAddress = await t.select().from(contactChannelAddress).where(eq(contactChannelAddress.addressId, GMAIL_ADDRESS_ID)).limit(1);
      if (existingAddress.length === 0) {
        await t.insert(contactChannelAddress).values({
          addressId: GMAIL_ADDRESS_ID,
          contactId: SEED_IDS.contactOdcy,
          channelType: 'GMAIL',
          normalizedAddress: recipient,
          emailVerificationStatus: 'VERIFIED',
          relationshipStatus: 'APPROVED',
          communicationStatus: 'ACTIVE',
          verifiedAt: now.toDb(),
          approvedByActorId: SEED_IDS.actorOperator,
          approvedAt: now.toDb(),
        });
      } else if (existingAddress[0]!.normalizedAddress !== recipient) {
        throw new Error('a different tech-validation recipient is already registered — reset the local DB to change it');
      }

      const existingRun = await t
        .select({ runId: recoveryRun.runId })
        .from(recoveryRun)
        .where(and(eq(recoveryRun.triggerRef, triggerRef), eq(recoveryRun.containsSimulated, false)))
        .limit(1);
      if (existingRun[0]) return { runId: existingRun[0].runId, created: false };
      const snapshotId = ids.newId();
      const runId = ids.newId();
      await t.insert(planningSnapshot).values({
        snapshotId,
        asOf: now.toDb(),
        factFingerprint: canonicalHash({ k: 'snap-facts', v: 1, facts: [] }),
        ruleVersion: 'tech-validation-1',
        tariffVersion: 'tech-validation-1',
        policyVersion: 'tech-validation-1',
        scopeRef: { note: 'Tech Validation run — real channel round trip, no scenario values' },
        containsSimulated: false,
        createdAt: now.toDb(),
        scenarioId: null,
      });
      await t.insert(recoveryRun).values({
        runId,
        snapshotId,
        triggerType: 'OPERATOR_REQUEST',
        triggerRef,
        objectiveVersion: 'tech-validation-1',
        runStatus: 'FEASIBLE',
        totalCostKrw: null,
        containsSimulated: false,
        executedAt: now.toDb(),
      });
      return { runId, created: true };
    });

    const allowlisted = env.CERA_TEST_RECIPIENT_ALLOWLIST.includes(recipient);
    console.log(`GMAIL address registered for the ODCY contact (address_id=${GMAIL_ADDRESS_ID})`);
    console.log(`Tech validation recovery run ${result.created ? 'created' : 'already exists'}: ${result.runId} (plan date ${day}, not simulated)`);
    if (!allowlisted) console.log('WARNING: the recipient is not in CERA_TEST_RECIPIENT_ALLOWLIST — approval and sending will be blocked (NOT_IN_TEST_ALLOWLIST)');
    if (!env.CERA_GMAIL_ENABLED) console.log('WARNING: CERA_GMAIL_ENABLED=false — GMAIL messages will be CHANNEL_UNAVAILABLE');
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
