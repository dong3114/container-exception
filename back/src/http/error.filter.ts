import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { CeraError, type ErrorResponseBody } from '../shared/errors/cera-error.js';
import { currentContext } from '../shared/context/request-context.js';

/**
 * API 경계의 공통 오류 처리(docs/23 4.2). 응답은 항상 `{ code, message, request_id }`.
 * 예상 밖 오류는 안전한 문장만 돌려주고 상세(스택)는 로그로만 남긴다.
 * `system_error` 표 기록은 U1 이후(표가 생긴 뒤)에 붙인다.
 */
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiErrorFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const requestId = currentContext()?.requestId ?? null;
    const { status, body } = this.toResponse(exception, requestId);
    if (status >= 500) {
      this.logger.error(
        { msg: 'unhandled error', code: body.code, request_id: requestId, trace_id: currentContext()?.traceId },
        exception instanceof Error ? exception.stack : undefined,
      );
    }
    res.status(status).json(body);
  }

  private toResponse(exception: unknown, requestId: string | null): { status: number; body: ErrorResponseBody } {
    if (exception instanceof CeraError) {
      return { status: exception.httpStatus, body: { code: exception.code, message: exception.message, request_id: requestId } };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const message = status >= 500 ? 'Internal server error' : exception.message;
      return { status, body: { code: `HTTP_${status}`, message, request_id: requestId } };
    }
    return { status: 500, body: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: requestId } };
  }
}
