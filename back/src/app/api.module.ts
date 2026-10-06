import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DatabaseModule } from '../db/database.module.js';
import { HealthController } from '../health/health.controller.js';
import { ApiErrorFilter } from '../http/error.filter.js';
import { PersistenceModule } from '../persistence/persistence.module.js';
import { SharedModule } from '../shared/shared.module.js';

/** API 프로세스의 루트 모듈. 업무 모듈(통신 · 사건 · …)은 U1 이후 여기에 더한다. */
@Module({})
export class ApiModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: ApiModule,
      imports: [ConfigModule.forRoot(env), SharedModule, DatabaseModule.forRoot('cera-api'), PersistenceModule],
      controllers: [HealthController],
      providers: [{ provide: APP_FILTER, useClass: ApiErrorFilter }],
    };
  }
}
