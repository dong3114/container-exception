import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FactCoordinate } from "@/api/truth";
import { ManualFactForm } from "./ManualFactForm";
import { type ManualForm, buildManualFact, manualTargets } from "./manualEntry";

const POOL = "01a11040-0000-7000-8000-0000000000p1";
const form = (over: Partial<ManualForm> = {}): ManualForm => ({
  kind: "TRUCK_SLOT",
  targetId: POOL,
  date: "2026-12-01",
  windowFrom: "15:00",
  windowTo: "17:00",
  sizeType: "",
  value: "3",
  sourceNote: "배차 담당자와 통화",
  observedAt: "",
  ...over,
});
const REAL = { isSimulated: false, scenarioId: null };

describe("operator direct entry — form to request", () => {
  it("builds a truck slot entry with its window and no scenario on a real run", () => {
    expect(buildManualFact(form({ observedAt: "2026-12-01T09:30" }), REAL)).toEqual({
      body: { kind: "TRUCK_SLOT", target_id: POOL, date: "2026-12-01", window_from: "15:00", window_to: "17:00", value: 3, source_note: "배차 담당자와 통화", observed_at: "2026-12-01T09:30:00+09:00" },
    });
  });

  it("a simulated run passes its scenario, and refuses when the scenario is unknown", () => {
    expect(buildManualFact(form(), { isSimulated: true, scenarioId: "s1" })).toMatchObject({ body: { scenario_id: "s1" } });
    expect(buildManualFact(form(), { isSimulated: true, scenarioId: null })).toEqual({ problem: "시뮬레이션 계획의 시나리오를 알 수 없어 입력할 수 없습니다" });
  });

  it("capacity has no window; size type only when given", () => {
    const res = buildManualFact(form({ kind: "FACILITY_CAPACITY", sizeType: " 40DRY " }), REAL);
    expect(res).toMatchObject({ body: { kind: "FACILITY_CAPACITY", size_type: "40DRY" } });
    expect("body" in res && "window_from" in res.body).toBe(false);
  });

  it("names the first problem in Korean", () => {
    expect(buildManualFact(form({ targetId: "" }), REAL)).toEqual({ problem: "대상을 고르세요" });
    expect(buildManualFact(form({ value: "1.5" }), REAL)).toEqual({ problem: "값은 0 이상 999999 이하의 정수입니다" });
    expect(buildManualFact(form({ sourceNote: "  " }), REAL)).toEqual({ problem: "어디서 확인했는지(전화 · 방문 등) 적어 주세요" });
    expect(buildManualFact(form({ windowFrom: "17:00", windowTo: "15:00" }), REAL)).toEqual({ problem: "시간창 시작이 끝보다 앞서야 합니다" });
  });

  it("targets: truck pools from the judged facts, warehouses and ODCYs from the registry", () => {
    const facts = [
      { entity_type: "TRUCK_POOL", entity_id: POOL, entity_name: "가나다운송 풀" },
      { entity_type: "TRUCK_POOL", entity_id: POOL, entity_name: "가나다운송 풀" },
      { entity_type: "FACILITY", entity_id: "f9", entity_name: "x" },
    ] as FactCoordinate[];
    expect(manualTargets("TRUCK_SLOT", facts, [])).toEqual([{ id: POOL, label: "가나다운송 풀", isOdcy: false }]);
    const facilities = [
      { facility_id: "w1", facility_type: "WAREHOUSE" as const, facility_name: "부산창고", area: null, operator_counterparty_id: null },
      { facility_id: "t1", facility_type: "TERMINAL" as const, facility_name: "터미널", area: null, operator_counterparty_id: null },
      { facility_id: "o1", facility_type: "ODCY" as const, facility_name: "감만ODCY", area: null, operator_counterparty_id: null },
    ];
    expect(manualTargets("FACILITY_CAPACITY", facts, facilities)).toEqual([
      { id: "w1", label: "부산창고 (창고)", isOdcy: false },
      { id: "o1", label: "감만ODCY (ODCY)", isOdcy: true },
    ]);
  });

  it("the form cannot be sent without an acting operator", () => {
    const html = renderToStaticMarkup(<ManualFactForm facts={[]} actorId={null} isSimulated scenarioId="s1" onEntered={() => undefined} />);
    expect(html).toContain("직접 입력(전화 · 방문으로 확인한 사실)");
    expect(html).toMatch(/disabled="" data-testid="manual-submit"/);
    expect(html).toContain("입력할 담당자를 불러오지 못해");
    expect(html).toContain("시뮬레이션 계획의 값으로 기록됩니다");
  });
});
