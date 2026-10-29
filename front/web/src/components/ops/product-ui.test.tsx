import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AgentRun } from "@/api/agentRuns";
import type { ImportReport } from "@/api/ops";
import type { SystemStatus } from "@/api/systemStatus";
import { PortfolioIntro } from "@/app/PortfolioDemo";
import { ExtractionView } from "@/components/drafts/ExtractionView";
import { Callout, EmptyState, MetricCard } from "@/components/ui/primitives";
import { ActionRequired } from "./ActionRequired";
import { AgentMilestones, AgentStatus, AgentWorkLog } from "./AgentStatus";
import { GapTable } from "./GapTable";
import { ImportResult } from "./OperationalInput";
import { RecoveryHeader } from "./RecoveryHeader";
import { HealthCard } from "./SystemHealth";
import { TRUTH_SHORT, truthShort } from "./opsLabels";
import { type ActionItem, type RunRow, agentWorkLog, deriveActions, outdatedValueChange } from "./opsModel";
import { coreLines } from "./systemStatusText";

/** 1차 제품 UI — 처음 보는 사람이 "무슨 문제 · 무엇을 할지 · CERA 가 무엇을 하는지"를 읽을 수 있는가. 값은 늘 Backend 값 그대로 */
const RUN = "0190aaaa-0000-7000-8000-00000000c0de";

function row(over: Partial<RunRow["run"]> = {}): RunRow {
  return {
    run: {
      run_id: RUN,
      trigger_ref: "자동 탐지 — 창고 A",
      executed_at: "2026-10-28T09:12:00.000+09:00",
      contains_simulated: false,
      scenario_id: null,
      source: "AUTO_DETECTED",
      exception: { exception_id: "e1", status: "ACTIVE", basis: "CONFIRMED", facility_id: "f", facility_name: "창고 A", window_day: "2026-10-28", scheduled_demand: 20, capacity: 8, shortage: 12 },
      ...over,
    },
    agent: null,
    plan: null,
  };
}

function agent(over: Partial<AgentRun> = {}): AgentRun {
  return {
    agent_run_id: "a1",
    recovery_run_id: RUN,
    goal: "g",
    status: "WAITING_HUMAN",
    current_node: "wait_contact",
    waiting_reason: "CONTACT_SELECTION_REQUIRED",
    pending_ref: null,
    last_error_code: null,
    started_at: "2026-10-28T09:20:00.000+09:00",
    finished_at: null,
    updated_at: null,
    runtime_attempts: 0,
    next_attempt_at: null,
    result_summary: null,
    is_simulated: false,
    parameters: { plan_recovery: true },
    steps: [
      { seq: 1, kind: "START", node: null, outcome: "OK", detail_code: null, started_at: "2026-10-28T09:20:00.000+09:00" },
      { seq: 2, kind: "NODE", node: "inspect_gaps", outcome: "OK", detail_code: null, started_at: "2026-10-28T09:20:01.000+09:00" },
      { seq: 3, kind: "NODE", node: "choose_next_action", outcome: "OK", detail_code: null, started_at: "2026-10-28T09:20:02.000+09:00" },
      { seq: 4, kind: "NODE", node: "prepare_inquiry", outcome: "OK", detail_code: null, started_at: "2026-10-28T09:20:03.000+09:00" },
      { seq: 5, kind: "INTERRUPT", node: "wait_contact", outcome: "OK", detail_code: "CONTACT_SELECTION_REQUIRED", started_at: "2026-10-28T09:20:04.000+09:00" },
    ],
    tool_calls: [],
    ...over,
  };
}

describe("dashboard metrics", () => {
  it("a metric shows only its current value — no invented comparison or trend", () => {
    const html = renderToStaticMarkup(<MetricCard label="진행 중 예외" value={2} hint="자동 탐지 · 해소 전" tone="warn" testId="kpi-active-exceptions" />);
    expect(html).toContain("진행 중 예외");
    expect(html).toContain(">2<");
    expect(html).not.toMatch(/전일|대비|%|▲|▼/);
  });
});

