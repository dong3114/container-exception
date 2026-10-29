import { createRequire } from 'node:module';
import { canonicalHash } from '../../shared/hash/hash.js';
import type { BaselineResult } from './baseline.js';
import type { ActionOption, CostBreakdown, CostLine, CostTable, PlanningInput, TruckResource } from './types.js';

/**
 * Recovery Solver (T-113) — Cost Engine 이 만든 비용표에서 **총 예상 손실(base + risk)이 가장 작은 조합**을 고른다.
 * LLM 이 아니고 권한도 없다: 결과는 후보 계획이며 저장 · 승인은 Backend 가 한다.
 *
 * 0-1 정수계획(MIP), HiGHS(MIT, WASM — 같은 프로세스 · 네트워크 없음 · 단일 스레드 결정론):
 *   y[i]       선택지 i 를 고른다(컨테이너마다 정확히 하나)
 *   z[i,k,h]   오늘 이동하는 선택지 i 를 트럭 k 가 h 시에 출발해 맡는다(왕복 시간 동안 그 트럭을 점유)
 *   s[c]       계획 불가(아주 큰 벌점) — 모든 선택지가 막히면 어느 컨테이너가 왜 막혔는지 설명하려고 둔다
 * 제약: 컨테이너당 하나 · 창고 일별 용량 · ODCY 용량 · 트럭 시간창 · 트럭 한 대 한 시각 한 일 · 출발 시간창(선택지에 이미 반영)
 * 목적: Σ total·y + Σ 협력 트럭 위험 벌점·z (+ M·s)
 * 동률은 결정론으로 가른다: (2단계) 같은 목적값 안에서 원래 계획에 가까운 선택지, (3단계) 이른 출발 · 트럭 번호 순.
 */

export const SOLVER_VERSION = 'recovery-solver/1';
export const SOLVER_ENGINE = 'HiGHS 1.15.3 (highs-js, MIP)';
/** 비상 상한(개발 안전 상한 — 성능 목표가 아니다). 관측 후 줄인다. [ASSUMPTION] */
export const SOLVER_TIME_LIMIT_SECONDS = 30;
const UNPLANNED_PENALTY = 1_000_000_000;

export type SolverStatus = 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'TIME_LIMIT' | 'ERROR';

export interface SolverAssignment {
  container_id: string;
  option_id: string;
  action: ActionOption['action'];
  target_id: string;
  destination_id: string;
  delivery_day: string;
  scheduled_time: string | null;
  truck_id: string | null;
  truck_pool_id: string | null;
  expected_cost: CostBreakdown;
  reason_codes: string[];
  alternatives: { option_id: string; action: string; target_id: string; delivery_day: string; total: number; base_cost: number; difference: number; blocked_by: string[] }[];
  warning_refs: ActionOption['warning_refs'];
  evidence_refs: string[];
  assumptions: string[];
}

export interface SolverResult {
  solver_version: string;
  engine: string;
  status: SolverStatus;
  input_hash: string;
  objective_value: number | null;
  base_cost: number | null;
  risk_penalty: number | null;
  baseline_value: number;
  baseline_base_cost: number;
  saving: number | null;
  base_saving: number | null;
  assignments: SolverAssignment[];
  unplanned: { container_id: string; reasons: string[] }[];
  binding_constraints: { type: string; ref: string; note: string }[];
  resource_usage: { resource_key: string; used: number; available: number | null }[];
  truck_usage: { truck_id: string; kind: string; busy_hours: number[]; from_hour: number; to_hour: number }[];
  assumptions: string[];
  warnings: string[];
  timings_ms: { model: number; solve: number };
  model_size: { options: number; truck_vars: number; constraints: number };
}

type Highs = { solve: (lp: string, opts?: Record<string, unknown>) => { Status: string; ObjectiveValue: number; Columns: Record<string, { Primal: number }> } };
let highsPromise: Promise<Highs> | null = null;
/** WASM 로더(한 번만). 계산 라이브러리일 뿐 — 네트워크 · 파일 쓰기 없음. */
export function loadHighs(): Promise<Highs> {
  if (!highsPromise) {
    const require = createRequire(import.meta.url);
    const loader = require('highs') as () => Promise<Highs>;
    highsPromise = loader();
  }
  return highsPromise;
}

interface ZVar {
  name: string;
  option: number;
  truck: number;
  hour: number;
  trip: number;
}

interface Model {
  options: ActionOption[];
  containers: string[];
  z: ZVar[];
  trucks: TruckResource[];
  lines: string[]; // 제약
  zByOption: Map<number, ZVar[]>;
}

