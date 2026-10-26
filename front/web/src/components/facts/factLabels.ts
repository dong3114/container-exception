import type { FactCandidate, FactCoordinate, FactReasonCode } from "@/api/truth";

/** Fact judgement in operator words (T-093). Pure — names what the backend reports; unknown codes are shown as they are. */
export const FACT_STATE_LABEL: Record<FactCoordinate["fact_state"], string> = {
  PROVISIONAL: "임시 사실(검증됨 · 사람 확인 전)",
  CONFIRMED: "사람 확인 완료",
  OBSERVED: "공식 기록(사람 확인 아님)",
  NEEDS_REVIEW: "검토 필요(충돌·보류)",
  UNKNOWN: "아직 값 없음",
};

export const FACT_STATE_BADGE: Record<FactCoordinate["fact_state"], string> = {
  PROVISIONAL: "b-amber",
  CONFIRMED: "b-green",
  OBSERVED: "b-blue",
  NEEDS_REVIEW: "b-red",
  UNKNOWN: "b-outline",
};

/** Always shown next to a provisional fact so an AI value is never read as settled. */
export const PROVISIONAL_NOTE = "아직 확정 아님 — 사람이 확인하기 전까지 임시로만 씁니다";

export const ROLE_LABEL: Record<FactCandidate["role"], string> = {
  WINNER: "현재 값",
  CORROBORATING: "같은 값",
  OUTDATED: "더 새 값에 밀림",
  DISSENTING: "반대 의견(기록만)",
  CONTESTING: "충돌 중",
  HELD_CANDIDATE: "보류된 변경",
  INELIGIBLE: "자격 없음",
  REJECTED: "거절됨",
  SUPERSEDED: "정정으로 대체됨",
};

/** Rejected or superseded values have nothing left to decide. */
export const isActionable = (c: FactCandidate) => c.role !== "SUPERSEDED" && c.role !== "REJECTED";

export const USABILITY_LABEL: Record<FactCoordinate["decision_usability"], string> = {
  USABLE: "판단에 쓸 수 있음",
  USABLE_WITH_WARNING: "경고와 함께 쓸 수 있음",
  APPROVAL_BLOCKED: "승인 판단에는 쓸 수 없음",
  UNUSABLE: "쓸 수 없음",
};

export const HOLD_LABEL: Record<FactCoordinate["hold_status"], string> = { NONE: "", HELD: "불리한 변경이 보류됨 — 사람이 판단" };
export const CONFLICT_LABEL: Record<FactCoordinate["conflict_status"], string> = { NONE: "", DISSENT: "반대 의견이 있음(기록만)", OPEN: "충돌 중 — 사람이 판단" };

export const REASON_OPTIONS: { code: FactReasonCode; label: string }[] = [
  { code: "MODEL_MISREAD", label: "모델이 잘못 읽음" },
  { code: "CONDITIONAL_ANSWER", label: "조건부 답변" },
  { code: "OUTDATED_REPLY", label: "오래된 회신" },
  { code: "WRONG_SENDER_CONTEXT", label: "보낸 사람/맥락 불일치" },
  { code: "WRONG_UNIT", label: "단위 오류" },
  { code: "CONFLICTING_EVIDENCE", label: "상충하는 근거" },
  { code: "OPERATOR_CORRECTION", label: "운영자 정정" },
];

const BLOCKED_LABEL: Record<string, string> = {
  SENDER_NOT_AUTHORITY: "권한 없는 발신자",
  AMBIGUOUS_REPLY: "모호한 표현",
  WINDOW_OUT_OF_SCOPE: "질문 시간창 밖",
  DATE_OUT_OF_SCOPE: "질문 날짜와 다른 날짜",
  DATE_UNVERIFIED: "날짜 확인 불가",
  DUPLICATE_CLAIM: "같은 주장이 다른 값으로 이미 있음",
  WINDOW_UNVERIFIED: "시간창 검증 불가",
  PLAN_SUPERSEDED: "계획 교체됨",
  ASK_CANCELLED: "질문 취소됨",
  QUESTION_TARGET_MISSING: "대상 불명",
  UNSUPPORTED_FACT: "지원하지 않는 사실",
  SCENARIO_MISSING: "시나리오 없음",
};
export const blockedReasonLabel = (code: string) => BLOCKED_LABEL[code] ?? code;

export const GENERATED_BY_LABEL: Record<FactCandidate["generated_by"], string> = {
  RECORDED_REPLAY: "녹화 재생(AI 미실행)",
  LLM: "AI(LLM)",
  HUMAN: "사람 입력",
  SYSTEM: "시스템 기록",
};

const SOURCE_LABEL: Record<string, string> = { EMAIL: "메일 회신", HUMAN_UI: "화면에서 사람 입력" };
export const sourceLabel = (source: string) => SOURCE_LABEL[source] ?? source;

const UNIT_LABEL: Record<string, string> = { TRUCK: "대", CONTAINER: "개", KRW: "원" };
export const formatValue = (value: number | null, unit: string | null) => (value === null ? "값 없음" : `${value}${unit ? (UNIT_LABEL[unit] ?? ` ${unit}`) : ""}`);

export const formatTime = (iso: string) => iso.slice(0, 16).replace("T", " ");
export function formatWindow(from: string | null, until: string | null): string {
  if (!from && !until) return "";
  if (from && until && from.slice(0, 10) === until.slice(0, 10)) return `${from.slice(0, 10)} ${from.slice(11, 16)}–${until.slice(11, 16)}`;
  return `${from ? formatTime(from) : "?"} ~ ${until ? formatTime(until) : "?"}`;
}

/** fact_key → plain Korean. Unknown shapes fall back to the raw key. */
export function factTitle(factKey: string): string {
  const slot = /^available\.slot\((\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})-(\d{2}:\d{2})\)$/.exec(factKey);
  if (slot) return `차량 가용 · ${slot[1]} ${slot[2]}–${slot[3]}`;
  const day = /^capacity\.day\((\d{4}-\d{2}-\d{2})\)$/.exec(factKey);
  if (day) return `일별 수용량 · ${day[1]}`;
  return factKey;
}

const ERROR_LABEL: Record<string, string> = {
  ACTOR_NOT_ALLOWED: "이 담당자는 사실을 확인·거절·정정할 권한이 없습니다",
  EVENT_SUPERSEDED: "이미 다른 값으로 대체된 기록입니다 — 새로 고친 뒤 다시 보세요",
  ALREADY_REJECTED: "이미 거절된 기록입니다",
  VALUE_UNCHANGED: "정정 값이 현재 값과 같습니다",
  INVALID_FACT_REQUEST: "요청 내용이 올바르지 않습니다 — 값과 사유를 확인하세요",
};
/** Backend error → Korean-friendly line; the code stays visible for support. */
export const factErrorText = (code: string, fallback: string) => (ERROR_LABEL[code] ? `${ERROR_LABEL[code]} (${code})` : `${code} — ${fallback}`);
