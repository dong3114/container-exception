import { Module } from '@nestjs/common';
import { CommunicationModule } from '../communication/communication.module.js';
import { RegistryModule } from '../registry/registry.module.js';
import { TruthModule } from '../truth/truth.module.js';
import { PlanFollowUpController } from './follow-up.controller.js';
import { PlanFollowUpService } from './follow-up.service.js';
import { PlanningController } from './planning.controller.js';
import { PlanningInputController } from './planning-input.controller.js';
import { PlanningInputService } from './planning-input.service.js';
import { RecoveryPlanService } from './recovery-plan.service.js';
import { ExceptionController } from '../detection/exception.controller.js';
import { ExceptionDetectorService } from '../detection/exception-detector.service.js';

/**
 * 복구 계획(T-112 · T-113 · T-114): 결정론 Cost / Risk Engine + Recovery Solver(HiGHS MIP) + 제안 판 저장 · 판 관리 · 사람 승인.
 * 엔진(`engine/`)은 순수 모듈이다 — DB · 네트워크 · LLM 을 import 하지 않는다(ADR-029). Agent 는 COMPUTE · PROPOSE Tool 로만 닿는다.
 */
@Module({
  imports: [TruthModule, CommunicationModule, RegistryModule],
  controllers: [PlanningController, PlanFollowUpController, PlanningInputController, ExceptionController],
  // T-132: 운영 예외 탐지기(결정론) — 계획 입력 · Truth 를 읽고 예외 · 복구 실행을 만든다
  providers: [RecoveryPlanService, PlanFollowUpService, PlanningInputService, ExceptionDetectorService],
  exports: [RecoveryPlanService, PlanFollowUpService, PlanningInputService, ExceptionDetectorService],
})
export class PlanningModule {}
