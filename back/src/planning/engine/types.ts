/**
 * Cost / Risk Engine · Recovery Solver 의 입력 · 출력 계약 (T-112 · T-113).
 *
 * 순수 모듈이다: DB · 네트워크 · LLM 을 import 하지 않는다(ADR-029). 숫자는 모두 KRW 정수, 날짜는 Asia/Seoul 날짜(YYYY-MM-DD),
 * 시각은 계획일(D0)의 Asia/Seoul 정시(0~24). 현재 시각은 읽지 않는다 — `as_of` 를 받는다.
 */

export type ActionType = 'KEEP_CURRENT_PLAN' | 'MOVE_TO_WAREHOUSE' | 'MOVE_TO_ODCY' | 'WAIT_AT_TERMINAL';
export const ACTION_TYPES: readonly ActionType[] = ['KEEP_CURRENT_PLAN', 'MOVE_TO_WAREHOUSE', 'MOVE_TO_ODCY', 'WAIT_AT_TERMINAL'];

export type Priority = 'CRITICAL' | 'HIGH' | 'NORMAL';

/** Truth Layer 의 사실 상태(`fact_state`) — 계획 입력에 쓸 수 있는지는 비용 정책이 정한다. */
export type FactState = 'CONFIRMED' | 'OBSERVED' | 'PROVISIONAL' | 'NEEDS_REVIEW' | 'STALE' | 'REVOKED' | 'UNKNOWN';
/** 신선도. N_A = 시간에 따라 낡지 않는 사실(계약 요율 등). */
export type FreshnessState = 'FRESH' | 'AGING' | 'STALE' | 'EXPIRED' | 'UNKNOWN' | 'N_A';

export interface ContainerInput {
  container_id: string;
  container_no: string;
  size_type: string;
  carrier: string;
  priority: Priority;
  /** Demurrage 무료 마지막 날. 없으면 Demurrage 를 계산하지 못한다(NOT_AVAILABLE). */
  lfd: string | null;
  pickup_ready: boolean;
  current_location_id: string;
  destination_id: string;
  planned_day: string;
  planned_depart_hour: number | null;
  /** 다른 창고로 바꿔 보내도 되는지(화주 승인). 기본 false. */
  alternate_destination_allowed: boolean;
  /** 이 컨테이너 사실의 근거(LFD · 반출 가능 · 계획). */
  evidence_refs: string[];
  is_simulated: boolean;
  /** T-136: 컨테이너가 실린 입항 건(공공 컨테이너에 연결된 LIVE 기록만). 그 입항 신고 일시(사실 `declared_arrival`)를 반출 제약 · 검증 위험에 쓴다 */
  vessel_call_id?: string | null;
}

export interface FacilityInput {
  facility_id: string;
  name: string;
  kind: 'WAREHOUSE' | 'ODCY';
  accepts: string[];
  /** 오늘(D0) 이 시설로 출발할 수 있는 첫 정시. */
  open_from_hour: number;
  /** 오늘 도착을 위한 마지막 출발 정시(창고 입고 마감 · ODCY 반입 마감에서 정한다). */
  last_departure_hour: number;
  /** 터미널 → 이 시설 왕복으로 트럭을 점유하는 시간(정수 시간). */
  trip_hours: number;
}

export interface TruckInput {
  truck_id: string;
  pool_id: string;
  /** 출발 가능 시간창 [from, to) — 일은 `to` 전에 끝나야 한다. */
  from_hour: number;
  to_hour: number;
  /** 이 트럭이 있다는 근거 사실. */
  fact_ref: string | null;
}

export type RatesBySize = Record<string, number>;

export interface RateTable {
  rate_version: string;
  /** 요율 출처(예: 시나리오 요율표 — [ASSUMPTION] 자리표시). */
  source_ref: string;
  assumption: string | null;
  currency: 'KRW';
  demurrage_per_day: Record<string, RatesBySize>;
  terminal_storage_per_day: RatesBySize;
  detention_free_days: number;
  /** 편도 운임. 키는 `FROM__TO`. */
  transport: Record<string, RatesBySize>;
  odcy: Record<string, { handling_in_out: RatesBySize; storage_per_day: RatesBySize }>;
}

