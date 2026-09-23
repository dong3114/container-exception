/**
 * 시점(instant) 값 객체 — docs/24 5절.
 *
 * - 저장: PostgreSQL `timestamptz(3)`(UTC 시점, 밀리초). DB 세션은 UTC.
 * - 도메인: 이 타입만 쓴다. JS `Date` 는 이 파일 안에서만 쓴다(ADR-033 결정 8③).
 * - 표시: Asia/Seoul(+09:00)은 API 직렬화 책임 — `toSeoulIso()`.
 * - 들어오는 시각은 오프셋이 있는 값만 받는다(없으면 거부 — 시간대 추정은 어댑터가 명시적으로 한다).
 */
const ISO_WITH_OFFSET =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})$/;
/** node-postgres 가 문자열 모드로 돌려주는 timestamptz 형식: `2026-09-22 08:59:50.103+00` */
const PG_TIMESTAMPTZ =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?([+-]\d{2})(?::?(\d{2}))?$/;

const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000; // Asia/Seoul: UTC+9, 일광절약시간 없음

export class Instant {
  private constructor(readonly epochMs: number) {}

  static ofEpochMs(epochMs: number): Instant {
    if (!Number.isSafeInteger(epochMs)) {
      throw new RangeError(`Instant epochMs must be a safe integer: ${String(epochMs)}`);
    }
    return new Instant(epochMs);
  }

  /** ISO 8601 + 오프셋 필수. 밀리초 아래는 버린다(DB 정밀도와 맞춘다). */
  static parseIso(text: string): Instant {
    const m = ISO_WITH_OFFSET.exec(text);
    if (!m) throw new RangeError(`Instant requires ISO 8601 with offset (Z or ±HH:MM): ${text}`);
    const frac = (m[7] ?? '').padEnd(3, '0').slice(0, 3);
    const normalized = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}.${frac}${m[8]}`;
    const ms = Date.parse(normalized);
    if (Number.isNaN(ms)) throw new RangeError(`Invalid instant: ${text}`);
    return Instant.ofEpochMs(ms);
  }

  /** DB(`timestamptz`, 문자열 모드)에서 읽은 값. */
  static fromDb(text: string): Instant {
    const m = PG_TIMESTAMPTZ.exec(text);
    if (!m) return Instant.parseIso(text);
    const frac = (m[7] ?? '').padEnd(3, '0').slice(0, 3);
    const offset = `${m[8]}:${m[9] ?? '00'}`;
    return Instant.parseIso(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${frac}${offset}`);
  }

  /** `YYYY-MM-DDTHH:mm:ss.sssZ` — DB 쓰기 · 해시 재료 · 로그용 정규형. */
  toIsoUtc(): string {
    return new Date(this.epochMs).toISOString();
  }

  /** DB 파라미터로 넘길 값. */
  toDb(): string {
    return this.toIsoUtc();
  }

  /** API 직렬화: `YYYY-MM-DDTHH:mm:ss.sss+09:00`. */
  toSeoulIso(): string {
    return new Date(this.epochMs + SEOUL_OFFSET_MS).toISOString().replace('Z', '+09:00');
  }

  plusMs(ms: number): Instant {
    return Instant.ofEpochMs(this.epochMs + ms);
  }

  isBefore(other: Instant): boolean {
    return this.epochMs < other.epochMs;
  }

  isAfter(other: Instant): boolean {
    return this.epochMs > other.epochMs;
  }

  equals(other: Instant): boolean {
    return this.epochMs === other.epochMs;
  }

  compareTo(other: Instant): number {
    return this.epochMs - other.epochMs;
  }

  toJSON(): string {
    return this.toSeoulIso();
  }

  toString(): string {
    return this.toIsoUtc();
  }
}
