import { describe, expect, it } from "vitest";
import type { Plan, PlanItem } from "@/api/plans";
import { actionCounts, alternatives, costLines, nameMap, reasonLabel, resourceLabel } from "./planLabels";

const W = "01a0fb92-9b66-7544-aeb3-216d6e00eef3";
const O = "01a0fb92-9b66-7544-aeb3-28ca5dc2afa8";
const item = (over: Partial<PlanItem> = {}): PlanItem =>
  ({
    container_id: "C002",
    action: "MOVE_TO_ODCY",
    target_id: O,
    target_name: "ODCY A",
    destination_id: W,
    delivery_day: "2026-10-14",
    scheduled_time: "2026-10-13T15:00:00+09:00",
    truck_id: "TRUCK-03",
    base_cost_krw: 305000,
    risk_penalty_krw: 50000,
    total_krw: 355000,
    baseline_total_krw: 485000,
    reason_codes: ["CHEAPER_OPTION_BLOCKED:CAPACITY_FULL:WAREHOUSE_DAY:" + W + ":2026-10-13", "NO_DEMURRAGE"],
    detail: {
      cost: {
        lines: [
          { label: "운송 터미널→ODCY A", amount_krw: 85000, qty: 1, unit_krw: 85000, item: "transport", status: "CALCULATED", assumption: "[ASSUMPTION] 시나리오 요율", source_ref: "x" },
          { label: "Detention", amount_krw: 0, qty: 0, unit_krw: null, item: "detention", status: "CALCULATED", assumption: "무료", source_ref: "y" },
          { label: "ODCY 핸들링", amount_krw: 0, qty: 1, unit_krw: null, item: "handling", status: "NOT_AVAILABLE", assumption: "요율 없음", source_ref: "z" },
        ],
      },
      alternatives: [{ action: "KEEP_CURRENT_PLAN", target_id: W, delivery_day: "2026-10-13", total: 190000, difference: -165000, blocked_by: ["CAPACITY_FULL:WAREHOUSE_DAY:" + W + ":2026-10-13"] }],
    },
    ...over,
  }) as PlanItem;

describe("plan labels (T-114) — names what the engine reported, never computes money", () => {
  const names = new Map([[W, "창고 A"], [O, "ODCY A"]]);

  it("explains why a cheaper option was not chosen, by the resource that was full", () => {
    expect(reasonLabel(`CHEAPER_OPTION_BLOCKED:CAPACITY_FULL:WAREHOUSE_DAY:${W}:2026-10-13`, names)).toBe("더 싼 선택지가 막힘 — 창고 A 10-13 입고 용량이 다른 컨테이너에 쓰임");
    expect(reasonLabel("CHEAPER_OPTION_BLOCKED:TRUCKS_BUSY", names)).toContain("트럭");
    expect(reasonLabel("LOWEST_COST_OPTION", names)).toBe("이 컨테이너에서 가장 싼 선택지");
    expect(reasonLabel("SOMETHING_NEW", names)).toBe("SOMETHING_NEW"); // unknown codes are shown as they are
    expect(resourceLabel(`ODCY:${O}:40DRY`, names)).toBe("ODCY A 40DRY 용량");
  });

  it("cost lines are the engine's lines (zero lines hidden unless not available), alternatives keep their engine totals", () => {
    const lines = costLines(item());
    expect(lines.map((l) => l.label)).toEqual(["운송 터미널→ODCY A", "ODCY 핸들링"]);
    expect(lines[1]).toMatchObject({ status: "NOT_AVAILABLE" });
    expect(alternatives(item(), names)).toEqual([{ action: "원래 계획대로 직송", target: "창고 A", day: "2026-10-13", total: 190000, difference: -165000, blockedBy: ["창고 A 10-13 입고 용량 가득"] }]);
  });

  it("counts containers per action and maps ids to names from the plan itself", () => {
    expect(actionCounts([item(), item({ container_id: "C001", action: "KEEP_CURRENT_PLAN" }), item({ container_id: "C003", action: "MOVE_TO_ODCY" })])).toEqual([
      { action: "KEEP_CURRENT_PLAN", label: "원래 계획대로 직송", count: 1 },
      { action: "MOVE_TO_ODCY", label: "ODCY 경유", count: 2 },
    ]);
    const plan = { facts: [{ subject_id: W, subject_name: "창고 A" }], items: [item()] } as unknown as Plan;
    expect(nameMap(plan).get(W)).toBe("창고 A");
    expect(nameMap(plan).get(O)).toBe("ODCY A");
  });
});
