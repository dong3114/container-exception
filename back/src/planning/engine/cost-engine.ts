import { ValidationError } from '../../shared/errors/cera-error.js';
import { DEFAULT_COST_POLICY, factUsage, type CostPolicy, type FactUsage } from './cost-policy.js';
import {
  BASE_COST_ITEMS,
  COST_ITEM_KEYS,
  type ActionOption,
  type ActionType,
  type CapacityResource,
  type ContainerInput,
  type CostBreakdown,
  type CostLine,
  type CostTable,
  type FacilityInput,
  type InfeasibleDetail,
  type PlanningFact,
  type PlanningInput,
  type TruckResource,
  type UsedFact,
} from './types.js';

/**
 * Cost / Risk Engine (T-112) — 컨테이너 × 복구 선택지마다 비용 · 위험을 결정론으로 계산한다.
 * 순수 함수다: DB · HTTP · LLM · 현재 시각을 쓰지 않는다. 같은 입력 → 같은 출력(as_of 포함).
 * 요율이나 사실이 없으면 숫자를 지어내지 않는다: 그 항목은 NOT_AVAILABLE 이고 선택지는 실행 불가(이유 표시)다.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLOT_KEY = /^available\.slot\((\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})-(\d{2}):(\d{2})\)$/;
const ODCY_SIZE_KEY = /^capacity\.size_type\(([0-9A-Z]+)\)\.day\((\d{4}-\d{2}-\d{2})\)$/;

export function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** as_of 를 Asia/Seoul(+09:00, 일광절약 없음)의 날짜 · 시각(소수 시간)으로. */
export function seoulParts(asOf: string): { day: string; hour: number } {
  const ms = Date.parse(asOf);
  const d = new Date(ms + 9 * 3_600_000);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600 };
}

function isKrw(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}

/** 입력 검사 — 금액은 원(KRW) 정수, 날짜 · 시각 형식, 사실 좌표 중복 없음. 틀리면 계산하지 않는다. */
export function validatePlanningInput(input: PlanningInput): void {
  const bad = (field: string, msg: string): never => {
    throw new ValidationError('INVALID_PLANNING_INPUT', msg, [field]);
  };
  if (!/[+-]\d{2}:\d{2}$|Z$/.test(input.as_of) || Number.isNaN(Date.parse(input.as_of))) bad('as_of', 'as_of must be ISO 8601 with an offset');
  if (!DATE.test(input.plan_day)) bad('plan_day', 'plan_day must be YYYY-MM-DD');
  if (input.horizon_days.length === 0 || input.horizon_days[0] !== input.plan_day) bad('horizon_days', 'horizon_days must start with plan_day');
  for (const d of input.horizon_days) if (!DATE.test(d)) bad('horizon_days', `bad day ${d}`);
  const r = input.rates;
  if (r.currency !== 'KRW') bad('rates.currency', `unsupported currency ${String(r.currency)} — amounts are KRW integers`);
  const checkTable = (path: string, t: Record<string, number>) => {
    for (const [k, v] of Object.entries(t)) if (!isKrw(v)) bad(`${path}.${k}`, `${path}.${k} must be a non-negative KRW integer, got ${String(v)}`);
  };
  for (const [carrier, t] of Object.entries(r.demurrage_per_day)) checkTable(`rates.demurrage_per_day.${carrier}`, t);
  checkTable('rates.terminal_storage_per_day', r.terminal_storage_per_day);
  for (const [leg, t] of Object.entries(r.transport)) checkTable(`rates.transport.${leg}`, t);
  for (const [o, t] of Object.entries(r.odcy)) {
    checkTable(`rates.odcy.${o}.handling_in_out`, t.handling_in_out);
    checkTable(`rates.odcy.${o}.storage_per_day`, t.storage_per_day);
  }
  if (!Number.isInteger(r.detention_free_days) || r.detention_free_days < 0) bad('rates.detention_free_days', 'detention_free_days must be a non-negative integer');
  const seen = new Set<string>();
  for (const f of input.facts) {
    const k = `${f.subject_id}|${f.fact_key}`;
    if (seen.has(k)) bad('facts', `duplicate fact coordinate ${k}`);
    seen.add(k);
    if (f.value !== null && (!Number.isSafeInteger(f.value) || f.value < 0)) bad('facts', `fact ${f.fact_ref} value must be a non-negative integer`);
  }
  for (const c of input.containers) {
    if (c.lfd !== null && !DATE.test(c.lfd)) bad('containers', `bad lfd for ${c.container_id}`);
    if (!DATE.test(c.planned_day)) bad('containers', `bad planned_day for ${c.container_id}`);
  }
  for (const t of input.own_trucks) if (!(t.from_hour >= 0 && t.to_hour <= 24 && t.from_hour < t.to_hour)) bad('own_trucks', `bad window for ${t.truck_id}`);
}

