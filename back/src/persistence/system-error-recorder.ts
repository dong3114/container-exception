import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE, type Database } from '../db/database.js';
import { systemError } from '../db/schema/index.js';
import { currentContext } from '../shared/context/request-context.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import type { SystemErrorCategory, SystemErrorCode } from './catalog.js';

export interface SystemErrorEntry {
  serviceName: string;
  componentName: string;
  operationName: string;
  errorBoundary: 'API_REQUEST' | 'INTEGRATION' | 'BACKGROUND_JOB';
  errorCategory: SystemErrorCategory;
  errorCode: SystemErrorCode | string;
  /** 사람이 읽는 안전한 문장. 비밀값 · 원문 본문 · 스택을 넣지 않는다(docs/23 4.4). */
  safeErrorMessage: string;
  /** 원인 오류. **이름(타입)만** 저장한다 — 메시지·스택은 저장하지 않는다. */
  cause?: unknown;
  targetSystem?: string | null;
  httpStatus?: number | null;
  retryable: boolean;
  relatedEntity?: { type: string; id: string } | null;
  scenarioId?: string | null;
}

/**
 * `system_error` 기록(docs/23 · docs/24 15절).
 * - **업무 트랜잭션과 따로** 쓴다: 트랜잭션 `tx` 를 받지 않고 풀에서 단독 문장으로 넣는다 → 업무가 롤백돼도 남는다
 * - HTTP 오류 응답(ApiErrorFilter 의 `{code, message, request_id}`)과는 별개다 — 응답은 클라이언트용, 이 행은 운영용
 * - 기록 실패가 원래 오류를 덮지 않는다: 실패하면 로그만 남기고 `null` 을 돌려준다 — **절대 던지지 않는다**
 *   (문맥 · ID 생성 · 삽입 · 실패 로그 어디서 실패하든). 호출자는 원래 오류를 그대로 처리한다
 */
@Injectable()
export class SystemErrorRecorder {
  private readonly logger = new Logger('SystemErrorRecorder');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async record(entry: SystemErrorEntry): Promise<string | null> {
    let ctx: ReturnType<typeof currentContext>;
    try {
      ctx = currentContext();
      const errorId = this.ids.newId();
      await this.db.insert(systemError).values({
        errorId,
        occurredAt: this.clock.now().toDb(),
        serviceName: entry.serviceName.slice(0, 60),
        componentName: entry.componentName.slice(0, 100),
        operationName: entry.operationName.slice(0, 100),
        errorBoundary: entry.errorBoundary,
        errorCategory: entry.errorCategory,
        errorCode: entry.errorCode.slice(0, 60),
        safeErrorMessage: entry.safeErrorMessage.slice(0, 500),
        exceptionType: exceptionTypeOf(entry.cause),
        requestId: ctx?.requestId ?? null,
        traceId: ctx?.traceId ?? null,
        targetSystem: entry.targetSystem ?? null,
        httpStatus: entry.httpStatus ?? null,
        retryable: entry.retryable,
        relatedEntityType: entry.relatedEntity?.type ?? null,
        relatedEntityId: entry.relatedEntity?.id ?? null,
        rawLogRef: null,
        isSimulated: entry.scenarioId != null,
        scenarioId: entry.scenarioId ?? null,
      });
      return errorId;
    } catch (error) {
      try {
        this.logger.error({
          msg: 'system_error persistence failed',
          error_code: entry.errorCode,
          persistence_failure: exceptionTypeOf(error),
          request_id: ctx?.requestId,
        });
      } catch {
        // 로그까지 실패해도 원래 오류 처리를 막지 않는다.
      }
      return null;
    }
  }
}

function exceptionTypeOf(cause: unknown): string | null {
  if (cause instanceof Error) return cause.name.slice(0, 200);
  if (cause === undefined || cause === null) return null;
  return typeof cause;
}
