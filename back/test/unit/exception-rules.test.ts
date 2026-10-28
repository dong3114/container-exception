import { describe, expect, it } from 'vitest';
import {
  type CapacityObservation,
  type DemandItem,
  assessWarehouseCapacity,
  capacityFactKey,
  decideLifecycle,
  evidenceMaterial,
  shouldCreateRun,
} from '../../src/detection/exception-rules.js';

/** T-132 창고 수용량 부족 탐지 규칙 — 순수 함수(DB · 시각 · LLM 없음). DB · API 수준은 test/db/exception-detection.test.ts */
const WH = 'wh-a';
const D = '2026-10-13';
const demand = (n: number, day = D, facility = WH): DemandItem[] =>
  Array.from({ length: n }, (_, i) => ({ ref: `r${i}`, container_no: `CONU${String(i).padStart(7, '0')}`, facility_id: facility, day, depart_hour: 8 + (i % 10) }));
const cap = (value: number | null, state: CapacityObservation['state'] = 'CONFIRMED', day = D): CapacityObservation => ({ facility_id: WH, day, value, state, event_id: value === null ? null : 'ev-1', fact_key: capacityFactKey(day) });
const assess = (items: DemandItem[], caps: CapacityObservation[], also: { facility_id: string; day: string }[] = []) => assessWarehouseCapacity(items, caps, [D, '2026-10-14'], new Set([WH]), also);

describe('assessWarehouseCapacity', () => {
  it('A: demand <= confirmed capacity → no shortage', () => {
    const [a] = assess(demand(8), [cap(8)]);
    expect(a).toMatchObject({ verdict: 'SUFFICIENT', demand: 8, capacity: 8, shortage: 0, affected: [], basis: 'CONFIRMED' });
  });

  it('B: demand > confirmed capacity → shortage = demand − capacity, the over-capacity containers are the latest in plan order', () => {
    const [a] = assess(demand(20), [cap(8)]);
    expect(a).toMatchObject({ verdict: 'SHORTAGE', demand: 20, capacity: 8, shortage: 12, basis: 'CONFIRMED' });
    expect(a!.affected).toHaveLength(12);
    // 계획 순서(출발 시각 → 번호)로 앞 8대가 수용량 안 — 넘치는 12대는 뒤쪽. "아무 12대"가 아니다
    const order = [...demand(20)].sort((x, y) => (x.depart_hour! - y.depart_hour!) || (x.container_no < y.container_no ? -1 : 1)).map((x) => x.container_no);
    expect(a!.affected).toEqual(order.slice(8));
    expect(a!.scheduled).toEqual(order);
  });

  it('C: missing capacity fact → INDETERMINATE (not called a shortage)', () => {
    const [a] = assess(demand(20), []);
    expect(a).toMatchObject({ verdict: 'INDETERMINATE', basis: null, capacity: null, capacity_state: 'MISSING', shortage: 0 });
  });

  it('D: stale · revoked · needs review → INDETERMINATE; provisional → shortage with PROVISIONAL basis', () => {
    for (const s of ['STALE', 'REVOKED', 'NEEDS_REVIEW', 'UNKNOWN'] as const) expect(assess(demand(20), [cap(8, s)])[0]).toMatchObject({ verdict: 'INDETERMINATE', basis: null });
    expect(assess(demand(20), [cap(8, 'OBSERVED')])[0]).toMatchObject({ verdict: 'SHORTAGE', basis: 'CONFIRMED' });
    expect(assess(demand(20), [cap(8, 'PROVISIONAL')])[0]).toMatchObject({ verdict: 'SHORTAGE', basis: 'PROVISIONAL', shortage: 12 });
  });

  it('only warehouses and days in the window are judged; an active exception with no demand left is checked (for resolution)', () => {
    expect(assessWarehouseCapacity(demand(5, '2026-10-20'), [], [D], new Set([WH]))).toEqual([]);
    expect(assessWarehouseCapacity(demand(5, D, 'odcy'), [], [D], new Set([WH]))).toEqual([]);
    const [gone] = assess([], [], [{ facility_id: WH, day: D }]);
    expect(gone).toMatchObject({ verdict: 'SUFFICIENT', demand: 0 });
  });

  it('is deterministic: same input in any order → same result', () => {
    const items = demand(13);
    expect(assess([...items].reverse(), [cap(5)])).toEqual(assess(items, [cap(5)]));
  });
});

describe('decideLifecycle · shouldCreateRun', () => {
  const short = assess(demand(20), [cap(8)])[0]!;
  const hash = 'sha256:' + 'a'.repeat(64);
  const active = (basis: 'CONFIRMED' | 'PROVISIONAL' = 'CONFIRMED', last: string | null = hash) => ({ basis, scheduled_demand: 20, capacity: 8, shortage: 12, last_evidence_hash: last });

  it('B: a new shortage is DETECTED; nothing for sufficient · indeterminate without an active exception', () => {
    expect(decideLifecycle(null, short, hash)).toEqual({ action: 'DETECT', basis: 'CONFIRMED' });
    expect(decideLifecycle(null, assess(demand(4), [cap(8)])[0]!, hash)).toEqual({ action: 'NONE' });
    expect(decideLifecycle(null, assess(demand(20), [])[0]!, hash)).toEqual({ action: 'NONE' });
  });

  it('E: the same evidence again → nothing recorded (no duplicates)', () => {
    expect(decideLifecycle(active(), short, hash)).toEqual({ action: 'NONE' });
  });

  it('F: capacity 8 → 6 on the same exception → CHANGE (a new observation, same exception)', () => {
    const six = assess(demand(20), [cap(6)])[0]!;
    expect(decideLifecycle(active(), six, 'sha256:' + 'b'.repeat(64))).toEqual({ action: 'CHANGE', basis: 'CONFIRMED' });
  });

  it('G: confirmed capacity becomes enough, or demand drops to 0 → RESOLVE; a provisional "enough" or unknown capacity does not resolve', () => {
    expect(decideLifecycle(active(), assess(demand(20), [cap(25)])[0]!, 'h2')).toEqual({ action: 'RESOLVE' });
    expect(decideLifecycle(active(), assess([], [], [{ facility_id: WH, day: D }])[0]!, 'h3')).toEqual({ action: 'RESOLVE' });
    expect(decideLifecycle(active(), assess(demand(20), [cap(25, 'PROVISIONAL')])[0]!, 'h4')).toEqual({ action: 'INDETERMINATE' });
    expect(decideLifecycle(active(), assess(demand(20), [cap(25, 'STALE')])[0]!, 'h5')).toEqual({ action: 'INDETERMINATE' });
  });

  it('a recovery run is created only for an ACTIVE exception with CONFIRMED basis and no run yet', () => {
    expect(shouldCreateRun('ACTIVE', 'CONFIRMED', false)).toBe(true);
    expect(shouldCreateRun('ACTIVE', 'PROVISIONAL', false)).toBe(false);
    expect(shouldCreateRun('ACTIVE', 'CONFIRMED', true)).toBe(false);
    expect(shouldCreateRun('RESOLVED', 'CONFIRMED', false)).toBe(false);
  });

  it('evidence material ignores order of the demand references', () => {
    const a = assess(demand(10), [cap(3)])[0]!;
    expect(evidenceMaterial({ ...a, demand_refs: [...a.demand_refs].reverse() })).toEqual(evidenceMaterial(a));
  });
});
