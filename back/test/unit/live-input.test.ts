import { describe, expect, it } from 'vitest';
import { computeBaseline } from '../../src/planning/engine/baseline.js';
import { buildCostTable } from '../../src/planning/engine/cost-engine.js';
import { solveRecovery } from '../../src/planning/engine/solver.js';
import type { PlanningFact } from '../../src/planning/engine/types.js';
import { type LiveSources, assessLiveInput } from '../../src/planning/live-input.js';
import { parseCsv, readTable, validContainerNo, validateContainers, validateRates } from '../../src/planning/operational-import.js';

/** 합성 값(T-123 시험용) — 실제 회사 · 실제 컨테이너가 아니다. 길(운영 기록 → LIVE 입력 생성기 → 엔진)은 제품 그대로. */
const D0 = '2026-11-02';
const WH = '0000000a-0000-7000-8000-000000000001';
const OD = '0000000a-0000-7000-8000-000000000002';
const OWN = '0000000a-0000-7000-8000-000000000003';
const PARTNER = '0000000a-0000-7000-8000-000000000004';

/** ISO 6346 검사 숫자를 붙인 합성 번호 */
function cno(prefix10: string): string {
  for (let d = 0; d <= 9; d++) if (validContainerNo(`${prefix10}${d}`)) return `${prefix10}${d}`;
  throw new Error('no check digit');
}
const fact = (subject: string, key: string, value: number, over: Partial<PlanningFact> = {}): PlanningFact => ({ fact_ref: `event:${subject.slice(-4)}-${key}`, subject_id: subject, fact_key: key, value, fact_state: 'CONFIRMED', freshness: 'FRESH', source: 'TRUTH', is_simulated: false, evidence_time: `${D0}T08:00:00.000+09:00`, ...over });
const rec = (no: string, over: Partial<LiveSources['containers'][number]> = {}): LiveSources['containers'][number] => ({
  record_id: `rec-${no}`,
  container_no: no,
  container_id: null,
  size_type: '40DRY',
  carrier_code: 'CARRIER_X',
  priority: 'NORMAL',
  lfd: '2026-11-03',
  pickup_ready: true,
  current_terminal: 'PNIT',
  destination_facility_id: WH,
  planned_day: D0,
  planned_depart_hour: 9,
  alternate_destination_allowed: false,
  content_hash: `h-${no}`,
  ...over,
});
const rate = (rate_type: string, amount: number, over: Partial<LiveSources['rates'][number]> = {}): LiveSources['rates'][number] => ({ rate_id: `r-${rate_type}-${over.to_ref ?? ''}-${over.from_ref ?? ''}`, rate_type, carrier_code: null, from_ref: null, to_ref: null, size_type: '40DRY', amount, effective_from: '2026-11-01', content_hash: `rh-${rate_type}-${amount}`, ...over });

