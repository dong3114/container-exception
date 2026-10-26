import { ValidationError } from '../shared/errors/cera-error.js';
import type { ContainerInput, FacilityInput, FactState, FreshnessState, PlanningFact, PlanningInput, Priority, RateTable, TruckInput } from './engine/types.js';

/**
 * 시나리오 데이터 팩(`data/scenarios/<id>/`) → 계획 입력 (T-112).
 * 순수 함수다: 파일은 호출자가 읽어 넘긴다. 모든 값은 합성(SIMULATED)이며 요율은 [ASSUMPTION] 자리표시다.
 *
 * 두 방식:
 *  - 단계 재생(`step`): 팩의 `facts_timeline` 에서 그 단계까지의 사실을 쓴다(오프라인 계산 · 회귀 비교).
 *  - Truth 연동(`truthFacts`): Agent 가 묻고 Truth Layer 가 판정하는 사실 계열(오늘 창고 · ODCY 용량, 협력 차량 가용)은
 *    **Truth 에서만** 가져온다 — 팩의 같은 계열 값은 버린다(없으면 FACT_MISSING). 나머지(요율 · 다음 날 용량 · 자사 명부 · 컨테이너)는 팩 값.
 */

export interface ScenarioPack {
  scenario: { scenario_id: string; days: Record<string, string>; steps: { step_id: string; index: number; as_of: string }[] };
  containers: { containers: PackContainer[] };
  resources: PackResources;
}

interface PackTrust {
  value_status: string;
  freshness_status: string;
  event_id: string | null;
  evidence_time: string | null;
}
interface PackFact {
  from_step: string;
  key: string;
  value: unknown;
  trust: PackTrust;
}
interface PackContainer {
  id: string;
  container_no: string;
  size_type: string;
  carrier: string;
  business_priority: string;
  lfd: string | null;
  phase: string;
  original_plan: { destination_id: string; day: string; depart_at: string | null } | null;
}
interface PackFacility {
  id: string;
  name: string;
  accepts: string[];
  receiving_window?: { from: string; to: string };
  last_departure_for_same_day?: string;
  gate_close?: string;
  round_trip_slots?: number;
  facts_timeline: PackFact[];
}
interface PackResources {
  terminal: { id: string };
  warehouses: PackFacility[];
  odcys: PackFacility[];
  truck_pools: { id: string; name: string; owner: string; trucks: { id: string; window: { from: string; to: string } }[]; facts_timeline: PackFact[] }[];
  rates: Record<string, unknown>;
}

export interface ScenarioInputOptions {
  as_of: string;
  /** 단계 재생: 이 단계까지의 팩 사실을 쓴다. 없으면 as_of 이하의 마지막 단계. */
  step?: string;
  /** Truth 연동: Truth Layer 가 판정한 사실(주체 id 는 `ids` 로 바꾼 뒤의 id). 주면 Truth 관리 계열은 Truth 에서만 가져온다. */
  truthFacts?: PlanningFact[];
  /** 팩 id(WAREHOUSE_A …) → 저장소 id(UUID). 없으면 팩 id 그대로. */
  ids?: Record<string, string>;
  /** 협력 운송사 회신 "N시 M대" 를 시간창으로 볼 때의 길이(시간). [ASSUMPTION] */
  partner_slot_hours?: number;
}

/** 요율표 판(시나리오 팩 요율 — [ASSUMPTION] 자리표시). 출처는 source_ref 가 팩까지 가리킨다 */
export const SCENARIO_RATE_VERSION = 'scenario-rates/1';

const hourOf = (hhmm: string) => Number(hhmm.slice(0, 2));

const FACT_STATE: Record<string, FactState> = { CONFIRMED: 'CONFIRMED', PROVISIONAL: 'PROVISIONAL', OBSERVED: 'OBSERVED', NEEDS_REVIEW: 'NEEDS_REVIEW', STALE: 'STALE', REVOKED: 'REVOKED' };
const FRESHNESS: Record<string, FreshnessState> = { FRESH: 'FRESH', AGING: 'AGING', STALE: 'STALE', EXPIRED: 'EXPIRED', N_A: 'N_A' };