interface Ctx {
  input: PlanningInput;
  policy: CostPolicy;
  facility: Map<string, FacilityInput>;
  fact: Map<string, PlanningFact>;
  resources: CapacityResource[];
  usage: Map<string, FactUsage>;
  earliestToday: number;
}

function factOf(ctx: Ctx, subjectId: string, key: string): PlanningFact | null {
  return ctx.fact.get(`${subjectId}|${key}`) ?? null;
}

function usageOf(ctx: Ctx, f: PlanningFact | null): FactUsage {
  if (!f) return { usable: false, reason: 'FACT_MISSING' };
  return ctx.usage.get(f.fact_ref) ?? factUsage(f.fact_state, f.freshness, ctx.policy);
}

/** 오늘 계획 대상(계획일에 움직이기로 한 컨테이너)과, 계획 대상이 아닌 컨테이너가 이미 약속한 창고 용량. */
function partition(input: PlanningInput) {
  const candidates = input.containers.filter((c) => c.planned_day === input.plan_day).sort((a, b) => a.container_id.localeCompare(b.container_id));
  const commitments = new Map<string, { facility_id: string; day: string; count: number; container_ids: string[] }>();
  for (const c of input.containers) {
    if (c.planned_day === input.plan_day || !input.horizon_days.includes(c.planned_day)) continue;
    const k = `${c.destination_id}|${c.planned_day}`;
    const e = commitments.get(k) ?? { facility_id: c.destination_id, day: c.planned_day, count: 0, container_ids: [] };
    e.count += 1;
    e.container_ids.push(c.container_id);
    commitments.set(k, e);
  }
  return { candidates, commitments: [...commitments.values()].sort((a, b) => a.facility_id.localeCompare(b.facility_id) || a.day.localeCompare(b.day)) };
}

function buildResources(ctx: Ctx, commitments: { facility_id: string; day: string; count: number }[]): CapacityResource[] {
  const out: CapacityResource[] = [];
  const committed = (fid: string, day: string) => commitments.find((c) => c.facility_id === fid && c.day === day)?.count ?? 0;
  for (const f of [...ctx.facility.values()].sort((a, b) => a.facility_id.localeCompare(b.facility_id))) {
    if (f.kind === 'WAREHOUSE') {
      for (const day of ctx.input.horizon_days) {
        const fact = factOf(ctx, f.facility_id, `capacity.day(${day})`);
        const u = usageOf(ctx, fact);
        const c = committed(f.facility_id, day);
        out.push({
          resource_key: `WAREHOUSE_DAY:${f.facility_id}:${day}`,
          kind: 'WAREHOUSE_DAY',
          facility_id: f.facility_id,
          day,
          available: u.usable && fact?.value !== null && fact ? Math.max(0, fact.value - c) : null,
          fact_value: fact?.value ?? null,
          committed: c,
          fact_ref: fact?.fact_ref ?? null,
          sizes: null,
        });
      }
    } else {
      // ODCY 오늘 반입 용량: 규격별 사실 `capacity.size_type(T).day(D0)` 또는 전체 `capacity.day(D0)`
      const D0 = ctx.input.plan_day;
      const facts = ctx.input.facts.filter((x) => x.subject_id === f.facility_id && (x.fact_key === `capacity.day(${D0})` || ODCY_SIZE_KEY.exec(x.fact_key)?.[2] === D0));
      for (const fact of facts.sort((a, b) => a.fact_key.localeCompare(b.fact_key))) {
        const u = usageOf(ctx, fact);
        const size = ODCY_SIZE_KEY.exec(fact.fact_key)?.[1] ?? null;
        out.push({
          resource_key: `ODCY:${f.facility_id}:${size ?? 'ALL'}`,
          kind: 'ODCY',
          facility_id: f.facility_id,
          day: D0,
          available: u.usable && fact.value !== null ? fact.value : null,
          fact_value: fact.value,
          committed: 0,
          fact_ref: fact.fact_ref,
          sizes: size ? [size] : null,
        });
      }
    }
  }
  return out;
}

