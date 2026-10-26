import { type DynamicModule, Inject, Injectable, Logger, Module } from '@nestjs/common';
import type pg from 'pg';
import { AgentToolsModule } from '../agent-tools/agent-tools.module.js';
import { AgentReconciler } from '../agent-tools/reconciler.js';
import { ChannelModule } from '../channel/channel.module.js';
import { CommunicationModule } from '../communication/communication.module.js';
import { ExtractionProcessor } from '../communication/extraction-processor.js';
import { InboundProcessor } from '../communication/inbound-processor.js';
import { OutboxDispatcher } from '../communication/outbox-dispatcher.js';
import { ConfigModule, ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { PG_POOL } from '../db/database.js';
import { DatabaseHealth, DatabaseModule } from '../db/database.module.js';
import { PersistenceModule } from '../persistence/persistence.module.js';
import { newJobContext, runWithContext } from '../shared/context/request-context.js';
import { SharedModule } from '../shared/shared.module.js';
import { TransactionRunner } from '../db/transaction.js';
import { TruthModule } from '../truth/truth.module.js';
import { TruthService } from '../truth/truth.service.js';
import { PlanningModule } from '../planning/planning.module.js';
import { RecoveryPlanService } from '../planning/recovery-plan.service.js';

/** advisory lock 키(docs/24 14 — 코드 한 곳에서 관리). 64비트 키는 SQL 의 hashtextextended 로 만든다. */
export const ADVISORY_LOCK_KEYS = { OUTBOX_WORKER: 'cera.outbox.worker', INBOUND_POLLER: 'cera.inbound.poller', EXTRACTION_WORKER: 'cera.extraction.worker', AGENT_RECONCILER: 'cera.agent.reconciler', TRUTH_REFRESH: 'cera.truth.refresh' } as const;

/** 사실 파생 표의 신선도 재판정 간격 [ASSUMPTION] — 읽기는 사건에서 직접 판정하므로 이 간격은 정확성이 아니라 투영 갱신 주기다 */
export const TRUTH_REFRESH_INTERVAL_MS = 60_000;
type LockKey = (typeof ADVISORY_LOCK_KEYS)[keyof typeof ADVISORY_LOCK_KEYS];

/**
 * Worker 프로세스(ADR-033 — 같은 코드베이스, 별도 프로세스). HTTP 를 띄우지 않는다.
 *
 * - 기동 점검(DB) → **발송 워커 단일 보장**: 전용 연결에서 세션 advisory lock(`cera.outbox.worker`)을 잡는다. 연결이 끊기면
 *   PostgreSQL 이 자동으로 풀어 준다 — 죽은 워커가 잠금을 쥐고 있지 않다(docs/24 14 결정 1). 못 잡으면 다른 워커가 도는 중이라 쉰다.
 * - 주기마다 `OutboxDispatcher.runCycle()`(화해 → 픽업 · 발송). 픽업 자체도 `FOR UPDATE SKIP LOCKED` 라 워커가 둘이어도 안전하다.
 * - 이어서 `InboundProcessor.runCycle()`(수신 — T-091) · `ExtractionProcessor.runCycle()`(회신 추출 — T-092, 잠금 `cera.extraction.worker`). 수신 폴링도 세션 잠금(`cera.inbound.poller`)으로 하나만 돈다. 두 작업은 서로의
 *   잠금 · 실패와 무관하다(한쪽이 실패해도 다른 쪽은 돈다). 중복 수신은 잠금이 아니라 외부 메시지 id UNIQUE 가 막는다.
 * - 마지막으로 `AgentReconciler.runOnce()`(T-104 durability — 잠금 `cera.agent.reconciler`): 기다리던 업무 기록이 이미 바뀐 Agent 실행 ·
 *   재시도 시각이 된 실행을 깨운다. 첫 주기 = 기동 재조정. 알림을 놓쳐도(프로세스 재시작 등) 실행이 영구 정지하지 않는다.
 * 업무 상태는 메모리에 두지 않는다 — 잠금 연결 하나만 쥔다.
 */
@Injectable()
export class WorkerRunner {
  private readonly logger = new Logger('WorkerRunner');
  private readonly locks = new Map<LockKey, pg.PoolClient>();
  private lastTruthRefresh = 0; // 주기 판단용 프로세스 시계(업무 판정에는 쓰지 않는다)

  constructor(
    @Inject(DatabaseHealth) private readonly database: DatabaseHealth,
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(OutboxDispatcher) private readonly dispatcher: OutboxDispatcher,
    @Inject(InboundProcessor) private readonly inbound: InboundProcessor,
    @Inject(ExtractionProcessor) private readonly extraction: ExtractionProcessor,
    @Inject(AgentReconciler) private readonly agents: AgentReconciler,
    @Inject(TruthService) private readonly truth: TruthService,
    @Inject(RecoveryPlanService) private readonly plans: RecoveryPlanService,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** 기동 점검. DB 에 닿지 않으면 실패한다. */
  async bootstrapCheck(): Promise<void> {
    await runWithContext(newJobContext(), async () => {
      const dbUp = await this.database.ping(5_000);
      if (!dbUp) throw new Error('worker bootstrap failed: database unreachable');
      this.logger.log({ msg: 'worker bootstrapped', db: 'up', sending_paused: this.env.CERA_SENDING_PAUSED });
    });
  }

  /** 발송 워커 잠금(세션). 이미 쥐고 있으면 true. */
  holdOutboxLock(): Promise<boolean> {
    return this.holdLock(ADVISORY_LOCK_KEYS.OUTBOX_WORKER);
  }

  /** 세션 advisory lock — 연결이 끊기면 PostgreSQL 이 풀어 준다. */
  async holdLock(key: LockKey): Promise<boolean> {
    if (this.locks.has(key)) return true;
    const client = await this.pool.connect();
    const { rows } = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS ok', [key]);
    if (rows[0]?.ok) {
      this.locks.set(key, client);
      return true;
    }
    client.release();
    return false;
  }

  /** 한 주기: 발송 → 수신. 각자 잠금을 못 잡으면 그 작업만 쉰다. */
  async tick(): Promise<void> {
    await runWithContext(newJobContext(), async () => {
      if (await this.holdLock(ADVISORY_LOCK_KEYS.OUTBOX_WORKER)) {
        try {
          const summary = await this.dispatcher.runCycle();
          const busy = summary.reconciled > 0 || Object.entries(summary.processed).some(([k, v]) => k !== 'SKIPPED' && v > 0);
          if (busy) this.logger.log({ msg: 'outbox cycle', ...summary });
        } catch (error) {
          this.logger.error({ msg: 'outbox cycle failed', error: error instanceof Error ? error.message : String(error) });
        }
      } else {
        this.logger.log({ msg: 'another outbox worker holds the lock — idle' });
      }
      if (await this.holdLock(ADVISORY_LOCK_KEYS.INBOUND_POLLER)) {
        try {
          const summary = await this.inbound.runCycle();
          if (summary.NORMAL + summary.HOLD > 0) this.logger.log({ msg: 'inbound cycle', ...summary });
        } catch (error) {
          this.logger.error({ msg: 'inbound cycle failed', error: error instanceof Error ? error.message : String(error) });
        }
      }
      // 회신 추출(T-092) — 정상 회신만, AI Server 호출은 트랜잭션 밖. AI 가 꺼져 있어도 발송 · 수신은 영향 없다
      if (await this.holdLock(ADVISORY_LOCK_KEYS.EXTRACTION_WORKER)) {
        try {
          const summary = await this.extraction.runCycle();
          if (Object.values(summary).some((v) => v > 0)) this.logger.log({ msg: 'extraction cycle', ...summary });
        } catch (error) {
          this.logger.error({ msg: 'extraction cycle failed', error: error instanceof Error ? error.message : String(error) });
        }
      }
      // 사실 신선도 재판정(T-111) — 시간이 지나 AGING · STALE · EXPIRED 가 된 것을 파생 표에 반영. 걸린 시간을 남긴다(관측)
      if (Date.now() - this.lastTruthRefresh >= TRUTH_REFRESH_INTERVAL_MS && (await this.holdLock(ADVISORY_LOCK_KEYS.TRUTH_REFRESH))) {
        this.lastTruthRefresh = Date.now();
        try {
          const summary = await this.truth.refreshDerived((work) => this.tx.run(work));
          if (summary.changed > 0 || summary.ms > 1_000) this.logger.log({ msg: 'truth refresh', ...summary });
        } catch (error) {
          this.logger.error({ msg: 'truth refresh failed', error: error instanceof Error ? error.message : String(error) });
        }
        // 계획 판이 기댄 사실이 바뀌었으면 OUTDATED(T-114) — API 의 FACT_CHANGED 알림을 놓쳐도 여기서 잡는다
        try {
          const t0 = Date.now();
          const outdated = await this.plans.refreshOutdated();
          if (outdated > 0) this.logger.log({ msg: 'plans outdated', count: outdated, ms: Date.now() - t0 });
        } catch (error) {
          this.logger.error({ msg: 'plan outdated check failed', error: error instanceof Error ? error.message : String(error) });
        }
      }
      // Agent 재조정 — 발송 · 수신 · 추출 결과를 본 뒤 기다리던 실행을 깨운다(같은 주기에 바로 이어진다). 시간 경과로 바뀐 사실도 DB 와 기준 시각으로 다시 판정한다
      if (await this.holdLock(ADVISORY_LOCK_KEYS.AGENT_RECONCILER)) {
        try {
          const summary = await this.agents.runOnce();
          if (summary.retried + summary.woken > 0) this.logger.log({ msg: 'agent reconcile', ...summary });
        } catch (error) {
          this.logger.error({ msg: 'agent reconcile failed', error: error instanceof Error ? error.message : String(error) });
        }
      }
    });
  }

  async releaseLock(): Promise<void> {
    for (const [key, client] of this.locks) {
      try {
        await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [key]);
      } finally {
        client.release();
        this.locks.delete(key);
      }
    }
  }
}

@Module({})
export class WorkerModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: WorkerModule,
      imports: [ConfigModule.forRoot(env), SharedModule, DatabaseModule.forRoot('cera-worker'), PersistenceModule, ChannelModule, CommunicationModule, AgentToolsModule, TruthModule, PlanningModule],
      providers: [WorkerRunner],
    };
  }
}
