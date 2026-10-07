import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DatabaseModule } from '../db/database.module.js';
import { HealthController } from '../health/health.controller.js';
import { ChannelModule } from '../channel/channel.module.js';
import { CommunicationModule } from '../communication/communication.module.js';
import { ApiErrorFilter } from '../http/error.filter.js';
import { PersistenceModule } from '../persistence/persistence.module.js';
import { RegistryModule } from '../registry/registry.module.js';
import { SharedModule } from '../shared/shared.module.js';

/** API 프로세스의 루트 모듈. 업무 모듈은 U 단위마다 여기에 더한다(U2: 등록부 · Contact Gate · U3: 문의 초안 · U4 승인 · U5 발송 요청 — 발송 자체는 Worker). */
@Module({})
export class ApiModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: ApiModule,
      imports: [ConfigModule.forRoot(env), SharedModule, DatabaseModule.forRoot('cera-api'), PersistenceModule, ChannelModule, RegistryModule, CommunicationModule],
      controllers: [HealthController],
      providers: [{ provide: APP_FILTER, useClass: ApiErrorFilter }],
    };
  }
}