function buildModel(table: CostTable): Model {
  const options = table.options.filter((o) => o.feasible);
  const containers = [...table.candidates];
  const trucks = table.trucks;
  const z: ZVar[] = [];
  const zByOption = new Map<number, ZVar[]>();
  options.forEach((o, i) => {
    if (!o.truck_job) return;
    const list: ZVar[] = [];
    trucks.forEach((k, ki) => {
      const from = Math.max(o.truck_job!.earliest_hour, k.from_hour);
      const to = Math.min(o.truck_job!.latest_hour, k.to_hour - o.truck_job!.trip_hours);
      for (let h = from; h <= to; h++) list.push({ name: `z${z.length + list.length}`, option: i, truck: ki, hour: h, trip: o.truck_job!.trip_hours });
    });
    z.push(...list);
    zByOption.set(i, list);
  });
  const lines: string[] = [];
  const sum = (terms: string[]) => (terms.length ? terms.join('\n + ') : '0 y_none');
  // 컨테이너당 정확히 하나(또는 계획 불가 s)
  containers.forEach((c, ci) => {
    const ys = options.map((o, i) => (o.container_id === c ? `y${i}` : null)).filter((x): x is string => x !== null);
    lines.push(`one_${ci}: ${sum([...ys, `s${ci}`])} = 1`);
  });
  // 오늘 이동 = 트럭 한 대 · 출발 시각 하나
  options.forEach((o, i) => {
    if (!o.truck_job) return;
    const zs = zByOption.get(i) ?? [];
    lines.push(zs.length ? `job_${i}: ${sum(zs.map((v) => v.name))} - y${i} = 0` : `job_${i}: y${i} = 0`);
  });
  // 트럭 한 대는 한 시각에 일 하나(왕복 시간 동안 점유)
  trucks.forEach((k, ki) => {
    for (let t = k.from_hour; t < k.to_hour; t++) {
      const busy = z.filter((v) => v.truck === ki && v.hour <= t && t < v.hour + v.trip).map((v) => v.name);
      if (busy.length > 1) lines.push(`truck_${ki}_${t}: ${sum(busy)} <= 1`);
    }
  });
  // 용량(창고 일별 · ODCY)
  table.resources.forEach((r, ri) => {
    // 값이 없는 용량(null)은 제약을 없애지 않는다(T-136): 그 자원을 쓰는 선택지는 비용 엔진이 이미 실행 불가로 뺐다. 혹시 남았다면 0 으로 막는다
    if (r.available === null) {
      const ys = options.map((o, i) => (o.capacity_uses.some((u) => u.resource_key === r.resource_key) ? `y${i}` : null)).filter((x): x is string => x !== null);
      if (ys.length) lines.push(`cap_${ri}: ${sum(ys)} <= 0`);
      return;
    }
    const ys = options.map((o, i) => (o.capacity_uses.some((u) => u.resource_key === r.resource_key) ? `y${i}` : null)).filter((x): x is string => x !== null);
    if (ys.length) lines.push(`cap_${ri}: ${sum(ys)} <= ${r.available}`);
  });
  return { options, containers, z, trucks, lines, zByOption };
}

function lp(model: Model, objective: string[], extra: string[]): string {
  const bins = [...model.options.map((_, i) => `y${i}`), ...model.containers.map((_, ci) => `s${ci}`), ...model.z.map((v) => v.name)];
  const binLines: string[] = [];
  for (let i = 0; i < bins.length; i += 20) binLines.push(` ${bins.slice(i, i + 20).join(' ')}`);
  return ['Minimize', ` obj: ${objective.length ? objective.join('\n + ') : '0 s0'}`, 'Subject To', ...model.lines.map((l) => ` ${l}`), ...extra.map((l) => ` ${l}`), 'Binary', ...binLines, 'End'].join('\n');
}

const phase1Terms = (m: Model) => [
  ...m.options.map((o, i) => `${o.cost.total} y${i}`),
  ...m.z.filter((v) => m.trucks[v.truck]!.penalty_krw > 0).map((v) => `${m.trucks[v.truck]!.penalty_krw} ${v.name}`),
  ...m.containers.map((_, ci) => `${UNPLANNED_PENALTY} s${ci}`),
];
/** 같은 비용이면 원래 계획에 가까운 쪽: KEEP < 대기(이른 날) < ODCY < 다른 창고 */
const ACTION_PREF: Record<string, number> = { KEEP_CURRENT_PLAN: 0, WAIT_AT_TERMINAL: 1, MOVE_TO_ODCY: 3, MOVE_TO_WAREHOUSE: 6 };
const phase2Terms = (m: Model) => m.options.map((o, i) => `${ACTION_PREF[o.action]! + m.options.filter((x) => x.container_id === o.container_id && x.action === o.action && x.delivery_day < o.delivery_day).length} y${i}`);
const phase3Terms = (m: Model) => m.z.map((v) => `${v.hour * 100 + v.truck + 1} ${v.name}`);

