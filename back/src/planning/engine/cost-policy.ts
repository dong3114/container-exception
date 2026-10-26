import type { FactState, FreshnessState, Priority } from './types.js';

/**
 * 비용 · 위험 정책 (T-112). 벌점 값은 모두 [ASSUMPTION] 이다 — 실제 운영 데이터로 정한 값이 아니다.
 * 한 곳에만 둔다: 값을 바꾸면 `version` 을 올린다(계획 입력 스냅숏이 이 판을 기록한다).
 *
 * base_cost   = 실제로 내는 돈(운송 · 보관 · 핸들링 · Demurrage · Detention · 추가 이동)
 * risk_penalty = 정책 벌점(입고 지연 · 잠정 사실 의존 · 오래되는 사실 · 터미널 대기 위험) — 돈이 아니라 판단 가중치
 * total_expected_loss = base_cost + risk_penalty  (Solver 목적함수)
 */
export interface CostPolicy {
  version: string;
  /** 업무 우선순위별 입고 지연 벌점(원/일, 원래 입고일 대비). [ASSUMPTION] */
  delay_penalty_per_day_krw: Record<Priority, number>;
  /** LFD 가 지난 뒤 터미널에 남는 날마다 붙는 대기 위험 벌점(원/일). [ASSUMPTION] */
  terminal_wait_risk_per_day_krw: number;
  provisional: {
    /** 잠정(PROVISIONAL) 사실을 계획 제약으로 써도 되는가. */
    allowed: boolean;
    /** 잠정 사실에 기대는 선택지 하나당 벌점. [ASSUMPTION] */
    penalty_krw: number;
  };
  /** 오래되는 중(AGING)인 사실에 기대는 선택지 하나당 벌점. [ASSUMPTION] */
  aging_penalty_krw: number;
  /** 반출 후 빈 컨테이너 반납까지 걸리는 날(Detention 계산). [ASSUMPTION] */
  empty_return_lead_days: number;
}

export const COST_POLICY_VERSION = 'cost-policy/1';

export const DEFAULT_COST_POLICY: CostPolicy = {
  version: COST_POLICY_VERSION,
  delay_penalty_per_day_krw: { CRITICAL: 300_000, HIGH: 50_000, NORMAL: 0 },
  terminal_wait_risk_per_day_krw: 10_000,
  provisional: { allowed: true, penalty_krw: 20_000 },
  aging_penalty_krw: 10_000,
  empty_return_lead_days: 1,
};

export type FactUsage =
  | { usable: true; warning: 'PROVISIONAL' | 'AGING' | null }
  | { usable: false; reason: 'FACT_MISSING' | 'FACT_STALE' | 'FACT_REVOKED' | 'FACT_CONFLICTED' | 'FACT_PROVISIONAL_NOT_ALLOWED' };

/**
 * 사실 상태 → 계획 제약으로 쓸 수 있는가.
 *   CONFIRMED · OBSERVED(신선) → 그대로 · AGING → 경고 + 벌점 · PROVISIONAL → 정책이 허용하면 경고 + 벌점
 *   NEEDS_REVIEW(충돌) · STALE · EXPIRED · REVOKED · UNKNOWN → 제약으로 쓰지 않는다(그 자원은 없는 것으로 본다)
 */
export function factUsage(state: FactState | null, freshness: FreshnessState | null, policy: CostPolicy): FactUsage {
  if (state === null || state === 'UNKNOWN') return { usable: false, reason: 'FACT_MISSING' };
  if (state === 'REVOKED') return { usable: false, reason: 'FACT_REVOKED' };
  if (state === 'NEEDS_REVIEW') return { usable: false, reason: 'FACT_CONFLICTED' };
  if (state === 'STALE' || freshness === 'STALE' || freshness === 'EXPIRED') return { usable: false, reason: 'FACT_STALE' };
  if (state === 'PROVISIONAL') {
    if (!policy.provisional.allowed) return { usable: false, reason: 'FACT_PROVISIONAL_NOT_ALLOWED' };
    return { usable: true, warning: 'PROVISIONAL' };
  }
  return { usable: true, warning: freshness === 'AGING' ? 'AGING' : null };
}

export const PRIORITY_RANK: Record<Priority, number> = { CRITICAL: 0, HIGH: 1, NORMAL: 2 };
