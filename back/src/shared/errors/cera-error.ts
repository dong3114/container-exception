/**
 * 오류 세 종류(docs/23 4절 · 12절 공통 오류 응답 `{ code, message, request_id }`).
 *
 * - BUSINESS   : 예상 가능한 업무 규칙 거부(예: 승인 만료, Contact Gate 불통과). 정책 거부는 기술 오류가 아니다
 * - VALIDATION : 입력 형식·값 오류
 * - SYSTEM     : 예상 밖 기술 오류. 응답에는 안전한 문장만 — 상세는 로그(U1 이후 system_error)
 *
 * `message` 에는 비밀값 · 원문 본문 · 스택을 넣지 않는다(docs/23 4.4).
 */
export type CeraErrorKind = 'BUSINESS' | 'VALIDATION' | 'SYSTEM';

const CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export abstract class CeraError extends Error {
  abstract readonly kind: CeraErrorKind;

  protected constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    if (!CODE_PATTERN.test(code)) throw new TypeError(`Error code must be UPPER_SNAKE: ${code}`);
    this.name = new.target.name;
  }
}

export class BusinessRuleError extends CeraError {
  readonly kind = 'BUSINESS' as const;

  constructor(code: string, message: string, httpStatus: 409 | 422 | 403 | 404 = 409) {
    super(code, message, httpStatus);
  }
}

export class ValidationError extends CeraError {
  readonly kind = 'VALIDATION' as const;

  constructor(code: string, message: string, readonly fields: readonly string[] = []) {
    super(code, message, 400);
  }
}

export class SystemError extends CeraError {
  readonly kind = 'SYSTEM' as const;

  constructor(code: string, safeMessage: string, options?: { cause?: unknown }) {
    super(code, safeMessage, 500, options);
  }
}

export interface ErrorResponseBody {
  code: string;
  message: string;
  request_id: string | null;
}