function mapStatus(s: string): SolverStatus {
  if (s === 'Optimal') return 'OPTIMAL';
  if (s === 'Infeasible') return 'INFEASIBLE';
  if (/time limit/i.test(s)) return 'TIME_LIMIT';
  return 'ERROR';
}

export function solverInputHash(input: PlanningInput, table: CostTable): string {
  return canonicalHash({
    k: 'solver_input',
    v: 2,
    solver_version: SOLVER_VERSION,
    policy_version: table.policy_version,
    rate_version: table.rate_version,
    // T-136: 실행 시각(as_of) 자체는 넣지 않는다 — 같은 업무 입력이면 같은 지문(LIVE 에서 다시 계산할 때마다 새 판이 생기던 문제).
    // as_of 가 결정을 바꾸는 효과는 아래에 이미 들어 있다: 사실의 신선도 · 옵션의 실행 가능 여부 · 오늘 출발 가능 시간창(earliest/latest) · 트럭 시간창
    plan_day: input.plan_day,
    candidates: [...table.candidates].sort(),
    affected: table.affected ? [...table.affected].sort() : null,
    facts: input.facts.map((f) => ({ ref: f.fact_ref, key: f.fact_key, subject: f.subject_id, value: f.value, state: f.fact_state, freshness: f.freshness })),
    options: table.options.map((o) => ({ id: o.option_id, feasible: o.feasible, total: o.cost.total, window: o.truck_job ? [o.truck_job.earliest_hour, o.truck_job.latest_hour, o.truck_job.trip_hours] : null })),
    resources: table.resources.map((r) => ({ key: r.resource_key, available: r.available })),
    trucks: table.trucks.map((t) => ({ id: t.truck_id, from: t.from_hour, to: t.to_hour, penalty: t.penalty_krw })),
  });
}

