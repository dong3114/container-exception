import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentRun, AgentRunListItem } from "@/api/agentRuns";
import type { Me } from "@/api/auth";
import type { Draft, InboundItem } from "@/api/drafts";
import { ApiError } from "@/api/errors";
import { type ContactAddress, type Counterparty, type Readiness, selectFollowUpContact, selectRunContact } from "@/api/ops";
import type { PlanItem, PlanSummary } from "@/api/plans";
import type { FactCoordinate } from "@/api/truth";
import { MeContext } from "@/app/MeContext";
import { ExtractionView } from "@/components/drafts/ExtractionView";
import { AgentStatus } from "./AgentStatus";
import { CommsList, type FollowUpTag } from "./CommsList";
import { ContactResolver } from "./ContactResolver";
import { ErrorNotice } from "./ErrorNotice";
import { OperationalInput } from "./OperationalInput";
import { ReadinessPanel } from "./ReadinessPanel";
import { RunList } from "./RunList";
import { HUMAN_REASON, can, errorText } from "./opsLabels";
import { type RunSummary, addressState, agentNarrative, exceptionText, buildTimeline, candidateCompanies, createPoller, deriveActions, outdatedText, ownerFromInquiries, planDiff, questionAnswered, runGroup, usable } from "./opsModel";

/** 운영 콘솔(T-120) — 화면은 Backend 기록을 모아 쉬운 말로 보일 뿐이다. 계약 모양의 합성 값만 쓴다 */
const RUN = "01a11040-0000-7000-8000-0000000000r1";
const RUN2 = "01a11040-0000-7000-8000-0000000000r2";
const AGENT = "01a11040-0000-7000-8000-0000000000a1";
const FAC = "01a11040-0000-7000-8000-0000000000f1";
const MSG = "01a11040-0000-7000-8000-0000000000m1";
const PLAN = "01a11040-0000-7000-8000-0000000000p1";

const me = (role: Me["role"], permissions: string[]): Me => ({ user_id: "u", actor_id: "01a11040-0000-7000-8000-0000000000aa", login_id: role.toLowerCase(), display_name: role, role, permissions, via: "SESSION" });
const OPERATOR = me("OPERATOR", ["read", "agent_run.manage", "communication.draft", "communication.approve", "communication.send", "truth.review", "truth.manual_entry", "extraction.retry", "plan.recalculate", "plan.approve", "planning.input", "contact.select"]);
const ADMIN = me("ADMIN", [...OPERATOR.permissions, "registry.manage", "users.manage"]);
const FIELD = me("FIELD_OPERATOR", ["read", "truth.manual_entry"]);
const withMe = (who: Me, node: React.ReactNode) => renderToStaticMarkup(<MeContext.Provider value={who}>{node}</MeContext.Provider>);

const runSummary = (id: string, simulated = true) => ({ run_id: id, trigger_ref: "WH-A-CAPACITY", executed_at: "2026-10-13T10:30:00.000+09:00", contains_simulated: simulated, scenario_id: "s", source: (simulated ? "SCENARIO" : "MANUAL") as "SCENARIO" | "MANUAL" | "AUTO_DETECTED", exception: null as RunSummary["exception"] });
const agentItem = (over: Partial<AgentRunListItem> = {}): AgentRunListItem => ({ agent_run_id: AGENT, recovery_run_id: RUN, status: "WAITING_HUMAN", current_node: "wait_contact", waiting_reason: "CONTACT_SELECTION_REQUIRED", pending_ref: { type: "FACILITY", id: FAC }, started_at: "2026-10-13T10:31:00.000+09:00", finished_at: null, ...over });
const agentRun = (over: Partial<AgentRun> = {}): AgentRun =>
  ({
    agent_run_id: AGENT,
    recovery_run_id: RUN,
    goal: "g",
    status: "WAITING_HUMAN",
    current_node: "wait_contact",
    waiting_reason: "CONTACT_SELECTION_REQUIRED",
    pending_ref: { type: "FACILITY", id: FAC },
    last_error_code: null,
    started_at: "2026-10-13T10:31:00.000+09:00",
    finished_at: null,
    updated_at: null,
    runtime_attempts: 0,
    next_attempt_at: null,
    result_summary: null,
    is_simulated: true,
    steps: [
      { seq: 1, kind: "START", node: null, outcome: "OK", detail_code: null, started_at: "2026-10-13T10:31:00.000+09:00" },
      { seq: 2, kind: "NODE", node: "inspect_gaps", outcome: "OK", detail_code: null, started_at: "2026-10-13T10:31:01.000+09:00" },
      { seq: 3, kind: "NODE", node: "prepare_inquiry", outcome: "OK", detail_code: "CONTACT_SELECTION_REQUIRED", started_at: "2026-10-13T10:31:02.000+09:00" },
      { seq: 4, kind: "INTERRUPT", node: "wait_contact", outcome: "WAITING", detail_code: "CONTACT_SELECTION_REQUIRED", started_at: "2026-10-13T10:31:03.000+09:00" },
    ],
    tool_calls: [],
    ...over,
  }) as AgentRun;

