/**
 * 원화 금액 = 원 단위 정수(docs/01 규칙 7 · docs/24 6절 D-3).
 *
 *   PostgreSQL `bigint` → TypeScript `bigint`(Drizzle `mode: 'bigint'`) → API 10진 정수 문자열
 *
 * JS `number` 로의 암묵 변환은 금지한다: 이 타입은 `number` 를 받지 않고, JSON 으로는 항상 문자열이 된다.
 * 음수 허용 여부는 도메인 규칙이 정한다 — 기본은 허용하지 않는다.
 */
const DECIMAL_INTEGER = /^-?(0|[1-9][0-9]*)$/;

export interface KrwOptions {
  allowNegative?: boolean;
}

export class KrwError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = 'KrwError';
  }
}

export function isDecimalIntegerString(value: unknown): value is string {
  return typeof value === 'string' && DECIMAL_INTEGER.test(value) && value !== '-0';
}

export class Krw {
  private constructor(readonly amount: bigint) {}

  static of(amount: bigint, options: KrwOptions = {}): Krw {
    if (typeof amount !== 'bigint') {
      throw new KrwError(`Krw requires bigint, got ${typeof amount} — no implicit number conversion`);
    }
    if (amount < 0n && !options.allowNegative) throw new KrwError(`Negative KRW not allowed: ${amount}`);
    return new Krw(amount);
  }

  /** API · 외부 입력: 10진 정수 문자열만 받는다(지수 · 소수점 · 앞자리 0 · `+` 금지). */
  static parse(text: unknown, options: KrwOptions = {}): Krw {
    if (!isDecimalIntegerString(text)) {
      throw new KrwError(`KRW must be a decimal integer string: ${JSON.stringify(text)}`);
    }
    return Krw.of(BigInt(text), options);
  }

  /** DB 에서 읽은 값(`bigint` 모드). 문자열 모드로 읽은 값도 받는다. */
  static fromDb(value: bigint | string, options: KrwOptions = { allowNegative: true }): Krw {
    return typeof value === 'bigint' ? Krw.of(value, options) : Krw.parse(value, options);
  }

  plus(other: Krw): Krw {
    return new Krw(this.amount + other.amount);
  }

  minus(other: Krw): Krw {
    return new Krw(this.amount - other.amount);
  }

  equals(other: Krw): boolean {
    return this.amount === other.amount;
  }

  isNegative(): boolean {
    return this.amount < 0n;
  }

  /** DB 파라미터. */
  toDb(): bigint {
    return this.amount;
  }

  /** API 직렬화 — 10진 정수 문자열. */
  toApi(): string {
    return this.amount.toString(10);
  }

  toJSON(): string {
    return this.toApi();
  }

  toString(): string {
    return this.toApi();
  }

  /** `number` 가 꼭 필요한 곳(표시 라이브러리 등)만 명시적으로 부른다. 안전 범위 밖이면 실패한다. */
  toSafeNumber(): number {
    const n = Number(this.amount);
    if (!Number.isSafeInteger(n)) throw new KrwError(`KRW out of safe integer range: ${this.amount}`);
    return n;
  }
}
