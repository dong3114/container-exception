import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InboundItem } from "@/api/drafts";
import { ExtractionView } from "./ExtractionView";

type Extraction = NonNullable<InboundItem["extraction"]>;
const candidate = (over: Partial<Extraction["candidates"][number]>): Extraction["candidates"][number] => ({
  extraction_id: "01a11040-0000-7000-8000-0000000000f1",
  ask_id: "Q1",
  field: "quantity",
  value: "4",
  unit: "TRUCK",
  evidence_quote: "차량 4대까지 가능합니다",
  validation: "PASSED",
  failed_reasons: [],
  review_status: "PENDING",
  generated_by: "RECORDED_REPLAY",
  fact_event_id: null,
  promotion_blocked_reasons: [],
  ...over,
});
const base: Extraction = {
  state: "DONE",
  no_candidate_outcome: null,
  candidates: [],
  failed_attempts: 0,
  last_error_code: null,
  provider_code: null,
  next_attempt_at: null,
  failure_kind: null,
  needs_review: false,
  review_pending: false,
  attempts: [],
  retry: { available: false, blocked_reason: "EXTRACTION_NOT_REQUIRED" },
};
const view = (e: Partial<Extraction>, onRetry?: () => void) => renderToStaticMarkup(<ExtractionView extraction={{ ...base, ...e }} onRetry={onRetry} />);

describe("AI suggestions — candidates with evidence, never facts", () => {
  it("shows AI 제안, the value, the verbatim evidence and the validation result", () => {
    const html = view({
      candidates: [
        candidate({}),
        candidate({ extraction_id: "x2", field: "available_from", value: "15:00", unit: null, evidence_quote: "오후 3시 이후" }),
        candidate({ extraction_id: "x3", field: "rate_per_truck", value: "180000", unit: "KRW", evidence_quote: "단가는 대당 18만원입니다", validation: "REJECTED", failed_reasons: ["FIELD_NOT_ASKED"], review_status: "REJECTED" }),
        candidate({ extraction_id: "x4", evidence_quote: "차량 4대 가능합니다", validation: "REJECTED", failed_reasons: ["QUOTE_NOT_IN_SOURCE"], review_status: "REJECTED" }),
      ],
    });
    expect(html).toContain("AI 제안");
    expect(html).toContain("녹화 재생 — LLM 미실행");
    expect(html).toContain("후보일 뿐 — 확정되지 않았고 업무에 반영되지 않았습니다");
    expect(html).toContain("가능 수량:");
    expect(html).toContain("<b class=\"num\">4대</b>");
    expect(html).toContain("가능 시작 시각:");
    expect(html).toContain("근거: “차량 4대까지 가능합니다”");
    expect(html).toContain("검증 통과");
    expect(html).toContain("업무에 반영되지 않음 — 문의하지 않은 항목");
    expect(html).toContain("근거 문장이 회신 원문에 없음");
    for (const word of ["확정됨", "CONFIRMED", "현재 사실", "운영 사실"]) expect(html).not.toContain(word);
  });

  it("waiting, retrying, failed and no-candidate states are told apart", () => {
    expect(view({ state: "WAITING" })).toContain("AI 추출 대기 중");
    expect(view({ state: "RETRYING", failed_attempts: 1, last_error_code: "EXTRACTION_TIMEOUT" })).toContain("자동으로 다시 시도합니다 · EXTRACTION_TIMEOUT");
    expect(view({ state: "FAILED", failed_attempts: 3, last_error_code: "AI_SERVER_UNAVAILABLE" })).toContain("재시도 한도에 도달(회신 원문은 그대로 보관)");
    expect(view({ state: "NO_CANDIDATE", no_candidate_outcome: "UNPARSEABLE" })).toContain("질문에 대한 값을 찾지 못함 (UNPARSEABLE)");
  });

  it("tells apart: became a provisional fact, validated but not promoted (with reasons), and plain candidates", () => {
    const accepted = view({ candidates: [candidate({ review_status: "ACCEPTED", fact_event_id: "e1", promotion_blocked_reasons: [] })] });
    expect(accepted).toContain("임시 사실로 올라감");
    expect(accepted).toContain("아직 사람이 확인하지 않았습니다");
    expect(accepted).not.toContain("사람 확인 완료");
    const held = view({ candidates: [candidate({ promotion_blocked_reasons: ["AMBIGUOUS_REPLY", "WINDOW_UNVERIFIED"] })] });
    expect(held).toContain("자동 승격 안 됨 — 사람이 판단");
    expect(held).toContain("이유: 모호한 표현 · 시간창 검증 불가");
    const rejected = view({ candidates: [candidate({ validation: "REJECTED", review_status: "REJECTED", failed_reasons: ["BAD_QUANTITY"] })] });
    expect(rejected).not.toContain("extraction-promotion");
  });

  it("T-124: a reply with no usable value asks for a person — why it failed, every attempt, retry and direct entry", () => {
    const attempt = (n: number, over: Partial<Extraction["attempts"][number]> = {}): Extraction["attempts"][number] => ({
      attempt_no: n, trigger: "AUTO", result: "FAILED", at: "2026-10-27T13:38:35.000+09:00", error_code: "EXTRACTION_PROVIDER_FAILED", provider_code: "NO_RECORDING", outcome: null, retry_request_id: null, requested_by_actor_id: null, ...over,
    });
    const failed = { state: "FAILED" as const, failed_attempts: 3, last_error_code: "EXTRACTION_PROVIDER_FAILED", provider_code: "NO_RECORDING", next_attempt_at: null, failure_kind: "AI_CALL_FAILED" as const, needs_review: true, review_pending: true, attempts: [attempt(1), attempt(2), attempt(3)], retry: { available: true, blocked_reason: null } };
    const html = view(failed, () => undefined);
    expect(html).toContain("사람 검토 필요");
    expect(html).toContain("AI 호출 자체가 실패했습니다");
    expect(html).toContain("NO_RECORDING");
    expect(html).toContain("시도 3회");
    expect(html).toContain("data-testid=\"extraction-retry\"");
    expect(html).toContain("값을 직접 입력");
    // a running human attempt: no second button, the attempt shows as RUNNING
    const running = view({ ...failed, state: "RETRYING", attempts: [...failed.attempts, attempt(4, { trigger: "HUMAN_RETRY", result: "RUNNING", error_code: null, provider_code: null })], retry: { available: false, blocked_reason: "EXTRACTION_IN_PROGRESS" } }, () => undefined);
    expect(running).not.toContain("data-testid=\"extraction-retry\"");
    expect(running).toContain("#4 사람 요청 RUNNING");
    expect(running).toContain("추출이 진행 중입니다");
    // the model found no answer — told apart from an AI call failure
    expect(view({ state: "NO_CANDIDATE", no_candidate_outcome: "UNPARSEABLE", failure_kind: "NO_ANSWER_FOUND", needs_review: true, review_pending: true, attempts: [attempt(1, { result: "NO_CANDIDATE", error_code: null, provider_code: null, outcome: "UNPARSEABLE" })], retry: { available: true, blocked_reason: null } })).toContain("AI 가 회신에서 답을 찾지 못했습니다");
  });
});