function draft(over: { id?: string; status?: string; runId?: string; replies?: InboundItem[]; blocked?: string[]; created?: string; sent?: string | null } = {}): Draft {
  return {
    message: { message_id: over.id ?? MSG, thread_id: "t1", status: over.status ?? "PENDING_APPROVAL", drafted_by: "TEMPLATE", channel_type: "MOCK", is_simulated: true, content_hash: `sha256:${"a".repeat(64)}`, subject: "[문의] ODCY A 수용 가능 여부", body: "본문", created_at: over.created ?? "2026-10-13T10:32:00.000+09:00" },
    thread: { thread_id: "t1", purpose: "CAPACITY", thread_status: "OPEN", counterparty_id: "cp1", counterparty_name: "ODCY A 운영", contact_id: "c1", contact_name: "운영팀", address_id: "ad1", normalized_address: "ops@example.invalid", related_run_id: over.runId ?? RUN, opened_at: "2026-10-13T10:32:00.000+09:00" },
    question: { question_item_id: "q", ask_id: "Q1", question_type: "CAPACITY", question_text: "q", target_entity_type: "FACILITY", target_entity_id: FAC, target_name: "ODCY A", target_fact_key: "capacity.day(2026-10-13)", expected_value_type: "NUMBER", expected_unit: "CONTAINER", question_status: "OPEN" },
    structured_values: [],
    plan_based: false,
    source_run: { run_id: over.runId ?? RUN, trigger_ref: "WH-A-CAPACITY", contains_simulated: true },
    number_check: { status: "PASSED", passed: true, tokens: [], unmatched: [], not_mentioned: [] },
    contact_gate: { eligible: true, reasons: [] },
    approval_ready: true,
    blocked_reasons: over.blocked ?? [],
    approval: { state: "NONE", usable_for_send: false, current: null, ended_by: null, rejection: null, history: [] },
    revision: { previous_message_id: null, next_message_id: null, previous_approval_invalidated: false },
    dispatch: { state: "NOT_QUEUED", can_request_send: false, blocked_reasons: [], queued_at: null, sent_at: over.sent ?? null, approval_id_used: null, next_attempt_at: null, dequeued_reason: null, sending_paused: false, attempts: [] },
    replies: over.replies ?? [],
  } as unknown as Draft;
}
const reply = (needsReview: boolean, state = "FAILED"): InboundItem =>
  ({
    raw_input_id: "r1",
    message_id: "in1",
    status: "NORMAL",
    hold_reasons: [],
    from_address: "ops@example.invalid",
    sender_label: { counterparty_name: "ODCY A 운영", contact_name: "운영팀" },
    subject: "Re: 문의",
    preview: "네 확인해 보겠습니다",
    channel_received_at: "2026-10-13T10:40:00.000+09:00",
    received_at: "2026-10-13T10:40:00.000+09:00",
    evidence_time: "2026-10-13T10:40:00.000+09:00",
    evidence_basis: "DATE_HEADER",
    date_header_reject_reason: null,
    thread_id: "t1",
    thread_counterparty_name: "ODCY A 운영",
    is_simulated: true,
    content_available: true,
    extraction: { state, no_candidate_outcome: null, candidates: [], failed_attempts: 3, last_error_code: "EXTRACTION_PROVIDER_FAILED", provider_code: null, next_attempt_at: null, failure_kind: "AI_CALL_FAILED", needs_review: needsReview, attempts: [{ attempt_no: 1, trigger: "AUTO", result: "FAILED", at: "2026-10-13T10:40:01.000+09:00", error_code: "EXTRACTION_PROVIDER_FAILED", provider_code: null, outcome: null, retry_request_id: null, requested_by_actor_id: null }], retry: { available: true, blocked_reason: null } },
  }) as unknown as InboundItem;
