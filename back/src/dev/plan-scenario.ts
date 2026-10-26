/**
 * 개발 전용 — 시나리오 팩 한 단계를 Cost Engine(+ Baseline)으로 계산해 요약을 찍는다(DB 없음).
 *   npx tsx src/dev/plan-scenario.ts [--step S7] [--json]
 */
import { buildCostTable } from '../planning/engine/cost-engine.js';
import { computeBaseline } from '../planning/engine/baseline.js';
import { solveRecovery } from '../planning/engine/solver.js';
import { planningInputFromScenario } from '../planning/scenario-input.js';
import { loadScenarioPack } from '../planning/scenario-pack.js';
import { DEFAULT_DATA_PACK } from '../seed/slice1-fixture.js';

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const pack = loadScenarioPack(arg('--dir') ?? DEFAULT_DATA_PACK);
const stepId = arg('--step') ?? 'S7';
const step = pack.scenario.steps.find((s) => s.step_id === stepId)!;
const input = planningInputFromScenario(pack, { as_of: step.as_of, step: stepId });
const t0 = performance.now();
const table = buildCostTable(input);
const costMs = performance.now() - t0;
const baseline = computeBaseline(input, table);
const krw = (n: number) => n.toLocaleString('en-US');
console.log(`step ${stepId} as_of ${input.as_of} · candidates ${table.candidates.length} · options ${table.options.length} (feasible ${table.options.filter((o) => o.feasible).length}) · cost ${costMs.toFixed(1)} ms`);
for (const r of table.resources) console.log(`  resource ${r.resource_key} fact=${r.fact_value} committed=${r.committed} available=${r.available}`);
console.log(`  trucks ${table.trucks.map((t) => `${t.truck_id}[${t.from_hour}-${t.to_hour}${t.warning ? ' ' + t.warning : ''}]`).join(' ')}`);
for (const w of table.warnings) console.log(`  ! ${w}`);
console.log(`baseline base ${krw(baseline.base_cost)} · risk ${krw(baseline.risk_penalty)} · total ${krw(baseline.total)} · unplanned ${baseline.unplanned.length}`);
for (const a of baseline.assignments) console.log(`  ${a.container_id} ${a.option.action.padEnd(17)} ${a.option.target_id.padEnd(12)} ${a.option.delivery_day} base ${krw(a.option.cost.base_cost).padStart(9)} risk ${krw(a.option.cost.risk_penalty).padStart(8)}`);
const result = await solveRecovery(input, table, baseline);
console.log(`solver ${result.status} · objective ${result.objective_value === null ? '-' : krw(result.objective_value)} (base ${result.base_cost === null ? '-' : krw(result.base_cost)} · risk ${result.risk_penalty === null ? '-' : krw(result.risk_penalty)}) · saving ${result.saving === null ? '-' : krw(result.saving)} (base ${result.base_saving === null ? '-' : krw(result.base_saving)}) · model ${result.timings_ms.model.toFixed(1)} ms · solve ${result.timings_ms.solve.toFixed(1)} ms · size ${JSON.stringify(result.model_size)}`);
for (const a of result.assignments) console.log(`  ${a.container_id} ${a.action.padEnd(17)} ${a.target_id.padEnd(12)} ${a.delivery_day} ${(a.scheduled_time ?? '').slice(11, 16).padEnd(5)} ${(a.truck_id ?? '').padEnd(24)} base ${krw(a.expected_cost.base_cost).padStart(9)} risk ${krw(a.expected_cost.risk_penalty).padStart(8)} ${a.reason_codes.join(',')}`);
for (const u of result.unplanned) console.log(`  UNPLANNED ${u.container_id}: ${u.reasons.join(' | ')}`);
for (const b of result.binding_constraints) console.log(`  binding ${b.type} ${b.ref} ${b.note}`);
if (process.argv.includes('--options')) {
  for (const o of table.options) console.log(`  ${o.option_id.padEnd(50)} ${o.feasible ? 'OK ' : 'NO '} base ${krw(o.cost.base_cost).padStart(9)} total ${krw(o.cost.total).padStart(9)} ${o.infeasible_reasons.map((r) => r.code).join(',')}`);
}
