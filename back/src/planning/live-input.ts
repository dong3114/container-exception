import { canonicalHash } from '../shared/hash/hash.js';
import { buildCostTable } from './engine/cost-engine.js';
import { DEFAULT_COST_POLICY, factUsage } from './engine/cost-policy.js';
import type { ContainerInput, FacilityInput, PlanningFact, PlanningInput, RateTable, TruckInput } from './engine/types.js';

/**
 * 실제(LIVE) 계획 입력(T-123) — 순수 함수. 시나리오 팩을 **읽지 않는다**(합성 값이 실제 결과에 섞이지 않는다, 규칙 9).
 *
 *   운영 기록(사람이 넣은 컨테이너 계획 정보 · 계약 요율 · 시설 계획 정보 — M30)
 *   + Truth 사실(그날 수용량 · 협력/자사 차량 가용 — 사람 직접 입력 · 회신)
 *   + as_of
 *   → PlanningInput(시나리오와 같은 계약) → 같은 Cost Engine · Solver
 *
 * 없는 값은 만들지 않는다: 빠진 것은 `missing_inputs`(필드 단위 · 묶음)로 돌려주고 계산하지 않는다(NOT_READY).
 * 요율이 없으면 0 원이 아니라 엔진의 RATE_MISSING 이다 — 준비도는 그 엔진 결과로 어떤 요율이 빠졌는지 정확히 찾는다.
 */
export const LIVE_INPUT_VERSION = 'live-input/1';
/** 계획 기간: 계획일 + 다음 2일 — 시나리오와 같은 길이 [ASSUMPTION] */
export const LIVE_HORIZON_DAYS = 3;
export const LIVE_RATE_SOURCE = 'tariff_rate';

export interface ContainerRecordIn {
  record_id: string;
  container_no: string;
  container_id: string | null;
  size_type: string;
  carrier_code: string;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL';
  lfd: string | null;
  pickup_ready: boolean;
  current_terminal: string;
  destination_facility_id: string;
  planned_day: string;
  planned_depart_hour: number | null;
  alternate_destination_allowed: boolean;
  content_hash: string;
}
export interface ProfileIn {
  profile_id: string;
  facility_id: string;
  accepts: string[];
  open_from_hour: number;
  last_departure_hour: number;
  trip_hours: number;
  max_storage_days: number | null;
  content_hash: string;
}
export interface RateIn {
  rate_id: string;
  rate_type: string;
  carrier_code: string | null;
  from_ref: string | null;
  to_ref: string | null;
  size_type: string | null;
  amount: number;
  effective_from: string;
  content_hash: string;
}
export interface LiveSources {
  planDay: string;
  asOf: string;
  /** 지금 판(ACTIVE · 밀리지 않은 것)만 */
  containers: ContainerRecordIn[];
  /** 범위 안 공공데이터 컨테이너 중 운영 기록이 없는 것(번호) */
  unrecordedPublicContainers: string[];
  facilities: { id: string; type: string; name: string }[];
  profiles: ProfileIn[];
  /** 계획일에 유효한 지금 판 요율 */
  rates: RateIn[];
  pools: { id: string; name: string; ownership: string }[];
  truthFacts: PlanningFact[];
}

export type MissingGroup = 'CONTAINER_DATA' | 'LFD' | 'RATE' | 'WAREHOUSE_CAPACITY' | 'ODCY_CAPACITY' | 'TRUCK_AVAILABILITY' | 'FACILITY_PROFILE' | 'TERMINAL';
export interface MissingInput {
  code: string;
  group: MissingGroup;
  /** BLOCKING = 없으면 계산하지 않는다 · OPTIONAL = 계산은 되지만 그 선택지 · 자원은 쓰지 않는다 */
  severity: 'BLOCKING' | 'OPTIONAL';
  scope: 'RUN' | 'CONTAINER' | 'FACILITY' | 'TRUCK_POOL' | 'RATE';
  count: number;
  /** 빠진 값의 자리(최대 50) — 예: `container.TSTU1234565.lfd` · `rate.TRANSPORT.PNIT→창고 A.40DRY` */
  fields: string[];
  examples: string[];
  source_expected: ('OPERATIONAL_RECORD' | 'HUMAN_INPUT' | 'TRUTH_FACT' | 'PARTNER_REPLY')[];
  provide_via: string;
}
export type ReadinessStatus = 'READY' | 'READY_WITH_PROVISIONAL' | 'NOT_READY';

