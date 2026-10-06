import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DatabaseModule } from '../db/database.module.js';
import { PersistenceModule } from '../persistence/persistence.module.js';
import { SharedModule } from '../shared/shared.module.js';
import { Slice1Seed } from './slice1-seed.js';

/** 시드 명령 전용 모듈(API · Worker 에 넣지 않는다 — 운영 기동에서 시드가 돌 수 없다). */
@Module({})
export class SeedModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: SeedModule,
      imports: [ConfigModule.forRoot(env), SharedModule, DatabaseModule.forRoot('cera-seed'), PersistenceModule],
      providers: [Slice1Seed],
      exports: [Slice1Seed],
    };
  }
}