describe("action required", () => {
  it("each action says what kind of hand is needed, why, on what, since when and offers one button", () => {
    const actions = deriveActions({ rows: [row()], drafts: [], inbound: [] });
    expect(actions).toHaveLength(1);
    expect(actions[0]!.kind).toBe("START");
    expect(actions[0]!.at).toBe("2026-10-28T09:12:00.000+09:00");
    const html = renderToStaticMarkup(<ActionRequired actions={actions} runLabel={() => "실행 #00c0de"} onOpen={() => undefined} />);
    expect(html).toContain('data-testid="action-kind"');
    expect(html).toContain(">시작<");
    expect(html).toContain("복구 조사를 시작해 주세요");
    expect(html).toContain("영향 12대"); // 이유 = 예외 숫자(Backend)
    expect(html).toContain("발생 10-28 09:12");
    expect(html).toContain("Agent 시작");
    // 심각도는 Backend 에 없다 — 화면이 지어내지 않는다
    expect(html).not.toMatch(/Critical|High|긴급|심각/);
  });

  it("an agent waiting for a person becomes a [선택] action; no actions reads as a plain empty state", () => {
    const actions = deriveActions({ rows: [{ ...row(), agent: { ...agent(), pending_ref: null } }], drafts: [], inbound: [] });
    expect(actions[0]!.kind).toBe("SELECT");
    const empty = renderToStaticMarkup(<ActionRequired actions={[] as ActionItem[]} runLabel={() => ""} onOpen={() => undefined} />);
    expect(empty).toContain("지금 사람이 처리할 일이 없습니다.");
  });
});

describe("recovery run header", () => {
  it("always shows state, cause, facility, impact, source and start time in plain words", () => {
    const html = renderToStaticMarkup(<RecoveryHeader row={row()} actions={[]} />);
    for (const s of ["창고 A 수용량 부족 복구", "발생 원인", "창고 수용량 부족", "대상 시설", "영향 수량", "12대 (예정 20 / 가능 8)", "⚡ 자동 탐지", "10-28 09:12", "실제 실행"]) expect(html).toContain(s);
    expect(html).not.toContain("WAREHOUSE_CAPACITY_SHORTAGE");
  });

  it("a run without an exception (scenario) names the run instead of inventing a cause", () => {
    const html = renderToStaticMarkup(<RecoveryHeader row={row({ exception: null, source: "SCENARIO", trigger_ref: "시나리오 S1", contains_simulated: true })} actions={[]} />);
    expect(html).toContain("시나리오 S1");
    expect(html).toContain("시뮬레이션 실행(합성 데이터)");
  });
});

describe("agent UX", () => {
  it("says now · waiting · last · next in operator words, not graph node codes", () => {
    const html = renderToStaticMarkup(<AgentStatus run={agent()} />);
    for (const s of ["현재", "기다리는 것", "마지막 작업", "다음 예상", "연락할 담당자를 선택해야 합니다", "담당자를 고르면 그 사람에게 문의 초안을 만듭니다"]) expect(html).toContain(s);
    expect(html).not.toContain("wait_contact");
  });

  it("the work log keeps only meaningful business steps and the milestones read from recorded steps", () => {
    const log = agentWorkLog(agent());
    expect(log.map((e) => e.text)).toEqual(["Agent 가 복구 조사를 시작했습니다", "정보 공백 확인", "물어볼 상대 · 연락처 찾기", "멈춤 — 연락할 담당자를 선택해야 합니다"]);
    const html = renderToStaticMarkup(<AgentWorkLog run={agent()} />);
    expect(html).not.toContain("choose_next_action");
    const ms = renderToStaticMarkup(<AgentMilestones run={agent()} />);
    expect(ms).toContain("문의 초안 · 승인 요청");
    expect(ms).toContain('data-done="false"');
  });
});