export interface LiveProvenance {
  input_version: string;
  container_records: { record_id: string; container_no: string; content_hash: string }[];
  rate_records: { rate_id: string; key: string; amount: number; content_hash: string }[];
  facility_profiles: { profile_id: string; facility_id: string; content_hash: string }[];
  /** 운영 기록 지문 — 판이 기댄 기록이 바뀌었는지 비교한다(OUTDATED) */
  operational_fingerprint: string;
}

export interface LiveAssessment {
  status: ReadinessStatus;
  ready: boolean;
  input: PlanningInput | null;
  provenance: LiveProvenance;
  missing_inputs: MissingInput[];
  provisional_facts: { fact_ref: string; subject_id: string; fact_key: string }[];
  available: Record<string, number>;
}

const SLOT = /^available\.slot\((\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})-(\d{2}):(\d{2})\)$/;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const rateKey = (r: RateIn) => {
  switch (r.rate_type) {
    case 'DEMURRAGE_PER_DAY':
      return `demurrage_per_day.${r.carrier_code}.${r.size_type}`;
    case 'TERMINAL_STORAGE_PER_DAY':
      return `terminal_storage_per_day.${r.size_type}`;
    case 'DETENTION_FREE_DAYS':
      return 'detention_free_days';
    case 'TRANSPORT':
      return `transport.${r.from_ref}__${r.to_ref}.${r.size_type}`;
    case 'ODCY_HANDLING_IN_OUT':
      return `odcy.${r.to_ref}.handling_in_out.${r.size_type}`;
    default:
      return `odcy.${r.to_ref}.storage_per_day.${r.size_type}`;
  }
};

/** 같은 요율 자리에 판이 여럿이면 효력 시작이 가장 늦은 것(계획일에 유효한 것 중). 호출자가 이미 계획일 유효분만 넘긴다. */
function pickRates(rates: RateIn[]): Map<string, RateIn> {
  const by = new Map<string, RateIn>();
  for (const r of [...rates].sort((a, b) => a.effective_from.localeCompare(b.effective_from) || a.rate_id.localeCompare(b.rate_id))) by.set(rateKey(r), r);
  return by;
}

function rateTable(picked: Map<string, RateIn>): RateTable | null {
  const detention = picked.get('detention_free_days');
  if (!detention) return null;
  const t: RateTable = {
    rate_version: `live:${canonicalHash({ k: 'live-rates', v: 1, ids: [...picked.values()].map((r) => r.rate_id).sort() }).slice(7, 19)}`, // planning_snapshot.tariff_version = varchar(20)
    source_ref: LIVE_RATE_SOURCE,
    assumption: null,
    currency: 'KRW',
    demurrage_per_day: {},
    terminal_storage_per_day: {},
    detention_free_days: detention.amount,
    transport: {},
    odcy: {},
  };
  for (const r of picked.values()) {
    const size = r.size_type!;
    if (r.rate_type === 'DEMURRAGE_PER_DAY') (t.demurrage_per_day[r.carrier_code!] ??= {})[size] = r.amount;
    else if (r.rate_type === 'TERMINAL_STORAGE_PER_DAY') t.terminal_storage_per_day[size] = r.amount;
    else if (r.rate_type === 'TRANSPORT') (t.transport[`${r.from_ref}__${r.to_ref}`] ??= {})[size] = r.amount;
    else if (r.rate_type === 'ODCY_HANDLING_IN_OUT') (t.odcy[r.to_ref!] ??= { handling_in_out: {}, storage_per_day: {} }).handling_in_out[size] = r.amount;
    else if (r.rate_type === 'ODCY_STORAGE_PER_DAY') (t.odcy[r.to_ref!] ??= { handling_in_out: {}, storage_per_day: {} }).storage_per_day[size] = r.amount;
  }
  return t;
}

