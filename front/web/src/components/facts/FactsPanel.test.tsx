import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FactCandidate, FactCoordinate } from "@/api/truth";
import { FactCard } from "./FactsPanel";

const candidate = (over: Partial<FactCandidate> = {}): FactCandidate => ({
  event_id: "01a11040-0000-7000-8000-0000000000e1",
  event_class: "OBSERVATION",
  role: "WINNER",
  value: 4,
  unit: "TRUCK",
  valid_from: "2026-12-01T15:00:00+09:00",
  valid_until: "2026-12-01T17:00:00+09:00",
  source_type: "EMAIL",
  source_role: "TRANSPORTER",
  evidence_strength: 2,
  verification: "UNVERIFIED",
  verified_by_human: false,
  received_at: "2026-12-01T10:00:00+09:00",
  evidence_time: "2026-12-01T09:58:00+09:00",
  supersedes_event_id: null,
  extraction_id: "x1",
  evidence_quote: "차량 4대까지 가능합니다",
  generated_by: "RECORDED_REPLAY",
  model_version: "replay-v1",
  prompt_version: "p1",
  ...over,
});

const fact = (over: Partial<FactCoordinate> = {}): FactCoordinate => ({
  entity_type: "TRANSPORTER",
  entity_id: "01a11040-0000-7000-8000-0000000000c1",
  entity_name: "가나다운송",
  fact_key: "available.slot(2026-12-01T15:00-17:00)",
  applicability_scope: { type: "RECOVERY_RUN", ref: "r" },
  is_simulated: true,
  fact_state: "PROVISIONAL",
  value_status: "PROVISIONAL",
  conflict_status: "NONE",
  hold_status: "NONE",
  decision_usability: "USABLE_WITH_WARNING",
  applied_rule: "R4-a",
  rule_version: "v1",
  current: { event_id: "01a11040-0000-7000-8000-0000000000e1", value: 4, unit: "TRUCK", valid_from: "2026-12-01T15:00:00+09:00", valid_until: "2026-12-01T17:00:00+09:00", evidence_strength: 2, verified_by_human: false, verification_basis: null },
  held_event_id: null,
  candidates: [candidate()],
  ...over,
});

const render = (f: FactCoordinate, actorId: string | null = "actor-1") => renderToStaticMarkup(<FactCard fact={f} actorId={actorId} onUpdated={() => undefined} />);

describe("FactCard — AI values are provisional until a person decides", () => {
  it("shows a provisional fact as not yet confirmed, with the evidence and a replay label", () => {
    const html = render(fact());
    expect(html).toContain("가나다운송");
    expect(html).toContain("차량 가용 · 2026-12-01 15:00–17:00");
    expect(html).toContain("임시 사실(검증됨 · 사람 확인 전)");
    expect(html).toContain("아직 확정 아님");
    expect(html).toContain('<b class="num">4대</b>');
    expect(html).toContain("녹화 재생(AI 미실행)");
    expect(html).toContain("근거: “차량 4대까지 가능합니다”");
    expect(html).toContain("모델: replay-v1");
    expect(html).toContain("시뮬레이션");
    expect(html).not.toContain("사람 확인 완료");
    expect(html).not.toContain("AI(LLM)");
  });

  it("offers confirm / reject / correct only on actionable candidates and only with an acting operator", () => {
    const html = render(fact({ candidates: [candidate(), candidate({ event_id: "e2", role: "SUPERSEDED" }), candidate({ event_id: "e3", role: "REJECTED" })] }));
    expect(html.match(/data-testid="fact-confirm"/g)).toHaveLength(1);
    expect(html).toContain("정정으로 대체됨");
    expect(html).toContain("거절됨");
    expect(render(fact(), null)).toMatch(/disabled="" data-testid="fact-confirm"/);
  });

  it("confirmed, human-entered and conflict states are told apart", () => {
    const confirmed = render(fact({ fact_state: "CONFIRMED", candidates: [candidate({ verification: "CONFIRMED", generated_by: "HUMAN" })] }));
    expect(confirmed).toContain("사람 확인 완료");
    expect(confirmed).toContain("사람 입력");
    expect(confirmed).not.toContain("아직 확정 아님");
    const review = render(fact({ fact_state: "NEEDS_REVIEW", conflict_status: "OPEN", hold_status: "HELD", decision_usability: "APPROVAL_BLOCKED" }));
    expect(review).toContain("검토 필요(충돌·보류)");
    expect(review).toContain("충돌 중 — 사람이 판단");
    expect(review).toContain("불리한 변경이 보류됨");
    expect(review).toContain("승인 판단에는 쓸 수 없음");
    expect(render(fact({ candidates: [candidate({ generated_by: "LLM" })] }))).toContain("AI(LLM)");
  });

  it("a fact without a usable value says so", () => {
    const html = render(fact({ fact_state: "UNKNOWN", current: null, candidates: [] }));
    expect(html).toContain("아직 값 없음");
    expect(html).toContain("쓸 수 있는 값이 아직 없습니다");
  });
});
