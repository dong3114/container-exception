import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Draft } from "@/api/drafts";
import { DraftView } from "./DraftView";

/** Contract-shaped fixtures (generated OpenAPI types) — the screen only shows what the backend decided. */
const base: Draft = {
  message: {
    message_id: "01a11040-0000-7000-8000-000000000001",
    thread_id: "01a11040-0000-7000-8000-000000000002",
    status: "PENDING_APPROVAL",
    drafted_by: "TEMPLATE",
    channel_type: "MOCK",
    is_simulated: true,
    content_hash: `sha256:${"a".repeat(64)}`,
    subject: "[문의 Q1] 10월 13일(화) 15:00~17:00 트럭 2대 추가 배차 가능 여부",
    body: "10월 13일(화) 15:00~17:00에 셔틀 트럭 2대를 추가로 배차할 수 있는지 확인 부탁드립니다.",
    created_at: "2026-10-13T11:00:00.000+09:00",
  },
  thread: {
    thread_id: "01a11040-0000-7000-8000-000000000002",
    purpose: "SLOT_REQUEST",
    thread_status: "OPEN",
    counterparty_id: "01a11040-0000-7000-8000-000000000003",
    counterparty_name: "K운송 (가상)",
    contact_id: "01a11040-0000-7000-8000-000000000004",
    contact_name: "배차팀",
    address_id: "01a11040-0000-7000-8000-000000000005",
    normalized_address: "dispatch@k-trucking.example.invalid",
    related_run_id: "01a11040-0000-7000-8000-000000000006",
    opened_at: "2026-10-13T11:00:00.000+09:00",
  },
  question: {
    question_item_id: "01a11040-0000-7000-8000-000000000007",
    ask_id: "Q1",
    question_type: "SLOT",
    question_text: "10월 13일(화) 15:00~17:00 트럭 2대 추가 배차 가능 여부",
    target_entity_type: "TRUCK_POOL",
    target_entity_id: "01a11040-0000-7000-8000-000000000008",
    target_name: "K운송 셔틀",
    target_fact_key: "available.slot(2026-10-13T15:00-17:00)",
    expected_value_type: "NUMBER",
    expected_unit: "TRUCK",
    question_status: "DRAFTED",
  },
  structured_values: [
    { key: "quantity", value_number: "2", value_text: null, unit: "TRUCK", source_run_id: "01a11040-0000-7000-8000-000000000006", source_path: "resource_gaps[0].needed" },
    { key: "date", value_text: "2026-10-13", value_number: null, unit: null, source_run_id: null, source_path: null },
  ],
  plan_based: true,
  source_run: { run_id: "01a11040-0000-7000-8000-000000000006", trigger_ref: "RP-001", contains_simulated: true },
  number_check: { status: "PASSED", passed: true, tokens: [], unmatched: [], not_mentioned: [] },
  contact_gate: { eligible: true, reasons: [] },
  approval_ready: true,
  blocked_reasons: [],
  approval: { state: "NONE", usable_for_send: false, current: null, ended_by: null, rejection: null, history: [] },
  revision: { previous_message_id: null, next_message_id: null, previous_approval_invalidated: null },
  dispatch: {
    state: "NOT_REQUESTED",
    can_request_send: false,
    blocked_reasons: [],
    queued_at: null,
    sent_at: null,
    approval_id_used: null,
    next_attempt_at: null,
    dequeued_reason: null,
    sending_paused: false,
    attempts: [],
  },
};

const OPERATOR = "01a11040-0000-7000-8000-0000000000aa";
const render = (draft: Draft, approverId: string | null = OPERATOR) =>
  renderToStaticMarkup(<DraftView draft={draft} approverId={approverId} onChanged={() => undefined} />);