export function assessLiveInput(s: LiveSources): LiveAssessment {
  const missing: MissingInput[] = [];
  const add = (m: Omit<MissingInput, 'count' | 'fields' | 'examples'> & { items: { field: string; example: string }[] }) => {
    if (m.items.length === 0) return;
    const { items, ...rest } = m;
    missing.push({ ...rest, count: items.length, fields: items.map((i) => i.field).slice(0, 50), examples: [...new Set(items.map((i) => i.example))].slice(0, 5) });
  };
  const name = new Map(s.facilities.map((f) => [f.id, f.name]));
  const label = (id: string) => name.get(id) ?? id;
  const D0 = s.planDay;
  const horizon = Array.from({ length: LIVE_HORIZON_DAYS }, (_, k) => addDays(D0, k));

  // ---- 컨테이너
  const recs = s.containers;
  if (recs.length === 0 && s.unrecordedPublicContainers.length === 0) {
    add({ code: 'CONTAINER_SCOPE_EMPTY', group: 'CONTAINER_DATA', severity: 'BLOCKING', scope: 'RUN', items: [{ field: 'containers', example: '컨테이너 없음' }], source_expected: ['OPERATIONAL_RECORD'], provide_via: 'POST /planning/runs/:runId/inputs/containers (CSV · 행) — 이 실행의 컨테이너 계획 정보' });
  }
  add({ code: 'CONTAINER_RECORD', group: 'CONTAINER_DATA', severity: 'BLOCKING', scope: 'CONTAINER', items: s.unrecordedPublicContainers.map((no) => ({ field: `container.${no}`, example: no })), source_expected: ['OPERATIONAL_RECORD'], provide_via: '범위 안 공공데이터 컨테이너의 목적지 · 원래 배차 · LFD — 컨테이너 입력(CSV · 행)' });
  add({ code: 'CONTAINER_LFD', group: 'LFD', severity: 'BLOCKING', scope: 'CONTAINER', items: recs.filter((c) => c.lfd === null).map((c) => ({ field: `container.${c.container_no}.lfd`, example: c.container_no })), source_expected: ['OPERATIONAL_RECORD', 'HUMAN_INPUT'], provide_via: '선사 D&D 무료기간 끝(LFD) — 컨테이너 입력의 lfd 칸. 추정하지 않는다' });
  const whIds = new Set(s.facilities.filter((f) => f.type === 'WAREHOUSE').map((f) => f.id));
  add({ code: 'CONTAINER_DESTINATION', group: 'CONTAINER_DATA', severity: 'BLOCKING', scope: 'CONTAINER', items: recs.filter((c) => !whIds.has(c.destination_facility_id)).map((c) => ({ field: `container.${c.container_no}.destination`, example: c.container_no })), source_expected: ['OPERATIONAL_RECORD'], provide_via: '목적지가 활성 창고가 아니다 — 컨테이너 입력을 고친다' });
  const terminals = [...new Set(recs.map((c) => c.current_terminal))].sort();
  if (terminals.length > 1) add({ code: 'TERMINAL_AMBIGUOUS', group: 'TERMINAL', severity: 'BLOCKING', scope: 'RUN', items: terminals.map((t) => ({ field: `terminal.${t}`, example: t })), source_expected: ['OPERATIONAL_RECORD'], provide_via: '한 계획 실행은 한 터미널에서 출발하는 컨테이너만 — 실행을 나눈다' });

  // ---- 시설 계획 정보 · 그날 수용량
  const prof = new Map(s.profiles.map((p) => [p.facility_id, p]));
  const destIds = [...new Set(recs.map((c) => c.destination_facility_id))].filter((id) => whIds.has(id));
  const planFacilities = s.facilities.filter((f) => f.type === 'WAREHOUSE' || f.type === 'ODCY');
  add({ code: 'FACILITY_PROFILE', group: 'FACILITY_PROFILE', severity: 'BLOCKING', scope: 'FACILITY', items: destIds.filter((id) => !prof.has(id)).map((id) => ({ field: `facility.${label(id)}.profile`, example: label(id) })), source_expected: ['OPERATIONAL_RECORD'], provide_via: 'POST /planning/inputs/facility-profiles — 받는 규격 · 출발 가능 시각 · 마지막 출발 · 왕복 시간' });
  add({ code: 'FACILITY_PROFILE', group: 'FACILITY_PROFILE', severity: 'OPTIONAL', scope: 'FACILITY', items: planFacilities.filter((f) => !destIds.includes(f.id) && !prof.has(f.id)).map((f) => ({ field: `facility.${f.name}.profile`, example: f.name })), source_expected: ['OPERATIONAL_RECORD'], provide_via: '계획 정보가 없는 시설은 대안(다른 창고 · ODCY)으로 쓰지 않는다' });
  const usableFact = (subject: string, pred: (k: string) => boolean) =>
    s.truthFacts.some((f) => f.subject_id === subject && pred(f.fact_key) && f.value !== null && factUsage(f.fact_state, f.freshness, DEFAULT_COST_POLICY).usable);
  add({ code: 'FACILITY_CAPACITY', group: 'WAREHOUSE_CAPACITY', severity: 'BLOCKING', scope: 'FACILITY', items: destIds.filter((id) => !usableFact(id, (k) => k === `capacity.day(${D0})`)).map((id) => ({ field: `facility.${label(id)}.capacity.day(${D0})`, example: label(id) })), source_expected: ['TRUTH_FACT', 'HUMAN_INPUT', 'PARTNER_REPLY'], provide_via: `그날(${D0}) 수용량 — POST /truth/facts/manual(FACILITY_CAPACITY) 또는 Agent 문의 회신` });
  const odcys = planFacilities.filter((f) => f.type === 'ODCY' && prof.has(f.id));
  add({ code: 'FACILITY_CAPACITY', group: 'ODCY_CAPACITY', severity: 'OPTIONAL', scope: 'FACILITY', items: odcys.filter((f) => !usableFact(f.id, (k) => k.startsWith('capacity.') && k.endsWith(`day(${D0})`))).map((f) => ({ field: `facility.${f.name}.capacity.day(${D0})`, example: f.name })), source_expected: ['TRUTH_FACT', 'HUMAN_INPUT', 'PARTNER_REPLY'], provide_via: '없으면 그 ODCY 경유는 계산하지 않는다' });

  // ---- 트럭: 자사 = 확인된 가용 사실만 명부로 · 협력 = 엔진이 사실 상태로 판단
  const own: TruckInput[] = [];
  const ownPools = s.pools.filter((p) => p.ownership === 'OWN');
  const partnerPools = s.pools.filter((p) => p.ownership === 'PARTNER');
  const unusableOwn: { field: string; example: string }[] = [];
  for (const p of ownPools) {
    const slots = s.truthFacts.filter((f) => f.subject_id === p.id && SLOT.exec(f.fact_key)?.[1] === D0);
    for (const f of slots) {
      const m = SLOT.exec(f.fact_key)!;
      const u = factUsage(f.fact_state, f.freshness, DEFAULT_COST_POLICY);
      // 자사 명부는 벌점 없이 확실한 자원으로 쓰인다 — 확인(사람) · 공식 기록이고 신선할 때만. 잠정 · 오래됨은 쓰지 않는다
      if (!u.usable || u.warning !== null || f.value === null) {
        unusableOwn.push({ field: `truck_pool.${p.name}.${f.fact_key}`, example: `${p.name} (${f.fact_state})` });
        continue;
      }
      const from = Number(m[2]) + (Number(m[3]) > 0 ? 1 : 0);
      // `own:` 접두어 — 협력 트럭 id(`풀#시간창#번호`)와 구분한다: 자사 트럭에는 외부 배차 요청(T-116 후속 초안)이 없다
      for (let i = 1; i <= f.value; i++) own.push({ truck_id: `own:${p.id}#${m[2]}${m[3]}-${m[4]}${m[5]}#${i}`, pool_id: p.id, from_hour: from, to_hour: Number(m[4]), fact_ref: f.fact_ref });
    }
  }
  const partnerSlots = partnerPools.filter((p) => usableFact(p.id, (k) => SLOT.exec(k)?.[1] === D0));
  if (own.length === 0 && partnerSlots.length === 0) {
    add({ code: 'TRUCK_AVAILABILITY', group: 'TRUCK_AVAILABILITY', severity: 'BLOCKING', scope: 'RUN', items: [{ field: `truck.available.slot(${D0})`, example: '쓸 수 있는 트럭 없음' }], source_expected: ['TRUTH_FACT', 'HUMAN_INPUT', 'PARTNER_REPLY'], provide_via: `그날 가용 시간창 — POST /truth/facts/manual(TRUCK_SLOT, ${D0}) 자사 · 협력 트럭 풀` });
  }
  add({ code: 'OWN_TRUCK_NOT_CONFIRMED', group: 'TRUCK_AVAILABILITY', severity: 'OPTIONAL', scope: 'TRUCK_POOL', items: unusableOwn, source_expected: ['HUMAN_INPUT'], provide_via: '자사 트럭은 사람이 확인한 신선한 가용만 쓴다 — 확인하거나 다시 입력' });
  add({ code: 'PARTNER_TRUCK_SLOTS', group: 'TRUCK_AVAILABILITY', severity: 'OPTIONAL', scope: 'TRUCK_POOL', items: partnerPools.filter((p) => !partnerSlots.includes(p)).map((p) => ({ field: `truck_pool.${p.name}.available.slot(${D0})`, example: p.name })), source_expected: ['PARTNER_REPLY', 'HUMAN_INPUT'], provide_via: '협력 운송사 가용 — Agent 문의 회신 또는 직접 입력(없으면 그 풀은 쓰지 않는다)' });

  // ---- 요율
  const picked = pickRates(s.rates);
  const rates = rateTable(picked);
  if (!rates) add({ code: 'RATE_MISSING', group: 'RATE', severity: 'BLOCKING', scope: 'RATE', items: [{ field: 'rate.DETENTION_FREE_DAYS', example: 'Detention 무료일' }], source_expected: ['OPERATIONAL_RECORD', 'HUMAN_INPUT'], provide_via: 'POST /planning/inputs/rates — DETENTION_FREE_DAYS(일)' });

  const provenance: LiveProvenance = {
    input_version: LIVE_INPUT_VERSION,
    container_records: recs.map((c) => ({ record_id: c.record_id, container_no: c.container_no, content_hash: c.content_hash })).sort((a, b) => a.container_no.localeCompare(b.container_no)),
    rate_records: [...picked.entries()].map(([key, r]) => ({ rate_id: r.rate_id, key, amount: r.amount, content_hash: r.content_hash })).sort((a, b) => a.key.localeCompare(b.key)),
    facility_profiles: s.profiles.map((p) => ({ profile_id: p.profile_id, facility_id: p.facility_id, content_hash: p.content_hash })).sort((a, b) => a.facility_id.localeCompare(b.facility_id)),
    operational_fingerprint: '',
  };
  provenance.operational_fingerprint = canonicalHash({ k: 'live-operational', v: 1, c: provenance.container_records.map((x) => x.content_hash), r: provenance.rate_records.map((x) => `${x.key}=${x.content_hash}`), p: provenance.facility_profiles.map((x) => x.content_hash) });

  const structuralBlock = missing.some((m) => m.severity === 'BLOCKING');
  let input: PlanningInput | null = null;
  const provisional: LiveAssessment['provisional_facts'] = [];
  if (!structuralBlock && rates) {
    const facilities: FacilityInput[] = planFacilities
      .filter((f) => prof.has(f.id))
      .map((f) => {
        const p = prof.get(f.id)!;
        return { facility_id: f.id, name: f.name, kind: f.type as 'WAREHOUSE' | 'ODCY', accepts: p.accepts, open_from_hour: p.open_from_hour, last_departure_hour: p.last_departure_hour, trip_hours: p.trip_hours };
      });
    const containers: ContainerInput[] = recs.map((c) => ({
      container_id: c.container_no,
      container_no: c.container_no,
      size_type: c.size_type,
      carrier: c.carrier_code,
      priority: c.priority,
      lfd: c.lfd,
      pickup_ready: c.pickup_ready,
      current_location_id: c.current_terminal,
      destination_id: c.destination_facility_id,
      planned_day: c.planned_day,
      planned_depart_hour: c.planned_depart_hour,
      alternate_destination_allowed: c.alternate_destination_allowed,
      evidence_refs: [`planning_container_record:${c.record_id}`, ...(c.container_id ? [`container:${c.container_id}`] : [])],
      is_simulated: false,
    }));
    // 시설 보관 한도는 운영 기록(사람이 넣은 시설 정보) — 출처를 OPERATIONAL_RECORD 로 남긴다
    const profileFacts: PlanningFact[] = facilities
      .filter((f) => f.kind === 'ODCY' && prof.get(f.facility_id)!.max_storage_days !== null)
      .map((f) => ({ fact_ref: `facility_planning_profile:${prof.get(f.facility_id)!.profile_id}`, subject_id: f.facility_id, fact_key: 'max_days', value: prof.get(f.facility_id)!.max_storage_days, fact_state: 'CONFIRMED', freshness: 'N_A', source: 'OPERATIONAL_RECORD', is_simulated: false, evidence_time: null }));
    input = {
      scenario_id: null,
      contains_simulated: false,
      as_of: s.asOf,
      plan_day: D0,
      horizon_days: horizon,
      terminal_id: terminals[0]!,
      containers: containers.sort((a, b) => a.container_id.localeCompare(b.container_id)),
      facilities: facilities.sort((a, b) => a.facility_id.localeCompare(b.facility_id)),
      own_trucks: own.sort((a, b) => a.truck_id.localeCompare(b.truck_id)),
      partner_pools: partnerPools.map((p) => ({ pool_id: p.id, name: p.name })).sort((a, b) => a.pool_id.localeCompare(b.pool_id)),
      rates,
      facts: [...s.truthFacts, ...profileFacts].sort((a, b) => a.subject_id.localeCompare(b.subject_id) || a.fact_key.localeCompare(b.fact_key)),
    };
    // 요율 누락은 엔진이 정확히 안다: 원래 계획(KEEP)에 필요한 요율이 없으면 BLOCKING, 대안에만 필요하면 OPTIONAL
    const table = buildCostTable(input);
    const pretty = (ref: string) => ref.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (id) => label(id));
    const keepMissing = new Map<string, string>();
    const otherMissing = new Map<string, string>();
    for (const o of table.options) {
      for (const r of o.infeasible_reasons.filter((x) => x.code === 'RATE_MISSING')) (o.action === 'KEEP_CURRENT_PLAN' ? keepMissing : otherMissing).set(`rate.${pretty(r.ref)}`, o.container_id);
    }
    for (const k of keepMissing.keys()) otherMissing.delete(k);
    add({ code: 'RATE_MISSING', group: 'RATE', severity: 'BLOCKING', scope: 'RATE', items: [...keepMissing].sort().map(([field, c]) => ({ field, example: c })), source_expected: ['OPERATIONAL_RECORD', 'HUMAN_INPUT'], provide_via: 'POST /planning/inputs/rates — 원래 계획(KEEP) 비용에 필요한 계약 요율. 0 원으로 계산하지 않는다' });
    add({ code: 'RATE_MISSING', group: 'RATE', severity: 'OPTIONAL', scope: 'RATE', items: [...otherMissing].sort().map(([field, c]) => ({ field, example: c })), source_expected: ['OPERATIONAL_RECORD', 'HUMAN_INPUT'], provide_via: '없으면 그 대안(다른 창고 · ODCY · 대기)은 계산하지 않는다' });
    // 빠진 사실(다음 날 창고 수용량 등)도 엔진이 정확히 안다: 선택지가 하나도 남지 않은 컨테이너가 기대는 빠진 사실은 BLOCKING
    // (그대로 풀면 Solver 가 INFEASIBLE 을 낸다 — 계획이 불가능한 게 아니라 입력이 빠진 것), 대안 하나만 막는 것은 OPTIONAL
    const stuck = new Set(table.candidates.filter((c) => !table.options.some((o) => o.container_id === c && o.feasible)));
    const blockingFacts = new Map<string, string>();
    const optionalFacts = new Map<string, string>();
    for (const o of table.options) {
      for (const r of o.infeasible_reasons.filter((x) => x.code === 'FACT_MISSING')) (stuck.has(o.container_id) ? blockingFacts : optionalFacts).set(capacityField(r.ref, label, D0), o.container_id);
    }
    for (const k of blockingFacts.keys()) optionalFacts.delete(k);
    const factGroup = (field: string): MissingGroup => (field.includes('.odcy_capacity') || field.includes('capacity(') ? 'ODCY_CAPACITY' : 'WAREHOUSE_CAPACITY');
    for (const [severity, m] of [['BLOCKING', blockingFacts], ['OPTIONAL', optionalFacts]] as const) {
      for (const group of ['WAREHOUSE_CAPACITY', 'ODCY_CAPACITY'] as const) {
        const items = [...m].filter(([f]) => factGroup(f) === group).sort().map(([field, c]) => ({ field, example: c }));
        add({ code: 'FACILITY_CAPACITY', group, severity, scope: 'FACILITY', items, source_expected: ['TRUTH_FACT', 'HUMAN_INPUT', 'PARTNER_REPLY'], provide_via: severity === 'BLOCKING' ? '이 컨테이너들은 이 수용량 없이는 어떤 선택지도 계산되지 않는다 — 그날 수용량을 직접 입력하거나 문의' : '없으면 그 날 · 그 시설로 가는 선택지는 계산하지 않는다' });
      }
    }
    for (const f of table.facts) if (f.usage === 'USED_WITH_WARNING' && f.reason === 'PROVISIONAL') provisional.push({ fact_ref: f.fact_ref, subject_id: f.subject_id, fact_key: f.fact_key });
  }
  const blocking = missing.some((m) => m.severity === 'BLOCKING');
  return {
    status: blocking ? 'NOT_READY' : provisional.length ? 'READY_WITH_PROVISIONAL' : 'READY',
    ready: !blocking,
    input: blocking ? null : input,
    provenance,
    missing_inputs: missing,
    provisional_facts: provisional,
    available: {
      container_records: recs.length,
      facility_profiles: s.profiles.length,
      rate_records: picked.size,
      own_trucks: own.length,
      partner_pools_with_slots: partnerSlots.length,
      truth_facts: s.truthFacts.length,
    },
  };
}

