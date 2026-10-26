import { describe, expect, it } from "vitest";
import {
  FACT_STATE_LABEL,
  FRESHNESS_LABEL,
  GENERATED_BY_LABEL,
  REVOKE_REASON_OPTIONS,
  ROLE_LABEL,
  VALUE_STATUS_LABEL,
  blockedReasonLabel,
  factErrorText,
  factTitle,
  formatValue,
  formatWindow,
  isActionable,
} from "./factLabels";

describe("fact labels", () => {
  it("a provisional fact never reads as confirmed", () => {
    expect(FACT_STATE_LABEL.PROVISIONAL).toBe("임시 사실(검증됨 · 사람 확인 전)");
    expect(FACT_STATE_LABEL.CONFIRMED).toBe("사람 확인 완료");
    expect(FACT_STATE_LABEL.OBSERVED).toContain("사람 확인 아님");
  });

  it("a replay is not an LLM result", () => {
    expect(GENERATED_BY_LABEL.RECORDED_REPLAY).toBe("녹화 재생(AI 미실행)");
    expect(GENERATED_BY_LABEL.LLM).toBe("AI(LLM)");
    expect(GENERATED_BY_LABEL.HUMAN).toBe("사람 입력");
  });

  it("turns fact keys into plain Korean and falls back to the raw key", () => {
    expect(factTitle("available.slot(2026-12-01T15:00-17:00)")).toBe("차량 가용 · 2026-12-01 15:00–17:00");
    expect(factTitle("capacity.day(2026-12-01)")).toBe("일별 수용량 · 2026-12-01");
    expect(factTitle("something.else(1)")).toBe("something.else(1)");
  });

  it("formats values, windows, blocked reasons and errors", () => {
    expect(formatValue(4, "TRUCK")).toBe("4대");
    expect(formatValue(null, null)).toBe("값 없음");
    expect(formatWindow("2026-12-01T15:00:00+09:00", "2026-12-01T17:00:00+09:00")).toBe("2026-12-01 15:00–17:00");
    expect(blockedReasonLabel("AMBIGUOUS_REPLY")).toBe("모호한 표현");
    expect(blockedReasonLabel("NEW_CODE")).toBe("NEW_CODE");
    expect(factErrorText("VALUE_UNCHANGED", "x")).toContain("같습니다");
    expect(factErrorText("OTHER", "msg")).toBe("OTHER — msg");
  });

  it("superseded, rejected and withdrawn values have no actions", () => {
    expect(isActionable({ role: "WINNER" } as never)).toBe(true);
    expect(isActionable({ role: "SUPERSEDED" } as never)).toBe(false);
    expect(isActionable({ role: "REJECTED" } as never)).toBe(false);
    expect(isActionable({ role: "REVOKED" } as never)).toBe(false);
  });

  it("stale is old, not wrong; revoked has no current value", () => {
    expect(FACT_STATE_LABEL.STALE).toBe("오래됨 — 다시 확인 필요(틀린 것은 아님)");
    expect(FACT_STATE_LABEL.REVOKED).toBe("철회됨 — 지금 값 없음");
    expect(ROLE_LABEL.REVOKED).toBe("철회됨");
    expect(FRESHNESS_LABEL).toEqual({ FRESH: "신선", AGING: "오래되는 중(주의)", STALE: "오래됨", EXPIRED: "유효 시간 지남", UNKNOWN: "신선도 기준 없음" });
    expect(VALUE_STATUS_LABEL.CONFIRMED).toBe("사람 확인 완료");
  });

  it("revoke reasons and new errors are in plain Korean", () => {
    expect(REVOKE_REASON_OPTIONS.map((o) => o.label)).toEqual(["상대가 말을 거둠", "운영자가 무효화", "상황이 바뀌어 더는 유효하지 않음"]);
    expect(factErrorText("EVENT_REVOKED", "x")).toContain("이미 철회된 기록");
    expect(factErrorText("TARGET_NOT_FOUND", "x")).toContain("찾지 못했습니다");
    expect(factErrorText("TARGET_NOT_SUPPORTED", "x")).toContain("직접 입력할 수 없습니다");
    expect(factErrorText("SCENARIO_NOT_FOUND", "x")).toContain("시나리오를 찾지 못했습니다");
  });
});