const plan = (version: number, status: string, id = `${PLAN}${version}`): PlanSummary => ({ plan_id: id, version, plan_status: status, solver_status: "OPTIMAL", objective_krw: 1000, base_cost_krw: 900, baseline_total_krw: 2000, saving_krw: 1000, agent_run_id: AGENT, created_at: `2026-10-13T11:0${version}:00.000+09:00`, outdated_reason_count: 0 }) as PlanSummary;
const address = (over: Partial<ContactAddress> = {}): ContactAddress => ({ address_id: "a1", channel_type: "MOCK", normalized_address: "a@example.invalid", email_verification_status: "VERIFIED", relationship_status: "APPROVED", communication_status: "ACTIVE", is_simulated: true, eligible: true, reasons: [], ...over }) as ContactAddress;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("A · E · H — 지금 해야 할 일: Agent 사람 대기 · 검토할 답장 · 승인 대기 계획을 한 번씩 모은다", () => {
  it("A: WAITING_HUMAN is shown in plain words with what to do next, never as a bare code", () => {
    const html = renderToStaticMarkup(<AgentStatus run={agentRun()} />);
    expect(html).toContain(HUMAN_REASON.CONTACT_SELECTION_REQUIRED!.title);
    expect(html).toContain("담당자를 고르면 그 사람에게 문의 초안을 만듭니다");
    expect(html).toContain('data-testid="agent-human-needed"');
    const actions = deriveActions({ rows: [{ run: runSummary(RUN), agent: agentItem(), plan: null }], drafts: [], inbound: [] });
    expect(actions).toEqual([expect.objectContaining({ runId: RUN, title: "연락할 담당자를 선택해야 합니다", tab: "agent" })]);
  });

  it("E: a reply the AI could not read is one action — counted once when the agent also waits for its review", () => {
    const d = draft({ status: "SENT", replies: [reply(true)] });
    const only = deriveActions({ rows: [{ run: runSummary(RUN), agent: null, plan: null }], drafts: [d], inbound: [reply(true)] });
    expect(only.map((a) => a.title)).toEqual(["답장이 왔지만 AI 가 내용을 확정하지 못했습니다"]);
    const both = deriveActions({ rows: [{ run: runSummary(RUN), agent: agentItem({ waiting_reason: "REPLY_REVIEW_REQUIRED", pending_ref: { type: "COMM_MESSAGE", id: MSG } }), plan: null }], drafts: [d], inbound: [reply(true)] });
    expect(both).toHaveLength(1);
    expect(deriveActions({ rows: [], drafts: [d], inbound: [reply(false, "DONE")] })).toEqual([]);
    // 사람이 값을 직접 넣어 Agent 가 넘어갔으면(완료 · 다른 대기) 그 답장은 더는 할 일이 아니다 — 기록은 연락 탭에 남는다
    const movedOn = deriveActions({ rows: [{ run: runSummary(RUN), agent: agentItem({ status: "COMPLETED", waiting_reason: null, pending_ref: null }), plan: null }], drafts: [d], inbound: [reply(true)] });
    expect(movedOn).toEqual([]);
  });

  it("H: a proposed plan needs approval once, even when the agent waits on the same plan; a draft waiting for approval is one action", () => {
    const rows = [{ run: runSummary(RUN), agent: agentItem({ waiting_reason: "AWAITING_PLAN_DECISION", pending_ref: { type: "RECOVERY_PLAN", id: `${PLAN}2` } }), plan: plan(2, "PROPOSED") }];
    const actions = deriveActions({ rows, drafts: [draft()], inbound: [] });
    expect(actions.map((a) => a.key).sort()).toEqual([`msg:${MSG}`, `plan:${PLAN}2`]);
    expect(runGroup(rows[0]!, actions)).toBe("ACTION");
    expect(runGroup({ run: runSummary(RUN2), agent: agentItem({ recovery_run_id: RUN2, status: "COMPLETED", waiting_reason: null }), plan: plan(1, "APPROVED") }, actions)).toBe("DONE");
    expect(runGroup({ run: runSummary(RUN2), agent: agentItem({ recovery_run_id: RUN2, status: "FAILED", waiting_reason: null }), plan: null }, actions)).toBe("STOPPED");
  });
});

