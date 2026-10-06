import { Module } from '@nestjs/common';
import { PlanningRunController, DraftController } from './draft.controller.js';
import { DraftRepository } from './draft.repository.js';
import { DraftService } from './draft.service.js';

/** 문의 초안 · 구조화 값 · 숫자 검사(T-088 U3). 승인(U4) · 발송(U5)이 이 모듈에 더해진다. */
@Module({
  controllers: [DraftController, PlanningRunController],
  providers: [DraftRepository, DraftService],
  exports: [DraftService],
})
export class CommunicationModule {}
