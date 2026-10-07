import { Module } from '@nestjs/common';
import { ApprovalController } from './approval.controller.js';
import { ApprovalRepository } from './approval.repository.js';
import { ApprovalService } from './approval.service.js';
import { PlanningRunController, DraftController } from './draft.controller.js';
import { DraftRepository } from './draft.repository.js';
import { DraftService } from './draft.service.js';
import { AI_CLIENT, HttpAiClient } from '../ai/ai-client.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { ExtractionProcessor } from './extraction-processor.js';
import { ExtractionRepository } from './extraction.repository.js';
import { InboundController } from './inbound.controller.js';
import { InboundProcessor } from './inbound-processor.js';
import { InboundRepository } from './inbound.repository.js';
import { InboundService } from './inbound.service.js';
import { OutboxDispatcher } from './outbox-dispatcher.js';
import { PlanSupersessionService } from './plan-supersession.service.js';
import { SendController } from './send.controller.js';
import { SendRepository } from './send.repository.js';
import { SendService } from './send.service.js';

/**
 * 문의 초안 · 숫자 검사(T-088 U3) + 발송 승인 · 무효화(T-089 U4) + 발송 요청 · Outbox 디스패처(T-090 U5) + 수신(T-091 U6) + 회신 추출(T-092 U7).
 * API 프로세스는 컨트롤러를, Worker 프로세스는 `OutboxDispatcher` · `InboundProcessor` · `ExtractionProcessor` 를 쓴다(같은 코드, 다른 프로세스 — ADR-033).
 */
@Module({
  controllers: [DraftController, ApprovalController, SendController, InboundController, PlanningRunController],
  providers: [
    DraftRepository,
    ApprovalRepository,
    SendRepository,
    InboundRepository,
    InboundService,
    InboundProcessor,
    ExtractionRepository,
    ExtractionProcessor,
    // Python AI Server 호출(T-092) — Main Backend 만 부른다. 시험은 이 토큰을 가짜로 바꾼다
    { provide: AI_CLIENT, inject: [ENV], useFactory: (env: Env) => new HttpAiClient(env.CERA_AI_SERVER_URL, env.CERA_AI_TIMEOUT_MS) },
    DraftService,
    ApprovalService,
    SendService,
    PlanSupersessionService,
    OutboxDispatcher,
  ],
  exports: [DraftService, ApprovalService, SendService, PlanSupersessionService, OutboxDispatcher, InboundProcessor, ExtractionProcessor],
})
export class CommunicationModule {}
