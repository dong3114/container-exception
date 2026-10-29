import type { Freshness } from './reconcile-rules.js';

/**
 * 공공 근거 교차 확인 규칙(T-136, 순수 · 결정론). 업체가 말한 값(주장)과 공공 관측 값이 **같은 사실**(같은 주체 id · 같은 사실 키)일 때만 비교한다.
 * 같은 사실인지는 식별자(입항 건 id = 호출부호 · 입항 연도 · 차수로 등록된 행)로 정한다 — 이름 유사도로 판정하지 않는다.
 * LLM 이 쓰이지 않는다: 값 차이와 허용 오차 · 공공 관측의 신선도만 본다.
 */
export const CORROBORATION_RULE_VERSION = 'corroboration/1';

/** 입항 일시 허용 오차 [ASSUMPTION] — 업체 진술과 Port-MIS 신고가 이만큼 안이면 같은 사실을 지지한다(신고 시각 · 구두 표현의 반올림) */
export const ARRIVAL_TOLERANCE_MINUTES = 60;

export type CorroborationResult = 'MATCH' | 'CONFLICT' | 'NO_PUBLIC_EVIDENCE' | 'STALE_PUBLIC_EVIDENCE' | 'NOT_COMPARABLE';

export interface CorroborationInput {
  /** 공공데이터가 다루는 사실인가(public-authority `isPublicVerifiable`) */
  comparable: boolean;
  /** 주장 값(시각 사실은 epoch ms). 값이 없는 주장은 비교하지 않는다 */
  claimValue: number | null;
  /** 같은 사실의 가장 최근 공공 관측 — 없으면 null */
  publicObservation: { value: number | null; freshness: Freshness } | null;
}

export interface CorroborationJudgement {
  result: CorroborationResult;
  reason: string;
  differenceMinutes: number | null;
  toleranceMinutes: number | null;
}

export function judgeClaim(i: CorroborationInput): CorroborationJudgement {
  if (!i.comparable) return { result: 'NOT_COMPARABLE', reason: 'PUBLIC_DATA_DOES_NOT_COVER_FACT', differenceMinutes: null, toleranceMinutes: null };
  if (i.claimValue === null) return { result: 'NOT_COMPARABLE', reason: 'CLAIM_HAS_NO_VALUE', differenceMinutes: null, toleranceMinutes: null };
  // 공공 관측이 없다 = 외부 근거가 없을 뿐이다. 업체 말이 거짓이라는 뜻이 아니다
  if (!i.publicObservation || i.publicObservation.value === null) return { result: 'NO_PUBLIC_EVIDENCE', reason: 'NO_PUBLIC_OBSERVATION', differenceMinutes: null, toleranceMinutes: null };
  const diff = Math.round(Math.abs(i.claimValue - i.publicObservation.value) / 60_000);
  // 오래된 공공 관측으로는 맞다 · 틀리다를 말하지 않는다(다시 조회해야 한다)
  if (i.publicObservation.freshness === 'STALE' || i.publicObservation.freshness === 'EXPIRED') {
    return { result: 'STALE_PUBLIC_EVIDENCE', reason: 'PUBLIC_OBSERVATION_STALE', differenceMinutes: diff, toleranceMinutes: ARRIVAL_TOLERANCE_MINUTES };
  }
  if (diff <= ARRIVAL_TOLERANCE_MINUTES) return { result: 'MATCH', reason: 'WITHIN_TOLERANCE', differenceMinutes: diff, toleranceMinutes: ARRIVAL_TOLERANCE_MINUTES };
  return { result: 'CONFLICT', reason: 'VALUE_DIFFERS_BEYOND_TOLERANCE', differenceMinutes: diff, toleranceMinutes: ARRIVAL_TOLERANCE_MINUTES };
}
