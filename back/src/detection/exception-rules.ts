/**
 * 운영 예외 탐지 규칙(T-132 · ADR-040) — **순수 모듈**: DB · 네트워크 · LLM · 현재 시각을 쓰지 않는다. 같은 입력 → 같은 출력.
 *
 * 첫 예외 종류 WAREHOUSE_CAPACITY_SHORTAGE:
 *   scheduledDemand  = 그 날짜에 그 창고로 갈 예정인 유효 컨테이너 수(운영 기준 계획 · 시나리오의 원래 계획)
 *   confirmedCapacity = 그 창고 · 그 날짜의 수용량 사실 `capacity.day(D)` 의 지금 값(Truth 판정)
 *   shortage         = scheduledDemand − confirmedCapacity  (> 0 이면 예외)
 *
 * 사실 품질 정책 — 숫자가 있어도 믿을 수 없으면 부족이라고 단정하지 않는다:
 *   CONFIRMED · OBSERVED → 근거 CONFIRMED(부족 · 해소 모두 단정)
 *   PROVISIONAL          → 근거 PROVISIONAL(부족은 기록하되 복구 실행을 자동으로 만들지 않는다 · 해소는 단정하지 않는다)
 *   STALE · REVOKED · NEEDS_REVIEW · UNKNOWN · 사실 없음 → INDETERMINATE(판단 불가 — 정보 위험. 새 예외를 만들지 않고 진행 중 예외를 해소하지도 않는다)
 * 예정 반입이 0 이면 수용량과 무관하게 부족이 아니다(해소 가능).
 *
 * 넘치는 컨테이너(affected): "아무 N대"가 아니라 그날 계획 순서(출발 시각 → 컨테이너 번호)로 수용량 안에 드는 앞쪽을 빼고 남는 뒤쪽이다.
 * 어느 컨테이너를 어떻게 옮길지는 탐지기가 아니라 복구 Solver 가 정한다 — 탐지기는 문제의 범위만 정한다.
 */

export const WAREHOUSE_CAPACITY_SHORTAGE = 'WAREHOUSE_CAPACITY_SHORTAGE' as const;

export interface DemandItem {
  /** 출처 참조 — 운영 기준 기록 id 또는 시나리오 컨테이너 id */
  ref: string;
  container_no: string;
  facility_id: string;
  day: string;
  depart_hour: number | null;
  /** 운영 입력 묶음(LIVE) — 근거 기록용 */
  batch_id?: string;
}

export type CapacityState = 'CONFIRMED' | 'OBSERVED' | 'PROVISIONAL' | 'NEEDS_REVIEW' | 'STALE' | 'REVOKED' | 'UNKNOWN' | 'MISSING';

export interface CapacityObservation {
  facility_id: string;
  day: string;
  value: number | null;
  state: CapacityState;
  /** 이긴 사건(근거) — 없으면 null */
  event_id: string | null;
  fact_key: string;
}

export type Verdict = 'SHORTAGE' | 'SUFFICIENT' | 'INDETERMINATE';
export type Basis = 'CONFIRMED' | 'PROVISIONAL';

export interface CapacityAssessment {
  facility_id: string;
  day: string;
  demand: number;
  capacity: number | null;
  capacity_state: CapacityState;
  capacity_event_id: string | null;
  fact_key: string;
  verdict: Verdict;
  /** 판단을 단정한 근거(INDETERMINATE 면 null) */
  basis: Basis | null;
  shortage: number;
  /** 수용량을 넘는 컨테이너(계획 순서의 뒤쪽) — 번호 */
  affected: string[];
  /** 그날 그 창고로 가는 컨테이너 전부(계획 순서) */
  scheduled: string[];
  demand_refs: string[];
}

export const capacityFactKey = (day: string) => `capacity.day(${day})`;

const basisOf = (state: CapacityState): Basis | null => (state === 'CONFIRMED' || state === 'OBSERVED' ? 'CONFIRMED' : state === 'PROVISIONAL' ? 'PROVISIONAL' : null);

/** 계획 순서: 출발 시각(없으면 맨 뒤) → 컨테이너 번호. */
export function planOrder(a: DemandItem, b: DemandItem): number {
  const ha = a.depart_hour ?? 99;
  const hb = b.depart_hour ?? 99;
  return ha !== hb ? ha - hb : a.container_no < b.container_no ? -1 : a.container_no > b.container_no ? 1 : 0;
}

/**
 * 창고 × 날짜마다 판정한다. 대상 = 예정 반입이 있는 (창고, 날짜) + `alsoCheck`(진행 중 예외가 있는 곳 — 예정이 0 이 되면 해소를 판정하려고).
 * `windowDays` 밖의 날짜는 보지 않는다(지난 날 · 계획 범위 밖).
 */
