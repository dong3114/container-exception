import { describe, expect, it } from 'vitest';
import { computeBaseline } from '../../src/planning/engine/baseline.js';
import { buildCostTable } from '../../src/planning/engine/cost-engine.js';
import { solveRecovery } from '../../src/planning/engine/solver.js';
import type { PlanningInput } from '../../src/planning/engine/types.js';
import { planningInputFromScenario } from '../../src/planning/scenario-input.js';
import { loadScenarioPack } from '../../src/planning/scenario-pack.js';
import { DEFAULT_DATA_PACK } from '../../src/seed/slice1-fixture.js';
import { container, fact, miniInput, withFact } from './planning-fixture.js';

async function solve(input: PlanningInput) {
  const table = buildCostTable(input);
  const baseline = computeBaseline(input, table);
  return { table, baseline, result: await solveRecovery(input, table, baseline) };
}
const pick = (r: Awaited<ReturnType<typeof solve>>['result'], id: string) => r.assignments.find((a) => a.container_id === id)!;

/** 작은 문제의 정답: 트럭 제약이 없는(트럭이 넉넉한) 경우 모든 조합을 다 세어 본다. */
function bruteForce(table: ReturnType<typeof buildCostTable>): number {
  const byC = table.candidates.map((c) => table.options.filter((o) => o.container_id === c && o.feasible));
  let best = Infinity;
  const used = new Map<string, number>();
  const cap = new Map(table.resources.map((r) => [r.resource_key, r.available ?? 0]));
  const rec = (i: number, acc: number) => {
    if (acc >= best) return;
    if (i === byC.length) {
      best = acc;
      return;
    }
    for (const o of byC[i]!) {
      const keys = o.capacity_uses.map((u) => u.resource_key);
      if (keys.some((k) => (used.get(k) ?? 0) >= (cap.get(k) ?? 0))) continue;
      for (const k of keys) used.set(k, (used.get(k) ?? 0) + 1);
      rec(i + 1, acc + o.cost.total);
      for (const k of keys) used.set(k, used.get(k)! - 1);
    }
  };
  rec(0, 0);
  return best;
}

