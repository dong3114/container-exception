import { describe, expect, it } from "vitest";
import { candidateState, mainPathIndex, visibleMessageState } from "./lifecycle";

describe("visible message state (docs/19 15.1)", () => {
  it("maps canonical statuses to what the operator sees", () => {
    expect(visibleMessageState({ status: "DRAFTED" })).toBe("DRAFTING");
    expect(visibleMessageState({ status: "DRAFTED", numberCheckFailed: true })).toBe("NEEDS_FIX");
    expect(visibleMessageState({ status: "PENDING_APPROVAL" })).toBe("NEEDS_APPROVAL");
    expect(visibleMessageState({ status: "APPROVED" })).toBe("WAITING_TO_SEND");
    expect(visibleMessageState({ status: "QUEUED" })).toBe("WAITING_TO_SEND");
    expect(visibleMessageState({ status: "QUEUED", attemptInProgress: true })).toBe("SENDING");
    expect(visibleMessageState({ status: "SENT" })).toBe("SENT");
    expect(visibleMessageState({ status: "REPLIED" })).toBe("REPLIED");
    expect(visibleMessageState({ status: "DELIVERY_FAILED" })).toBe("SEND_FAILED");
    expect(visibleMessageState({ status: "REJECTED" })).toBe("CANCELLED");
  });

  it("an invalidated approval (content or plan changed) means cancelled — a new approval is needed", () => {
    expect(visibleMessageState({ status: "QUEUED", invalidation: "CONTENT_CHANGED" })).toBe("CANCELLED");
    expect(visibleMessageState({ status: "APPROVED", invalidation: "PLAN_SUPERSEDED" })).toBe("CANCELLED");
  });

  it("a failed send is flagged on the sending step", () => {
    expect(mainPathIndex("SEND_FAILED")).toBe(mainPathIndex("SENDING"));
    expect(mainPathIndex("CANCELLED")).toBe(-1);
  });
});

describe("candidate vs confirmed (ADR-029: LLM output is a candidate)", () => {
  it("only a real LLM extraction is labelled AI", () => {
    expect(candidateState({ method: "LLM_EXTRACTED", reviewStatus: "PENDING" })).toBe("AI_SUGGESTION");
    expect(candidateState({ method: "SIMULATED — 시나리오 작성값 (LLM 미실행)", valueStatus: "PROVISIONAL" })).toBe("PROVISIONAL");
    expect(candidateState({ method: "RULE_PARSED", reviewStatus: "PENDING" })).toBe("NEEDS_HUMAN_REVIEW");
  });

  it("human acceptance or a confirmed value is confirmed; rejected stays rejected", () => {
    expect(candidateState({ method: "LLM_EXTRACTED", reviewStatus: "ACCEPTED" })).toBe("HUMAN_CONFIRMED");
    expect(candidateState({ method: "DIRECT", valueStatus: "CONFIRMED" })).toBe("HUMAN_CONFIRMED");
    expect(candidateState({ method: "LLM_EXTRACTED", reviewStatus: "REJECTED" })).toBe("REJECTED");
  });
});
