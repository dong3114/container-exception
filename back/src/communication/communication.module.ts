import { Module } from '@nestjs/common';
import { ApprovalController } from './approval.controller.js';
import { ApprovalRepository } from './approval.repository.js';
import { ApprovalService } from './approval.service.js';
import { PlanningRunController, DraftController } from './draft.controller.js';
import { DraftRepository } from './draft.repository.js';
import { DraftService } from './draft.service.js';
import { PlanSupersessionService } from './plan-supersession.service.js';

/** 문의 초안 · 구조화 값 · 숫자 검사(T-088 U3) + 발송 승인 · 무효화(T-089 U4). 발송(U5)이 이 모듈에 더해진다. */
@Module({
  controllers: [DraftController, ApprovalController, PlanningRunController],
  providers: [DraftRepository, ApprovalRepository, DraftService, ApprovalService, PlanSupersessionService],
  exports: [DraftService, ApprovalService, PlanSupersessionService],
})
export class CommunicationModule {}
