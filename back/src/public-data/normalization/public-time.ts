import { Instant } from '../../shared/time/instant.js';

/**
 * 공공 API 일시 → Instant. 순수 함수.
 * - ISO 8601 + 오프셋(`2017-12-27T01:00:00+09:00`)은 그대로
 * - 오프셋 없는 `YYYY-MM-DD HH:mm:ss`(DS-03 `tkoffPrrrnDt` 등)는 Asia/Seoul 로 보고 `tzAssumed = true` 를 남긴다(field-dictionary 8절 규칙 4)
 * - 그 밖의 모양은 null(지어내지 않는다)
 */
export interface ParsedPublicTime {
  instant: Instant;
  tzAssumed: boolean;
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

export function parsePublicTime(text: string | null): ParsedPublicTime | null {
  if (!text) return null;
  const t = text.trim();
  try {
    return { instant: Instant.parseIso(t), tzAssumed: false };
  } catch {
    // 오프셋이 없는 모양만 Asia/Seoul 로 해석한다
  }
  const m = LOCAL.exec(t);
  if (!m) return null;
  try {
    return { instant: Instant.parseIso(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}+09:00`), tzAssumed: true };
  } catch {
    return null;
  }
}

/** Asia/Seoul 달력 날짜 `YYYY-MM-DD` → DS-03 `sde`/`ede` 형식 `YYYYMMDD`. */
export function toCompactDate(isoDate: string): string {
  return isoDate.replaceAll('-', '');
}

/** `YYYY-MM-DD` 유효성(실제 달력 날짜인가). */
export function isCalendarDate(text: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** 두 달력 날짜 사이 일수(to − from). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