const snapshot: NonNullable<Draft["approval"]["current"]> = {
  approval_id: "01a11040-0000-7000-8000-0000000000b1",
  state: "ACTIVE",
  approver_actor_id: OPERATOR,
  approver_name: "운영자 (가상)",
  decided_at: "2026-10-07T10:15:00.000+09:00",
  expires_at: "2026-10-08T10:15:00.000+09:00",
  approved_content_hash: base.message.content_hash,
  approved_to_address_id: "01a11040-0000-7000-8000-000000000005",
  approved_plan_run_id: "01a11040-0000-7000-8000-000000000006",
  subject: base.message.subject,
  body: base.message.body,
  structured_values: base.structured_values,
  copy_verified: true,
};
const approvedDraft: Draft = {
  ...base,
  message: { ...base.message, status: "APPROVED" },
  approval_ready: false,
  blocked_reasons: ["ALREADY_APPROVED"],
  approval: {
    state: "ACTIVE",
    usable_for_send: true,
    current: snapshot,
    ended_by: null,
    rejection: null,
    history: [
      {
        approval_id: snapshot.approval_id,
        decision: "APPROVED",
        invalidation_cause: null,
        invalidates_approval_id: null,
        actor_name: "운영자 (가상)",
        actor_type: "HUMAN",
        decided_at: snapshot.decided_at,
        reason: null,
      },
    ],
  },
};
const endedBy = (cause: "USER_REVOKED" | "PLAN_SUPERSEDED" | "CONTENT_CHANGED") => ({
  approval_id: "01a11040-0000-7000-8000-0000000000b2",
  decision: cause === "USER_REVOKED" ? ("REVOKED" as const) : ("INVALIDATED" as const),
  invalidation_cause: cause,
  invalidates_approval_id: snapshot.approval_id,
  actor_name: cause === "USER_REVOKED" ? "운영자 (가상)" : "CERA System",
  actor_type: cause === "USER_REVOKED" ? "HUMAN" : "SYSTEM",
  decided_at: "2026-10-07T10:30:00.000+09:00",
  reason: cause === "USER_REVOKED" ? "거래처 사정" : null,
});

