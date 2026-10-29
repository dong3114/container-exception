/**
 * T-136 검토 도우미(개발 전용) — State B(시나리오 · 창고 A 20 / 8)를 같은 Truth 사실로 두 번 계산한다:
 * ① 예외 범위 없음(이전 — 오늘 계획 23대 전부 재배치 후보) ② 예외 영향 컨테이너만 후보(T-136 Phase 5). 숫자 차이를 원 단위로 설명하는 근거.
 * DB · 네트워크 없음. 실행: npx tsx src/dev/t136-state-b.ts
 */
import { assessWarehouseCapacity } from '../detection/exception-rules.js';
import { computeBaseline } from '../planning/engine/baseline.js';
import { buildCostTable } from '../planning/engine/cost-engine.js';
import { solveRecovery } from '../planning/engine/solver.js';
import type { PlanningFact } from '../planning/engine/types.js';
import { planningInputFromScenario } from '../planning/scenario-input.js';
import { loadScenarioPack } from '../planning/scenario-pack.js';
import { DEFAULT_DATA_PACK, PACK_FACILITY_IDS, SEED_IDS } from '../seed/slice1-fixture.js';

const pack = loadScenarioPack(DEFAULT_DATA_PACK);
const ids: Record<string, string> = { ...PACK_FACILITY_IDS, OWN_FLEET: SEED_IDS.truckPoolOwnFleet, K_TRUCKING: SEED_IDS.truckPoolPartner };
const D0 = pack.scenario.days.D0!;
const D1 = pack.scenario.days.D1!;
const AS_OF = `${D0}T10:30:00+09:00`;
const f = (subject: string, key: string, value: number, state: PlanningFact['fact_state'] = 'CONFIRMED'): PlanningFact => ({ fact_ref: `truth:${subject}:${key}`, subject_id: subject, fact_key: key, value, fact_state: state, freshness: 'FRESH', source: 'TRUTH', is_simulated: true, evidence_time: AS_OF });
// State B 의 Truth 사실(검토 상태 B 와 같은 값) — 창고 A 오늘 8 · 내일 11 · 창고 B 10 · ODCY A 4 · ODCY B 6 · K운송 15~18시 4대(임시)
const truthFacts = [
  f(ids.WAREHOUSE_A!, `capacity.day(${D0})`, 8),
  f(ids.WAREHOUSE_A!, `capacity.day(${D1})`, 11),
  f(ids.WAREHOUSE_B!, `capacity.day(${D0})`, 10),
  f(ids.ODCY_A!, `capacity.size_type(40DRY).day(${D0})`, 4),
  f(ids.ODCY_B!, `capacity.day(${D0})`, 6),
  f(ids.K_TRUCKING!, `available.slot(${D0}T15:00-18:00)`, 4, 'PROVISIONAL'),
];

async function run(label: string, affected: string[] | null) {
  const input = { ...planningInputFromScenario(pack, { as_of: AS_OF, truthFacts, ids }), affected_container_ids: affected };
  const table = buildCostTable(input);
  const baseline = computeBaseline(input, table);
  const r = await solveRecovery(input, table, baseline);
  const actions: Record<string, number> = {};
  for (const a of r.assignments) actions[a.action] = (actions[a.action] ?? 0) + 1;
  console.log(JSON.stringify({ label, baseline_total: baseline.total, baseline_base: baseline.base_cost, objective: r.objective_value, base_cost: r.base_cost, risk_penalty: r.risk_penalty, saving: r.saving, status: r.status, actions, candidates: table.candidates.length, affected: table.affected?.length ?? null }));
  return r;
}

// 탐지기와 같은 규칙으로 넘치는 컨테이너(영향)를 고른다 — 시나리오 컨테이너의 원래 계획 순서
const scenario = planningInputFromScenario(pack, { as_of: AS_OF, truthFacts: [], ids });
const demand = scenario.containers.map((c) => ({ ref: c.container_id, container_no: c.container_no, facility_id: c.destination_id, day: c.planned_day, depart_hour: c.planned_depart_hour }));
const a = assessWarehouseCapacity(demand, [{ facility_id: ids.WAREHOUSE_A!, day: D0, value: 8, state: 'CONFIRMED', event_id: null, fact_key: `capacity.day(${D0})` }], [D0], new Set([ids.WAREHOUSE_A!])).find((x) => x.facility_id === ids.WAREHOUSE_A && x.day === D0)!;
const affected = a.affected.map((no) => a.demand_refs[a.scheduled.indexOf(no)]!);
console.log(JSON.stringify({ exception: { demand: a.demand, capacity: a.capacity, shortage: a.shortage, affected } }));
const before = await run('before (all 23 candidates)', null);
const after = await run('after (affected only)', affected);
const changed = after.assignments.filter((x) => before.assignments.find((y) => y.container_id === x.container_id)?.option_id !== x.option_id).map((x) => ({ c: x.container_id, before: before.assignments.find((y) => y.container_id === x.container_id)?.action, after: x.action, total: x.expected_cost.total, before_total: before.assignments.find((y) => y.container_id === x.container_id)?.expected_cost.total }));
console.log(JSON.stringify({ changed }));