/** 자사 명부 트럭 + 협력 운송사 가용 사실 `available.slot(D0THH:MM-HH:MM)` = N 대(시간창 동안 일할 수 있는 트럭 N 대 [ASSUMPTION]). */
function buildTrucks(ctx: Ctx): { trucks: TruckResource[]; warnings: string[] } {
  const trucks: TruckResource[] = ctx.input.own_trucks.map((t) => ({ ...t, kind: 'OWN', warning: null, penalty_krw: 0 }));
  const warnings: string[] = [];
  for (const pool of ctx.input.partner_pools) {
    const facts = ctx.input.facts.filter((f) => f.subject_id === pool.pool_id && f.fact_key.startsWith('available.slot(')).sort((a, b) => a.fact_key.localeCompare(b.fact_key));
    for (const f of facts) {
      const m = SLOT_KEY.exec(f.fact_key);
      if (!m || m[1] !== ctx.input.plan_day) continue;
      const u = usageOf(ctx, f);
      if (!u.usable) {
        warnings.push(`${pool.name} ${f.fact_key}: ${u.reason} — 이 트럭은 계획에 쓰지 않는다`);
        continue;
      }
      const from = Number(m[2]) + (Number(m[3]) > 0 ? 1 : 0);
      const to = Number(m[4]);
      const penalty = u.warning === 'PROVISIONAL' ? ctx.policy.provisional.penalty_krw : u.warning === 'AGING' ? ctx.policy.aging_penalty_krw : 0;
      for (let i = 1; i <= (f.value ?? 0); i++) {
        trucks.push({ truck_id: `${pool.pool_id}#${m[2]}${m[3]}-${m[4]}${m[5]}#${i}`, pool_id: pool.pool_id, from_hour: from, to_hour: to, fact_ref: f.fact_ref, kind: 'PARTNER', warning: u.warning, penalty_krw: penalty });
      }
    }
  }
  return { trucks, warnings };
}

class Lines {
  readonly lines: CostLine[] = [];
  readonly reasons: InfeasibleDetail[] = [];
  constructor(private readonly rates: PlanningInput['rates']) {}

  rate(item: CostLine['item'], code: string, label: string, qty: number, table: Record<string, number> | undefined, key: string, ref: string, assumption: string | null = null): void {
    const unit = table?.[key];
    const source_ref = `${this.rates.source_ref}#${ref}.${key}`;
    if (unit === undefined) {
      // 요율이 없다 — 0 으로 지어내지 않는다. 수량이 0 이면 금액도 0 이라 계산할 필요가 없다
      if (qty === 0) {
        this.lines.push({ item, code, label, qty, unit_krw: null, amount_krw: 0, currency: 'KRW', status: 'CALCULATED', source_type: 'RATE_TABLE', source_ref, assumption: assumption ?? this.rates.assumption });
        return;
      }
      this.lines.push({ item, code, label, qty, unit_krw: null, amount_krw: 0, currency: 'KRW', status: 'NOT_AVAILABLE', source_type: 'RATE_TABLE', source_ref, assumption: '요율 없음 — 금액을 계산하지 않았다' });
      this.reasons.push({ code: 'RATE_MISSING', ref: `${ref}.${key}`, note: `${label}: 요율 없음` });
      return;
    }
    this.lines.push({ item, code, label, qty, unit_krw: unit, amount_krw: unit * qty, currency: 'KRW', status: 'CALCULATED', source_type: 'RATE_TABLE', source_ref, assumption: assumption ?? this.rates.assumption });
  }

  policy(item: CostLine['item'], code: string, label: string, qty: number, unit: number, ref: string, assumption: string): void {
    this.lines.push({ item, code, label, qty, unit_krw: unit, amount_krw: unit * qty, currency: 'KRW', status: 'CALCULATED', source_type: 'POLICY', source_ref: ref, assumption });
  }

  breakdown(): CostBreakdown {
    const sum = (k: string) => this.lines.filter((l) => l.item === k).reduce((s, l) => s + l.amount_krw, 0);
    const b = Object.fromEntries(COST_ITEM_KEYS.map((k) => [k, sum(k)])) as Record<(typeof COST_ITEM_KEYS)[number], number>;
    const base = BASE_COST_ITEMS.reduce((s, k) => s + b[k], 0);
    const risk = b.delay + b.risk;
    return { ...b, base_cost: base, risk_penalty: risk, total: base + risk, lines: this.lines };
  }
}

