import type { InboundItem } from "@/api/drafts";
import { blockedReasonLabel } from "@/components/facts/factLabels";

type Extraction = NonNullable<InboundItem["extraction"]>;
type Candidate = Extraction["candidates"][number];

const FIELD_LABEL: Record<string, string> = {
  quantity: "가능 수량",
  available_from: "가능 시작 시각",
  available_until: "가능 종료 시각",
  rate_per_truck: "대당 단가",
};
const UNIT_LABEL: Record<string, string> = { TRUCK: "대", CONTAINER: "개", KRW: "원" };
const REASON_LABEL: Record<string, string> = {
  QUOTE_NOT_IN_SOURCE: "근거 문장이 회신 원문에 없음",
  FIELD_NOT_ASKED: "문의하지 않은 항목",
  UNKNOWN_ASK: "없는 질문에 대한 답",
  VALUE_NOT_IN_QUOTE: "값이 근거 문장에 없음",
  CONFLICTING_CANDIDATES: "같은 질문에 서로 다른 값",
  BAD_QUANTITY: "수량 형식이 아님",
  BAD_TIME: "시각 형식이 아님",
  BAD_MONEY: "금액 형식이 아님",
};
const STATE_TEXT: Record<Extraction["state"], string> = {
  WAITING: "AI 추출 대기 중",
  DONE: "",
  NO_CANDIDATE: "회신에서 질문에 대한 값을 찾지 못함",
  SKIPPED: "추출하지 않음(원문 또는 질문 없음)",
  RETRYING: "AI 추출 일시 실패 — 자동으로 다시 시도합니다",
  FAILED: "AI 추출 실패 — 재시도 한도에 도달(회신 원문은 그대로 보관)",
};

const reason = (r: string) => (r.startsWith("UNIT_MISMATCH:") ? `단위가 맞지 않음(${r.slice(14)})` : (REASON_LABEL[r] ?? r));
/** Where the candidate stands after validation: still a candidate, a provisional fact, or left for a person. */
function promotionNote(c: Candidate): { text: string; badge: string } | null {
  if (c.review_status === "ACCEPTED") return { text: "임시 사실로 올라감 — 아직 사람이 확인하지 않았습니다(‘사실 판단’에서 확인·거절·정정)", badge: "b-amber" };
  if (c.review_status === "PENDING" && c.validation === "PASSED") return { text: "자동 승격 안 됨 — 사람이 판단", badge: "b-orange" };
  return null;
}

const show = (c: Candidate) => `${c.value}${c.unit ? (UNIT_LABEL[c.unit] ?? ` ${c.unit}`) : ""}`;

/**
 * AI 제안(T-092) — 회신 원문에서 AI 가 찾은 **값 후보**와 그 근거 문장, Backend 검증 결과. 확정된 사실이 아니다:
 * 통과한 후보도 아직 업무에 반영되지 않았다(사실로 만드는 것은 다음 단계 — Backend 규칙과 사람 확인).
 */
export function ExtractionView({ extraction }: { extraction: Extraction }) {
  const replay = extraction.candidates.some((c) => c.generated_by === "RECORDED_REPLAY");
  const candidates: Candidate[] = extraction.candidates;
  return (
    <div data-testid="extraction-view" data-extraction-state={extraction.state} style={{ display: "grid", gap: 4, borderLeft: "3px solid var(--line-strong)", paddingLeft: 8 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span className="badge b-violet">AI 제안</span>
        {replay && <span className="badge b-sim">녹화 재생 — LLM 미실행</span>}
        <span className="muted" style={{ fontSize: 11 }}>후보일 뿐 — 확정되지 않았고 업무에 반영되지 않았습니다. 검증을 통과해 조건을 채운 값만 ‘임시 사실’이 되며, 그것도 사람이 확인해야 확정됩니다</span>
      </div>
      {extraction.state !== "DONE" && (
        <div style={{ fontSize: 12 }} data-testid="extraction-state">
          {STATE_TEXT[extraction.state]}
          {extraction.no_candidate_outcome ? ` (${extraction.no_candidate_outcome})` : ""}
          {extraction.last_error_code && extraction.state !== "NO_CANDIDATE" ? ` · ${extraction.last_error_code}` : ""}
        </div>
      )}
      {candidates.map((c) => {
        const note = promotionNote(c);
        const blocked = c.promotion_blocked_reasons;
        return (
        <div key={c.extraction_id} data-testid="extraction-candidate" data-validation={c.validation} style={{ fontSize: 12, display: "grid", gap: 1 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span>{FIELD_LABEL[c.field] ?? c.field}:</span>
            <b className="num">{show(c)}</b>
            <span className={`badge ${c.validation === "PASSED" ? "b-green" : "b-red"}`}>{c.validation === "PASSED" ? "검증 통과" : "검증 실패"}</span>
            {c.validation === "REJECTED" && <span className="muted">업무에 반영되지 않음 — {c.failed_reasons.map(reason).join(" · ")}</span>}
          </div>
          {note && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }} data-testid="extraction-promotion">
              <span className={`badge ${note.badge}`}>{note.text}</span>
              {note.badge === "b-orange" && blocked.length > 0 && <span className="muted">이유: {blocked.map(blockedReasonLabel).join(" · ")}</span>}
            </div>
          )}
          <div className="muted" style={{ fontSize: 11.5 }}>근거: “{c.evidence_quote ?? "(인용을 찾을 수 없음)"}”</div>
        </div>
        );
      })}
    </div>
  );
}
