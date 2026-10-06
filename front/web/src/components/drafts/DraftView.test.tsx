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
};

const render = (draft: Draft) => renderToStaticMarkup(<DraftView draft={draft} onRevised={() => undefined} />);

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
    expect(html).toContain("승인 단계로 넘길 수 있음");
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
    expect(html).toContain("승인 단계로 넘길 수 없음");
    expect(html).toContain("본문의 숫자 · 날짜가 구조화 값과 다름");
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
});