describe("truth states", () => {
  it("every truth state has an icon and words (never color alone)", () => {
    const want: Record<string, string> = { CONFIRMED: "확정", PROVISIONAL: "임시", AGING: "다시 확인 필요", STALE: "오래되어 사용 주의", REVOKED: "철회", SUPERSEDED: "새 값으로 대체", CONFLICTED: "값 충돌" };
    for (const [state, word] of Object.entries(want)) {
      const t = truthShort(state);
      expect(t.label).toContain(word);
      expect(t.label).toMatch(/^[^\sA-Za-z가-힣]+ /); // 앞에 기호
    }
    expect(Object.keys(TRUTH_SHORT)).toContain("UNKNOWN");
    expect(truthShort("SOMETHING_NEW").label).toBe("SOMETHING_NEW"); // 모르는 코드는 그대로
  });

  it("the information table is titled for a first-time reader", () => {
    const html = renderToStaticMarkup(<GapTable rows={[{ key: "k", what: "10/28 수용 가능량", target: "창고 A", state: "PROVISIONAL", askedTo: "창고 A 운영사", askStatus: "SENT", replied: true, value: "8 CONTAINER", confirmed: false }]} />);
    expect(html).toContain("확인이 필요한 정보");
    expect(html).toContain("(확정 아님)");
    expect(renderToStaticMarkup(<GapTable rows={[]} />)).toContain("이 실행이 확인 중인 정보가 아직 없습니다.");
  });
});

describe("reply review", () => {
  it("an unreadable reply reads as a person's next step, not a system error", () => {
    const html = renderToStaticMarkup(
      <ExtractionView
        extraction={{ state: "NO_CANDIDATE", needs_review: true, failure_kind: "NO_ANSWER_FOUND", provider_code: null, no_candidate_outcome: "UNPARSEABLE", last_error_code: null, failed_attempts: 0, candidates: [], attempts: [{ attempt_no: 1, trigger: "AUTO", result: "NO_CANDIDATE", outcome: "UNPARSEABLE", error_code: null, at: "2026-10-28T10:00:00.000+09:00" }], retry: { available: true, blocked_reason: null } } as never}
        onRetry={() => undefined}
      />,
    );
    expect(html).toContain("AI 가 이 답장에서 확실한 값을 찾지 못했습니다.");
    expect(html).toContain("직접 입력하거나 다시 분석할 수 있습니다");
    expect(html).toContain("시스템 오류가 아니며");
    expect(html).toContain("AI 가 회신에서 답을 찾지 못했습니다");
    expect(html).toContain("시도 1회");
    expect(html).toContain('data-testid="extraction-retry"');
  });
});

describe("outdated plan", () => {
  it("shows the recorded before → after value when the backend kept it, and nothing invented otherwise", () => {
    expect(outdatedValueChange({ code: "FACT_SUPERSEDED", before: { value: 8 }, after: { value: 6 } })).toEqual({ before: 8, after: 6 });
    expect(outdatedValueChange({ code: "FACT_GONE", before: { value: 8 }, after: null })).toEqual({ before: 8, after: null });
    expect(outdatedValueChange({ code: "OPERATIONAL_RECORD_CHANGED", kind: "RATE" })).toBeNull();
    expect(outdatedValueChange({ code: "FACT_STATE_CHANGED", before: { value: 4 }, after: { value: 4 } })).toBeNull();
    const html = renderToStaticMarkup(<Callout tone="warn" title="새 계획이 필요합니다." actions={<button type="button">다시 계산</button>} testId="plan-outdated" />);
    expect(html).toContain("다시 계산");
    expect(html).toContain('role="status"');
  });
});

