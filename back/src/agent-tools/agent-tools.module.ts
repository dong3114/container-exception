import { Module } from '@nestjs/common';
import { CommunicationModule } from '../communication/communication.module.js';
import { PublicDataModule } from '../public-data/public-data.module.js';
import { RegistryModule } from '../registry/registry.module.js';
import { AgentRunRepository } from './agent-run.repository.js';
import { AgentRunsController } from './agent-runs.controller.js';
import { AgentToolsController } from './agent-tools.controller.js';
import { AgentToolsService } from './agent-tools.service.js';
import { RecoveryContextService } from './context.service.js';

/**
 * Agent Tool Layer(T-103 · ADR-036): Python Agent Runtime → 이 API → 기존 도메인 서비스.
 * Agent 는 DB · 공공 API · 발송 · 승인에 직접 닿지 않는다. 쓸 수 있는 것은 registry.ts 의 Tool 뿐이다.
 */
@Module({
  imports: [PublicDataModule, RegistryModule, CommunicationModule],
  controllers: [AgentToolsController, AgentRunsController],
  providers: [AgentRunRepository, RecoveryContextService, AgentToolsService],
})
export class AgentToolsModule {}
