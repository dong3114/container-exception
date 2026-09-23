import { type DynamicModule, Inject, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DatabaseHealth, DatabaseModule } from '../db/database.module.js';
import { newJobContext, runWithContext } from '../shared/context/request-context.js';
import { SharedModule } from '../shared/shared.module.js';

/**
 * Worker 프로세스. U0 는 **기동 · DB 확인 · 정상 종료**까지만 한다.
 * Outbox 픽업 · 발송 · 화해 · 수신 폴링은 U5 · U6(docs/24 14절)에서 여기에 붙인다.
 */
@Injectable()
export class WorkerRunner {
  private readonly logger = new Logger('WorkerRunner');

  constructor(@Inject(DatabaseHealth) private readonly database: DatabaseHealth) {}

  /** 기동 점검. DB 에 닿지 않으면 실패한다. */
  async bootstrapCheck(): Promise<void> {
    await runWithContext(newJobContext(), async () => {
      const dbUp = await this.database.ping(5_000);
      if (!dbUp) throw new Error('worker bootstrap failed: database unreachable');
      this.logger.log({ msg: 'worker bootstrapped', db: 'up' });
    });
  }
}

@Module({})
export class WorkerModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: WorkerModule,
      imports: [ConfigModule.forRoot(env), SharedModule, DatabaseModule.forRoot('cera-worker')],
      providers: [{ provide: WorkerRunner, inject: [DatabaseHealth], useFactory: (db: DatabaseHealth) => new WorkerRunner(db) }],
    };
  }
}
