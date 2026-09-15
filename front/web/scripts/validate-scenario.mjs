#!/usr/bin/env node
/**
 * Consistency check for the prototype scenario data pack (T-061).
 * The fixture defines every result explicitly; this script only re-checks that the
 * explicit numbers agree with each other (sums, counts, capacities, truck windows, KPIs)
 * and that project rules hold (KRW integers, +09:00 times, no forbidden claims).
 *
 * Usage: npm run validate:scenario   (exit code 1 on any failure)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", ".."); // front/web/scripts → repo root
const dir = join(repo, "data", "scenarios", "busan-wh-capacity-01");
const load = (f) => JSON.parse(readFileSync(join(dir, f), "utf8"));

const scenario = load("scenario.json");
const containers = load("containers.json").containers;
const resources = load("resources.json");
const risk = load("risk.json");
const plans = load("plans.json");
const comms = load("communications.json");
const activity = load("activity.json");
const verifications = load("verifications.json");
const events = load("events.json");

const failures = [];
let checks = 0;
const ok = (cond, msg) => {
  checks++;
  if (!cond) failures.push(msg);
};
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const stepIdx = (id) => scenario.steps.findIndex((s) => s.step_id === id);

// ---------- 1. every file is simulated ----------
for (const f of scenario.files) ok(load(f).is_simulated === true, `${f}: is_simulated must be true`);

// ---------- 2. times carry +09:00, money is integer KRW ----------
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/;
function walk(node, path, file) {
  if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`, file));
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (/_krw$/.test(k) && v !== null) ok(Number.isInteger(v) && v >= 0, `${file} ${path}.${k}: KRW must be a non-negative integer (${v})`);
      walk(v, `${path}.${k}`, file);
    }
    return;
  }
  if (typeof node === "string" && ISO.test(node)) ok(/\+09:00$/.test(node), `${file} ${path}: time without +09:00 offset (${node})`);
}
for (const f of scenario.files) walk(load(f), "", f);

// ---------- 3. ISO 6346 check digits ----------
const LETTER = {};
{
  let v = 10;
  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (v % 11 === 0) v++;
    LETTER[ch] = v++;
  }
}
for (const c of containers) {
  const s = c.container_no;
  let total = 0;
  [...s.slice(0, 10)].forEach((ch, i) => (total += (/[A-Z]/.test(ch) ? LETTER[ch] : Number(ch)) * 2 ** i));
  ok(Number(s[10]) === (total % 11) % 10, `${c.id}: ISO 6346 check digit wrong (${s})`);
}
ok(containers.length === 30, `expected 30 containers, got ${containers.length}`);
ok(scenario.steps.every((s) => s.kpi.active_containers === containers.length), "KPI active_containers must equal container count");

// ---------- 4. cost arithmetic ----------
const checkLines = (lines, total, where) => {
  for (const l of lines) ok(l.amount_krw === l.qty * l.unit_krw, `${where} ${l.label}: amount ${l.amount_krw} != ${l.qty} × ${l.unit_krw}`);
  ok(sum(lines.map((l) => l.amount_krw)) === total, `${where}: line sum ${sum(lines.map((l) => l.amount_krw))} != ${total}`);
};
const base = plans.baseline;
for (const a of base.actions) {
  checkLines(a.cost_breakdown, a.cost_krw, `baseline ${a.container_id}`);
  ok(a.exposure_krw === a.cost_krw - a.normal_cost_krw, `baseline ${a.container_id}: exposure != cost − normal`);
}
ok(base.total_cost_krw === sum(base.actions.map((a) => a.cost_krw)), "baseline total != sum of actions");
ok(base.exposure_krw === base.total_cost_krw - base.normal_cost_krw, "baseline exposure != total − normal");

const exception = risk.exceptions[0];
for (const p of plans.plans) {
  const where = p.label;
  for (const a of p.actions) {
    checkLines(a.cost_breakdown, a.cost_krw, `${where} ${a.container_id}`);
    const b = base.actions.find((x) => x.container_id === a.container_id);
    ok(!!b && a.baseline_cost_krw === b.cost_krw, `${where} ${a.container_id}: baseline_cost_krw differs from baseline plan`);
    ok(a.saving_krw === a.baseline_cost_krw - a.cost_krw, `${where} ${a.container_id}: saving != baseline − cost`);
    ok(!!b && a.delivery_day === b.delivery_day, `${where} ${a.container_id}: delivery day differs from baseline`);
  }
  ok(p.plan_cost_krw === sum(p.actions.map((a) => a.cost_krw)), `${where}: plan cost != sum of actions`);
  ok(p.baseline_cost_krw === base.total_cost_krw, `${where}: baseline cost != baseline total`);
  ok(p.potential_saving_krw === p.baseline_cost_krw - p.plan_cost_krw, `${where}: saving != baseline − plan`);
  ok(p.residual_exposure_krw === p.plan_cost_krw - base.normal_cost_krw, `${where}: residual exposure != plan − normal`);
  ok(p.unchanged_direct.cost_krw === sum(p.unchanged_direct.actions.map((a) => a.cost_krw)), `${where}: direct cost mismatch`);
  if (p.previous) {
    const prev = plans.plans.find((x) => x.plan_id === p.previous.plan_id);
    ok(prev && prev.plan_cost_krw === p.previous.plan_cost_krw && prev.potential_saving_krw === p.previous.potential_saving_krw, `${where}: previous plan numbers mismatch`);
  }

  // ---------- 5. counts add up ----------
  const count = (route) => p.actions.filter((a) => a.route === route).length;
  ok(p.actions.length === exception.affected_count, `${where}: ${p.actions.length} actions but ${exception.affected_count} affected`);
  ok(sum(Object.values(p.recovery_action_summary_12)) === exception.affected_count, `${where}: recovery action summary != affected count`);
  ok(sum(Object.values(p.route_summary_20)) === exception.planned_today, `${where}: route summary != planned today`);
  ok(p.route_summary_20.WAREHOUSE_DIRECT === p.unchanged_direct.count, `${where}: direct count mismatch`);
  ok(p.unchanged_direct.count === exception.capacity_after, `${where}: direct count != warehouse capacity after`);
  for (const [route, n] of Object.entries(p.recovery_action_summary_12)) ok(count(route) === n, `${where}: summary ${route}=${n} but ${count(route)} actions`);
  ok(new Set([...p.actions.map((a) => a.container_id), ...p.unchanged_direct.container_ids]).size === exception.planned_today, `${where}: containers not covering the 20`);
  ok(exception.affected_container_ids.every((id) => p.actions.some((a) => a.container_id === id)), `${where}: affected ids vs actions differ`);

  // ---------- 6. capacity & equipment ----------
  const step = scenario.steps[stepIdx(p.generated_step)];
  const factAt = (tl, prefix) => {
    let v;
    for (const f of tl) if (stepIdx(f.from_step) <= step.index && f.key.startsWith(prefix)) v = f.value;
    return v;
  };
  for (const o of resources.odcys) {
    const cap = factAt(o.facts_timeline, "capacity.");
    const used = count(o.id);
    ok(used === p.capacity_usage[o.id].used, `${where}: ${o.id} usage field mismatch`);
    ok(used <= cap, `${where}: ${o.id} uses ${used} > capacity ${cap} at ${p.generated_step}`);
    for (const a of p.actions.filter((x) => x.route === o.id)) {
      const c = containers.find((x) => x.id === a.container_id);
      ok(o.accepts.includes(c.size_type), `${where}: ${a.container_id} ${c.size_type} not accepted by ${o.id}`);
    }
    const maxDays = factAt(o.facts_timeline, "max_days");
    if (maxDays) for (const a of p.actions.filter((x) => x.route === o.id)) {
      const days = a.cost_breakdown.find((l) => l.item === "ODCY_STORAGE").qty;
      ok(days <= maxDays, `${where}: ${a.container_id} stays ${days}d > max ${maxDays}d at ${o.id}`);
    }
  }
  const wh = resources.warehouses.find((w) => w.id === "WAREHOUSE_A");
  for (const d of p.capacity_usage.WAREHOUSE_A) {
    const cap = factAt(wh.facts_timeline, `capacity.day(${d.day})`);
    ok(d.capacity === cap && d.used <= cap, `${where}: WAREHOUSE_A ${d.day} used ${d.used} / cap ${d.capacity} (fact ${cap})`);
  }

  // ---------- 7. trucks ----------
  checkTrucks(p.truck_schedule, where, step);
}
checkTrucks(plans.original_plan.truck_schedule, "original plan", scenario.steps[0]);

function checkTrucks(schedule, where, step) {
  const own = resources.truck_pools.find((x) => x.id === "OWN_FLEET").trucks;
  const seen = new Map();
  for (const r of schedule) {
    const key = `${r.truck_id}@${r.hour}`;
    ok(!seen.has(key) || seen.get(key) === r.container_id, `${where}: ${key} double-booked (${seen.get(key)} and ${r.container_id})`);
    seen.set(key, r.container_id);
    if (r.truck_id.startsWith("K-")) {
      const pool = resources.truck_pools.find((x) => x.id === "K_TRUCKING");
      const offer = pool.facts_timeline.find((f) => f.truck_ids.includes(r.truck_id));
      ok(!!offer && stepIdx(offer.from_step) <= step.index, `${where}: ${r.truck_id} used before the carrier reply`);
      ok(!!offer && Number(offer.key.match(/T(\d{2}):/)[1]) === r.hour, `${where}: ${r.truck_id} used outside its offered hour`);
      continue;
    }
    const t = own.find((x) => x.id === r.truck_id);
    ok(!!t, `${where}: unknown truck ${r.truck_id}`);
    if (t) ok(Number(t.window.from.slice(0, 2)) <= r.hour && r.hour < Number(t.window.to.slice(0, 2)), `${where}: ${r.truck_id} at ${r.hour}:00 outside window ${t.window.from}-${t.window.to}`);
  }
  const wA = resources.warehouses.find((w) => w.id === "WAREHOUSE_A");
  for (const r of schedule.filter((x) => x.leg === "TERMINAL_T1→WAREHOUSE_A")) ok(r.hour <= Number(wA.last_departure_for_same_day.slice(0, 2)), `${where}: ${r.container_id} departs ${r.hour}:00 after WH A same-day cutoff`);
}

// ---------- 8. risk & KPI ----------
for (const [id, st] of Object.entries(risk.states)) {
  for (const g of ["CRITICAL", "HIGH", "WATCH", "LOW"]) ok(st.by_grade[g] === st.assessments.filter((a) => a.grade === g).length, `${id}: by_grade.${g} mismatch`);
  ok(st.assessments.length === containers.length, `${id}: assessments must cover all containers`);
  ok(st.exposure_krw === sum(st.assessments.map((a) => a.exposure_krw)), `${id}: exposure sum mismatch`);
  ok(st.residual_exposure_krw === sum(st.assessments.map((a) => a.residual_exposure_krw)), `${id}: residual sum mismatch`);
  ok(st.affected_count === st.assessments.filter((a) => a.impact === "AFFECTED").length, `${id}: affected count mismatch`);
}
ok(risk.states.RS1.exposure_krw === base.exposure_krw, "RS1 exposure must equal baseline exposure");
for (const s of scenario.steps) {
  const st = risk.states[s.risk_state];
  const k = s.kpi;
  ok(k.critical_count === st.by_grade.CRITICAL && k.high_count === st.by_grade.HIGH, `${s.step_id}: KPI risk counts != risk state`);
  ok(k.current_exposure_krw === st.exposure_krw, `${s.step_id}: KPI exposure != risk state exposure`);
  ok(k.affected_count === st.affected_count, `${s.step_id}: KPI affected != risk state`);
  const plan = plans.plans.find((p) => p.plan_id === s.current_plan_id);
  ok((plan?.potential_saving_krw ?? null) === k.recoverable_exposure_krw, `${s.step_id}: recoverable != current plan saving`);
  const pending = verifications.requests.filter((r) => stepIdx(r.created_step) <= s.index && (r.closed_step === null || stepIdx(r.closed_step) > s.index)).length;
  ok(pending === k.verification_pending, `${s.step_id}: verification_pending ${k.verification_pending} != ${pending}`);
  const whFacts = resources.warehouses.find((w) => w.id === "WAREHOUSE_A").facts_timeline.filter((f) => f.key === `capacity.day(${scenario.days.D0})` && stepIdx(f.from_step) <= s.index);
  ok(whFacts.at(-1).value === k.warehouse.capacity_today, `${s.step_id}: KPI warehouse capacity != fact`);
  if (st.affected_count > 0) ok(k.warehouse.planned_today - k.warehouse.capacity_today === st.affected_count, `${s.step_id}: planned − capacity != affected`);
}

// ---------- 9. references ----------
const eventIds = new Set(events.events.map((e) => e.event_id));
for (const p of plans.plans) for (const i of p.provisional_inputs) ok(eventIds.has(i.event_id), `${p.label}: provisional input ${i.ref} → unknown event ${i.event_id}`);
for (const th of comms.threads) for (const m of th.messages) for (const e of m.extraction?.event_ids ?? []) ok(eventIds.has(e), `${m.message_id}: unknown event ${e}`);
for (const item of activity.items) ok(stepIdx(item.step_id) >= 0, `activity "${item.text}": unknown step`);
const rates = resources.rates;
for (const key of ["demurrage_per_day", "terminal_storage_per_day", "transport", "detention"]) ok(rates[key].tag === "[ASSUMPTION]", `rates.${key} must be tagged [ASSUMPTION]`);

// ---------- 10. forbidden claims (docs/01_project-rules.md 4절, brief 7절) ----------
const FORBIDDEN = [/AI가\s*(D&D|비용|최적)/, /Solver가\s*계산/, /최적화했다/, /디지털\s*트윈이다/, /실시간\s*추적한다/, /D&D가\s*(제거|사라진)/, /자동\s*예약한다/];
const files = [...scenario.files.map((f) => join(dir, f)), ...listFiles(join(repo, "front", "web", "src"))];
for (const f of files) {
  const text = readFileSync(f, "utf8");
  for (const re of FORBIDDEN) ok(!re.test(text), `${relative(repo, f)}: forbidden claim ${re}`);
}
function listFiles(d) {
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? listFiles(p) : /\.(tsx?|css)$/.test(n) ? [p] : [];
  });
}

// ---------- report ----------
if (failures.length) {
  console.error(`validate:scenario FAILED — ${failures.length} of ${checks} checks`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
const v1 = plans.plans[0];
const v2 = plans.plans[1];
console.log(`validate:scenario OK — ${checks} checks`);
console.log(`  containers ${containers.length} · affected ${exception.affected_count} · WH A ${exception.capacity_before} → ${exception.capacity_after}`);
console.log(`  baseline ${base.total_cost_krw} · ${v1.label} ${v1.plan_cost_krw} (saving ${v1.potential_saving_krw}) · ${v2.label} ${v2.plan_cost_krw} (saving ${v2.potential_saving_krw})`);