describe("B · C · D — 연락처 문제: 등록 · 선택. 화면은 고르지 않는다", () => {
  const problem = (reason: "CONTACT_REGISTRATION_REQUIRED" | "CONTACT_SELECTION_REQUIRED") => ({ scope: "AGENT" as const, agentRunId: AGENT, reason, subject: { type: "FACILITY", id: FAC } });

  it("B: registration required says nobody can be contacted; only an ADMIN sees the registration form", () => {
    const admin = withMe(ADMIN, <ContactResolver problem={problem("CONTACT_REGISTRATION_REQUIRED")} simulated onResolved={() => undefined} />);
    expect(admin).toContain('data-reason="CONTACT_REGISTRATION_REQUIRED"');
    expect(admin).toContain("운영 회사가 등록되어 있지 않습니다"); // 시설 운영사를 아직 모르면(목록 로드 전) 회사부터
    expect(admin).toContain('data-testid="contact-registration"');
    const op = withMe(OPERATOR, <ContactResolver problem={problem("CONTACT_REGISTRATION_REQUIRED")} simulated onResolved={() => undefined} />);
    expect(op).not.toContain('data-testid="contact-registration"');
    expect(op).toContain("담당자 등록은 관리자가 합니다");
  });

  it("C: selection required asks a person to choose; the submit button starts disabled (nothing preselected)", () => {
    const html = withMe(OPERATOR, <ContactResolver problem={problem("CONTACT_SELECTION_REQUIRED")} simulated onResolved={() => undefined} />);
    expect(html).toContain("이번 건을 받을 담당자를 고르세요");
    expect(html).toMatch(/data-testid="contact-select-submit"[^>]*disabled=""|disabled=""[^>]*data-testid="contact-select-submit"/);
  });

  it("D: only usable addresses are selectable — paused · retired · rejected · unapproved · inactive contact · wrong Mock/Real are not", () => {
    expect(usable(address(), true, true)).toBe(true);
    expect(usable(address({ communication_status: "PAUSED", eligible: false }), true, true)).toBe(false);
    expect(usable(address(), false, true)).toBe(false); // 담당자 비활성
    expect(usable(address(), true, false)).toBe(false); // 실제 실행에 가상 주소
    expect(addressState(address({ relationship_status: "REJECTED", communication_status: "INACTIVE" }))).toBe("REJECTED");
    expect(addressState(address({ communication_status: "PAUSED" }))).toBe("PAUSED");
    expect(addressState(address({ email_verification_status: "UNVERIFIED", relationship_status: "PENDING" }))).toBe("UNVERIFIED");
    const parties = [{ counterparty_id: "x", display_name: "X", source_role: "ODCY", is_active: true, contacts: [] }, { counterparty_id: "y", display_name: "Y", source_role: "ODCY", is_active: true, contacts: [] }, { counterparty_id: "t", display_name: "T", source_role: "TRUCKING", is_active: true, contacts: [] }] as unknown as Counterparty[];
    expect(candidateCompanies(parties, "y", "ODCY").map((c) => c.counterparty_id)).toEqual(["y"]); // 주인을 알면 그 회사만 — 다른 ODCY 회사 없음
    expect(candidateCompanies(parties, null, "TRUCKING").map((c) => c.counterparty_id)).toEqual(["t"]);
  });

  it("D: the choice goes to the T-129 endpoints with the chosen address only", async () => {
    const seen: { url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      seen.push({ url, body: JSON.parse(String(init.body)) });
      return Promise.resolve(new Response("{}", { status: 201 }));
    });
    await selectRunContact(AGENT, "a2", "전화 확인", OPERATOR.actor_id);
    await selectFollowUpContact(PLAN, "CANCEL:PARTNER_TRUCKS:x", "a2", undefined, OPERATOR.actor_id);
    expect(seen[0]).toEqual({ url: expect.stringContaining(`/agent-runs/${AGENT}/contact-selection`), body: { address_id: "a2", note: "전화 확인" } });
    expect(seen[1]).toEqual({ url: expect.stringContaining(`/planning/plans/${PLAN}/follow-ups/contact-selection`), body: { action_key: "CANCEL:PARTNER_TRUCKS:x", address_id: "a2" } });
  });
});

