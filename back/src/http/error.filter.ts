import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Inject, Logger, Optional } from '@nestjs/common';
import type { Response } from 'express';
import { CeraError, type ErrorResponseBody } from '../shared/errors/cera-error.js';
import { SYSTEM_ERROR_CATEGORY, SYSTEM_ERROR_CODE } from '../persistence/catalog.js';
import { SystemErrorRecorder } from '../persistence/system-error-recorder.js';
import { currentContext } from '../shared/context/request-context.js';

/**
 * API 경계의 공통 오류 처리(docs/23 4.2). 응답은 항상 `{ code, message, request_id }`.
 * 예상 밖 오류는 안전한 문장만 돌려주고 상세(스택)는 로그로만 남긴다.
 * 예상 밖 오류(5xx)는 `system_error` 에도 남긴다(U1) — 응답 바디와 운영 기록은 별개다:
 * 응답은 클라이언트용 `{code, message, request_id}`, 기록은 운영용 행(별도 트랜잭션, 메시지·스택 없음).
 */
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiErrorFilter');

  constructor(@Optional() @Inject(SystemErrorRecorder) private readonly systemErrors?: SystemErrorRecorder) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const requestId = currentContext()?.requestId ?? null;
    const { status, body } = this.toResponse(exception, requestId);
    if (status >= 500) {
      this.logger.error(
        { msg: 'unhandled error', code: body.code, request_id: requestId, trace_id: currentContext()?.traceId },
        exception instanceof Error ? exception.stack : undefined,
      );
      // 기다리지 않는다 — 응답은 원래 오류로 이미 정해졌다. 기록 실패가 처리되지 않은 rejection 으로 프로세스를 흔들지 않게 삼킨다.
      this.recordSystemError(exception, body.code, status).catch(() => undefined);
    }
    res.status(status).json(body);
  }

  private async recordSystemError(exception: unknown, code: string, status: number): Promise<void> {
    if (!this.systemErrors) return;
    await this.systemErrors.record({
      serviceName: 'cera-api',
      componentName: 'ApiErrorFilter',
      operationName: 'request',
      errorBoundary: 'API_REQUEST',
      errorCategory: SYSTEM_ERROR_CATEGORY.UNEXPECTED,
      errorCode: code === 'INTERNAL_ERROR' ? SYSTEM_ERROR_CODE.INTERNAL_ERROR : code,
      safeErrorMessage: 'Unhandled error while processing an API request',
      cause: exception,
      httpStatus: status,
      retryable: false,
    });
  }

  private toResponse(exception: unknown, requestId: string | null): { status: number; body: ErrorResponseBody } {
    if (exception instanceof CeraError) {
      const details = 'details' in exception && exception.details ? { details: exception.details as Record<string, unknown> } : {};
      return { status: exception.httpStatus, body: { code: exception.code, message: exception.message, request_id: requestId, ...details } };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const message = status >= 500 ? 'Internal server error' : exception.message;
      return { status, body: { code: `HTTP_${status}`, message, request_id: requestId } };
    }
    return { status: 500, body: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: requestId } };
  }
}
