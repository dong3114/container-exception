import { Module } from '@nestjs/common';
import { TruthModule } from '../truth/truth.module.js';
import { PlanningController } from './planning.controller.js';
import { RecoveryPlanService } from './recovery-plan.service.js';

/**
 * 복구 계획(T-112 · T-113 · T-114): 결정론 Cost / Risk Engine + Recovery Solver(HiGHS MIP) + 제안 판 저장 · 판 관리 · 사람 승인.
 * 엔진(`engine/`)은 순수 모듈이다 — DB · 네트워크 · LLM 을 import 하지 않는다(ADR-029). Agent 는 COMPUTE · PROPOSE Tool 로만 닿는다.
 */
@Module({
  imports: [TruthModule],
  controllers: [PlanningController],
  providers: [RecoveryPlanService],
  exports: [RecoveryPlanService],
})
export class PlanningModule {}