describe("system health cards", () => {
  const base = (redis: "up" | "down", worker: number): SystemStatus =>
    ({
      checked_at: "2026-10-28T14:31:00.000+09:00",
      mode: "PRIVATE_STAGING",
      overall: { status: "HEALTHY", reasons: [] },
      core: {
        api: { level: "HEALTHY", version: "0.1.0", commit: null, uptime_seconds: 60 },
        database: { level: "HEALTHY", connected: true, latency_ms: 2 },
        redis: { level: redis === "up" ? "HEALTHY" : "DEGRADED", state: redis, fallback: redis === "up" ? null : "POSTGRES_POLLING" },
        worker: { level: worker > 90 ? "DOWN" : worker > 30 ? "DEGRADED" : "HEALTHY", last_seen_at: null, last_seen_seconds_ago: worker, last_cycle_ms: 100, failed_steps: [], queue_consumer: true },
        ai_server: { level: "HEALTHY", reachable: true, provider_mode: "REPLAY" },
        agent_runtime: { level: "HEALTHY", reachable: true, tools_enabled: true },
      },
      integrations: { llm: { level: "HEALTHY", mode: "REPLAY" }, gmail: { level: "DISABLED" }, public_data: { level: "DISABLED" } },
      queues: { send: { count: 0, oldest_age_seconds: null, retrying: 0 }, extraction: { count: 0, oldest_age_seconds: null }, extraction_retry: { count: 0, oldest_age_seconds: null }, agent_retry: { count: 0, oldest_age_seconds: null } },
    }) as SystemStatus;

  it("Redis down = fallback path, PostgreSQL keeps working; every level has icon + words", () => {
    const redis = coreLines(base("down", 5)).find((l) => l.key === "redis")!;
    expect(redis.text).toContain("대체 경로 사용 중");
    expect(redis.text).toContain("업무 데이터 손실 없음");
    const html = renderToStaticMarkup(<HealthCard line={redis} />);
    expect(html).toContain("! 지연");
    expect(renderToStaticMarkup(<HealthCard line={{ key: "x", name: "Gmail", level: "DISABLED", text: "꺼짐" }} />)).toContain("– 사용 안 함");
    expect(renderToStaticMarkup(<HealthCard line={coreLines(base("up", 125)).find((l) => l.key === "worker")!} />)).toContain("✕ 장애");
  });
});

describe("operational input errors", () => {
  it("row errors read as sentences (row · column · reason), codes only behind details", () => {
    const report = { kind: "CONTAINERS", dry_run: true, stored: false, replayed: false, batch_id: null, recovery_run_id: null, content_hash: "h", row_count: 12, valid_rows: 11, invalid_rows: 1, changes: {}, errors: [{ row: 12, column: "planned_arrival_at", code: "INVALID_DATE", message: "날짜 형식이 올바르지 않습니다." }], note: "" } as unknown as ImportReport;
    const html = renderToStaticMarkup(<ImportResult report={report} />);
    expect(html).toContain("12번째 행");
    expect(html).toContain("planned_arrival_at");
    expect(html).toContain("날짜 형식이 올바르지 않습니다.");
    expect(html.indexOf("INVALID_DATE")).toBeGreaterThan(html.indexOf("<summary>코드</summary>"));
  });
});

describe("empty states and demo intro", () => {
  it("an empty state says what is missing and what happens next", () => {
    const html = renderToStaticMarkup(<EmptyState title="현재 처리 중인 예외가 없습니다.">부족이 생기면 자동으로 예외를 만듭니다.</EmptyState>);
    expect(html).toContain('role="status"');
    expect(html).toContain("자동으로 예외를 만듭니다");
  });

  it("the public demo intro is short: the problem, what you will try, synthetic data, no real mail, one start button", () => {
    const html = renderToStaticMarkup(<PortfolioIntro onStart={() => undefined} busy={false} error={null} login={<form />} />);
    for (const s of ["창고 수용량", "이 데모에서 체험할 것", "합성 데이터", "실제로 전송되지 않음", "데모 시작"]) expect(html).toContain(s);
    expect(html.match(/data-testid="demo-start"/g)).toHaveLength(1);
  });
});