describe("DraftView", () => {
  it("shows target, question, message, structured values with their source, and a passed number check", () => {
    const html = render(base);
    expect(html).toContain("K운송 (가상)");
    expect(html).toContain("dispatch@k-trucking.example.invalid");
    expect(html).toContain("available.slot(2026-10-13T15:00-17:00)");
    expect(html).toContain("셔틀 트럭 2대를 추가로 배차할 수 있는지");
    expect(html).toContain("계획 RP-001 · resource_gaps[0].needed");
    expect(html).toContain("직접 입력");
    expect(html).toContain('data-status="PASSED"');
    expect(html).toContain("템플릿 초안 · AI 미사용");
    expect(html).not.toContain("AI 제안");
  });

  it("a blocked draft says why: the number that is not a structured value, and that it cannot go to approval", () => {
    const html = render({
      ...base,
      message: { ...base.message, status: "DRAFTED", drafted_by: "HUMAN", body: "셔틀 트럭 8대" },
      number_check: { status: "BLOCKED_NUMBER_CHECK", passed: false, tokens: [], unmatched: [{ text: "8", kind: "QUANTITY", matched_field: null }], not_mentioned: ["quantity"] },
      approval_ready: false,
      blocked_reasons: ["BLOCKED_NUMBER_CHECK", "NOT_PENDING_APPROVAL"],
    });
    expect(html).toContain('data-status="BLOCKED_NUMBER_CHECK"');
    expect(html).toContain("숫자 검사 실패");
    expect(html).toContain("본문의 수량 <b class=\"mono\">8</b> — 구조화 값에 없음");
    expect(html).toContain("지금 승인할 수 없는 이유");
    expect(html).toContain("본문의 숫자 · 날짜가 구조화 값과 다름");
    expect(html).toMatch(/data-testid="btn-approve" disabled=""/);
    expect(html).toContain("운영자 수정본");
  });

  it("a recipient that lost eligibility shows the Contact Gate reasons", () => {
    const html = render({
      ...base,
      contact_gate: { eligible: false, reasons: [{ code: "NOT_ACTIVE", layer: "PRODUCT_RULE" }] },
      approval_ready: false,
      blocked_reasons: ["RECIPIENT_NOT_ELIGIBLE"],
    });
    expect(html).toContain("발송 불가");
    expect(html).toContain("통신 중지 · 비활성");
  });

  it("a ready draft can be approved or rejected by the chosen operator; without an operator the buttons stay off", () => {
    const html = render(base);
    expect(html).toContain('data-approval-state="NONE"');
    expect(html).toContain("승인 전");
    expect(html).toMatch(/data-testid="btn-approve">이 내용으로 승인</);
    expect(html).toContain('data-testid="btn-reject"');
    expect(html).not.toContain('data-testid="btn-revoke"');
    expect(html).not.toContain("지금 승인할 수 없는 이유");

    const noOperator = render(base, null);
    expect(noOperator).toMatch(/data-testid="btn-approve" disabled=""/);
    expect(noOperator).toContain("승인자를 먼저 고르세요");
  });

  it("an approved draft shows who approved, when, until when, the frozen content and a revoke button", () => {
    const html = render(approvedDraft);
    expect(html).toContain('data-approval-state="ACTIVE"');
    expect(html).toContain("승인됨");
    expect(html).toContain("발송에 쓸 수 있는 승인");
    expect(html).toContain('data-testid="approver-name">운영자 (가상)<');
    expect(html).toContain("2026-10-07 10:15");
    expect(html).toContain("2026-10-08 10:15");
    expect(html).toContain("지금 내용과 같음");
    expect(html).toContain("승인 사본 확인됨");
    expect(html).toContain('data-testid="btn-revoke"');
    // 살아 있는 승인이 있으면 승인 버튼 · 승인 불가 목록을 보이지 않는다(취소만 할 수 있다)
    expect(html).not.toContain('data-testid="btn-approve"');
    expect(html).not.toContain("지금 승인할 수 없는 이유");
  });

  it("a revoked approval says so and can be approved again", () => {
    const html = render({
      ...approvedDraft,
      approval_ready: true,
      blocked_reasons: [],
      approval: { ...approvedDraft.approval, state: "REVOKED", usable_for_send: false, current: { ...snapshot, state: "REVOKED" }, ended_by: endedBy("USER_REVOKED") },
    });
    expect(html).toContain("운영자가 승인을 취소했습니다");
    expect(html).toContain("거래처 사정");
    expect(html).toMatch(/data-testid="btn-approve">이 내용으로 다시 승인</);
    expect(html).not.toContain('data-testid="btn-revoke"');
  });

  it("a plan replacement shows why the approval was lifted and why it cannot be approved", () => {
    const html = render({
      ...approvedDraft,
      approval_ready: false,
      blocked_reasons: ["PLAN_SUPERSEDED"],
      approval: { ...approvedDraft.approval, state: "INVALIDATED", usable_for_send: false, current: { ...snapshot, state: "INVALIDATED" }, ended_by: endedBy("PLAN_SUPERSEDED") },
    });
    expect(html).toContain("근거 계획이 바뀌어 승인이 풀렸습니다");
    expect(html).toContain("시스템");
    expect(html).toContain("근거 계획이 새 실행으로 바뀜");
  });

  it("a revision of an approved draft says it needs approval again; the old one says it was replaced", () => {
    const revised = render({
      ...base,
      message: { ...base.message, message_id: "01a11040-0000-7000-8000-0000000000c1", drafted_by: "HUMAN" },
      revision: { previous_message_id: base.message.message_id, next_message_id: null, previous_approval_invalidated: "CONTENT_CHANGED" },
    });
    expect(revised).toContain('data-testid="reapproval-required"');
    expect(revised).toContain("내용 변경으로 재승인 필요");

    const old = render({
      ...approvedDraft,
      message: { ...approvedDraft.message, status: "CLOSED" },
      approval_ready: false,
      blocked_reasons: ["MESSAGE_SUPERSEDED"],
      approval: { ...approvedDraft.approval, state: "INVALIDATED", usable_for_send: false, current: { ...snapshot, state: "INVALIDATED" }, ended_by: endedBy("CONTENT_CHANGED") },
      revision: { previous_message_id: null, next_message_id: "01a11040-0000-7000-8000-0000000000c1", previous_approval_invalidated: null },
    });
    expect(old).toContain('data-testid="superseded"');
    expect(old).toContain("승인 뒤 내용이 바뀌어 다시 승인해야 합니다");
    expect(old).toContain("새 수정본으로 대체된 초안 — 최신 수정본을 승인해야 함");
  });

  it("a rejected draft shows the reason and offers no approval", () => {
    const html = render({
      ...base,
      message: { ...base.message, status: "REJECTED" },
      approval_ready: false,
      blocked_reasons: ["NOT_PENDING_APPROVAL"],
      approval: {
        ...base.approval,
        state: "REJECTED",
        rejection: { ...endedBy("USER_REVOKED"), decision: "REJECTED", invalidation_cause: null, invalidates_approval_id: null, reason: "시간대가 맞지 않음" },
      },
    });
    expect(html).toContain("반려 사유: 시간대가 맞지 않음");
    expect(html).not.toContain('data-testid="btn-reject"');
  });

  it("after sending the approval can no longer be revoked from the screen", () => {
    const html = render({ ...approvedDraft, message: { ...approvedDraft.message, status: "SENT" }, dispatch: { ...approvedDraft.dispatch, state: "SENT" } });
    expect(html).toContain("이 승인으로 발송됨");
    expect(html).not.toContain('data-testid="btn-revoke"');
  });
});
