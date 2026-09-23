import type { NextFunction, Request, Response } from 'express';
import { contextFromHeaders, HEADER_REQUEST_ID, runWithContext } from '../shared/context/request-context.js';

/** 모든 HTTP 요청에 요청 · 추적 · 업무 상관 문맥을 붙이고 응답 헤더에 `X-Request-Id` 를 돌려준다. */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const context = contextFromHeaders(req.headers);
  res.setHeader(HEADER_REQUEST_ID, context.requestId);
  runWithContext(context, () => next());
}
