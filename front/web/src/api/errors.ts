/**
 * One error type for every Main Backend call, so screens can say *why* a request failed
 * instead of a generic "failed" (docs/19 15절 화면 상태 · docs/23 4.2 공통 오류 응답).
 *
 * - HTTP: the backend answered with an error status. `code` / `message` / `requestId` come from the
 *   common error body `{ code, message, request_id }` (OpenAPI `ErrorResponse`).
 * - NETWORK: no answer (backend down, proxy unreachable).
 * - TIMEOUT: no answer within the client time limit. Long AI work should not rely on one long request —
 *   the backend task decides between 202 + polling or another async shape.
 * - ABORTED: the screen cancelled the request (navigation, a newer request). Not shown as a failure.
 * - INVALID_RESPONSE: the answer was not the expected JSON.
 */
export type ApiErrorKind = "HTTP" | "NETWORK" | "TIMEOUT" | "ABORTED" | "INVALID_RESPONSE";

export interface ApiErrorBody {
  code: string;
  message: string;
  request_id: string | null;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: string;
  readonly requestId: string | null;

  constructor(kind: ApiErrorKind, message: string, options: { status?: number | null; code?: string; requestId?: string | null } = {}) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = options.status ?? null;
    this.code = options.code ?? kind;
    this.requestId = options.requestId ?? null;
  }

  /**
   * Whether the same request may simply be tried again. Server faults, overload and lost connections may;
   * a 4xx means the request itself (or the state it needs) must change first.
   */
  get retryable(): boolean {
    if (this.kind === "NETWORK" || this.kind === "TIMEOUT") return true;
    if (this.kind === "HTTP" && this.status !== null) return this.status >= 500 || this.status === 408 || this.status === 429;
    return false;
  }
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.code === "string" && typeof v.message === "string" && (v.request_id === null || typeof v.request_id === "string");
}

/** Short Korean label for a failure, used by AsyncStatus. */
export function describeApiError(error: ApiError): string {
  switch (error.kind) {
    case "NETWORK":
      return "Backend 에 연결할 수 없음";
    case "TIMEOUT":
      return "응답 시간 초과";
    case "ABORTED":
      return "요청 취소됨";
    case "INVALID_RESPONSE":
      return "예상하지 못한 응답 형식";
    case "HTTP":
      if (error.status === 503) return "일시적으로 사용할 수 없음";
      if (error.status !== null && error.status >= 500) return "서버 오류";
      if (error.status === 409) return "현재 상태와 충돌";
      if (error.status === 422 || error.status === 400) return "입력 검증 실패";
      if (error.status === 403) return "권한 없음";
      if (error.status === 404) return "대상을 찾을 수 없음";
      return `요청 실패 (${error.status ?? "?"})`;
  }
}