describe('T-113 Recovery Solver', () => {
  it('컨테이너 하나 — 원래 계획이 가장 싸면 그대로(KEEP), 출발 시각 · 트럭이 정해진다', async () => {
    const { result } = await solve(miniInput());
    expect(result.status).toBe('OPTIMAL');
    expect(pick(result, 'C1')).toMatchObject({ action: 'KEEP_CURRENT_PLAN', target_id: 'W', truck_id: 'K1', scheduled_time: '2026-10-13T13:00:00+09:00' });
    expect(pick(result, 'C1').reason_codes).toContain('LOWEST_COST_OPTION');
    expect(result.objective_value).toBe(pick(result, 'C1').expected_cost.total);
  });

  it('용량: 창고 오늘 1대 — 둘 중 하나만 직송, 다른 하나는 다른 선택지(이유 = 용량 가득)', async () => {
    const input = withFact(miniInput({ containers: [container('C1'), container('C2', { carrier: 'CA', lfd: '2026-10-14' })], own_trucks: [{ truck_id: 'K1', pool_id: 'OWN', from_hour: 13, to_hour: 18, fact_ref: null }, { truck_id: 'K2', pool_id: 'OWN', from_hour: 13, to_hour: 18, fact_ref: null }] }), 'W', 'capacity.day(2026-10-13)', { value: 1 });
    const { result } = await solve(input);
    expect(result.status).toBe('OPTIMAL');
    const keeps = result.assignments.filter((a) => a.action === 'KEEP_CURRENT_PLAN');
    expect(keeps).toHaveLength(1);
    // LFD 가 내일인 C2 는 하루 기다려도 Demurrage 가 없다 → C1 이 직송을 가져간다
    expect(keeps[0]!.container_id).toBe('C1');
    expect(pick(result, 'C2')).toMatchObject({ action: 'WAIT_AT_TERMINAL', delivery_day: '2026-10-14' });
    expect(result.binding_constraints.map((b) => b.ref)).toContain('WAREHOUSE_DAY:W:2026-10-13');
  });

  it('경쟁: ODCY 1 자리 1개 — 절감이 큰 컨테이너가 가져가고, 진 쪽 이유에 "더 싼 선택지가 용량으로 막힘"', async () => {
    let input = miniInput({
      containers: [container('C1', { lfd: '2026-10-13' }), container('C2', { lfd: '2026-10-13', carrier: 'CB' })],
      own_trucks: [{ truck_id: 'K1', pool_id: 'OWN', from_hour: 13, to_hour: 18, fact_ref: null }, { truck_id: 'K2', pool_id: 'OWN', from_hour: 13, to_hour: 18, fact_ref: null }],
    });
    input = { ...input, rates: { ...input.rates, demurrage_per_day: { ...input.rates.demurrage_per_day, CB: { '40DRY': 100_000 } } } };
    input = withFact(withFact(withFact(input, 'W', 'capacity.day(2026-10-13)', { value: 0 }), 'O1', 'capacity.size_type(40DRY).day(2026-10-13)', { value: 1 }), 'O2', 'capacity.day(2026-10-13)', { value: 0 });
    const { result } = await solve(input);
    expect(pick(result, 'C1').action).toBe('MOVE_TO_ODCY');
    expect(pick(result, 'C2').action).toBe('WAIT_AT_TERMINAL');
    expect(pick(result, 'C2').reason_codes.join()).toMatch(/CHEAPER_OPTION_BLOCKED:CAPACITY_FULL:ODCY:O1:40DRY/);
  });

  it('트럭: 왕복 2시간 ODCY 일 두 개를 시간창 2시간짜리 트럭 한 대가 동시에 못 한다', async () => {
    let input = miniInput({ containers: [container('C1', { size_type: '20DRY' }), container('C2', { size_type: '20DRY' })], own_trucks: [{ truck_id: 'K1', pool_id: 'OWN', from_hour: 14, to_hour: 16, fact_ref: null }] });
    input = withFact(input, 'W', 'capacity.day(2026-10-13)', { value: 0 });
    const { result } = await solve(input);
    expect(result.assignments.filter((a) => a.action === 'MOVE_TO_ODCY')).toHaveLength(1);
    const busy = result.truck_usage.find((t) => t.truck_id === 'K1')!.busy_hours;
    expect(new Set(busy).size).toBe(busy.length); // 한 시각에 일 하나
  });

  it('용량 부족 → INFEASIBLE, 컨테이너별로 왜 막혔는지 설명', async () => {
    let input = miniInput({ containers: [container('C1'), container('C2', { size_type: '40RF' })] });
    for (const d of ['2026-10-13', '2026-10-14', '2026-10-15']) input = withFact(input, 'W', `capacity.day(${d})`, { value: d === '2026-10-15' ? 1 : 0 });
    input = withFact(withFact(input, 'O1', 'capacity.size_type(40DRY).day(2026-10-13)', null), 'O2', 'capacity.day(2026-10-13)', { fact_state: 'REVOKED', value: null });
    const { result } = await solve(input);
    expect(result.status).toBe('INFEASIBLE');
    expect(result.objective_value).toBeNull();
    expect(result.unplanned).toHaveLength(1);
    const why = result.unplanned[0]!.reasons.join(' | ');
    expect(why).toMatch(/CAPACITY_ZERO|CAPACITY_FULL/);
    expect(why).toMatch(/FACT_MISSING|FACT_REVOKED|SIZE_NOT_ACCEPTED/);
  });

  it('터미널 대기로 물러선다: ODCY 사실이 모두 없고 오늘 창고가 꽉 차면 대기', async () => {
    let input = withFact(miniInput(), 'W', 'capacity.day(2026-10-13)', { value: 0 });
    input = withFact(withFact(input, 'O1', 'capacity.size_type(40DRY).day(2026-10-13)', null), 'O2', 'capacity.day(2026-10-13)', { fact_state: 'STALE' });
    const { result } = await solve(input);
    expect(result.status).toBe('OPTIMAL');
    expect(pick(result, 'C1')).toMatchObject({ action: 'WAIT_AT_TERMINAL', delivery_day: '2026-10-14', truck_id: null, scheduled_time: null });
  });

  it('비용 최소: 트럭이 넉넉한 작은 문제에서 전수 조사의 최솟값과 같고 Baseline 보다 크지 않다', async () => {
    const trucks = Array.from({ length: 8 }, (_, i) => ({ truck_id: `K${i + 1}`, pool_id: 'OWN', from_hour: 8, to_hour: 20, fact_ref: null }));
    let input = miniInput({
      containers: [container('C1'), container('C2', { size_type: '20DRY' }), container('C3', { lfd: '2026-10-14', priority: 'HIGH' }), container('C4', { priority: 'CRITICAL' }), container('C5', { lfd: '2026-10-12' })],
      own_trucks: trucks,
    });
    input = withFact(withFact(withFact(input, 'W', 'capacity.day(2026-10-13)', { value: 2 }), 'W', 'capacity.day(2026-10-14)', { value: 1 }), 'O1', 'capacity.size_type(40DRY).day(2026-10-13)', { value: 1 });
    const { table, baseline, result } = await solve(input);
    expect(result.status).toBe('OPTIMAL');
    expect(result.objective_value).toBe(bruteForce(table));
    expect(result.objective_value!).toBeLessThanOrEqual(baseline.total);
    expect(result.saving).toBe(baseline.total - result.objective_value!);
  });

  it('결정론: 같은 입력은 같은 할당 · 같은 입력 해시', async () => {
    const input = miniInput({ containers: [container('C1'), container('C2'), container('C3')], own_trucks: [{ truck_id: 'K1', pool_id: 'OWN', from_hour: 13, to_hour: 18, fact_ref: null }, { truck_id: 'K2', pool_id: 'OWN', from_hour: 13, to_hour: 18, fact_ref: null }] });
    const a = await solve(withFact(input, 'W', 'capacity.day(2026-10-13)', { value: 1 }));
    const b = await solve(withFact(input, 'W', 'capacity.day(2026-10-13)', { value: 1 }));
    const strip = (r: typeof a.result) => r.assignments.map((x) => [x.container_id, x.option_id, x.truck_id, x.scheduled_time]);
    expect(strip(a.result)).toEqual(strip(b.result));
    expect(a.result.input_hash).toBe(b.result.input_hash);
  });

  it('사실이 바뀌면 결과가 바뀐다: ODCY 용량 사실이 철회되면 그 ODCY 를 쓰지 않는다 · 입력 해시도 바뀐다', async () => {
    const input = withFact(miniInput({ own_trucks: [{ truck_id: 'K1', pool_id: 'OWN', from_hour: 13, to_hour: 18, fact_ref: null }] }), 'W', 'capacity.day(2026-10-13)', { value: 0 });
    const before = await solve(input);
    expect(pick(before.result, 'C1').action).toBe('MOVE_TO_ODCY');
    const target = pick(before.result, 'C1').target_id;
    const key = target === 'O1' ? 'capacity.size_type(40DRY).day(2026-10-13)' : 'capacity.day(2026-10-13)';
    const after = await solve(withFact(input, target, key, { fact_state: 'REVOKED', value: null }));
    expect(pick(after.result, 'C1').target_id).not.toBe(target);
    expect(after.result.input_hash).not.toBe(before.result.input_hash);
  });

  it('협력 운송사 잠정 가용 사실: 트럭으로 쓰면 위험 벌점이 붙고 경고에 그 사실이 남는다', async () => {
    let input = miniInput({ own_trucks: [], partner_pools: [{ pool_id: 'P', name: '협력 P' }] });
    input = { ...input, facts: [...input.facts, fact('P', 'available.slot(2026-10-13T15:00-17:00)', 1, { fact_state: 'PROVISIONAL' })] };
    const { table, result } = await solve(input);
    expect(table.trucks).toHaveLength(1);
    const a = pick(result, 'C1');
    expect(a.truck_pool_id).toBe('P');
    expect(a.expected_cost.lines.some((l) => l.code === 'PROVISIONAL_RELIANCE')).toBe(true);
    expect(a.reason_codes).toContain('RELIES_ON_PROVISIONAL_FACT');
    // 그 가용 사실이 오래되면 트럭이 없다 → 오늘 이동 불가 → 대기
    const stale = await solve({ ...input, facts: input.facts.map((f) => (f.subject_id === 'P' ? { ...f, freshness: 'STALE' as const } : f)) });
    expect(stale.table.trucks).toHaveLength(0);
    expect(pick(stale.result, 'C1').action).toBe('WAIT_AT_TERMINAL');
  });
});

