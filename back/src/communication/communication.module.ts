import { Module } from '@nestjs/common';
import { ApprovalController } from './approval.controller.js';
import { ApprovalRepository } from './approval.repository.js';
import { ApprovalService } from './approval.service.js';
import { PlanningRunController, DraftController } from './draft.controller.js';
import { DraftRepository } from './draft.repository.js';
import { DraftService } from './draft.service.js';
import { OutboxDispatcher } from './outbox-dispatcher.js';
import { PlanSupersessionService } from './plan-supersession.service.js';
import { SendController } from './send.controller.js';
import { SendRepository } from './send.repository.js';
import { SendService } from './send.service.js';

/**
 * 문의 초안 · 숫자 검사(T-088 U3) + 발송 승인 · 무효화(T-089 U4) + 발송 요청 · Outbox 디스패처(T-090 U5).
 * API 프로세스는 컨트롤러를, Worker 프로세스는 `OutboxDispatcher` 를 쓴다(같은 코드, 다른 프로세스 — ADR-033).
 */
@Module({
  controllers: [DraftController, ApprovalController, SendController, PlanningRunController],
  providers: [
    DraftRepository,
    ApprovalRepository,
    SendRepository,
    DraftService,
    ApprovalService,
    SendService,
    PlanSupersessionService,
    OutboxDispatcher,
  ],
  exports: [DraftService, ApprovalService, SendService, PlanSupersessionService, OutboxDispatcher],
})
export class CommunicationModule {}
