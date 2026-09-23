import { type DynamicModule, Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { createDatabase, createPool, DATABASE, type Database, PG_POOL } from './database.js';
import { TransactionRunner } from './transaction.js';

@Injectable()
export class DatabaseHealth {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** DB 연결 확인. 시간 제한 안에 `select 1` 이 돌면 true. */
  async ping(timeoutMs = 2_000): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('db ping timeout')), timeoutMs);
      });
      await Promise.race([this.db.execute(sql`select 1`), timeout]);
      return true;
    } catch {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

@Injectable()
class PoolLifecycle implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({})
export class DatabaseModule {
  /** `applicationName`: PostgreSQL 에서 어느 프로세스의 연결인지 보이게 한다(cera-api / cera-worker). */
  static forRoot(applicationName: string): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: PG_POOL,
          inject: [ENV],
          useFactory: (env: Env) =>
            createPool({
              connectionString: env.DATABASE_URL,
              applicationName,
              max: env.DB_POOL_MAX,
              statementTimeoutMs: env.DB_STATEMENT_TIMEOUT_MS,
            }),
        },
        { provide: DATABASE, inject: [PG_POOL], useFactory: (pool: pg.Pool) => createDatabase(pool) },
        { provide: TransactionRunner, inject: [DATABASE], useFactory: (db: Database) => new TransactionRunner(db) },
        { provide: DatabaseHealth, inject: [DATABASE], useFactory: (db: Database) => new DatabaseHealth(db) },
        { provide: PoolLifecycle, inject: [PG_POOL], useFactory: (pool: pg.Pool) => new PoolLifecycle(pool) },
      ],
      exports: [PG_POOL, DATABASE, TransactionRunner, DatabaseHealth],
    };
  }
}