describe('T-113 30대 시나리오 (busan-wh-capacity-01)', () => {
  const pack = loadScenarioPack(DEFAULT_DATA_PACK);

  it('S7(회신 3건 반영 뒤): 최적해 · 용량 · 트럭 제약 만족 · Baseline 이하 · 몇 초 안', async () => {
    const input = planningInputFromScenario(pack, { as_of: '2026-10-13T11:20:05+09:00', step: 'S7' });
    const t0 = performance.now();
    const { table, baseline, result } = await solve(input);
    const ms = performance.now() - t0;
    expect(result.status).toBe('OPTIMAL');
    expect(result.assignments).toHaveLength(23);
    expect(ms).toBeLessThan(10_000);
    // 용량
    for (const r of result.resource_usage) if (r.available !== null) expect(r.used).toBeLessThanOrEqual(r.available);
    expect(result.assignments.filter((a) => a.delivery_day === '2026-10-13' && a.destination_id === 'WAREHOUSE_A')).toHaveLength(8);
    // 트럭 겹침 없음 · 시간창 안
    for (const t of result.truck_usage) {
      expect(new Set(t.busy_hours).size).toBe(t.busy_hours.length);
      for (const h of t.busy_hours) expect(h >= t.from_hour && h < t.to_hour).toBe(true);
    }
    // Reefer 는 ODCY 로 가지 않는다
    for (const id of ['C001', 'C009', 'C016', 'C019']) expect(pick(result, id).action).not.toBe('MOVE_TO_ODCY');
    expect(result.objective_value!).toBeLessThanOrEqual(baseline.total);
    expect(result.base_cost! + result.risk_penalty!).toBe(result.objective_value);
    // 숫자는 엔진의 비용표에서만 — 할당 비용 = 고른 선택지의 비용(+ 협력 트럭 벌점)
    for (const a of result.assignments) {
      const o = table.options.find((x) => x.option_id === a.option_id)!;
      expect(a.expected_cost.base_cost).toBe(o.cost.base_cost);
      expect(a.expected_cost.total).toBeGreaterThanOrEqual(o.cost.total);
    }
  });

  it('S1 → S7: 회신으로 사실이 바뀌면(ODCY A 5 → 4, 협력 트럭 추가) 계획이 바뀐다', async () => {
    const s1 = await solve(planningInputFromScenario(pack, { as_of: '2026-10-13T11:00:00+09:00', step: 'S1' }));
    const s7 = await solve(planningInputFromScenario(pack, { as_of: '2026-10-13T11:20:05+09:00', step: 'S7' }));
    expect(s1.result.input_hash).not.toBe(s7.result.input_hash);
    const odcyA = (r: typeof s1.result) => r.assignments.filter((a) => a.target_id === 'ODCY_A').length;
    expect(odcyA(s1.result)).toBe(5);
    expect(odcyA(s7.result)).toBe(4);
  });
});
