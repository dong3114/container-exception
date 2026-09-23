import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { v7 } from 'uuid';
import { isUuidV7 } from '../id/uuid.js';

/**
 * 요청 · 작업 문맥(docs/23 5절 · docs/24 10절).
 *
 * - requestId     : API 요청 1건 또는 작업 실행 1건. UUIDv7. 헤더 `X-Request-Id`
 * - traceId       : 기술 추적. W3C Trace Context trace-id(32 hex). 헤더 `traceparent`
 * - correlationId : **업무** 상관 id(`event.correlation_id` — 스레드 · 실행 · 확인 흐름). 기술 추적과 다르다.
 *                   요청마다 지어내지 않는다 — 클라이언트가 `X-CERA-Correlation-Id` 로 보냈거나 업무 코드가 정할 때만 있다
 *
 * 장기 업무 상관은 도메인 id 로 잇고 trace_id 는 관측 문맥·로그에만 둔다(docs/24 25절 F-9).
 */
export interface RequestContext {
  readonly requestId: string;
  readonly traceId: string;
  correlationId: string | null;
}

export const HEADER_REQUEST_ID = 'x-request-id';
export const HEADER_TRACEPARENT = 'traceparent';
export const HEADER_CORRELATION_ID = 'x-cera-correlation-id';

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const CORRELATION_ID = /^[A-Za-z0-9._:-]{1,60}$/; // event.correlation_id STRING(60)

const storage = new AsyncLocalStorage<RequestContext>();

export function newTraceId(): string {
  let id: string;
  do id = randomBytes(16).toString('hex');
  while (/^0+$/.test(id));
  return id;
}

function newSpanId(): string {
  return randomBytes(8).toString('hex');
}

export function parseTraceparent(header: string | undefined): string | null {
  if (!header) return null;
  const m = TRACEPARENT.exec(header.trim().toLowerCase());
  if (!m || /^0+$/.test(m[1]!) || /^0+$/.test(m[2]!)) return null;
  return m[1]!;
}

export function isValidCorrelationId(value: unknown): value is string {
  return typeof value === 'string' && CORRELATION_ID.test(value);
}

/** 들어온 헤더에서 문맥을 만든다. 형식이 틀린 id 는 믿지 않고 새로 만든다(요청·추적 id). */
export function contextFromHeaders(headers: Record<string, string | string[] | undefined>): RequestContext {
  const one = (name: string) => {
    const v = headers[name];
    return Array.isArray(v) ? v[0] : v;
  };
  const incomingRequestId = one(HEADER_REQUEST_ID);
  const incomingCorrelation = one(HEADER_CORRELATION_ID);
  return {
    requestId: isUuidV7(incomingRequestId) ? incomingRequestId : v7(),
    traceId: parseTraceparent(one(HEADER_TRACEPARENT)) ?? newTraceId(),
    correlationId: isValidCorrelationId(incomingCorrelation) ? incomingCorrelation : null,
  };
}

/** 작업(Worker) 실행 1건의 문맥. 작업을 만든 요청의 trace 를 이을 저장 위치는 두지 않는다(F-9) — 새 trace 로 시작한다. */
export function newJobContext(correlationId: string | null = null): RequestContext {
  return { requestId: v7(), traceId: newTraceId(), correlationId };
}

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

/** 업무 흐름이 시작될 때 업무 상관 id 를 정한다(예: 스레드 id). */
export function setCorrelationId(correlationId: string): void {
  const ctx = storage.getStore();
  if (!ctx) throw new Error('No request context');
  if (!isValidCorrelationId(correlationId)) throw new TypeError(`Invalid correlation id: ${correlationId}`);
  ctx.correlationId = correlationId;
}

/** AI Server · 외부 채널로 나가는 HTTP 호출에 붙일 헤더(새 span, 같은 trace). */
export function outboundHeaders(context: RequestContext | undefined = currentContext()): Record<string, string> {
  if (!context) return {};
  const headers: Record<string, string> = {
    [HEADER_REQUEST_ID]: context.requestId,
    [HEADER_TRACEPARENT]: `00-${context.traceId}-${newSpanId()}-01`,
  };
  if (context.correlationId) headers[HEADER_CORRELATION_ID] = context.correlationId;
  return headers;
}