/**
 * 계획이 기대는 사실 하나. 값은 Truth Layer 가 판정한 현재 값(또는 시나리오 값)이다.
 * 키(Truth 와 같은 형식): 창고 `capacity.day(D)` · ODCY `capacity.size_type(T).day(D)` | `capacity.day(D)` ·
 * 협력 차량 `available.slot(DTHH:MM-HH:MM)` · ODCY 보관 한도 `max_days`.
 */
export interface PlanningFact {
  fact_ref: string;
  subject_id: string;
  fact_key: string;
  value: number | null;
  fact_state: FactState;
  freshness: FreshnessState;
  /** TRUTH = Truth Layer 사건 · SCENARIO = 합성 시나리오 팩 · OPERATIONAL_RECORD = 사람이 넣은 운영 기록(시설 보관 한도 등, T-123) */
  source: 'TRUTH' | 'SCENARIO' | 'OPERATIONAL_RECORD';
  is_simulated: boolean;
  evidence_time: string | null;
}

export interface PlanningInput {
  scenario_id: string | null;
  contains_simulated: boolean;
  as_of: string;
  plan_day: string;
  /** 계획 기간의 날짜. 첫 날 = plan_day. */
  horizon_days: string[];
  terminal_id: string;
  containers: ContainerInput[];
  facilities: FacilityInput[];
  own_trucks: TruckInput[];
  partner_pools: { pool_id: string; name: string }[];
  rates: RateTable;
  facts: PlanningFact[];
  /**
   * T-136 Phase 5 — 예외가 영향을 준 컨테이너(예외 · 관측의 관계 `operational_exception_container`). 있으면 이 컨테이너들만 재배치 후보이고,
   * 나머지 오늘 계획은 **고정된 기존 계획**(원래 계획대로 — 창고 용량 · 트럭 시간은 쓰지만 바꾸지 않는다)이다. 없으면(예외 없이 연 실행) 전부 후보.
   */
  affected_container_ids?: string[] | null;
}

// ---------------------------------------------------------------- 출력

export type CostItemKey = 'transport' | 'storage' | 'handling' | 'demurrage' | 'detention' | 'delay' | 'additional_move' | 'risk';
export const COST_ITEM_KEYS: readonly CostItemKey[] = ['transport', 'storage', 'handling', 'demurrage', 'detention', 'delay', 'additional_move', 'risk'];
/** base_cost 에 들어가는 항목(실제로 내는 돈). 나머지(delay · risk)는 정책 벌점 = risk_penalty. */
export const BASE_COST_ITEMS: readonly CostItemKey[] = ['transport', 'storage', 'handling', 'demurrage', 'detention', 'additional_move'];

export interface CostLine {
  item: CostItemKey;
  code: string;
  label: string;
  qty: number;
  unit_krw: number | null;
  amount_krw: number;
  currency: 'KRW';
  status: 'CALCULATED' | 'NOT_AVAILABLE';
  source_type: 'RATE_TABLE' | 'FACT' | 'POLICY';
  source_ref: string;
  assumption: string | null;
}

export interface CostBreakdown {
  transport: number;
  storage: number;
  handling: number;
  demurrage: number;
  detention: number;
  delay: number;
  additional_move: number;
  risk: number;
  base_cost: number;
  risk_penalty: number;
  total: number;
  lines: CostLine[];
}

export type InfeasibleReason =
  | 'CONTAINER_NOT_READY'
  // T-136: 공공 관측(입항 신고 일시)상 그날에는 아직 입항 전이다
  | 'VESSEL_NOT_ARRIVED'
  | 'SIZE_NOT_ACCEPTED'
  | 'ALTERNATE_DESTINATION_NOT_APPROVED'
  | 'NO_DEPARTURE_WINDOW'
  | 'FACT_MISSING'
  | 'FACT_STALE'
  | 'FACT_REVOKED'
  | 'FACT_CONFLICTED'
  | 'FACT_PROVISIONAL_NOT_ALLOWED'
  | 'CAPACITY_ZERO'
  | 'STORAGE_LIMIT_EXCEEDED'
  | 'RATE_MISSING'
  | 'LFD_MISSING';