interface ActionSpec {
  action: ActionType;
  target: FacilityInput | null; // null = 터미널 대기
  deliveryDay: string;
}

/**
 * 컨테이너 하나 × 선택지 하나의 비용 · 실행 가능 여부.
 * `calculateActionCost(container, action, facts, rates, asOf)` 의 구현 — 사실 · 요율 · as_of 는 ctx 에 들어 있다.
 */
function calculateOption(ctx: Ctx, c: ContainerInput, spec: ActionSpec): ActionOption {
  const { input, policy } = ctx;
  const D0 = input.plan_day;
  const rates = input.rates;
  const L = new Lines(rates);
  const assumptions: string[] = [];
  const evidence = new Set<string>(c.evidence_refs);
  const warningRefs: ActionOption['warning_refs'] = [];
  const capacityUses: { resource_key: string }[] = [];
  const dest = ctx.facility.get(c.destination_id);
  const movesToday = spec.action !== 'WAIT_AT_TERMINAL';
  const targetId = spec.target ? spec.target.facility_id : input.terminal_id;
  const optionId = `${c.container_id}|${spec.action}|${targetId}|${spec.deliveryDay}`;
  const pickupDay = movesToday ? D0 : spec.deliveryDay;

  const needFact = (resKind: 'WAREHOUSE_DAY' | 'ODCY', facility: FacilityInput, day: string) => {
    const res = ctx.resources.filter((r) => r.kind === resKind && r.facility_id === facility.facility_id && (resKind === 'ODCY' ? r.sizes === null || r.sizes.includes(c.size_type) : r.day === day));
    if (res.length === 0) {
      L.reasons.push({ code: 'FACT_MISSING', ref: `${facility.facility_id}:${resKind === 'ODCY' ? `capacity(${c.size_type}).day(${D0})` : `capacity.day(${day})`}`, note: `${facility.name} 용량 사실 없음` });
      return;
    }
    for (const r of res) {
      const f = r.fact_ref ? ctx.input.facts.find((x) => x.fact_ref === r.fact_ref) ?? null : null;
      const u = usageOf(ctx, f);
      if (f) evidence.add(f.fact_ref);
      if (!u.usable) {
        L.reasons.push({ code: u.reason, ref: r.fact_ref ?? r.resource_key, note: `${facility.name} ${f?.fact_key ?? ''}: ${u.reason}` });
        continue;
      }
      // T-136: 사용할 수 있는 사실인데 값이 없다(null) — 숫자가 필요한 용량 제약에서 null 은 "무제한"이 아니다. 이 선택지는 계산할 수 없다
      if (r.available === null) {
        L.reasons.push({ code: 'FACT_MISSING', ref: r.fact_ref ?? r.resource_key, note: `${facility.name} ${f?.fact_key ?? ''}: 용량 값 없음 — 무제한으로 보지 않는다` });
        continue;
      }
      if (r.available !== null && r.available <= 0) L.reasons.push({ code: 'CAPACITY_ZERO', ref: r.resource_key, note: `${facility.name} ${day}: 남은 용량 0 (사실 ${r.fact_value} − 약속 ${r.committed})` });
      if (u.warning && f) {
        warningRefs.push({ fact_ref: f.fact_ref, reason: u.warning });
        const p = u.warning === 'PROVISIONAL' ? policy.provisional.penalty_krw : policy.aging_penalty_krw;
        L.policy('risk', u.warning === 'PROVISIONAL' ? 'PROVISIONAL_RELIANCE' : 'AGING_RELIANCE', `${u.warning === 'PROVISIONAL' ? '잠정' : '오래되는 중인'} 사실 의존 (${facility.name} ${f.fact_key})`, 1, p, `${policy.version}#${u.warning === 'PROVISIONAL' ? 'provisional.penalty_krw' : 'aging_penalty_krw'}`, '[ASSUMPTION] 정책 벌점 — 실제 비용이 아니다');
      }
      capacityUses.push({ resource_key: r.resource_key });
    }
  };

  // ---- 실행 가능 여부
  if (!dest || dest.kind !== 'WAREHOUSE') L.reasons.push({ code: 'FACT_MISSING', ref: c.destination_id, note: '목적지 창고 정보 없음' });
  if (movesToday && !c.pickup_ready) L.reasons.push({ code: 'CONTAINER_NOT_READY', ref: c.container_id, note: '오늘 반출 가능 상태가 아니다' });
  if (spec.target && !spec.target.accepts.includes(c.size_type)) L.reasons.push({ code: 'SIZE_NOT_ACCEPTED', ref: spec.target.facility_id, note: `${spec.target.name}은(는) ${c.size_type}을(를) 받지 않는다` });
  if (dest && !dest.accepts.includes(c.size_type)) L.reasons.push({ code: 'SIZE_NOT_ACCEPTED', ref: dest.facility_id, note: `${dest.name}은(는) ${c.size_type}을(를) 받지 않는다` });
  if (spec.action === 'MOVE_TO_WAREHOUSE' && !c.alternate_destination_allowed) L.reasons.push({ code: 'ALTERNATE_DESTINATION_NOT_APPROVED', ref: c.container_id, note: '다른 창고로 바꿔 보내는 것은 화주 승인이 없다' });
  let truckJob: ActionOption['truck_job'] = null;
  if (movesToday && spec.target) {
    const earliest = Math.max(spec.target.open_from_hour, ctx.earliestToday);
    const latest = spec.target.last_departure_hour;
    if (earliest > latest) L.reasons.push({ code: 'NO_DEPARTURE_WINDOW', ref: spec.target.facility_id, note: `오늘 ${spec.target.name}(으)로 출발할 수 있는 시간이 남지 않았다 (가장 이른 ${earliest}시 > 마지막 ${latest}시)` });
    truckJob = { trip_hours: spec.target.trip_hours, earliest_hour: earliest, latest_hour: latest };
  }
  if (spec.action === 'MOVE_TO_ODCY' && spec.target) {
    needFact('ODCY', spec.target, D0);
    const maxDays = factOf(ctx, spec.target.facility_id, 'max_days');
    const u = usageOf(ctx, maxDays);
    const days = dayDiff(D0, spec.deliveryDay);
    if (maxDays && u.usable && maxDays.value !== null) {
      evidence.add(maxDays.fact_ref);
      if (days > maxDays.value) L.reasons.push({ code: 'STORAGE_LIMIT_EXCEEDED', ref: maxDays.fact_ref, note: `${spec.target.name} 보관 한도 ${maxDays.value}일 < ${days}일` });
    } else {
      assumptions.push(`${spec.target.name} 보관 기간 한도 정보 없음(${maxDays ? u.usable ? '값 없음' : u.reason : 'FACT_MISSING'}) — 계획 기간 안에서는 한도가 없다고 가정 [ASSUMPTION]`);
    }
  }
  if (dest) needFact('WAREHOUSE_DAY', spec.action === 'MOVE_TO_WAREHOUSE' && spec.target ? spec.target : dest, spec.deliveryDay);

  // ---- 비용
  const size = c.size_type;
  const finalDest = spec.action === 'MOVE_TO_WAREHOUSE' && spec.target ? spec.target : dest;
  let ddDays = 0;
  if (c.lfd === null) {
    L.lines.push({ item: 'demurrage', code: 'DEMURRAGE', label: 'Demurrage', qty: 0, unit_krw: null, amount_krw: 0, currency: 'KRW', status: 'NOT_AVAILABLE', source_type: 'FACT', source_ref: `${c.container_id}:lfd`, assumption: 'LFD 없음 — Demurrage 를 계산하지 않았다' });
    L.reasons.push({ code: 'LFD_MISSING', ref: c.container_id, note: 'LFD 없음' });
  } else {
    ddDays = Math.max(0, dayDiff(c.lfd, pickupDay));
    L.rate('demurrage', 'DEMURRAGE', `Demurrage (터미널, LFD ${c.lfd} 이후 ${ddDays}일)`, ddDays, rates.demurrage_per_day[c.carrier], size, `demurrage_per_day.${c.carrier}`);
  }
  L.rate('storage', 'TERMINAL_STORAGE', `터미널 보관료 (무료 기간 경과 ${ddDays}일)`, ddDays, rates.terminal_storage_per_day, size, 'terminal_storage_per_day', '[ASSUMPTION] 터미널 무료 장치기간이 LFD 와 같이 끝난다고 단순화');
  if (spec.action === 'MOVE_TO_ODCY' && spec.target) {
    const o = spec.target.facility_id;
    const odcy = rates.odcy[o];
    const days = dayDiff(D0, spec.deliveryDay);
    L.rate('transport', 'TRANSPORT', `운송 터미널→${spec.target.name}`, 1, rates.transport[`${input.terminal_id}__${o}`], size, `transport.${input.terminal_id}__${o}`);
    L.rate('handling', 'ODCY_HANDLING', `${spec.target.name} 반입·반출 핸들링`, 1, odcy?.handling_in_out, size, `odcy.${o}.handling_in_out`);
    L.rate('storage', 'ODCY_STORAGE', `${spec.target.name} 보관료 ${days}일`, days, odcy?.storage_per_day, size, `odcy.${o}.storage_per_day`);
    if (dest) L.rate('transport', 'TRANSPORT', `운송 ${spec.target.name}→${dest.name} (${spec.deliveryDay})`, 1, rates.transport[`${o}__${dest.facility_id}`], size, `transport.${o}__${dest.facility_id}`);
    L.policy('additional_move', 'EXTRA_MOVE', '추가 이동 1회 (ODCY 경유)', 1, 0, `${policy.version}#additional_move`, '추가 이동의 비용은 운송 · 핸들링 항목에 이미 포함 — 이중 계산하지 않는다');
  } else if (finalDest) {
    L.rate('transport', 'TRANSPORT', `운송 터미널→${finalDest.name} (${spec.deliveryDay})`, 1, rates.transport[`${input.terminal_id}__${finalDest.facility_id}`], size, `transport.${input.terminal_id}__${finalDest.facility_id}`);
  }
  // Detention: 반출일부터 빈 컨테이너 반납까지(입고일 + 반납 리드타임)가 무료 기간을 넘는 날 — 요율표에 Detention 요율이 없다
  const outDays = dayDiff(pickupDay, spec.deliveryDay) + policy.empty_return_lead_days;
  const detDays = Math.max(0, outDays - rates.detention_free_days);
  L.rate('detention', 'DETENTION', `Detention (반출 후 ${outDays}일, 무료 ${rates.detention_free_days}일)`, detDays, undefined, size, 'detention_per_day', `[ASSUMPTION] 반출 후 무료 ${rates.detention_free_days}일 · 반납 리드타임 ${policy.empty_return_lead_days}일`);
  // 입고 지연 벌점(업무 우선순위) · 터미널 대기 위험
  const delayDays = Math.max(0, dayDiff(c.planned_day, spec.deliveryDay));
  L.policy('delay', 'DELIVERY_DELAY', `입고 지연 ${delayDays}일 (${c.priority})`, delayDays, policy.delay_penalty_per_day_krw[c.priority], `${policy.version}#delay_penalty_per_day_krw.${c.priority}`, '[ASSUMPTION] 업무 우선순위별 지연 벌점 — 실제 비용이 아니다');
  if (!movesToday && ddDays > 0) L.policy('risk', 'TERMINAL_WAIT_RISK', `LFD 이후 터미널 대기 ${ddDays}일`, ddDays, policy.terminal_wait_risk_per_day_krw, `${policy.version}#terminal_wait_risk_per_day_krw`, '[ASSUMPTION] 대기 연장 위험 벌점 — 실제 비용이 아니다');

  const cost = L.breakdown();
  if (rates.assumption) assumptions.push(`요율: ${rates.assumption}`);
  return {
    option_id: optionId,
    container_id: c.container_id,
    action: spec.action,
    target_id: targetId,
    destination_id: finalDest?.facility_id ?? c.destination_id,
    delivery_day: spec.deliveryDay,
    feasible: L.reasons.length === 0,
    infeasible_reasons: L.reasons,
    cost,
    truck_job: truckJob,
    capacity_uses: capacityUses,
    assumptions,
    evidence_refs: [...evidence].sort(),
    warning_refs: warningRefs,
  };
}