function sources(over: Partial<LiveSources> = {}): LiveSources {
  return {
    planDay: D0,
    asOf: `${D0}T08:30:00.000+09:00`,
    containers: [rec(cno('TSTU000001')), rec(cno('TSTU000002')), rec(cno('TSTU000003'), { priority: 'HIGH' })],
    unrecordedPublicContainers: [],
    facilities: [
      { id: WH, type: 'WAREHOUSE', name: '합성 창고' },
      { id: OD, type: 'ODCY', name: '합성 ODCY' },
    ],
    profiles: [
      { profile_id: 'p-wh', facility_id: WH, accepts: ['40DRY'], open_from_hour: 8, last_departure_hour: 16, trip_hours: 2, max_storage_days: null, content_hash: 'ph-wh' },
      { profile_id: 'p-od', facility_id: OD, accepts: ['40DRY'], open_from_hour: 0, last_departure_hour: 20, trip_hours: 1, max_storage_days: 3, content_hash: 'ph-od' },
    ],
    rates: [
      rate('DEMURRAGE_PER_DAY', 150000, { carrier_code: 'CARRIER_X' }),
      rate('TERMINAL_STORAGE_PER_DAY', 40000),
      rate('DETENTION_FREE_DAYS', 7, { size_type: null }),
      rate('TRANSPORT', 200000, { from_ref: 'PNIT', to_ref: WH }),
      rate('TRANSPORT', 90000, { from_ref: 'PNIT', to_ref: OD }),
      rate('TRANSPORT', 140000, { from_ref: OD, to_ref: WH }),
      rate('ODCY_HANDLING_IN_OUT', 50000, { to_ref: OD }),
      rate('ODCY_STORAGE_PER_DAY', 30000, { to_ref: OD }),
    ],
    pools: [
      { id: OWN, name: '자사 트럭', ownership: 'OWN' },
      { id: PARTNER, name: '협력 운송', ownership: 'PARTNER' },
    ],
    truthFacts: [fact(WH, `capacity.day(${D0})`, 1), fact(WH, 'capacity.day(2026-11-03)', 5), fact(OD, `capacity.day(${D0})`, 4), fact(OWN, `available.slot(${D0}T08:00-18:00)`, 3)],
    ...over,
  };
}

