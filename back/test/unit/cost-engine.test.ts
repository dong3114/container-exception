import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeBaseline } from '../../src/planning/engine/baseline.js';
import { buildCostTable, calculateActionCost } from '../../src/planning/engine/cost-engine.js';
import { DEFAULT_COST_POLICY } from '../../src/planning/engine/cost-policy.js';
import { BASE_COST_ITEMS, COST_ITEM_KEYS, type ActionOption } from '../../src/planning/engine/types.js';
import { planningInputFromScenario } from '../../src/planning/scenario-input.js';
import { loadScenarioPack } from '../../src/planning/scenario-pack.js';
import { DEFAULT_DATA_PACK } from '../../src/seed/slice1-fixture.js';
import { container, fact, miniInput, withFact } from './planning-fixture.js';

const opt = (options: ActionOption[], id: string) => {
  const o = options.find((x) => x.option_id === id);
  if (!o) throw new Error(`no option ${id}`);
  return o;
};
const codes = (o: ActionOption) => o.infeasible_reasons.map((r) => r.code);

describe('T-112 Cost / Risk Engine — 순수 결정론 계산', () => {
  it('A 결정론: 같은 입력은 같은 비용표(JSON 까지 같다)', () => {
    const input = miniInput({ containers: [container('C1'), container('C2', { size_type: '20DRY' })] });
    expect(JSON.stringify(buildCostTable(input))).toBe(JSON.stringify(buildCostTable(structuredClone(input))));
  });

  it('B 실행 불가: 규격을 안 받는 ODCY · 승인 없는 다른 창고 · 반출 불가 컨테이너', () => {
    const input = miniInput({
      containers: [container('C1', { size_type: '20DRY' }), container('C2', { size_type: '40RF' }), container('C3', { pickup_ready: false })],
      facilities: [...miniInput().facilities, { facility_id: 'W2', name: '창고 W2', kind: 'WAREHOUSE', accepts: ['40DRY'], open_from_hour: 8, last_departure_hour: 16, trip_hours: 1 }],
      facts: [...miniInput().facts, fact('W2', 'capacity.day(2026-10-13)', 5)],
    });
    const t = buildCostTable(input);
    expect(codes(opt(t.options, 'C1|MOVE_TO_ODCY|O1|2026-10-14'))).toContain('SIZE_NOT_ACCEPTED');
    expect(codes(opt(t.options, 'C2|MOVE_TO_ODCY|O2|2026-10-14'))).toContain('SIZE_NOT_ACCEPTED');
    expect(codes(opt(t.options, 'C3|MOVE_TO_WAREHOUSE|W2|2026-10-13'))).toContain('ALTERNATE_DESTINATION_NOT_APPROVED');
    expect(codes(opt(t.options, 'C3|KEEP_CURRENT_PLAN|W|2026-10-13'))).toContain('CONTAINER_NOT_READY');
    // 반출 불가여도 대기는 오늘 트럭을 쓰지 않으니 가능
    expect(opt(t.options, 'C3|WAIT_AT_TERMINAL|T|2026-10-14').feasible).toBe(true);
    // 실행 불가여도 비용 항목과 이유는 남는다(설명용)
    expect(opt(t.options, 'C1|MOVE_TO_ODCY|O1|2026-10-14').infeasible_reasons[0]!.note).toMatch(/20DRY/);
  });

  it('C 용량: 사실 0 · 이미 약속된 수가 용량을 넘으면 그 날은 실행 불가', () => {
    let input = withFact(miniInput(), 'W', 'capacity.day(2026-10-13)', { value: 0 });
    expect(codes(opt(buildCostTable(input).options, 'C1|KEEP_CURRENT_PLAN|W|2026-10-13'))).toContain('CAPACITY_ZERO');
    input = withFact(miniInput({ containers: [container('C1'), container('X1', { planned_day: '2026-10-14' }), container('X2', { planned_day: '2026-10-14' })] }), 'W', 'capacity.day(2026-10-14)', { value: 2 });
    const t = buildCostTable(input);
    expect(t.commitments).toEqual([{ facility_id: 'W', day: '2026-10-14', count: 2, container_ids: ['X1', 'X2'] }]);
    expect(t.resources.find((r) => r.resource_key === 'WAREHOUSE_DAY:W:2026-10-14')!.available).toBe(0);
    expect(codes(opt(t.options, 'C1|WAIT_AT_TERMINAL|T|2026-10-14'))).toContain('CAPACITY_ZERO');
    expect(t.candidates).toEqual(['C1']);
  });

  it('D 시간창: as_of 이후로만 출발 — 창고 마감(16시)이 지나면 오늘 직송 불가, ODCY 1(19시)은 가능', () => {
    const late = miniInput({ as_of: '2026-10-13T17:30:00+09:00' });
    const t = buildCostTable(late);
    expect(codes(opt(t.options, 'C1|KEEP_CURRENT_PLAN|W|2026-10-13'))).toContain('NO_DEPARTURE_WINDOW');
    expect(opt(t.options, 'C1|MOVE_TO_ODCY|O1|2026-10-14').truck_job).toEqual({ trip_hours: 1, earliest_hour: 18, latest_hour: 19 });
    expect(codes(opt(t.options, 'C1|MOVE_TO_ODCY|O2|2026-10-14'))).toContain('NO_DEPARTURE_WINDOW');
    // 계획일 다음 날의 as_of — 오늘 출발은 전혀 없다
    const next = buildCostTable(miniInput({ as_of: '2026-10-14T08:00:00+09:00' }));
    expect(codes(opt(next.options, 'C1|MOVE_TO_ODCY|O1|2026-10-14'))).toContain('NO_DEPARTURE_WINDOW');
  });

  it('E 확인된 신선한 사실은 그대로 쓰고 위험 벌점이 없다', () => {
    const t = buildCostTable(miniInput());
    const keep = opt(t.options, 'C1|KEEP_CURRENT_PLAN|W|2026-10-13');
    expect(keep.feasible).toBe(true);
    expect(keep.cost.risk).toBe(0);
    expect(keep.warning_refs).toEqual([]);
    expect(keep.evidence_refs).toContain('f:W:capacity.day(2026-10-13)');
    expect(t.facts.every((f) => f.usage === 'USED')).toBe(true);
  });

  it('F 오래된(STALE · EXPIRED) 사실은 제약으로 쓰지 않는다 → 그 자원 선택지는 실행 불가', () => {
    for (const patch of [{ fact_state: 'STALE' as const }, { freshness: 'EXPIRED' as const }, { freshness: 'STALE' as const }]) {
      const t = buildCostTable(withFact(miniInput(), 'O1', 'capacity.size_type(40DRY).day(2026-10-13)', patch));
      expect(codes(opt(t.options, 'C1|MOVE_TO_ODCY|O1|2026-10-14'))).toContain('FACT_STALE');
      expect(t.resources.find((r) => r.resource_key === 'ODCY:O1:40DRY')!.available).toBeNull();
      expect(t.facts.find((f) => f.subject_id === 'O1' && f.fact_key.startsWith('capacity'))!.usage).toBe('EXCLUDED');
      expect(t.warnings.some((w) => w.includes('사실 제외'))).toBe(true);
    }
  });

  it('G 철회(REVOKED) · 충돌(NEEDS_REVIEW) · 없음(UNKNOWN) 사실도 제약으로 쓰지 않는다', () => {
    const k = 'capacity.size_type(40DRY).day(2026-10-13)';
    expect(codes(opt(buildCostTable(withFact(miniInput(), 'O1', k, { fact_state: 'REVOKED', value: null })).options, 'C1|MOVE_TO_ODCY|O1|2026-10-14'))).toContain('FACT_REVOKED');
    expect(codes(opt(buildCostTable(withFact(miniInput(), 'O1', k, { fact_state: 'NEEDS_REVIEW' })).options, 'C1|MOVE_TO_ODCY|O1|2026-10-14'))).toContain('FACT_CONFLICTED');
    expect(codes(opt(buildCostTable(withFact(miniInput(), 'O1', k, null)).options, 'C1|MOVE_TO_ODCY|O1|2026-10-14'))).toContain('FACT_MISSING');
  });

  it('H 잠정(PROVISIONAL) 사실: 정책이 허용하면 경고 + 벌점, 허용하지 않으면 실행 불가 · AGING 은 경고 + 벌점', () => {
    const input = withFact(miniInput(), 'O1', 'capacity.size_type(40DRY).day(2026-10-13)', { fact_state: 'PROVISIONAL' });
    const o = opt(buildCostTable(input).options, 'C1|MOVE_TO_ODCY|O1|2026-10-14');
    expect(o.feasible).toBe(true);
    expect(o.warning_refs).toEqual([{ fact_ref: 'f:O1:capacity.size_type(40DRY).day(2026-10-13)', reason: 'PROVISIONAL' }]);
    const line = o.cost.lines.find((l) => l.code === 'PROVISIONAL_RELIANCE')!;
    expect(line).toMatchObject({ item: 'risk', amount_krw: DEFAULT_COST_POLICY.provisional.penalty_krw, source_type: 'POLICY' });
    expect(line.assumption).toMatch(/ASSUMPTION/);
    const strict = { ...DEFAULT_COST_POLICY, provisional: { allowed: false, penalty_krw: 0 } };
    expect(codes(opt(buildCostTable(input, strict).options, 'C1|MOVE_TO_ODCY|O1|2026-10-14'))).toContain('FACT_PROVISIONAL_NOT_ALLOWED');
    const aging = opt(buildCostTable(withFact(miniInput(), 'W', 'capacity.day(2026-10-13)', { freshness: 'AGING' })).options, 'C1|KEEP_CURRENT_PLAN|W|2026-10-13');
    expect(aging.feasible).toBe(true);
    expect(aging.cost.risk).toBe(DEFAULT_COST_POLICY.aging_penalty_krw);
  });

  it('I 항목 합 = 합계 · base_cost 와 risk_penalty 는 따로', () => {
    const input = withFact(miniInput({ containers: [container('C1', { priority: 'CRITICAL' }), container('C2', { size_type: '20DRY', lfd: '2026-10-12' })] }), 'O2', 'capacity.day(2026-10-13)', { fact_state: 'PROVISIONAL' });
    for (const o of buildCostTable(input).options) {
      const c = o.cost;
      for (const k of COST_ITEM_KEYS) expect(c[k]).toBe(c.lines.filter((l) => l.item === k).reduce((s, l) => s + l.amount_krw, 0));
      expect(c.base_cost).toBe(BASE_COST_ITEMS.reduce((s, k) => s + c[k], 0));
      expect(c.risk_penalty).toBe(c.delay + c.risk);
      expect(c.total).toBe(c.base_cost + c.risk_penalty);
      for (const l of c.lines) if (l.status === 'CALCULATED' && l.unit_krw !== null) expect(l.amount_krw).toBe(l.unit_krw * l.qty);
    }
  });

  it('K 음수 금액 없음 · 모든 금액은 KRW 정수', () => {
    const pack = loadScenarioPack(DEFAULT_DATA_PACK);
    const t = buildCostTable(planningInputFromScenario(pack, { as_of: '2026-10-13T11:20:05+09:00', step: 'S7' }));
    for (const o of t.options) {
      for (const l of o.cost.lines) {
        expect(l.amount_krw).toBeGreaterThanOrEqual(0);
        expect(Number.isSafeInteger(l.amount_krw)).toBe(true);
        expect(l.currency).toBe('KRW');
      }
    }
  });

  it('L 통화 · 단위 검사: KRW 정수가 아니면 계산하지 않는다', () => {
    const base = miniInput();
    expect(() => buildCostTable({ ...base, rates: { ...base.rates, currency: 'USD' as 'KRW' } })).toThrow(/currency/);
    expect(() => buildCostTable({ ...base, rates: { ...base.rates, terminal_storage_per_day: { '40DRY': 1.5 } } })).toThrow(/KRW integer/);
    expect(() => buildCostTable({ ...base, rates: { ...base.rates, transport: { T__W: { '40DRY': -1 } } } })).toThrow(/KRW integer/);
    expect(() => buildCostTable({ ...base, as_of: '2026-10-13T11:00:00' })).toThrow(/offset/);
    expect(() => buildCostTable(withFact(base, 'W', 'capacity.day(2026-10-13)', { value: 2.5 }))).toThrow(/integer/);
    expect(() => buildCostTable({ ...base, facts: [...base.facts, base.facts[0]!] })).toThrow(/duplicate/);
  });

  it('M 요율 · LFD 가 없으면 숫자를 지어내지 않는다(NOT_AVAILABLE + 실행 불가)', () => {
    const base = miniInput({ containers: [container('C1', { size_type: '20DRY' }), container('C2', { lfd: null })] });
    const noHandling = { ...base, rates: { ...base.rates, odcy: { ...base.rates.odcy, O2: { handling_in_out: { '40DRY': 60_000 }, storage_per_day: base.rates.odcy.O2!.storage_per_day } } } };
    const o = opt(buildCostTable(noHandling).options, 'C1|MOVE_TO_ODCY|O2|2026-10-14');
    expect(codes(o)).toContain('RATE_MISSING');
    expect(o.cost.lines.find((l) => l.code === 'ODCY_HANDLING')).toMatchObject({ status: 'NOT_AVAILABLE', amount_krw: 0, unit_krw: null });
    const c2 = opt(buildCostTable(base).options, 'C2|WAIT_AT_TERMINAL|T|2026-10-14');
    expect(codes(c2)).toContain('LFD_MISSING');
    expect(c2.cost.lines.find((l) => l.code === 'DEMURRAGE')!.status).toBe('NOT_AVAILABLE');
  });

  it('N as_of 재현성: 같은 as_of → 같은 결과, as_of 가 바뀌면 출발 가능 시각만 바뀐다', () => {
    const a = buildCostTable(miniInput({ as_of: '2026-10-13T14:10:00+09:00' }));
    const b = buildCostTable(miniInput({ as_of: '2026-10-13T14:10:00+09:00' }));
    expect(a).toEqual(b);
    expect(opt(a.options, 'C1|KEEP_CURRENT_PLAN|W|2026-10-13').truck_job!.earliest_hour).toBe(15);
    const early = buildCostTable(miniInput({ as_of: '2026-10-13T07:00:00+09:00' }));
    expect(opt(early.options, 'C1|KEEP_CURRENT_PLAN|W|2026-10-13').truck_job!.earliest_hour).toBe(8);
    expect(opt(early.options, 'C1|KEEP_CURRENT_PLAN|W|2026-10-13').cost).toEqual(opt(a.options, 'C1|KEEP_CURRENT_PLAN|W|2026-10-13').cost);
  });

  it('비용 계산식: 대기는 LFD 이후 일수 × (Demurrage + 터미널 보관) + 직송, ODCY 는 운송 2구간 + 핸들링 + 보관 일수 · 지연 벌점은 우선순위별', () => {
    const t = buildCostTable(miniInput({ containers: [container('C1', { priority: 'HIGH' })] }));
    const wait2 = opt(t.options, 'C1|WAIT_AT_TERMINAL|T|2026-10-15');
    expect(wait2.cost).toMatchObject({ demurrage: 400_000, storage: 80_000, transport: 190_000, base_cost: 670_000, delay: 2 * DEFAULT_COST_POLICY.delay_penalty_per_day_krw.HIGH });
    expect(wait2.cost.risk).toBe(2 * DEFAULT_COST_POLICY.terminal_wait_risk_per_day_krw);
    const odcy = opt(t.options, 'C1|MOVE_TO_ODCY|O1|2026-10-15');
    expect(odcy.cost).toMatchObject({ demurrage: 0, transport: 80_000 + 130_000, handling: 50_000, storage: 60_000, base_cost: 320_000, additional_move: 0 });
    expect(odcy.cost.lines.find((l) => l.code === 'EXTRA_MOVE')!.qty).toBe(1);
    // 보관 한도 2일 — 계획 기간 안에서는 넘지 않는다. 한도 1일이면 2일 보관은 불가
    expect(codes(opt(buildCostTable(withFact(miniInput(), 'O1', 'max_days', { value: 1 })).options, 'C1|MOVE_TO_ODCY|O1|2026-10-15'))).toContain('STORAGE_LIMIT_EXCEEDED');
    // 보관 한도 사실이 없으면 제약하지 않고 가정으로 적는다
    expect(opt(buildCostTable(withFact(miniInput(), 'O1', 'max_days', null)).options, 'C1|MOVE_TO_ODCY|O1|2026-10-15').assumptions.join()).toMatch(/보관 기간 한도 정보 없음/);
    // 공개 단건 함수도 같은 값
    expect(calculateActionCost(miniInput(), 'C1', 'MOVE_TO_ODCY', 'O1', '2026-10-15').cost).toEqual(opt(buildCostTable(miniInput()).options, 'C1|MOVE_TO_ODCY|O1|2026-10-15').cost);
  });
});