/** Truth Layer 가 맡는 사실 계열(Agent 가 묻는 것): 오늘 창고 · ODCY 용량, 협력 차량 가용 — `context.service.ts informationGaps` 와 같다. */
export function isTruthManagedKey(factKey: string, planDay: string, subjectKind: 'WAREHOUSE' | 'ODCY' | 'TRUCK_POOL'): boolean {
  if (subjectKind === 'TRUCK_POOL') return factKey.startsWith(`available.slot(${planDay}`);
  if (subjectKind === 'WAREHOUSE') return factKey === `capacity.day(${planDay})`;
  return factKey.startsWith('capacity.') && factKey.endsWith(`day(${planDay})`);
}

function stepIndex(pack: ScenarioPack, opts: ScenarioInputOptions): number {
  if (opts.step) {
    const s = pack.scenario.steps.find((x) => x.step_id === opts.step);
    if (!s) throw new ValidationError('INVALID_PLANNING_INPUT', `unknown step ${opts.step}`, ['step']);
    return s.index;
  }
  const t = Date.parse(opts.as_of);
  const passed = pack.scenario.steps.filter((s) => Date.parse(s.as_of) <= t);
  return passed.length ? Math.max(...passed.map((s) => s.index)) : -1;
}

/** 팩 사실 키 → Truth 와 같은 형식. */
function normalizeKey(key: string, kind: 'WAREHOUSE' | 'ODCY' | 'TRUCK_POOL', slotHours: number): string | null {
  if (kind === 'ODCY') {
    const sized = /^capacity\.([0-9]{2}[A-Z]+)\.day\((\d{4}-\d{2}-\d{2})\)$/.exec(key);
    if (sized) return `capacity.size_type(${sized[1]}).day(${sized[2]})`;
    const all = /^capacity\.dry\.day\((\d{4}-\d{2}-\d{2})\)$/.exec(key);
    if (all) return `capacity.day(${all[1]})`;
    return key === 'max_days' ? key : null;
  }
  if (kind === 'TRUCK_POOL') {
    const m = /^available\.slot\((\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(key);
    if (!m) return null;
    const to = String(Number(m[2]) + slotHours).padStart(2, '0');
    return `available.slot(${m[1]}T${m[2]}:${m[3]}-${to}:${m[3]})`;
  }
  return /^capacity\.day\(\d{4}-\d{2}-\d{2}\)$/.test(key) ? key : null;
}

function rateTable(pack: ScenarioPack, ids: (x: string) => string): RateTable {
  const r = pack.resources.rates as Record<string, Record<string, unknown>>;
  const strip = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'tag' && k !== 'rationale'));
  const transport: Record<string, Record<string, number>> = {};
  for (const [leg, v] of Object.entries(strip(r.transport!))) {
    const [a, b] = leg.split('__');
    transport[`${ids(a!)}__${ids(b!)}`] = v as Record<string, number>;
  }
  const odcy: RateTable['odcy'] = {};
  for (const [o, v] of Object.entries(r.odcy!)) {
    const x = v as { handling_in_out: Record<string, number>; storage_per_day: Record<string, number> };
    odcy[ids(o)] = { handling_in_out: x.handling_in_out, storage_per_day: x.storage_per_day };
  }
  return {
    rate_version: SCENARIO_RATE_VERSION,
    source_ref: `scenario:${pack.scenario.scenario_id}/resources.json#rates`,
    assumption: '[ASSUMPTION] 시나리오 자리표시 요율(합성) — 실제 요율이 아니다',
    currency: 'KRW',
    demurrage_per_day: strip(r.demurrage_per_day!) as Record<string, Record<string, number>>,
    terminal_storage_per_day: strip(r.terminal_storage_per_day!) as Record<string, number>,
    detention_free_days: Number(r.detention!.free_days_after_gate_out),
    transport,
    odcy,
  };
}