function actionSpecs(ctx: Ctx, c: ContainerInput): ActionSpec[] {
  const D0 = ctx.input.plan_day;
  const later = ctx.input.horizon_days.slice(1);
  const dest = ctx.facility.get(c.destination_id) ?? null;
  const facilities = [...ctx.facility.values()].sort((a, b) => a.facility_id.localeCompare(b.facility_id));
  const specs: ActionSpec[] = [{ action: 'KEEP_CURRENT_PLAN', target: dest, deliveryDay: D0 }];
  for (const w of facilities) if (w.kind === 'WAREHOUSE' && w.facility_id !== c.destination_id) specs.push({ action: 'MOVE_TO_WAREHOUSE', target: w, deliveryDay: D0 });
  for (const o of facilities) if (o.kind === 'ODCY') for (const d of later) specs.push({ action: 'MOVE_TO_ODCY', target: o, deliveryDay: d });
  for (const d of later) specs.push({ action: 'WAIT_AT_TERMINAL', target: null, deliveryDay: d });
  return specs;
}

function makeCtx(input: PlanningInput, policy: CostPolicy): Ctx {
  const usage = new Map(input.facts.map((f) => [f.fact_ref, factUsage(f.fact_state, f.freshness, policy)] as const));
  const asOf = seoulParts(input.as_of);
  // 오늘 이미 지난 시각에는 출발하지 못한다. as_of 가 계획일보다 뒤면 오늘 출발은 없다
  const earliestToday = asOf.day < input.plan_day ? 0 : asOf.day > input.plan_day ? 25 : Math.ceil(asOf.hour);
  return {
    input,
    policy,
    facility: new Map(input.facilities.map((f) => [f.facility_id, f])),
    fact: new Map(input.facts.map((f) => [`${f.subject_id}|${f.fact_key}`, f])),
    resources: [],
    usage,
    earliestToday,
  };
}