export async function solveRecovery(input: PlanningInput, table: CostTable, baseline: BaselineResult, opts: { timeLimitSeconds?: number } = {}): Promise<SolverResult> {
  const t0 = performance.now();
  const model = buildModel(table);
  const highs = await loadHighs();
  const settings = { mip_rel_gap: 0, mip_abs_gap: 0.5, threads: 1, random_seed: 0, output_flag: false, presolve: 'on', time_limit: opts.timeLimitSeconds ?? SOLVER_TIME_LIMIT_SECONDS };
  const tModel = performance.now();
  const base: Omit<SolverResult, 'status' | 'objective_value' | 'base_cost' | 'risk_penalty' | 'saving' | 'base_saving' | 'assignments' | 'unplanned' | 'binding_constraints' | 'resource_usage' | 'truck_usage' | 'timings_ms'> = {
    solver_version: SOLVER_VERSION,
    engine: SOLVER_ENGINE,
    input_hash: solverInputHash(input, table),
    baseline_value: baseline.total,
    baseline_base_cost: baseline.base_cost,
    assumptions: [
      'Solver 는 1단계(컨테이너 × 경로 × 입고일 × 출발 시각 · 트럭) 할당이다 — 개별 트럭 동선 · 순서(2단계)는 범위 밖 (ADR-009) [ASSUMPTION]',
      '다음 날 이후 운송(대기 후 직송 · ODCY→창고)의 트럭은 제약하지 않는다 [ASSUMPTION]',
      '협력 운송사 가용 "N대" 는 그 시간창 동안 일할 수 있는 트럭 N대로 본다 [ASSUMPTION]',
    ],
    warnings: [...table.warnings],
    model_size: { options: model.options.length, truck_vars: model.z.length, constraints: model.lines.length },
  };
  const fail = (status: SolverStatus, warning: string): SolverResult => ({
    ...base,
    status,
    objective_value: null,
    base_cost: null,
    risk_penalty: null,
    saving: null,
    base_saving: null,
    assignments: [],
    unplanned: [],
    binding_constraints: [],
    resource_usage: [],
    truck_usage: [],
    warnings: [...base.warnings, warning],
    timings_ms: { model: tModel - t0, solve: performance.now() - tModel },
  });

  let r1;
  try {
    r1 = highs.solve(lp(model, phase1Terms(model), []), settings);
  } catch (e) {
    return fail('ERROR', `solver error: ${(e as Error).message}`);
  }
  const s1 = mapStatus(r1.Status);
  if (s1 !== 'OPTIMAL' && s1 !== 'TIME_LIMIT') return fail(s1 === 'INFEASIBLE' ? 'INFEASIBLE' : 'ERROR', `solver status ${r1.Status}`);
  let cols = r1.Columns;
  let status: SolverStatus = s1;
  if (s1 === 'OPTIMAL') {
    // 2단계 · 3단계: 목적값을 지킨 채 결정론 동률 가르기
    const opt1 = Math.round(r1.ObjectiveValue);
    const keep1 = `fix_obj: ${phase1Terms(model).join('\n + ')} <= ${opt1 + 0.5}`;
    const r2 = highs.solve(lp(model, phase2Terms(model), [keep1]), settings);
    if (mapStatus(r2.Status) === 'OPTIMAL') {
      const keep2 = `fix_pref: ${phase2Terms(model).join('\n + ')} <= ${Math.round(r2.ObjectiveValue) + 0.5}`;
      const r3 = highs.solve(lp(model, phase3Terms(model), [keep1, keep2]), settings);
      cols = mapStatus(r3.Status) === 'OPTIMAL' ? r3.Columns : r2.Columns;
    } else {
      status = 'FEASIBLE';
      base.warnings.push(`tie-break phase did not finish (${r2.Status}) — first optimal solution kept`);
    }
  }
  const tSolve = performance.now();
  const on = (name: string) => Math.round(cols[name]?.Primal ?? 0) === 1;

  const chosen = model.options.map((o, i) => ({ o, i })).filter(({ i }) => on(`y${i}`));
  const used = new Map<string, number>();
  for (const { o } of chosen) for (const u of o.capacity_uses) used.set(u.resource_key, (used.get(u.resource_key) ?? 0) + 1);
  const resource_usage = table.resources.map((r) => ({ resource_key: r.resource_key, used: used.get(r.resource_key) ?? 0, available: r.available }));
  const saturated = new Set(resource_usage.filter((r) => r.available !== null && r.used >= r.available).map((r) => r.resource_key));
  const zOn = model.z.filter((v) => on(v.name));
  const truckUsage = model.trucks.map((k, ki) => {
    const busy = zOn.filter((v) => v.truck === ki).flatMap((v) => Array.from({ length: v.trip }, (_, d) => v.hour + d));
    return { truck_id: k.truck_id, kind: k.kind, busy_hours: busy.sort((a, b) => a - b), from_hour: k.from_hour, to_hour: k.to_hour };
  });
  const fullTrucks = truckUsage.filter((t) => t.busy_hours.length >= t.to_hour - t.from_hour);

  const assignments: SolverAssignment[] = chosen.map(({ o, i }) => {
    const zv = zOn.find((v) => v.option === i) ?? null;
    const truck = zv ? model.trucks[zv.truck]! : null;
    let cost = o.cost;
    if (truck && truck.penalty_krw > 0) {
      const line: CostLine = { item: 'risk', code: truck.warning === 'PROVISIONAL' ? 'PROVISIONAL_RELIANCE' : 'AGING_RELIANCE', label: `${truck.warning === 'PROVISIONAL' ? '잠정' : '오래되는 중인'} 협력 차량 가용 사실 의존 (${truck.truck_id})`, qty: 1, unit_krw: truck.penalty_krw, amount_krw: truck.penalty_krw, currency: 'KRW', status: 'CALCULATED', source_type: 'POLICY', source_ref: `${table.policy_version}#provisional.penalty_krw`, assumption: '[ASSUMPTION] 정책 벌점 — 실제 비용이 아니다' };
      cost = { ...cost, risk: cost.risk + truck.penalty_krw, risk_penalty: cost.risk_penalty + truck.penalty_krw, total: cost.total + truck.penalty_krw, lines: [...cost.lines, line] };
    }
    const others = model.options.filter((x) => x.container_id === o.container_id && x.option_id !== o.option_id).sort((a, b) => a.cost.total - b.cost.total || a.option_id.localeCompare(b.option_id));
    const blockers = (x: ActionOption): string[] => {
      const caps = x.capacity_uses.map((u) => u.resource_key).filter((k) => saturated.has(k) && !o.capacity_uses.some((ou) => ou.resource_key === k));
      if (caps.length) return caps.map((k) => `CAPACITY_FULL:${k}`);
      if (x.truck_job) return ['TRUCKS_BUSY'];
      return ['TOTAL_COST_TRADEOFF'];
    };
    const cheaper = others.filter((x) => x.cost.total < o.cost.total);
    const reasons = new Set<string>();
    if (cheaper.length === 0) reasons.add('LOWEST_COST_OPTION');
    else for (const x of cheaper) for (const b of blockers(x)) reasons.add(`CHEAPER_OPTION_BLOCKED:${b}`);
    if (o.action === 'KEEP_CURRENT_PLAN') reasons.add('KEEPS_ORIGINAL_PLAN');
    reasons.add(o.cost.demurrage === 0 ? 'NO_DEMURRAGE' : 'DEMURRAGE_INCURRED');
    if (o.warning_refs.some((w) => w.reason === 'PROVISIONAL') || truck?.warning === 'PROVISIONAL') reasons.add('RELIES_ON_PROVISIONAL_FACT');
    if (o.warning_refs.some((w) => w.reason === 'AGING') || truck?.warning === 'AGING') reasons.add('RELIES_ON_AGING_FACT');
    return {
      container_id: o.container_id,
      option_id: o.option_id,
      action: o.action,
      target_id: o.target_id,
      destination_id: o.destination_id,
      delivery_day: o.delivery_day,
      scheduled_time: zv ? `${table.plan_day}T${String(zv.hour).padStart(2, '0')}:00:00+09:00` : null,
      truck_id: truck?.truck_id ?? null,
      truck_pool_id: truck?.pool_id ?? null,
      expected_cost: cost,
      reason_codes: [...reasons],
      alternatives: others.slice(0, 4).map((x) => ({ option_id: x.option_id, action: x.action, target_id: x.target_id, delivery_day: x.delivery_day, total: x.cost.total, base_cost: x.cost.base_cost, difference: x.cost.total - o.cost.total, blocked_by: x.cost.total < o.cost.total ? blockers(x) : [] })),
      warning_refs: truck?.warning && truck.fact_ref ? [...o.warning_refs, { fact_ref: truck.fact_ref, reason: truck.warning }] : o.warning_refs,
      evidence_refs: truck?.fact_ref ? [...new Set([...o.evidence_refs, truck.fact_ref])].sort() : o.evidence_refs,
      assumptions: o.assumptions,
    };
  });
  assignments.sort((a, b) => a.container_id.localeCompare(b.container_id));

  const unplanned = model.containers
    .map((c, ci) => ({ c, ci }))
    .filter(({ ci }) => on(`s${ci}`))
    .map(({ c }) => {
      const all = table.options.filter((o) => o.container_id === c);
      const reasons = new Set<string>();
      for (const o of all) {
        if (!o.feasible) for (const r of o.infeasible_reasons) reasons.add(`${o.action}${o.action === 'KEEP_CURRENT_PLAN' ? '' : `(${o.target_id},${o.delivery_day})`}: ${r.code} ${r.ref}`);
        else for (const k of o.capacity_uses.map((u) => u.resource_key).filter((k) => saturated.has(k))) reasons.add(`${o.action}(${o.target_id},${o.delivery_day}): CAPACITY_FULL ${k}`);
      }
      if (reasons.size === 0) reasons.add('TRUCKS_BUSY: 오늘 이동 선택지에 남은 트럭 · 시각이 없다');
      return { container_id: c, reasons: [...reasons] };
    });

  const binding: SolverResult['binding_constraints'] = [];
  for (const r of resource_usage) if (r.available !== null && r.available > 0 && r.used >= r.available) binding.push({ type: r.resource_key.startsWith('ODCY') ? 'ODCY_CAPACITY' : 'WAREHOUSE_CAPACITY', ref: r.resource_key, note: `${r.used}/${r.available} 사용` });
  if (fullTrucks.length) binding.push({ type: 'TRUCK', ref: fullTrucks.map((t) => t.truck_id).join(','), note: `시간창을 모두 쓴 트럭 ${fullTrucks.length}대` });

  const planned = assignments;
  const objective = planned.reduce((s, a) => s + a.expected_cost.total, 0);
  const baseCost = planned.reduce((s, a) => s + a.expected_cost.base_cost, 0);
  const infeasible = unplanned.length > 0;
  return {
    ...base,
    status: infeasible ? 'INFEASIBLE' : status,
    objective_value: infeasible ? null : objective,
    base_cost: infeasible ? null : baseCost,
    risk_penalty: infeasible ? null : objective - baseCost,
    saving: infeasible ? null : baseline.total - objective,
    base_saving: infeasible ? null : baseline.base_cost - baseCost,
    assignments,
    unplanned,
    binding_constraints: binding,
    resource_usage,
    truck_usage: truckUsage,
    warnings: infeasible ? [...base.warnings, `계획 불가 컨테이너 ${unplanned.length}대 — 아래 이유`] : base.warnings,
    timings_ms: { model: tModel - t0, solve: tSolve - tModel },
  };
}