export function planningInputFromScenario(pack: ScenarioPack, opts: ScenarioInputOptions): PlanningInput {
  const idOf = (x: string) => opts.ids?.[x] ?? x;
  const slotHours = opts.partner_slot_hours ?? 2;
  const days = pack.scenario.days;
  const D0 = days.D0!;
  const horizon = Object.keys(days).sort().map((k) => days[k]!);
  const step = stepIndex(pack, opts);
  const stepIdx = new Map(pack.scenario.steps.map((s) => [s.step_id, s.index]));
  const sid = pack.scenario.scenario_id;
  const res = pack.resources;
  const truthMode = opts.truthFacts !== undefined;

  // 팩 사실: 같은 키는 그 단계까지의 마지막 값
  const facts = new Map<string, PlanningFact>();
  const addPackFacts = (subject: string, kind: 'WAREHOUSE' | 'ODCY' | 'TRUCK_POOL', timeline: PackFact[]) => {
    for (const f of timeline) {
      if ((stepIdx.get(f.from_step) ?? 99) > step) continue;
      const key = normalizeKey(f.key, kind, slotHours);
      if (!key) continue;
      if (truthMode && isTruthManagedKey(key, D0, kind)) continue;
      const value = f.value === null ? null : typeof f.value === 'number' ? f.value : null;
      facts.set(`${idOf(subject)}|${key}`, {
        fact_ref: `scenario:${sid}:${f.trust.event_id ?? 'contract'}:${subject}:${key}`,
        subject_id: idOf(subject),
        fact_key: key,
        value,
        fact_state: FACT_STATE[f.trust.value_status] ?? 'UNKNOWN',
        freshness: FRESHNESS[f.trust.freshness_status] ?? 'UNKNOWN',
        source: 'SCENARIO',
        is_simulated: true,
        evidence_time: f.trust.evidence_time,
      });
    }
  };
  for (const w of res.warehouses) addPackFacts(w.id, 'WAREHOUSE', w.facts_timeline);
  for (const o of res.odcys) addPackFacts(o.id, 'ODCY', o.facts_timeline);
  for (const p of res.truck_pools) if (p.owner === 'PARTNER') addPackFacts(p.id, 'TRUCK_POOL', p.facts_timeline);
  for (const f of opts.truthFacts ?? []) facts.set(`${f.subject_id}|${f.fact_key}`, f);

  const facilities: FacilityInput[] = [
    ...res.warehouses.map((w): FacilityInput => {
      const to = hourOf(w.receiving_window?.to ?? '24:00');
      return {
        facility_id: idOf(w.id),
        name: w.name,
        kind: 'WAREHOUSE',
        accepts: w.accepts,
        open_from_hour: hourOf(w.receiving_window?.from ?? '00:00'),
        // 같은 날 도착 마지막 출발: 팩 값, 없으면 입고 마감 1시간 전 [ASSUMPTION]
        last_departure_hour: w.last_departure_for_same_day ? hourOf(w.last_departure_for_same_day) : to - 1,
        trip_hours: 1,
      };
    }),
    ...res.odcys.map((o): FacilityInput => {
      const trip = o.round_trip_slots ?? 1;
      return { facility_id: idOf(o.id), name: o.name, kind: 'ODCY', accepts: o.accepts, open_from_hour: 0, last_departure_hour: hourOf(o.gate_close ?? '24:00') - trip, trip_hours: trip };
    }),
  ];

  const own: TruckInput[] = [];
  for (const p of res.truck_pools.filter((x) => x.owner !== 'PARTNER')) {
    const roster = p.facts_timeline.find((f) => f.key === 'roster');
    for (const t of p.trucks) own.push({ truck_id: t.id, pool_id: idOf(p.id), from_hour: hourOf(t.window.from), to_hour: hourOf(t.window.to), fact_ref: roster ? `scenario:${sid}:${roster.trust.event_id}:${p.id}:roster` : null });
  }

  const containers: ContainerInput[] = pack.containers.containers
    .filter((c) => c.original_plan)
    .map((c) => ({
      container_id: c.id,
      container_no: c.container_no,
      size_type: c.size_type,
      carrier: c.carrier,
      priority: (['CRITICAL', 'HIGH', 'NORMAL'].includes(c.business_priority) ? c.business_priority : 'NORMAL') as Priority,
      lfd: c.lfd,
      pickup_ready: c.phase === 'PICKUP_READY',
      current_location_id: res.terminal.id,
      destination_id: idOf(c.original_plan!.destination_id),
      planned_day: c.original_plan!.day,
      planned_depart_hour: c.original_plan!.depart_at ? Number(c.original_plan!.depart_at.slice(11, 13)) : null,
      alternate_destination_allowed: false,
      evidence_refs: [`scenario:${sid}/containers.json#${c.id}`],
      is_simulated: true,
    }));

  return {
    scenario_id: sid,
    contains_simulated: true,
    as_of: opts.as_of,
    plan_day: D0,
    horizon_days: horizon,
    terminal_id: res.terminal.id,
    containers,
    facilities,
    own_trucks: own,
    partner_pools: res.truck_pools.filter((p) => p.owner === 'PARTNER').map((p) => ({ pool_id: idOf(p.id), name: p.name })),
    rates: rateTable(pack, idOf),
    facts: [...facts.values()].sort((a, b) => a.subject_id.localeCompare(b.subject_id) || a.fact_key.localeCompare(b.fact_key)),
  };
}