describe('LIVE planning input (T-123) — operational records + Truth → the same engine, never the scenario pack', () => {
  it('ready inputs build a PlanningInput with live provenance; Cost Engine and Solver run on it', async () => {
    const a = assessLiveInput(sources());
    expect(a.status).toBe('READY');
    const input = a.input!;
    expect(input).toMatchObject({ scenario_id: null, contains_simulated: false, plan_day: D0, horizon_days: [D0, '2026-11-03', '2026-11-04'], terminal_id: 'PNIT' });
    expect(input.rates.rate_version).toMatch(/^live:/);
    expect(input.rates.assumption).toBeNull();
    expect(input.containers.every((c) => !c.is_simulated && c.evidence_refs[0]!.startsWith('planning_container_record:'))).toBe(true);
    expect(new Set(input.facts.map((f) => f.source))).toEqual(new Set(['TRUTH', 'OPERATIONAL_RECORD'])); // no SCENARIO
    expect(input.own_trucks).toHaveLength(3);
    expect(input.facts.find((f) => f.fact_key === 'max_days')).toMatchObject({ source: 'OPERATIONAL_RECORD', value: 3, fact_ref: 'facility_planning_profile:p-od' });
    const table = buildCostTable(input);
    const baseline = computeBaseline(input, table);
    const result = await solveRecovery(input, table, baseline);
    expect(result.status).toBe('OPTIMAL');
    // 창고 오늘 1칸뿐 → 3대 중 2대는 오늘 창고에 못 들어간다(ODCY 경유 · 대기) — 우선순위 HIGH 가 창고를 먼저
    expect(result.assignments).toHaveLength(3);
    expect(result.objective_value).toBeLessThanOrEqual(result.baseline_value);
    expect(a.provenance.rate_records.map((r) => r.key)).toContain(`transport.PNIT__${WH}.40DRY`);
  });

  it('same sources → the same input and fingerprint (deterministic); a changed record changes the fingerprint', () => {
    const a = assessLiveInput(sources());
    const b = assessLiveInput(sources());
    expect(JSON.stringify(b.input)).toBe(JSON.stringify(a.input));
    expect(b.provenance.operational_fingerprint).toBe(a.provenance.operational_fingerprint);
    const changed = assessLiveInput(sources({ rates: sources().rates.map((r) => (r.rate_type === 'TERMINAL_STORAGE_PER_DAY' ? { ...r, amount: 45000, content_hash: 'rh-new' } : r)) }));
    expect(changed.provenance.operational_fingerprint).not.toBe(a.provenance.operational_fingerprint);
  });

  it('missing LFD · missing capacity · missing truck availability → NOT_READY with field-level missing inputs, nothing computed', () => {
    const noLfd = sources({ containers: [rec(cno('TSTU000001'), { lfd: null }), rec(cno('TSTU000002'))] });
    const a = assessLiveInput(noLfd);
    expect(a).toMatchObject({ status: 'NOT_READY', ready: false, input: null });
    expect(a.missing_inputs).toContainEqual(expect.objectContaining({ code: 'CONTAINER_LFD', group: 'LFD', severity: 'BLOCKING', count: 1, fields: [`container.${cno('TSTU000001')}.lfd`] }));
    const noCap = assessLiveInput(sources({ truthFacts: [fact(OWN, `available.slot(${D0}T08:00-18:00)`, 3)] }));
    expect(noCap.missing_inputs).toContainEqual(expect.objectContaining({ code: 'FACILITY_CAPACITY', group: 'WAREHOUSE_CAPACITY', severity: 'BLOCKING', fields: [`facility.합성 창고.capacity.day(${D0})`] }));
    const noTruck = assessLiveInput(sources({ truthFacts: [fact(WH, `capacity.day(${D0})`, 1)] }));
    expect(noTruck.missing_inputs).toContainEqual(expect.objectContaining({ code: 'TRUCK_AVAILABILITY', severity: 'BLOCKING' }));
    // 자사 트럭은 확인된 신선한 가용만 — 잠정이면 쓰지 않고 알린다
    const provisionalOwn = assessLiveInput(sources({ truthFacts: [fact(WH, `capacity.day(${D0})`, 1), fact(OWN, `available.slot(${D0}T08:00-18:00)`, 3, { fact_state: 'PROVISIONAL' })] }));
    expect(provisionalOwn.missing_inputs.map((m) => m.code)).toEqual(expect.arrayContaining(['TRUCK_AVAILABILITY', 'OWN_TRUCK_NOT_CONFIRMED']));
  });

  it('a missing rate is never 0: the KEEP rate blocks, an alternative-only rate is optional', () => {
    const noKeep = assessLiveInput(sources({ rates: sources().rates.filter((r) => !(r.rate_type === 'TRANSPORT' && r.to_ref === WH && r.from_ref === 'PNIT')) }));
    expect(noKeep.status).toBe('NOT_READY');
    expect(noKeep.missing_inputs).toContainEqual(expect.objectContaining({ code: 'RATE_MISSING', group: 'RATE', severity: 'BLOCKING', fields: ['rate.transport.PNIT__합성 창고.40DRY'] }));
    const noOdcy = assessLiveInput(sources({ rates: sources().rates.filter((r) => r.rate_type !== 'ODCY_HANDLING_IN_OUT') }));
    expect(noOdcy.status).toBe('READY');
    expect(noOdcy.missing_inputs).toContainEqual(expect.objectContaining({ code: 'RATE_MISSING', severity: 'OPTIONAL' }));
    const noDetention = assessLiveInput(sources({ rates: sources().rates.filter((r) => r.rate_type !== 'DETENTION_FREE_DAYS') }));
    expect(noDetention.missing_inputs).toContainEqual(expect.objectContaining({ code: 'RATE_MISSING', fields: ['rate.DETENTION_FREE_DAYS'] }));
  });

  it('a provisional capacity is used with a warning (READY_WITH_PROVISIONAL), never turned into confirmed', () => {
    const a = assessLiveInput(sources({ truthFacts: [fact(WH, `capacity.day(${D0})`, 1, { fact_state: 'PROVISIONAL' }), fact(OWN, `available.slot(${D0}T08:00-18:00)`, 3)] }));
    expect(a.status).toBe('READY_WITH_PROVISIONAL');
    expect(a.input!.facts.find((f) => f.subject_id === WH)!.fact_state).toBe('PROVISIONAL');
    expect(a.provisional_facts).toHaveLength(1);
  });

  it('nothing at all → CONTAINER_SCOPE_EMPTY; public containers without a record are listed', () => {
    expect(assessLiveInput(sources({ containers: [] })).missing_inputs[0]).toMatchObject({ code: 'CONTAINER_SCOPE_EMPTY', severity: 'BLOCKING' });
    expect(assessLiveInput(sources({ unrecordedPublicContainers: ['ABCU1234560'] })).missing_inputs).toContainEqual(expect.objectContaining({ code: 'CONTAINER_RECORD', fields: ['container.ABCU1234560'] }));
  });
});

