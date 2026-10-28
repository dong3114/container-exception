#!/usr/bin/env node
/**
 * Browser smoke test for the Control Tower prototype.
 * Drives a real browser (installed Microsoft Edge or Chrome via playwright-core, no browser download)
 * through every playback step and checks what is on screen against scenario.json.
 *
 * Usage: start the app (npm run build && npm run start), then `npm run smoke`.
 * Env: SMOKE_URL (default http://localhost:3000), SMOKE_CHANNEL (msedge | chrome), SMOKE_OUT (screenshot dir, default front/web/.smoke)
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const scenarioDir = join(here, "..", "..", "..", "data", "scenarios", "busan-wh-capacity-01"); // front/web/scripts → repo root
const scenario = JSON.parse(readFileSync(join(scenarioDir, "scenario.json"), "utf8"));
const plans = JSON.parse(readFileSync(join(scenarioDir, "plans.json"), "utf8"));
const url = process.env.SMOKE_URL ?? "http://localhost:3000/prototype"; // 옛 Mock 재생 화면(T-120 뒤 / 는 운영 콘솔)
const out = process.env.SMOKE_OUT ?? join(here, "..", ".smoke");
mkdirSync(out, { recursive: true });

const won = (n) => `${n.toLocaleString("ko-KR")}원`;
const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
  console.log(`${cond ? "  ✓" : "  ✗"} ${msg}`);
};

const browser = await chromium.launch({ channel: process.env.SMOKE_CHANNEL ?? "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));

await page.goto(url, { waitUntil: "networkidle" });
await page.getByTestId("narrative").waitFor();

const text = async (id) => (await page.getByTestId(id).innerText()).replace(/\s+/g, " ").trim();

for (const step of scenario.steps) {
  if (step.index > 0) await page.getByTestId("btn-next").click();
  await page.waitForFunction((t) => document.querySelector('[data-testid="narrative"]')?.textContent?.includes(t), step.title);
  console.log(`\n[${step.step_id}] ${step.title}`);
  const k = step.kpi;
  check((await text("clock")).includes(step.as_of.slice(11, 19)), `clock shows ${step.as_of.slice(11, 19)}`);
  check((await text("kpi-critical")).includes(String(k.critical_count)), `Critical = ${k.critical_count}`);
  check((await text("kpi-high")).includes(String(k.high_count)), `High = ${k.high_count}`);
  check((await text("kpi-exposure")).includes(won(k.current_exposure_krw)), `Current Exposure = ${won(k.current_exposure_krw)}`);
  check((await text("kpi-recoverable")).includes(k.recoverable_exposure_krw == null ? "—" : won(k.recoverable_exposure_krw)), `Recoverable = ${k.recoverable_exposure_krw ?? "—"}`);
  check((await text("kpi-warehouse")).includes(`${k.warehouse.capacity_today} / 정상 ${k.warehouse.normal_capacity}`), `WH A capacity ${k.warehouse.capacity_today}/${k.warehouse.normal_capacity}`);

  const affectedCells = await page.locator('[data-testid^="cell-"][data-route="BLOCKED"]').count();
  const blockedRoute = await page.getByTestId("blocked-route").count();
  if (step.step_id === "S0") {
    check((await text("exception-panel")).includes("활성 예외 없음"), "no active exception");
    check(affectedCells === 0 && blockedRoute === 0, "no blocked route");
  }
  if (step.step_id === "S1") {
    check((await text("exc-affected")).includes("12대"), "exception shows Affected 12");
    check((await text("exc-capacity")) === "8", "exception shows capacity 8");
    check(affectedCells === 12, `12 containers drawn as blocked (got ${affectedCells})`);
    check(blockedRoute === 1, "blocked route drawn");
    check((await text("recovery-console")).includes(won(plans.baseline.total_cost_krw)), "baseline cost shown before plan");
  }
  const plan = plans.plans.find((p) => p.plan_id === step.current_plan_id);
  if (plan) {
    check((await text("plan-cost")).includes(won(plan.plan_cost_krw)), `${plan.label} cost ${won(plan.plan_cost_krw)}`);
    check((await text("potential-saving")).includes(won(plan.potential_saving_krw)), `${plan.label} saving ${won(plan.potential_saving_krw)}`);
    check((await page.locator('[data-testid^="action-C"]').count()) === 12, "12 recovery action rows");
    const summary = await text("action-summary");
    check(summary.includes("= 12대"), `action summary sums to 12 (${summary})`);
    for (const [route, n] of Object.entries(plan.recovery_action_summary_12)) {
      const drawn = await page.locator(`[data-testid^="cell-"][data-route="${route}"]`).count();
      check(drawn === n, `map: ${route} cells = ${n} (got ${drawn})`);
    }
    const status = await text("plan-status");
    check(status.includes(plan.label), `plan badge shows ${plan.label} (${status})`);
  }
  if (step.step_id === "S5") check((await page.getByTestId("input-changed").count()) === 1, "v1 flagged: input changed, re-plan needed");
  if (step.step_id === "S7") {
    check((await text("change-summary")).includes("C007"), "v2 change summary mentions C007");
    check((await page.locator('[data-testid="action-C007"].changed').count()) === 1, "C007 row highlighted as changed");
  }
  const newItems = await page.locator('[data-testid="activity-item"].new').count();
  check(newItems > 0, `timeline has new items (${newItems})`);
  await page.screenshot({ path: join(out, `${step.step_id}.png`), fullPage: false });
  await page.screenshot({ path: join(out, `${step.step_id}-full.png`), fullPage: true });
}

// drawer: C007 at the final step (v2 approved)
await page.getByTestId("row-C007").click();
await page.getByTestId("container-drawer").waitFor();
const drawer = await text("container-drawer");
check(drawer.includes("ODCY B") && drawer.includes("이전 계획: ODCY A 경유"), "C007 drawer explains ODCY A → ODCY B");
check(drawer.includes("합계"), "C007 drawer shows cost breakdown");
await page.screenshot({ path: join(out, "drawer-C007.png") });
await page.keyboard.press("Escape");

// drawer: C003 location with unknown freshness (T-060)
await page.getByTestId("row-C003").click();
const d3 = await text("container-drawer");
check(d3.includes("시각 모름") && d3.includes("RECEIVED_ONLY"), "C003 location shows freshness UNKNOWN (RECEIVED_ONLY), not STALE");
await page.keyboard.press("Escape");

// reset + play
await page.getByTestId("btn-reset").click();
await page.waitForFunction((t) => document.querySelector('[data-testid="narrative"]')?.textContent?.includes(t), scenario.steps[0].title);
check(true, "reset returns to step 1");
await page.getByTestId("btn-play").click();
await page.waitForFunction((t) => document.querySelector('[data-testid="narrative"]')?.textContent?.includes(t), scenario.steps[1].title, { timeout: 8000 });
check(true, "play advances automatically");
await page.getByTestId("btn-play").click();

await page.screenshot({ path: join(out, "full-S1.png"), fullPage: true });
check(consoleErrors.length === 0, `no browser console errors${consoleErrors.length ? `: ${consoleErrors.join(" | ")}` : ""}`);
await browser.close();

console.log(`\nscreenshots: ${out}`);
if (failures.length) {
  console.error(`smoke FAILED — ${failures.length} checks`);
  process.exit(1);
}
console.log("smoke OK");
