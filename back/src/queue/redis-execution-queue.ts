import { Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { type EnqueueOptions, type ExecutionJob, type ExecutionQueue, JOB_TYPES, type JobType, jobIdOf } from './execution-queue.js';

const connect = (url: string, _forWorker: boolean) =>
  new Redis(url, {
    // 생산자는 빨리 실패해야 한다(업무 요청을 붙잡지 않게) — 연결이 ready 가 아니면 넣지 않고(아래), 넣기도 2초 안에 끝나야 한다.
    // 오프라인 대기열은 켠다: BullMQ 가 연결을 복제 · 초기화하는 동안 명령이 거부되지 않게. 소비자는 BullMQ 요구대로 재연결을 기다린다
    // 재시도 횟수 제한은 두지 않는다 — 1로 두면 재연결 직후 명령이 'max retries' 로 버려져 빠른 길이 회복되지 않았다(실측).
    // 업무 요청을 붙잡지 않는 것은 ready 검사 + 2초 시간 제한이 맡는다. 늦게 전달된 작업은 멱등이라 무해하다
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
    connectTimeout: 2_000,
    // Redis 가 죽었을 때 재연결을 몰아치지 않는다: 1 · 2 · 4 … 초, 최대 30초마다 한 번. 재연결마다 호스트 이름을 조회하는데(DNS),
    // 그 조회가 Node 의 공용 스레드풀을 채우면 PostgreSQL 연결까지 시간 초과가 난다(실측 — Redis 가 없어도 업무는 돌아야 한다)
    retryStrategy: (times: number) => Math.min(1_000 * 2 ** Math.min(times - 1, 5), 30_000),
  });

/** BullMQ(Redis) 실행 큐. 생산(API · Worker)과 소비(Worker 만)를 나눈다. */
export class RedisExecutionQueue implements ExecutionQueue {
  readonly enabled = true;
  private readonly logger = new Logger('ExecutionQueue');
  private readonly producerConnection: Redis;
  private readonly queue: Queue;
  private worker: Worker | null = null;
  private workerConnection: Redis | null = null;

  constructor(
    private readonly url: string,
    private readonly name: string,
  ) {
    this.producerConnection = connect(url, false);
    this.producerConnection.on('error', () => undefined); // 상태는 status() · 넣기 실패로 본다 — 재연결 오류마다 찍지 않는다
    this.queue = new Queue(name, { connection: this.producerConnection, skipWaitingForReady: true });
    this.queue.on('error', () => undefined);
  }

  async enqueue(job: Omit<ExecutionJob, 'attempt'> & { attempt?: number }, options: EnqueueOptions = {}): Promise<boolean> {
    const payload: ExecutionJob = { job_type: job.job_type, entity_id: job.entity_id, trace_id: job.trace_id, attempt: job.attempt ?? 1 };
    if (this.producerConnection.status !== 'ready') return false; // Redis 가 없다 — 폴링이 한다(오프라인 대기열에 쌓지 않는다)
    try {
      await withTimeout(
        this.queue.add(payload.job_type, payload, {
          jobId: jobIdOf(payload, options.delayMs),
          delay: options.delayMs && options.delayMs > 0 ? options.delayMs : undefined,
          removeOnComplete: true,
          removeOnFail: 100,
          attempts: 1, // 재시도는 업무 규칙(DB)이 정한다 — 큐가 따로 재시도하지 않는다
        }),
        2_000,
      );
      return true;
    } catch (error) {
      this.logger.warn({ msg: 'enqueue failed — PostgreSQL polling will pick it up', job_type: payload.job_type, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /** Worker 프로세스만: 작업을 받아 처리기에 넘긴다. 처리기는 DB 를 다시 읽는 멱등 진입점이어야 한다. */
  consume(handler: (job: ExecutionJob) => Promise<void>, concurrency = 2): void {
    if (this.worker) return;
    this.workerConnection = connect(this.url, true);
    this.workerConnection.on('error', () => undefined);
    this.worker = new Worker(
      this.name,
      async (job) => {
        const data = job.data as ExecutionJob;
        if (!JOB_TYPES.includes(data.job_type as JobType)) return; // 모르는 작업은 버린다(정본은 DB)
        await handler(data);
      },
      { connection: this.workerConnection, concurrency, autorun: true },
    );
    this.worker.on('error', (e) => this.logger.warn({ msg: 'queue consumer error — polling continues', error: e.message }));
    this.worker.on('failed', (job, e) => this.logger.warn({ msg: 'queue job failed — polling will retry', job_type: job?.name, error: e.message }));
  }

  async status(): Promise<'up' | 'down'> {
    try {
      return (await withTimeout(this.producerConnection.ping(), 1_000)) === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.worker?.close(true), this.queue.close()]);
    this.workerConnection?.disconnect();
    this.producerConnection.disconnect();
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}