describe("F · G — 답장 다시 읽기 · 직접 입력", () => {
  it("F: the retry button is disabled while a request is out or the backend is already re-reading", () => {
    const ex = reply(true).extraction!;
    expect(renderToStaticMarkup(<ExtractionView extraction={ex} onRetry={() => undefined} />)).toMatch(/data-testid="extraction-retry"(?![^>]*disabled)/);
    expect(renderToStaticMarkup(<ExtractionView extraction={ex} onRetry={() => undefined} retryBusy />)).toContain("요청 중…");
    expect(renderToStaticMarkup(<ExtractionView extraction={{ ...ex, state: "RETRYING" }} onRetry={() => undefined} />)).toContain("다시 읽는 중…");
  });

  it("G: a field operator may enter a fact directly but not approve, select contacts or change the registry", () => {
    expect(can(FIELD, "truth.manual_entry")).toBe(true);
    for (const p of ["communication.approve", "contact.select", "registry.manage", "plan.approve", "planning.input"] as const) expect(can(FIELD, p)).toBe(false);
  });
});

describe("I · J — 계획 변경 · 정정 · 취소", () => {
  it("I: why a plan went OUTDATED is said in words — a fact change or an operational record change", () => {
    const names = new Map([["f1", "ODCY A"]]);
    expect(outdatedText({ code: "FACT_SUPERSEDED", subject_id: "f1", fact_key: "capacity.day(2026-10-13)" }, names)).toBe("ODCY A capacity.day(2026-10-13) — 새 값으로 바뀜");
    expect(outdatedText({ code: "OPERATIONAL_RECORD_CHANGED", kind: "RATE", key: "TRANSPORT|PNIT|odcy-a" }, names)).toBe("계약 요율 변경 (변경 · TRANSPORT|PNIT|odcy-a)");
  });

  it("I: version comparison lines up the engine items per container (no numbers computed on screen)", () => {
    const item = (id: string, action: string, target: string): PlanItem => ({ container_id: id, action, target_id: target, target_name: target, destination_id: null, delivery_day: "2026-10-13", scheduled_time: null, truck_id: null, base_cost_krw: 0, risk_penalty_krw: 0, total_krw: 0, baseline_total_krw: 0, reason_codes: [], detail: {} }) as unknown as PlanItem;
    const rows = planDiff([item("c1", "MOVE_TO_ODCY", "ODCY A"), item("c2", "KEEP_CURRENT_PLAN", "WH"), item("c3", "MOVE_TO_ODCY", "ODCY B")], [item("c1", "MOVE_TO_ODCY", "ODCY B"), item("c2", "KEEP_CURRENT_PLAN", "WH"), item("c4", "WAIT_AT_TERMINAL", "T1")]);
    expect(rows.map((r) => [r.container_id, r.change])).toEqual([["c1", "MODIFIED"], ["c2", "UNCHANGED"], ["c3", "REMOVED"], ["c4", "ADDED"]]);
  });

  it("J: corrections and cancellations are tagged apart from requests; a draft of an older plan says why it cannot be sent", () => {
    const tags = new Map<string, FollowUpTag>([
      ["m-corr", { kind: "CORRECTION", delta: "MODIFIED", previous_quantity: 4, quantity: 2 }],
      ["m-canc", { kind: "CANCELLATION", delta: "REMOVED", previous_quantity: 3, quantity: 3 }],
    ]);
    const html = withMe(OPERATOR, <CommsList drafts={[draft({ id: "m-req" }), draft({ id: "m-corr", created: "2026-10-13T11:00:00.000+09:00" }), draft({ id: "m-canc", created: "2026-10-13T11:01:00.000+09:00", blocked: ["PLAN_SUPERSEDED"] })]} tags={tags} openId={null} onOpen={() => undefined} onChanged={() => undefined} />);
    expect(html).toContain("[문의]");
    expect(html).toContain("[정정]");
    expect(html).toContain("4 → 2");
    expect(html).toContain("[취소]");
    expect(html).toContain("3 → 0");
    expect(html).toContain("이전 계획 기준");
    expect(html).toContain("승인 · 발송할 수 없습니다");
  });
});

