import { CeraError } from '../shared/errors/cera-error.js';

/**
 * Agent Tool 오류 계약(T-103 · ADR-036 결정 5). Agent 가 다음 단계를 고를 수 있게 **종류로 나눈다** —
 * 권한 거부 · 인자 오류 · 외부 시간 초과를 같은 FAILED 하나로 뭉개지 않는다.
 *
 * - REJECTED: 실행하지 않았거나 업무 규칙이 거부했다(다시 같은 입력으로 불러도 같다 — 입력이나 상황이 바뀌어야 한다)
 * - FAILED:   기술 실패(외부 시간 초과 · 상대 오류 · 내부 오류). `retryable` 이 다시 시도할 만한지 말한다
 */
export const TOOL_ERROR_CODES = {
  // 실행 전 · 계약
  INVALID_ARGUMENT: { status: 'REJECTED', retryable: false },
  IDEMPOTENCY_KEY_REQUIRED: { status: 'REJECTED', retryable: false },
  IDEMPOTENCY_KEY_REUSED: { status: 'REJECTED', retryable: false },
  TOOL_CALL_IN_PROGRESS: { status: 'REJECTED', retryable: true },
  OUT_OF_SCOPE: { status: 'REJECTED', retryable: false },
  NOT_FOUND: { status: 'REJECTED', retryable: false },
  // 업무 규칙
  CAPABILITY_DISABLED: { status: 'REJECTED', retryable: false },
  CAPABILITY_NOT_AVAILABLE: { status: 'REJECTED', retryable: false },
  HUMAN_ACTION_REQUIRED: { status: 'REJECTED', retryable: false },
  CONFLICT: { status: 'REJECTED', retryable: false },
  // 기술 실패
  UPSTREAM_TIMEOUT: { status: 'FAILED', retryable: true },
  UPSTREAM_ERROR: { status: 'FAILED', retryable: true },
  TOOL_TIMEOUT: { status: 'FAILED', retryable: true },
  OUTPUT_CONTRACT_VIOLATION: { status: 'FAILED', retryable: false },
  INTERNAL_ERROR: { status: 'FAILED', retryable: true },
} as const satisfies Record<string, { status: 'REJECTED' | 'FAILED'; retryable: boolean }>;

export type ToolErrorCode = keyof typeof TOOL_ERROR_CODES;

/** 호출 앞단(인증 · 실행 찾기)에서 끝나는 오류 — 실행에 묶을 수 없으므로 호출 기록이 없다. */
export const GATEWAY_ERROR_CODES = ['AGENT_TOOLS_DISABLED', 'UNAUTHORIZED_AGENT', 'TOOL_NOT_FOUND', 'AGENT_RUN_NOT_FOUND', 'AGENT_RUN_NOT_ACTIVE'] as const;
export type GatewayErrorCode = (typeof GATEWAY_ERROR_CODES)[number];

export interface ToolErrorBody {
  code: ToolErrorCode | GatewayErrorCode;
  retryable: boolean;
  /** 안전한 문장(비밀값 · 원문 없음) */
  message: string;
  /** 도메인 서비스가 낸 원래 코드(예: RECIPIENT_NOT_ELIGIBLE · BLOCKED_NUMBER_CHECK) */
  cause_code?: string;
  details?: Record<string, unknown>;
}

export class ToolFailure extends Error {
  readonly status: 'REJECTED' | 'FAILED';
  readonly retryable: boolean;

  constructor(
    readonly code: ToolErrorCode,
    message: string,
    readonly extra: { causeCode?: string; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = 'ToolFailure';
    this.status = TOOL_ERROR_CODES[code].status;
    this.retryable = TOOL_ERROR_CODES[code].retryable;
  }

  body(): ToolErrorBody {
    return {
      code: this.code,
      retryable: this.retryable,
      message: this.message,
      ...(this.extra.causeCode ? { cause_code: this.extra.causeCode } : {}),
      ...(this.extra.details ? { details: this.extra.details } : {}),
    };
  }
}

/** 호출 앞단 오류(HTTP 상태 그대로) — 기록 없음. */
export class ToolGatewayError extends Error {
  constructor(
    readonly code: GatewayErrorCode,
    readonly httpStatus: 401 | 403 | 404 | 409 | 503,
    message: string,
  ) {
    super(message);
    this.name = 'ToolGatewayError';
  }
}

/** 도메인 코드 → Tool 오류 종류. 표에 없는 업무 거부는 HTTP 상태로 나눈다. */
const DOMAIN_CODE_MAP: Record<string, ToolErrorCode> = {
  PUBLIC_DATA_DISABLED: 'CAPABILITY_DISABLED',
  PUBLIC_DATA_KEY_MISSING: 'CAPABILITY_DISABLED',
  PUBLIC_DATA_REPLAY_UNAVAILABLE: 'CAPABILITY_DISABLED',
  REPLAY_FIXTURE_NOT_FOUND: 'CAPABILITY_NOT_AVAILABLE',
  PUBLIC_DATA_SIMULATION_MISMATCH: 'CONFLICT',
  RECIPIENT_NOT_ELIGIBLE: 'HUMAN_ACTION_REQUIRED',
  NUMBER_CHECK_FAILED: 'HUMAN_ACTION_REQUIRED',
  BLOCKED_NUMBER_CHECK: 'HUMAN_ACTION_REQUIRED',
  SCENARIO_REQUIRED: 'INVALID_ARGUMENT',
};

/** 도메인 서비스 오류를 Tool 오류로 바꾼다. 원래 코드는 `cause_code` 에 남는다. */
export function fromDomainError(error: unknown): ToolFailure {
  if (error instanceof ToolFailure) return error;
  if (error instanceof CeraError) {
    const mapped =
      DOMAIN_CODE_MAP[error.code] ??
      (error.kind === 'VALIDATION'
        ? 'INVALID_ARGUMENT'
        : error.kind === 'SYSTEM'
          ? 'INTERNAL_ERROR'
          : error.httpStatus === 404
            ? 'NOT_FOUND'
            : error.httpStatus === 403
              ? 'HUMAN_ACTION_REQUIRED'
              : 'CONFLICT');
    return new ToolFailure(mapped, error.kind === 'SYSTEM' ? 'Internal error' : error.message.slice(0, 300), { causeCode: error.code });
  }
  return new ToolFailure('INTERNAL_ERROR', 'Internal error');
}