export interface InfeasibleDetail {
  code: InfeasibleReason;
  ref: string;
  note: string;
}

/** 트럭이 필요한 오늘 이동(KEEP · 다른 창고 · ODCY). 대기는 오늘 트럭을 쓰지 않는다. */
export interface TruckJob {
  trip_hours: number;
  earliest_hour: number;
  latest_hour: number;
}

/** 계획이 쓰는 용량 자원. Solver 가 이 키로 합을 묶는다. */
export interface CapacityUse {
  resource_key: string;
}

export interface ActionOption {
  /** T-136: AFFECTED = 예외 때문에 재배치 후보 · FIXED = 영향 없는 기존 계획(원래 계획만) · ALL = 범위 제한 없음(예외 없는 실행) */
  scope?: 'AFFECTED' | 'FIXED' | 'ALL';
  option_id: string;
  container_id: string;
  action: ActionType;
  /** 오늘 컨테이너가 가는 곳(창고 · ODCY). 대기는 터미널. */
  target_id: string;
  /** 최종 목적지(창고). */
  destination_id: string;
  /** 최종 목적지(창고)에 들어가는 날. */
  delivery_day: string;
  feasible: boolean;
  infeasible_reasons: InfeasibleDetail[];
  cost: CostBreakdown;
  truck_job: TruckJob | null;
  capacity_uses: CapacityUse[];
  assumptions: string[];
  evidence_refs: string[];
  /** 이 선택지가 기대는 잠정(PROVISIONAL) · 오래되는 중(AGING) 사실 — 화면 경고와 승인 확인에 쓴다. */
  warning_refs: { fact_ref: string; reason: 'PROVISIONAL' | 'AGING' | 'CONFLICTED' }[];
}

export interface CapacityResource {
  resource_key: string;
  kind: 'WAREHOUSE_DAY' | 'ODCY';
  facility_id: string;
  day: string;
  /** 쓸 수 있는 용량(사실 값 − 이미 약속된 수). 사실을 쓸 수 없으면 null. */
  available: number | null;
  fact_value: number | null;
  committed: number;
  fact_ref: string | null;
  sizes: string[] | null;
}

/** Solver 가 쓰는 트럭 하나(자사 명부 + 협력 운송사 가용 사실에서 만든 것). */
export interface TruckResource extends TruckInput {
  kind: 'OWN' | 'PARTNER';
  warning: 'PROVISIONAL' | 'AGING' | null;
  /** 이 트럭에 일을 맡기면 붙는 위험 벌점(잠정 · 오래되는 사실 의존). */
  penalty_krw: number;
}

export interface UsedFact {
  fact_ref: string;
  subject_id: string;
  fact_key: string;
  value: number | null;
  fact_state: FactState;
  freshness: FreshnessState;
  /** TRUTH = Truth Layer 사건 · SCENARIO = 합성 시나리오 팩 · OPERATIONAL_RECORD = 사람이 넣은 운영 기록(시설 보관 한도 등, T-123) */
  source: 'TRUTH' | 'SCENARIO' | 'OPERATIONAL_RECORD';
  usage: 'USED' | 'USED_WITH_WARNING' | 'EXCLUDED';
  reason: string | null;
}

export interface CostTable {
  policy_version: string;
  rate_version: string;
  as_of: string;
  plan_day: string;
  options: ActionOption[];
  resources: CapacityResource[];
  trucks: TruckResource[];
  facts: UsedFact[];
  /** 계획 대상이 아닌 컨테이너가 이미 약속한 창고 용량. */
  commitments: { facility_id: string; day: string; count: number; container_ids: string[] }[];
  candidates: string[];
  /** T-136: 예외 영향 컨테이너(재배치 후보). null = 범위 제한 없음(예외 없이 연 실행) */
  affected: string[] | null;
  warnings: string[];
}