describe('bulk planning input validation (T-123) — row errors, never fill in values', () => {
  const facilities = [
    { id: WH, name: '합성 창고', type: 'WAREHOUSE', isActive: true },
    { id: OD, name: '합성 ODCY', type: 'ODCY', isActive: true },
  ];
  const ctx = { planDay: D0, facilities, publicContainers: new Map([[cno('TSTU000009'), { id: 'pub-1', sizeType: '20DRY' }]]) };
  const header = 'container_no,size_type,carrier,pickup_ready,terminal,destination,planned_day,lfd,priority';

  it('CSV: quotes, CRLF, BOM; ISO 6346 check digits', () => {
    const p = parseCsv(`﻿a,b\r\n"x, ""y""",2\r\n`);
    expect(p).toEqual({ header: ['a', 'b'], rows: [{ row: 2, cells: { a: 'x, "y"', b: '2' } }] });
    expect(validContainerNo('CSQU3054383')).toBe(true);
    expect(validContainerNo('CSQU3054384')).toBe(false);
  });

  it('every bad row is reported with its line and column; a valid file normalizes names to ids', () => {
    const csv = [
      header,
      `${cno('TSTU000001')},40DRY,CARRIER_X,true,PNIT,합성 창고,${D0},2026-11-03,HIGH`,
      `TSTU0000010,40DRY,CARRIER_X,true,PNIT,합성 창고,${D0},,`, // bad check digit
      `${cno('TSTU000002')},45XX,CARRIER_X,maybe,PNIT,없는 창고,2026-13-01,2062-01-01,`, // many errors
      `${cno('TSTU000001')},40DRY,CARRIER_X,true,PNIT,합성 ODCY,${D0},,`, // duplicate + ODCY as destination
      `${cno('TSTU000009')},40DRY,CARRIER_X,true,PNIT,합성 창고,${D0},,`, // conflicts with the public manifest
    ].join('\n');
    const t = readTable('CONTAINERS', { csv });
    if ('errors' in t) throw new Error('unexpected');
    const v = validateContainers(t.rows, ctx, 'run-1');
    const codes = v.errors.map((e) => `${e.row}:${e.code}`);
    expect(codes).toEqual(expect.arrayContaining(['3:INVALID_CONTAINER_NO', '4:INVALID_CONTAINER_TYPE', '4:NOT_A_BOOLEAN', '4:UNKNOWN_FACILITY', '4:INVALID_DATE', '4:DATE_OUT_OF_RANGE', '5:FACILITY_TYPE_NOT_ALLOWED', '6:CONFLICTS_WITH_PUBLIC_DATA']));
    expect(v.rows[0]).toMatchObject({ container_no: cno('TSTU000001'), destination_facility_id: WH, priority: 'HIGH', lfd: '2026-11-03', record_status: 'ACTIVE' });
  });

  it('formula-like cells, unknown columns and oversized input are refused before any row is read', () => {
    expect(readTable('CONTAINERS', { csv: `${header},evil\n=1,,,,,,,,,` })).toMatchObject({ errors: expect.arrayContaining([expect.objectContaining({ code: 'UNKNOWN_COLUMN' }), expect.objectContaining({ code: 'FORMULA_LIKE_CELL' })]) });
    expect(readTable('CONTAINERS', { csv: `${header}\n@SUM(1),40DRY,C,true,PNIT,x,${D0},,` })).toMatchObject({ errors: [expect.objectContaining({ code: 'FORMULA_LIKE_CELL', column: 'container_no' })] });
    expect(readTable('CONTAINERS', { csv: 'x'.repeat(600 * 1024) })).toMatchObject({ errors: [expect.objectContaining({ code: 'INPUT_TOO_LARGE' })] });
  });

  it('rates: shape per type, KRW only, negative refused, terminal code or facility as origin', () => {
    const rows = [
      { rate_type: 'TRANSPORT', from: 'PNIT', to: '합성 창고', size_type: '40DRY', amount: '200000', effective_from: '2026-11-01', source_note: '계약서 2026' },
      { rate_type: 'DEMURRAGE_PER_DAY', size_type: '40DRY', amount: '150000', effective_from: '2026-11-01', source_note: 'x' }, // no carrier
      { rate_type: 'TRANSPORT', from: 'PNIT', to: '합성 창고', size_type: '40DRY', amount: '-5', effective_from: '2026-11-01', source_note: 'x', currency: 'USD' },
      { rate_type: 'DETENTION_FREE_DAYS', amount: '7', effective_from: '2026-11-01', effective_until: '2026-10-01', source_note: 'x' },
    ];
    const t = readTable('RATES', { rows });
    if ('errors' in t) throw new Error('unexpected');
    const v = validateRates(t.rows, { planDay: null, facilities, publicContainers: new Map() });
    expect(v.errors.map((e) => `${e.row}:${e.code}`)).toEqual(expect.arrayContaining(['2:REQUIRED', '3:UNSUPPORTED_CURRENCY', '3:NEGATIVE_VALUE', '4:INVALID_PERIOD']));
    expect(v.rows).toHaveLength(1);
    expect(v.rows[0]).toMatchObject({ rate_type: 'TRANSPORT', from_ref: 'PNIT', to_ref: WH, amount: 200000, unit: 'KRW' });
  });
});

