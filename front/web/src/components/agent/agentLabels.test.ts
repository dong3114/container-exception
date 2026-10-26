import { describe, expect, it } from "vitest";
import type { AgentRun } from "@/api/agentRuns";
import { gapStateLabel, milestones, nodeLabel, resultLabel, summaryRows, waitingLabel } from "./agentLabels";

const run = (steps: AgentRun["steps"], extra: Partial<AgentRun> = {}): AgentRun => ({
  agent_run_id: "r",
  recovery_run_id: "p",
  goal: "g",
  status: "WAITING_HUMAN",
  current_node: null,
  waiting_reason: null,
  pending_ref: null,
  last_error_code: null,
  started_at: "2026-10-22T10:00:00+09:00",
  finished_at: null,
  updated_at: null,
  runtime_attempts: 0,
  next_attempt_at: null,
  result_summary: null,
  is_simulated: true,
  steps,
  tool_calls: [],
  ...extra,
});
const node = (seq: number, n: string, detail: string | null = null) => ({ seq, kind: "NODE" as const, node: n, outcome: "SUCCEEDED", detail_code: detail, started_at: "2026-10-22T10:00:00+09:00" });

describe("agent progress labels", () => {
  it("milestones follow only the recorded steps", () => {
    const waitingSend = run([node(1, "request_approval"), node(2, "wait_for_human"), node(3, "track_message", "AWAIT_SEND_REQUEST")]);
    expect(milestones(waitingSend).filter((m) => m.done).map((m) => m.key)).toEqual(["draft", "approved"]);
    const done = run([node(1, "request_approval"), node(2, "track_message", "AWAIT_REPLY"), node(3, "track_message", "REPLY_READY"), node(4, "read_reply"), node(5, "reassess_gaps"), { ...node(6, "x"), kind: "TERMINAL", node: null, detail_code: "CANDIDATE_RECEIVED_PENDING_CONFIRMATION" }], { status: "COMPLETED" });
    expect(milestones(done).every((m) => m.done)).toBe(true);
  });

  it("explains waits and results without claiming facts", () => {
    expect(waitingLabel("AWAITING_SEND_REQUEST")).toContain("Agent 는 보내지 않습니다");
    expect(resultLabel("CANDIDATE_RECEIVED_PENDING_CONFIRMATION")).toContain("아직 확정 사실이 아닙니다");
    expect(resultLabel("CANDIDATE_RECEIVED_PENDING_CONFIRMATION")).toContain("자동으로 사실이 되기에는");
    expect(waitingLabel("AWAITING_FACT_VERIFICATION")).toContain("확인·거절·정정");
    expect(resultLabel("FACT_CONFIRMED")).toContain("사람이 확인한");
    expect(resultLabel("FACT_AWAITING_CONFIRMATION")).toContain("아직 확정 아님");
    expect(nodeLabel("wait_fact_verification")).toContain("사람 확인");
    expect(waitingLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW"); // unknown codes are shown, not guessed
  });

  it("summary rows show workflow vs business state and no unknown keys", () => {
    const rows = summaryRows({ candidate_state: "CANDIDATE_RECEIVED", business_gap_state: "ASKED", facts_confirmed: false, candidate_fields: ["quantity"], message_id: "m", public_data_mode: "LIVE" });
    expect(rows).toEqual([
      { label: "후보 상태(작업 흐름)", value: "CANDIDATE_RECEIVED" },
      { label: "업무 공백 상태(사실 기준)", value: "ASKED" },
      { label: "후보가 온 항목", value: "quantity" },
      { label: "확정된 사실", value: "아니오 — 아직 사람이 확인하지 않음" },
      { label: "공공데이터 출처", value: "LIVE" },
    ]);
  });

  it("a value that went stale or was withdrawn while waiting asks for a new run", () => {
    expect(resultLabel("FACT_NEEDS_REFRESH")).toContain("새 실행으로 다시 물어보세요");
    expect(gapStateLabel("NEEDS_REFRESH")).toContain("다시 확인 필요");
    expect(gapStateLabel("ASKED")).toBe("ASKED");
    expect(summaryRows({ business_gap_state: "NEEDS_REFRESH" })).toEqual([{ label: "업무 공백 상태(사실 기준)", value: "NEEDS_REFRESH (값이 오래됐거나 철회됨 — 다시 확인 필요)" }]);
  });

  it("fact summary rows: provisional fact ids and an accepted candidate", () => {
    const rows = summaryRows({ candidate_state: "CANDIDATE_ACCEPTED", fact_event_ids: ["01a11040-0000-7000-8000-0000000000e1"], facts_confirmed: true });
    expect(rows).toEqual([
      { label: "후보 상태(작업 흐름)", value: "CANDIDATE_ACCEPTED (임시 사실로 올라감)" },
      { label: "임시 사실 기록", value: "01a11040" },
      { label: "확정된 사실", value: "예 — 사람이 확인함" },
    ]);
  });
});
