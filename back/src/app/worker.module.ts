import { type DynamicModule, Inject, Injectable, Logger, Module } from '@nestjs/common';
import type pg from 'pg';
import { ChannelModule } from '../channel/channel.module.js';
import { CommunicationModule } from '../communication/communication.module.js';
import { OutboxDispatcher } from '../communication/outbox-dispatcher.js';
import { ConfigModule, ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { PG_POOL } from '../db/database.js';
import { DatabaseHealth, DatabaseModule } from '../db/database.module.js';
import { PersistenceModule } from '../persistence/persistence.module.js';
import { newJobContext, runWithContext } from '../shared/context/request-context.js';
import { SharedModule } from '../shared/shared.module.js';

/** advisory lock 키(docs/24 14 — 코드 한 곳에서 관리). 64비트 키는 SQL 의 hashtextextended 로 만든다. */
export const ADVISORY_LOCK_KEYS = { OUTBOX_WORKER: 'cera.outbox.worker' } as const;

/**
 * Worker 프로세스(ADR-033 — 같은 코드베이스, 별도 프로세스). HTTP 를 띄우지 않는다.
 *
 * - 기동 점검(DB) → **발송 워커 단일 보장**: 전용 연결에서 세션 advisory lock(`cera.outbox.worker`)을 잡는다. 연결이 끊기면
 *   PostgreSQL 이 자동으로 풀어 준다 — 죽은 워커가 잠금을 쥐고 있지 않다(docs/24 14 결정 1). 못 잡으면 다른 워커가 도는 중이라 쉰다.
 * - 주기마다 `OutboxDispatcher.runCycle()`(화해 → 픽업 · 발송). 픽업 자체도 `FOR UPDATE SKIP LOCKED` 라 워커가 둘이어도 안전하다.
 * 업무 상태는 메모리에 두지 않는다 — 잠금 연결 하나만 쥔다.
 */
@Injectable()
export class WorkerRunner {
  private readonly logger = new Logger('WorkerRunner');
  private lockClient: pg.PoolClient | null = null;

  constructor(
    @Inject(DatabaseHealth) private readonly database: DatabaseHealth,
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(OutboxDispatcher) private readonly dispatcher: OutboxDispatcher,
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
  async holdOutboxLock(): Promise<boolean> {
    if (this.lockClient) return true;
    const client = await this.pool.connect();
    const { rows } = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS ok', [ADVISORY_LOCK_KEYS.OUTBOX_WORKER]);
    if (rows[0]?.ok) {
      this.lockClient = client;
      return true;
    }
    client.release();
    return false;
  }

  /** 한 주기. 잠금을 못 잡으면 아무것도 하지 않는다. */
  async tick(): Promise<void> {
    await runWithContext(newJobContext(), async () => {
      if (!(await this.holdOutboxLock())) {
        this.logger.log({ msg: 'another outbox worker holds the lock — idle' });
        return;
      }
      const summary = await this.dispatcher.runCycle();
      const busy = summary.reconciled > 0 || Object.entries(summary.processed).some(([k, v]) => k !== 'SKIPPED' && v > 0);
      if (busy) this.logger.log({ msg: 'outbox cycle', ...summary });
    });
  }

  async releaseLock(): Promise<void> {
    if (!this.lockClient) return;
    try {
      await this.lockClient.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [ADVISORY_LOCK_KEYS.OUTBOX_WORKER]);
    } finally {
      this.lockClient.release();
      this.lockClient = null;
    }
  }
}

@Module({})
export class WorkerModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: WorkerModule,
      imports: [ConfigModule.forRoot(env), SharedModule, DatabaseModule.forRoot('cera-worker'), PersistenceModule, ChannelModule, CommunicationModule],
      providers: [WorkerRunner],
    };
  }
}
