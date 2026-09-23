import { Instant } from './instant.js';

/**
 * 현재 시각은 이 인터페이스로만 얻는다(docs/01 규칙 6 — 핵심 로직은 시각을 주입받는다).
 * 도메인·엔진 코드는 `Date.now()` · `new Date()` 를 직접 부르지 않는다.
 */
export interface Clock {
  now(): Instant;
}

export const CLOCK = Symbol('CERA_CLOCK');

export class SystemClock implements Clock {
  now(): Instant {
    return Instant.ofEpochMs(Date.now());
  }
}

/** 시험용 시계: 명시적으로 옮기기 전에는 멈춰 있다. */
export class FakeClock implements Clock {
  private current: Instant;

  constructor(start: Instant | string) {
    this.current = typeof start === 'string' ? Instant.parseIso(start) : start;
  }

  now(): Instant {
    return this.current;
  }

  set(to: Instant | string): void {
    this.current = typeof to === 'string' ? Instant.parseIso(to) : to;
  }

  advanceMs(ms: number): Instant {
    this.current = this.current.plusMs(ms);
    return this.current;
  }
}
