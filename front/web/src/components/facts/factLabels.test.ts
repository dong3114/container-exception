import { describe, expect, it } from "vitest";
import { FACT_STATE_LABEL, GENERATED_BY_LABEL, blockedReasonLabel, factErrorText, factTitle, formatValue, formatWindow, isActionable } from "./factLabels";

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

  it("superseded and rejected values have no actions", () => {
    expect(isActionable({ role: "WINNER" } as never)).toBe(true);
    expect(isActionable({ role: "SUPERSEDED" } as never)).toBe(false);
    expect(isActionable({ role: "REJECTED" } as never)).toBe(false);
  });
});
