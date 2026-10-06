/**
 * PostgreSQL 오류 코드(SQLSTATE). CERA 트리거의 전용 코드는 custom migration M07~M09 가 쓴다.
 * 앱은 이 코드로 "DB 가 불변식 위반으로 거부했다"를 구분한다(docs/24 12.3).
 */
export const CERA_SQLSTATE = {
  IMMUTABLE_RECORD: 'CE001',
  COLUMN_NOT_MUTABLE: 'CE002',
  ONE_TIME_FILL: 'CE003',
  TRANSITION_NOT_ALLOWED: 'CE004',
  INSERT_GUARD: 'CE005',
  DEFERRED_INVARIANT: 'CE006',
} as const;

export const PG_SQLSTATE = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  NOT_NULL_VIOLATION: '23502',
  INSUFFICIENT_PRIVILEGE: '42501',
} as const;

/** 오류(드라이버 오류를 `cause` 로 감싼 Drizzle 오류 포함)에서 SQLSTATE 를 꺼낸다. */
export function sqlStateOf(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current === 'object') {
      const code = (current as { code?: unknown }).code;
      if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
      current = (current as { cause?: unknown }).cause;
    } else {
      return undefined;
    }
  }
  return undefined;
}