describe('LIVE readiness also catches facts the engine needs beyond the plan day (found in the Docker E2E)', () => {
  it('a container left with no feasible option because a later-day capacity is missing → BLOCKING, not a silent INFEASIBLE plan', () => {
    // 오늘 창고 0칸 · 트럭 없음 수준이 아니라: 오늘 창고가 꽉 차고(0) 다음 날 수용량이 없으면 대기 선택지도 계산되지 않는다
    const s = sources({ truthFacts: [fact(WH, `capacity.day(${D0})`, 0), fact(OD, `capacity.day(${D0})`, 0), fact(OWN, `available.slot(${D0}T08:00-18:00)`, 3)] });
    const a = assessLiveInput(s);
    expect(a.status).toBe('NOT_READY');
    const m = a.missing_inputs.find((x) => x.code === 'FACILITY_CAPACITY' && x.severity === 'BLOCKING')!;
    expect(m.group).toBe('WAREHOUSE_CAPACITY');
    expect(m.fields).toEqual(expect.arrayContaining(['facility.합성 창고.capacity.day(2026-11-03)']));
  });
});

describe('own trucks in a live plan never become outside dispatch requests (found in the Docker E2E)', () => {
  it('own truck ids are told apart from partner truck ids; follow-ups only ask partners', async () => {
    const { requiredFollowUps } = await import('../../src/planning/follow-up.js');
    const a = assessLiveInput(sources());
    expect(a.input!.own_trucks.every((t) => t.truck_id.startsWith(`own:${OWN}#`))).toBe(true);
    const items = [
      { action: 'KEEP_CURRENT_PLAN', targetRef: WH, deliveryDay: D0, scheduledDay: D0, truckRef: a.input!.own_trucks[0]!.truck_id },
      { action: 'KEEP_CURRENT_PLAN', targetRef: WH, deliveryDay: D0, scheduledDay: D0, truckRef: `${PARTNER}#1300-1800#1` },
    ];
    expect(requiredFollowUps(items).map((x) => x.kind)).toEqual(['PARTNER_TRUCKS']);
  });
});
