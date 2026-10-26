import type { Authority, Confidence, Strength } from './reconcile-rules.js';

/**
 * 사실 판정 정책 값(T-093) — 한 곳에 모은다. **모두 실운영 데이터 없이 정한 휴리스틱이다 `[ASSUMPTION]`**(docs/05 15절 PoC 값 · Q-23 · Q-24).
 * 제품의 확정 진리가 아니다: 실제 충돌 빈도 · 사람 정정 · 잘못된 보류 · 놓친 충돌을 보고 바꾼다. 바꾸면 `TRUTH_POLICY_VERSION` 을 올린다.
 * 코드 깊숙이 숫자를 박지 않는다 — 판정 함수는 이 객체를 인자로 받는다(시험이 경계값을 바꿔 볼 수 있다).
 */
export const TRUTH_POLICY_VERSION = 'truth-policy/1';

export interface TruthPolicy {
  /** 같은 강도의 서로 다른 값을 "동시"로 보는 근거 시각 차이(이하). docs/05 τ `[ASSUMPTION]` */
  nearTimeConflictWindowMs: number;
  /** 약한 근거가 현재 값을 이 비율 이상 줄이면 보류(HELD). docs/05 θ_adverse `[ASSUMPTION]` */
  materialChangeRatio: number;
}

export const DEFAULT_TRUTH_POLICY: TruthPolicy = {
  nearTimeConflictWindowMs: 5 * 60_000,
  materialChangeRatio: 0.3,
};

/**
 * **출처 강도(evidence strength 0~3)** — 결정론적 출처(provenance) · 권한(authority)만으로 정한다(docs/05 3.3).
 * 모델의 확신도(confidence)는 쓰지 않는다: AI 가 0.99 라고 해도 강도는 오르지 않는다. "입력 신뢰도"(`input_confidence_level`)는
 * 모델 점수가 아니라 Backend 검증기 판정이다(모호 표현 → LOW).
 *
 *   강도 = 출처 종류 × (그 사실 계열에 대한) 출처 권한 × 입력 신뢰도   + 사람 확인이면 최소 2
 *
 * | 출처 종류        | 권한 A | 권한 S | 권한 W | 비고                                              |
 * | HUMAN_UI         | 3      | 2      | 1      | 운영자(CERA 사용자)는 대부분 S                    |
 * | PARTNER_SYSTEM   | 3      | 2      | 1      | 권한자의 운영 시스템(TMS · WMS · TOS)             |
 * | PUBLIC_API       | 2      | 1      | 1      | 반영 지연 SLA 미확인이라 A 도 2                   |
 * | FILE_IMPORT      | 2      | 2      | 1      |                                                   |
 * | EMAIL(LLM 추출)  | 1      | 1      | 0      | 신뢰도 LOW 면 0. 자원 · 제안 · 견적 사실만        |
 * | 그 밖            | 0      | 0      | 0      | DOCUMENT · INFERENCE — 이 슬라이스에서 후보 아님 |
 *
 * 권한은 **사실 계열별**이다(창고 담당자는 창고 수용량의 A 지만 통관의 A 가 아니다 — docs/05 3.2). 그래서 "공공데이터 vs 상대 회신" 같은
 * 전역 순위를 두지 않는다. 계열 · 출처 정책을 늘릴 때는 이 표와 `promotion-rules.ts` 의 계열 → 역할 표를 함께 늘린다.
 */
export function baseStrength(sourceType: string, authority: Authority, confidence: Confidence): Strength {
  switch (sourceType) {
    case 'HUMAN_UI':
    case 'PARTNER_SYSTEM':
      return authority === 'A' ? 3 : authority === 'S' ? 2 : 1;
    case 'PUBLIC_API':
      return authority === 'A' ? 2 : 1;
    case 'FILE_IMPORT':
      return authority === 'W' ? 1 : 2;
    case 'EMAIL':
      return confidence === 'LOW' || authority === 'W' ? 0 : 1;
    default:
      return 0;
  }
}
