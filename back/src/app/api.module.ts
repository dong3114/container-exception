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
import { PublicDataModule } from '../public-data/public-data.module.js';
import { AgentToolsModule } from '../agent-tools/agent-tools.module.js';
import { RegistryModule } from '../registry/registry.module.js';
import { SharedModule } from '../shared/shared.module.js';
import { TruthModule } from '../truth/truth.module.js';
import { PlanningModule } from '../planning/planning.module.js';
import { DemoController } from '../dev/demo.controller.js';
import { AuthModule } from '../auth/auth.module.js';

/** API 프로세스의 루트 모듈. 업무 모듈은 U 단위마다 여기에 더한다(U2: 등록부 · Contact Gate · U3: 문의 초안 · U4 승인 · U5 발송 요청 — 발송 자체는 Worker · T-102 공공데이터 · T-103 Agent Tool). */
@Module({})
export class ApiModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: ApiModule,
      imports: [ConfigModule.forRoot(env), SharedModule, DatabaseModule.forRoot('cera-api'), PersistenceModule, ChannelModule, RegistryModule, CommunicationModule, PublicDataModule, AgentToolsModule, TruthModule, PlanningModule, AuthModule],
      // 시연 · 테스트 도우미는 local · test 에서만(staging · production 에는 경로 자체가 없다)
      controllers: [HealthController, ...(env.APP_ENV === 'local' || env.APP_ENV === 'test' ? [DemoController] : [])],
      providers: [{ provide: APP_FILTER, useClass: ApiErrorFilter }],
    };
  }
}
