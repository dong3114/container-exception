/**
 * 실행 큐(T-121) — **빠른 전달 · 지연 재시도 · 깨우기 가속만** 한다. 업무 정본은 PostgreSQL 이다(ADR-034).
 *
 * - 작업에는 참조만 싣는다(`{ job_type, entity_id, trace_id, attempt }`). 원문 메일 · checkpoint · 사실 값 · 비밀은 넣지 않는다.
 *   받는 쪽은 언제나 DB 를 다시 읽고, 같은 작업이 두 번 와도 업무 효과는 한 번이다(발송 = 시도 선커밋 · SKIP LOCKED · 성공 1건 UNIQUE,
 *   추출 · 재조정 = 처리할 것이 없으면 아무것도 안 함)
 * - Redis 가 없거나 죽어도 정확성은 같다: Worker 의 PostgreSQL 폴링 · 재조정이 같은 일을 찾아 한다(느려질 뿐). 넣기 실패는 업무 요청을
 *   실패시키지 않는다(로그만)
 */
export const JOB_TYPES = ['OUTBOX_SEND', 'EXTRACTION_CYCLE', 'AGENT_RECONCILE'] as const;
export type JobType = (typeof JOB_TYPES)[number];

export interface ExecutionJob {
  job_type: JobType;
  /** 대상 id(메시지 id 등). 주기형 작업은 고정 값 'cycle'. */
  entity_id: string;
  trace_id: string | null;
  attempt: number;
}

export interface EnqueueOptions {
  /** 이 시간 뒤에 전달(재시도 예약). ms. */
  delayMs?: number;
}

export interface ExecutionQueue {
  readonly enabled: boolean;
  enqueue(job: Omit<ExecutionJob, 'attempt'> & { attempt?: number }, options?: EnqueueOptions): Promise<boolean>;
  /** 연결 상태(운영 · 시연 화면). */
  status(): Promise<'up' | 'down' | 'disabled'>;
  close(): Promise<void>;
}

export const EXECUTION_QUEUE = Symbol('CERA_EXECUTION_QUEUE');

/**
 * 같은 일이 대기열에 여러 번 쌓이지 않게 하는 작업 id(대기 중인 동안만 하나 — 끝나면 지워져 다음 것이 들어간다).
 * 지연 작업은 예약 초를 붙여 즉시 작업과 겹치지 않게 한다. BullMQ id 에 ':' 를 쓰지 않는다.
 */
export function jobIdOf(job: Pick<ExecutionJob, 'job_type' | 'entity_id'>, delayMs?: number): string {
  const base = `${job.job_type}__${job.entity_id}`;
  return delayMs && delayMs > 0 ? `${base}__d${Math.ceil(delayMs / 1000)}` : base;
}

export class DisabledExecutionQueue implements ExecutionQueue {
  readonly enabled = false;
  async enqueue(): Promise<boolean> {
    return false;
  }
  async status(): Promise<'disabled'> {
    return 'disabled';
  }
  async close(): Promise<void> {}
}