describe("K · L · M · N — 준비도 · 권한 · 오류 · 다시 읽기", () => {
  it("K: NOT_READY lists why, field by field (values are never invented)", () => {
    const r: Readiness = { mode: "LIVE", status: "NOT_READY", ready: false, plan_day: "2026-10-28", note: "", missing_inputs: [{ code: "CONTAINER_LFD", group: "LFD", severity: "BLOCKING", scope: "CONTAINER", count: 1, fields: ["container.FNLU0000010.lfd"], examples: [], provide_via: "" }, { code: "FACILITY_CAPACITY", group: "WAREHOUSE_CAPACITY", severity: "BLOCKING", scope: "FACILITY", count: 1, fields: ["facility.창고 A.capacity.day(2026-10-29)"], examples: [], provide_via: "" }] };
    const html = renderToStaticMarkup(<ReadinessPanel readiness={r} />);
    expect(html).toContain("계산할 수 없음");
    expect(html).toContain("컨테이너 LFD(무료기간 끝)가 없습니다");
    expect(html).toContain("container.FNLU0000010.lfd");
    expect(html).toContain("facility.창고 A.capacity.day(2026-10-29)");
  });

  it("L: buttons follow the role — a field operator sees no approve control and cannot store operational input", () => {
    const comms = withMe(FIELD, <CommsList drafts={[draft()]} tags={new Map()} openId={MSG} onOpen={() => undefined} onChanged={() => undefined} />);
    expect(comms).toContain("승인 · 발송 요청은 운영자 · 관리자만 할 수 있습니다");
    expect(comms).toMatch(/data-testid="btn-approve"[^>]*disabled=""|disabled=""[^>]*data-testid="btn-approve"/);
    const input = withMe(FIELD, <OperationalInput runId={RUN} />);
    expect(input).toContain("운영 기록 입력은 운영자 · 관리자만 할 수 있습니다");
    expect(withMe(OPERATOR, <OperationalInput runId={RUN} />)).not.toContain("운영자 · 관리자만");
  });

  it("M: a 403 or a domain code is said plainly; the code and request id stay in the technical details", () => {
    expect(errorText(new ApiError("HTTP", "x", { status: 403, code: "PERMISSION_DENIED" }))).toBe("이 작업을 할 권한이 없습니다.");
    expect(errorText(new ApiError("HTTP", "x", { status: 403, code: "SOMETHING_ELSE" }))).toBe("이 작업을 할 권한이 없습니다.");
    expect(errorText(new ApiError("HTTP", "x", { status: 409, code: "PLANNING_INPUT_UNAVAILABLE" }))).toBe("계획 계산에 필요한 정보가 부족합니다.");
    const html = renderToStaticMarkup(<ErrorNotice error={new ApiError("HTTP", "Recipient is not eligible: NOT_ACTIVE", { status: 403, code: "RECIPIENT_NOT_ELIGIBLE", requestId: "req-1" })} />);
    expect(html).toContain("선택한 담당자는 지금 사용할 수 없습니다");
    expect(html).toContain("<details");
    expect(html).toContain("req-1");
  });

  it("N: the board re-reads on an interval while visible, skips while hidden, never overlaps, and stops", async () => {
    vi.useFakeTimers();
    let visible = true;
    let calls = 0;
    let release: () => void = () => undefined;
    const stop = createPoller(() => new Promise<void>((r) => { calls += 1; release = r; }), 5_000, () => visible);
    expect(calls).toBe(1); // 곧바로 한 번
    await vi.advanceTimersByTimeAsync(5_000);
    expect(calls).toBe(1); // 이전 읽기가 안 끝나면 겹쳐 부르지 않는다
    release();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(calls).toBe(2);
    release();
    visible = false;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toBe(2);
    visible = true;
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toBe(2);
  });

  it("N: what the agent did, waits for and does next comes from its recorded steps; the timeline merges agent · mail · plan records in order", () => {
    const n = agentNarrative(agentRun({ status: "WAITING_EXTERNAL", waiting_reason: "AWAITING_REPLY", current_node: "wait_reply" }));
    expect(n).toEqual({ now: "회신 대기", waiting: "상대 업체의 답장을 기다립니다", last: "물어볼 상대 · 연락처 찾기 — CONTACT_SELECTION_REQUIRED", next: "답장이 오면 AI 가 읽고 정보 공백을 다시 평가합니다" });
    const t = buildTimeline({ agent: agentRun(), drafts: [draft({ status: "SENT", sent: "2026-10-13T10:35:00.000+09:00", replies: [reply(true)] })], plans: [plan(1, "PROPOSED")] });
    expect(t.map((e) => e.text)).toEqual([
      "Agent 시작",
      "정보 공백 확인",
      "물어볼 상대 · 연락처 찾기 · CONTACT_SELECTION_REQUIRED",
      "대기: 연락할 담당자를 선택해야 합니다",
      "문의 초안 → ODCY A 운영: [문의] ODCY A 수용 가능 여부",
      "발송 → ODCY A 운영",
      "답장 수신 ← ODCY A 운영",
      "AI 읽기 1회차 — FAILED (EXTRACTION_PROVIDER_FAILED)",
      "계획 v1 계산 — OPTIMAL",
    ]);
  });
});