/** 엔진의 빠진 용량 참조(`WAREHOUSE_DAY:<id>:<날짜>` · `ODCY:<id>:<규격>` · `<id>:capacity…`) → 사람이 읽는 필드 이름. */
function capacityField(ref: string, label: (id: string) => string, D0: string): string {
  const wh = /^WAREHOUSE_DAY:([^:]+):(\d{4}-\d{2}-\d{2})$/.exec(ref);
  if (wh) return `facility.${label(wh[1]!)}.capacity.day(${wh[2]})`;
  const od = /^ODCY:([^:]+):(.+)$/.exec(ref);
  if (od) return `facility.${label(od[1]!)}.capacity${od[2] === 'ALL' ? '' : `(${od[2]})`}.day(${D0})`;
  const raw = /^([^:]+):(.+)$/.exec(ref);
  return raw ? `facility.${label(raw[1]!)}.${raw[2]}` : `facility.${ref}`;
}

export const groupSummary = (missing: MissingInput[]) => {
  const out: Record<string, { blocking: number; optional: number }> = {};
  for (const m of missing) {
    const g = (out[m.group] ??= { blocking: 0, optional: 0 });
    if (m.severity === 'BLOCKING') g.blocking += m.count;
    else g.optional += m.count;
  }
  return out;
};