/**
 * 공개 진입점 — 컨테이너 하나 × 선택지 하나. 입력 전체(사실 · 요율 · as_of)를 받아 같은 규칙으로 계산한다.
 */
export function calculateActionCost(input: PlanningInput, containerId: string, action: ActionType, targetId: string | null, deliveryDay: string, policy: CostPolicy = DEFAULT_COST_POLICY): ActionOption {
  validatePlanningInput(input);
  const ctx = makeCtx(input, policy);
  ctx.resources = buildResources(ctx, partition(input).commitments);
  const c = input.containers.find((x) => x.container_id === containerId);
  if (!c) throw new ValidationError('INVALID_PLANNING_INPUT', `unknown container ${containerId}`, ['container_id']);
  const target = action === 'WAIT_AT_TERMINAL' ? null : (ctx.facility.get(targetId ?? c.destination_id) ?? null);
  return calculateOption(ctx, c, { action, target, deliveryDay });
}

/** 모든 계획 대상 컨테이너 × 모든 선택지의 비용표 — Solver 와 Baseline 이 같은 표를 쓴다. */
export function buildCostTable(input: PlanningInput, policy: CostPolicy = DEFAULT_COST_POLICY): CostTable {
  validatePlanningInput(input);
  const ctx = makeCtx(input, policy);
  const { candidates, commitments } = partition(input);
  ctx.resources = buildResources(ctx, commitments);
  const { trucks, warnings } = buildTrucks(ctx);
  const options = candidates.flatMap((c) => actionSpecs(ctx, c).map((s) => calculateOption(ctx, c, s)));
  for (const r of ctx.resources) {
    if (r.fact_value !== null && r.committed > r.fact_value) warnings.push(`${r.facility_id} ${r.day}: 이미 약속된 ${r.committed}대가 용량 ${r.fact_value}을(를) 넘는다`);
  }
  const facts: UsedFact[] = input.facts
    .map((f): UsedFact => {
      const u = ctx.usage.get(f.fact_ref)!;
      return { fact_ref: f.fact_ref, subject_id: f.subject_id, fact_key: f.fact_key, value: f.value, fact_state: f.fact_state, freshness: f.freshness, source: f.source, usage: u.usable ? (u.warning ? 'USED_WITH_WARNING' : 'USED') : 'EXCLUDED', reason: u.usable ? u.warning : u.reason };
    })
    .sort((a, b) => a.subject_id.localeCompare(b.subject_id) || a.fact_key.localeCompare(b.fact_key));
  for (const f of facts) if (f.usage === 'EXCLUDED') warnings.push(`사실 제외: ${f.subject_id} ${f.fact_key} (${f.reason})`);
  return {
    policy_version: policy.version,
    rate_version: input.rates.rate_version,
    as_of: input.as_of,
    plan_day: input.plan_day,
    options,
    resources: ctx.resources,
    trucks,
    facts,
    commitments,
    candidates: candidates.map((c) => c.container_id),
    warnings,
  };
}
