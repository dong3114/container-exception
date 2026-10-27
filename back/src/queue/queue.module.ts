import { Global, Inject, Injectable, Module, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { currentContext } from '../shared/context/request-context.js';
import { DOMAIN_SIGNALS, type DomainSignal, type DomainSignals } from '../shared/signals/domain-signals.js';
import { DisabledExecutionQueue, EXECUTION_QUEUE, type ExecutionQueue } from './execution-queue.js';
import { RedisExecutionQueue } from './redis-execution-queue.js';

/**
 * 업무 알림 → 실행 큐 작업(T-121). 서비스는 Redis 를 모른다 — 커밋 뒤 알림만 보내고, 이 다리가 작업으로 바꾼다.
 * 그래서 API 의 알림(승인 · 발송 요청 · 사실 변경)이 다른 프로세스(Worker)의 처리를 곧바로 깨운다.
 */
@Injectable()
export class SignalToQueueBridge implements OnModuleInit, OnApplicationShutdown {
  constructor(
    @Inject(EXECUTION_QUEUE) private readonly queue: ExecutionQueue,
    @Inject(DOMAIN_SIGNALS) private readonly signals: DomainSignals,
  ) {}

  onModuleInit(): void {
    if (!this.queue.enabled) return;
    this.signals.subscribe((s) => this.route(s));
  }

  async route(s: DomainSignal): Promise<void> {
    const trace = currentContext()?.traceId ?? null;
    switch (s.type) {
      case 'SEND_REQUESTED':
        await this.queue.enqueue({ job_type: 'OUTBOX_SEND', entity_id: s.messageId, trace_id: trace });
        return;
      case 'SEND_RETRY_SCHEDULED':
        await this.queue.enqueue({ job_type: 'OUTBOX_SEND', entity_id: s.messageId, trace_id: trace, attempt: s.attempt }, { delayMs: s.delayMs });
        return;
      case 'INBOUND_REPLY_RECEIVED':
        await this.queue.enqueue({ job_type: 'EXTRACTION_CYCLE', entity_id: 'cycle', trace_id: trace });
        await this.queue.enqueue({ job_type: 'AGENT_RECONCILE', entity_id: 'cycle', trace_id: trace });
        return;
      default:
        // 승인 결정 · 발송됨 · 추출됨 · 사실 · 계획 변경 → 기다리던 Agent 실행을 다시 본다
        await this.queue.enqueue({ job_type: 'AGENT_RECONCILE', entity_id: 'cycle', trace_id: trace });
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: EXECUTION_QUEUE,
      inject: [ENV],
      useFactory: (env: Env): ExecutionQueue => (env.CERA_REDIS_URL ? new RedisExecutionQueue(env.CERA_REDIS_URL, env.CERA_QUEUE_NAME) : new DisabledExecutionQueue()),
    },
    SignalToQueueBridge,
  ],
  exports: [EXECUTION_QUEUE, SignalToQueueBridge],
})
export class QueueModule {}
