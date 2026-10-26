import { Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { CommunicationModule } from '../communication/communication.module.js';
import { PublicDataModule } from '../public-data/public-data.module.js';
import { RegistryModule } from '../registry/registry.module.js';
import { TruthModule } from '../truth/truth.module.js';
import { PlanningModule } from '../planning/planning.module.js';
import { AgentRunRepository } from './agent-run.repository.js';
import { AgentRunsController } from './agent-runs.controller.js';
import { AgentRuntimeController } from './agent-runtime.controller.js';
import { AgentRuntimeService } from './agent-runtime.service.js';
import { AgentCoordinator } from './coordinator.js';
import { AgentReconciler } from './reconciler.js';
import { AGENT_RUNTIME_CLIENT, HttpAgentRuntimeClient } from './runtime-client.js';
import { RuntimeStoreRepository } from './runtime-store.repository.js';
import { AgentServiceAuth } from './service-auth.js';
import { AgentToolsController } from './agent-tools.controller.js';
import { AgentToolsService } from './agent-tools.service.js';
import { RecoveryContextService } from './context.service.js';

/**
 * Agent Tool Layer(T-103 · ADR-036): Python Agent Runtime → 이 API → 기존 도메인 서비스.
 * Agent 는 DB · 공공 API · 발송 · 승인에 직접 닿지 않는다. 쓸 수 있는 것은 registry.ts 의 Tool 뿐이다.
 * T-104: Coordinator(시작 · 재개 · 끝 상태) · Runtime 저장 통로(checkpoint · 단계) — Python 은 DB 자격증명 없이 이 API 로만 실행 상태를 남긴다.
 */
@Module({
  imports: [PublicDataModule, RegistryModule, CommunicationModule, TruthModule, PlanningModule],
  controllers: [AgentToolsController, AgentRunsController, AgentRuntimeController],
  providers: [
    AgentServiceAuth,
    AgentRunRepository,
    RuntimeStoreRepository,
    RecoveryContextService,
    AgentToolsService,
    AgentRuntimeService,
    AgentCoordinator,
    AgentReconciler,
    // Backend → Python Agent Runtime(시작 · 재개). 시험은 이 토큰을 가짜로 바꿀 수 있다
    { provide: AGENT_RUNTIME_CLIENT, inject: [ENV], useFactory: (env: Env) => new HttpAgentRuntimeClient(env.CERA_AGENT_RUNTIME_URL, env.CERA_AGENT_TOOL_TOKEN, env.CERA_AGENT_RUNTIME_TIMEOUT_MS) },
  ],
  exports: [AgentCoordinator, AgentReconciler],
})
export class AgentToolsModule {}