describe("시연 전 다듬기 — 트럭 풀 상대 회사 · 이미 채워진 답장", () => {
  it("the truck pool owner comes from the inquiries already sent to that pool (the backend only sends to the owner); none → unknown", () => {
    const d = draft();
    (d.question as { target_entity_id: string }).target_entity_id = "pool-1";
    (d.thread as { counterparty_id: string }).counterparty_id = "k-trucking";
    expect(ownerFromInquiries([d], "pool-1")).toBe("k-trucking");
    expect(ownerFromInquiries([d], "pool-2")).toBeNull();
  });

  it("a reply the AI could not read shows 'done' once the asked fact has a value — the backend flag is left as it is", () => {
    const d = draft({ status: "SENT", replies: [reply(true)] });
    const fact = { entity_id: FAC, fact_key: "capacity.day(2026-10-13)", fact_state: "CONFIRMED", current: { value: 3 } } as unknown as FactCoordinate;
    expect(questionAnswered(d, [])).toBe(false);
    expect(questionAnswered(d, [fact])).toBe(true);
    const open = withMe(OPERATOR, <CommsList drafts={[d]} tags={new Map()} openId={null} onOpen={() => undefined} onChanged={() => undefined} />);
    expect(open).toContain("답장 검토 필요");
    const done = withMe(OPERATOR, <CommsList drafts={[d]} tags={new Map()} openId={null} onOpen={() => undefined} onChanged={() => undefined} facts={[fact]} />);
    expect(done).toContain("처리 완료");
    expect(done).not.toContain("답장 검토 필요");
  });
});

describe("T-132 automatic exception detection on the console", () => {
  const ex: NonNullable<RunSummary["exception"]> = { exception_id: "e1", status: "ACTIVE", basis: "CONFIRMED", facility_id: "f", facility_name: "창고 A", window_day: "2026-10-13", scheduled_demand: 20, capacity: 8, shortage: 12 };
  const autoRun = { ...runSummary(RUN, false), trigger_ref: "EXCEPTION:e1", source: "AUTO_DETECTED" as const, exception: ex };

  it("states the detected problem in one line: facility · day · planned / capacity · affected", () => {
    expect(exceptionText(ex)).toBe("창고 A 수용량 부족 · 10-13 예정 20 / 가능 8 · 영향 12대");
    expect(exceptionText({ ...ex, status: "RESOLVED" })).toContain("해소됨");
    expect(exceptionText({ ...ex, basis: "PROVISIONAL" })).toContain("임시 사실 기준");
  });

  it("an auto-detected run without an agent asks a person to start the agent (the quantity is a human decision)", () => {
    const actions = deriveActions({ rows: [{ run: autoRun, agent: null, plan: null }], drafts: [], inbound: [] });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ key: `auto:${RUN}`, tab: "agent", title: "복구 조사를 시작해 주세요", cta: "Agent 시작" });
    expect(actions[0]!.detail).toContain("[자동 탐지]");
    expect(runGroup({ run: autoRun, agent: null, plan: null }, actions)).toBe("ACTION");
    // 이미 시작했거나 해소된 예외 · 사람이 만든 실행은 이 할 일이 없다
    expect(deriveActions({ rows: [{ run: autoRun, agent: agentItem({ status: "RUNNING", waiting_reason: null }), plan: null }], drafts: [], inbound: [] }).some((a) => a.key.startsWith("auto:"))).toBe(false);
    expect(deriveActions({ rows: [{ run: { ...autoRun, exception: { ...ex, status: "RESOLVED" } }, agent: null, plan: null }], drafts: [], inbound: [] })).toEqual([]);
    expect(deriveActions({ rows: [{ run: runSummary(RUN, false), agent: null, plan: null }], drafts: [], inbound: [] })).toEqual([]);
  });

  it("the run list marks the auto-detected run and shows the problem line", () => {
    const html = renderToStaticMarkup(<RunList rows={[{ run: autoRun, agent: null, plan: null }]} actions={[]} selectedId={null} onSelect={() => undefined} />);
    expect(html).toContain('data-testid="auto-detected"');
    expect(html).toContain("자동 탐지");
    expect(html).toContain("예정 20 / 가능 8 · 영향 12대");
  });
});