describe('T-112 30대 시나리오 회귀 (busan-wh-capacity-01) — 참고값과 비교, 결과를 하드코딩하지 않는다', () => {
  const pack = loadScenarioPack(DEFAULT_DATA_PACK);
  const plans = JSON.parse(readFileSync(join(DEFAULT_DATA_PACK, 'plans.json'), 'utf8')) as {
    baseline: { actions: { container_id: string; delivery_day: string }[]; total_cost_krw: number };
    plans: { plan_id: string; plan_cost_krw: number; actions: { container_id: string; route: string; delivery_day: string }[] }[];
  };
  const input = planningInputFromScenario(pack, { as_of: '2026-10-13T11:20:05+09:00', step: 'S7' });
  const table = buildCostTable(input);
  const priced = (actions: { container_id: string; route: string; delivery_day: string }[]) =>
    actions.reduce((s, a) => {
      const id = a.route === 'TERMINAL_WAIT' ? `${a.container_id}|WAIT_AT_TERMINAL|TERMINAL_T1|${a.delivery_day}` : `${a.container_id}|MOVE_TO_ODCY|${a.route}|${a.delivery_day}`;
      return s + opt(table.options, id).cost.base_cost;
    }, 0);

  it('J Baseline 은 같은 엔진 · 같은 비용표: 영향 12대 base 합 = 시나리오 Baseline 4,650,000', () => {
    const b = computeBaseline(input, table);
    for (const a of b.assignments) expect(table.options).toContain(a.option);
    const affected = new Set(plans.baseline.actions.map((a) => a.container_id));
    const sum = b.assignments.filter((a) => affected.has(a.container_id)).reduce((s, a) => s + a.option.cost.base_cost, 0);
    expect(sum).toBe(plans.baseline.total_cost_krw);
    // 규칙이 고른 대기 입고일도 시나리오와 같다
    for (const a of plans.baseline.actions) expect(b.assignments.find((x) => x.container_id === a.container_id)!.option.delivery_day).toBe(a.delivery_day);
    expect(b.assignments.filter((a) => a.option.action === 'KEEP_CURRENT_PLAN' && a.option.destination_id === 'WAREHOUSE_A')).toHaveLength(8);
  });

  it('시나리오 Plan v1 · v2 의 배정을 엔진으로 값을 매기면 시나리오 금액과 같다(3,835,000 · 3,855,000)', () => {
    for (const p of plans.plans) expect(priced(p.actions)).toBe(p.plan_cost_krw);
  });
});
