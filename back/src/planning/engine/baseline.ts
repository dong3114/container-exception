import { PRIORITY_RANK } from './cost-policy.js';
import type { ActionOption, ContainerInput, CostTable, PlanningInput } from './types.js';

/**
 * Baseline (T-112 · docs/08 5절 · docs/04 6.5) — 최적화가 아니라 **규칙**이다: 현재 계획을 새 제약 아래 그대로 밀고 간다.
 *  1. 목적지 창고의 오늘 남은 용량만큼, 원래 출발 순서(같은 시각이면 업무 우선순위 → Reefer → 번호)로 원래 계획(KEEP)을 유지한다.
 *  2. 나머지는 터미널에서 기다렸다가 직송(WAIT)한다. 입고일은 LFD 가 이른 순(같으면 하루 대기 비용이 큰 순 → 번호)으로
 *     창고 용량이 남은 가장 이른 날에 넣는다. [ASSUMPTION] 운영자가 조치하지 않을 때의 흐름을 단순화한 것
 * 비용은 Solver 와 **같은 비용표**(같은 엔진 · 같은 사실 · 같은 정책)에서 가져온다. 트럭은 원래 배차를 쓴다고 본다.
 */
export interface BaselineResult {
  rule: string;
  assignments: { container_id: string; option: ActionOption }[];
  unplanned: { container_id: string; reason: string }[];
  base_cost: number;
  risk_penalty: number;
  total: number;
}

export const BASELINE_RULE = 'baseline/1: keep in original departure order up to today capacity; rest wait at terminal, delivery day by LFD order';

export function computeBaseline(input: PlanningInput, table: CostTable): BaselineResult {
  const byId = new Map(input.containers.map((c) => [c.container_id, c]));
  const candidates = table.candidates.map((id) => byId.get(id)!);
  const optionsOf = (c: ContainerInput) => table.options.filter((o) => o.container_id === c.container_id);
  const remaining = new Map(table.resources.filter((r) => r.kind === 'WAREHOUSE_DAY').map((r) => [r.resource_key, r.available ?? 0]));
  const take = (o: ActionOption): boolean => {
    const keys = o.capacity_uses.map((u) => u.resource_key).filter((k) => remaining.has(k));
    if (keys.some((k) => (remaining.get(k) ?? 0) <= 0)) return false;
    for (const k of keys) remaining.set(k, remaining.get(k)! - 1);
    return true;
  };
  const assignments: BaselineResult['assignments'] = [];
  const unplanned: BaselineResult['unplanned'] = [];
  const reefer = (c: ContainerInput) => (/RF$/.test(c.size_type) ? 0 : 1);
  const order = [...candidates].sort(
    (a, b) => (a.planned_depart_hour ?? 99) - (b.planned_depart_hour ?? 99) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || reefer(a) - reefer(b) || a.container_id.localeCompare(b.container_id),
  );
  const waiting: ContainerInput[] = [];
  for (const c of order) {
    const keep = optionsOf(c).find((o) => o.action === 'KEEP_CURRENT_PLAN');
    if (keep?.feasible && take(keep)) assignments.push({ container_id: c.container_id, option: keep });
    else waiting.push(c);
  }
  const dailyHold = (c: ContainerInput) => (input.rates.demurrage_per_day[c.carrier]?.[c.size_type] ?? 0) + (input.rates.terminal_storage_per_day[c.size_type] ?? 0);
  waiting.sort((a, b) => (a.lfd ?? '9999').localeCompare(b.lfd ?? '9999') || dailyHold(b) - dailyHold(a) || a.container_id.localeCompare(b.container_id));
  for (const c of waiting) {
    const waits = optionsOf(c)
      .filter((o) => o.action === 'WAIT_AT_TERMINAL' && o.feasible)
      .sort((a, b) => a.delivery_day.localeCompare(b.delivery_day));
    const pick = waits.find((o) => take(o));
    if (pick) assignments.push({ container_id: c.container_id, option: pick });
    else unplanned.push({ container_id: c.container_id, reason: waits.length ? 'NO_WAREHOUSE_CAPACITY_IN_HORIZON' : 'NO_FEASIBLE_WAIT_OPTION' });
  }
  assignments.sort((a, b) => a.container_id.localeCompare(b.container_id));
  const sum = (k: 'base_cost' | 'risk_penalty' | 'total') => assignments.reduce((s, a) => s + a.option.cost[k], 0);
  return { rule: BASELINE_RULE, assignments, unplanned, base_cost: sum('base_cost'), risk_penalty: sum('risk_penalty'), total: sum('total') };
}