export function assessWarehouseCapacity(
  demand: readonly DemandItem[],
  capacity: readonly CapacityObservation[],
  windowDays: readonly string[],
  warehouseIds: ReadonlySet<string>,
  alsoCheck: readonly { facility_id: string; day: string }[] = [],
): CapacityAssessment[] {
  const window = new Set(windowDays);
  const groups = new Map<string, DemandItem[]>();
  const key = (f: string, d: string) => `${f}|${d}`;
  for (const item of demand) {
    if (!warehouseIds.has(item.facility_id) || !window.has(item.day)) continue;
    const k = key(item.facility_id, item.day);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  for (const c of alsoCheck) if (window.has(c.day) && warehouseIds.has(c.facility_id) && !groups.has(key(c.facility_id, c.day))) groups.set(key(c.facility_id, c.day), []);
  const cap = new Map(capacity.map((c) => [key(c.facility_id, c.day), c]));
  const out: CapacityAssessment[] = [];
  for (const k of [...groups.keys()].sort()) {
    const [facilityId, day] = k.split('|') as [string, string];
    const items = [...groups.get(k)!].sort(planOrder);
    const c = cap.get(k) ?? { facility_id: facilityId, day, value: null, state: 'MISSING' as const, event_id: null, fact_key: capacityFactKey(day) };
    const usable = c.value !== null && Number.isSafeInteger(c.value) && c.value >= 0;
    const basis = usable ? basisOf(c.state) : null;
    const scheduled = items.map((i) => i.container_no);
    const base = { facility_id: facilityId, day, demand: items.length, capacity: usable ? c.value : null, capacity_state: c.state, capacity_event_id: c.event_id, fact_key: c.fact_key, scheduled, demand_refs: items.map((i) => i.ref) };
    if (items.length === 0) {
      out.push({ ...base, verdict: 'SUFFICIENT', basis: basis ?? 'CONFIRMED', shortage: 0, affected: [] });
      continue;
    }
    if (basis === null) {
      out.push({ ...base, verdict: 'INDETERMINATE', basis: null, shortage: 0, affected: [] });
      continue;
    }
    const shortage = Math.max(0, items.length - (c.value as number));
    out.push({ ...base, verdict: shortage > 0 ? 'SHORTAGE' : 'SUFFICIENT', basis, shortage, affected: scheduled.slice(items.length - shortage) });
  }
  return out;
}

export type LifecycleAction =
  | { action: 'NONE' }
  | { action: 'DETECT'; basis: Basis }
  | { action: 'CHANGE'; basis: Basis }
  | { action: 'RESOLVE' }
  | { action: 'INDETERMINATE' };

export interface ActiveException {
  basis: Basis;
  scheduled_demand: number;
  capacity: number | null;
  shortage: number;
  /** 직전 관측의 근거 지문 */
  last_evidence_hash: string | null;
}

/**
 * 진행 중 예외(있으면)와 이번 판정 → 기록할 일. 근거 지문이 직전과 같으면 아무것도 기록하지 않는다(반복 탐지 = 기록 없음).
 * 해소는 근거가 단정적일 때만(CONFIRMED 수용량이 충분 · 예정 반입 0). 임시 값으로 "충분해졌다"고 닫지 않는다.
 */
export function decideLifecycle(active: ActiveException | null, a: CapacityAssessment, evidenceHash: string): LifecycleAction {
  if (!active) {
    if (a.verdict !== 'SHORTAGE' || !a.basis) return { action: 'NONE' };
    return { action: 'DETECT', basis: a.basis };
  }
  if (a.verdict === 'SUFFICIENT' && (a.demand === 0 || a.basis === 'CONFIRMED')) return { action: 'RESOLVE' };
  if (active.last_evidence_hash === evidenceHash) return { action: 'NONE' };
  if (a.verdict === 'SHORTAGE' && a.basis) return { action: 'CHANGE', basis: a.basis };
  return { action: 'INDETERMINATE' };
}

/**
 * 복구 실행을 자동으로 만들 때: 진행 중 · 근거 CONFIRMED · 아직 실행 없음. 임시 사실만으로는 업무를 시작하지 않는다(사람이 확인하면 그때 만든다).
 * 근거가 그대로여도(관측 기록 없음) 실행이 아직 없으면 다시 시도한다 — 앞선 시도가 중간에 끊겼어도 언젠가 하나가 생긴다.
 */
export function shouldCreateRun(status: 'ACTIVE' | 'RESOLVED', basis: Basis, hasRun: boolean): boolean {
  return status === 'ACTIVE' && basis === 'CONFIRMED' && !hasRun;
}

/** 근거 지문의 재료 — 같은 판단 근거면 같은 지문(시각 · 순서 무관). */
export function evidenceMaterial(a: CapacityAssessment): Record<string, unknown> {
  return {
    facility_id: a.facility_id,
    day: a.day,
    verdict: a.verdict,
    demand: a.demand,
    capacity: a.capacity,
    capacity_state: a.capacity_state,
    capacity_event_id: a.capacity_event_id,
    demand_refs: [...a.demand_refs].sort(),
  };
}
