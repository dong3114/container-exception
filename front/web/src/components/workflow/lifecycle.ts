/**
 * Presentation mapping only — the backend decides every state; the screen translates it into words.
 *
 * Status codes are the canonical CLOSED codes, typed in the Frontend Data Contract (src/contracts/cera.ts).
 */

import type { InvalidationCause, MessageStatusCode } from "@/contracts/cera";

export type { InvalidationCause, MessageStatusCode };

/** The visible states of an outbound inquiry (docs/19 15.1). */
export type VisibleMessageState =
  | "DRAFTING"
  | "NEEDS_FIX"
  | "NEEDS_APPROVAL"
  | "WAITING_TO_SEND"
  | "SENDING"
  | "SENT"
  | "REPLIED"
  | "SEND_FAILED"
  | "CANCELLED";

export const VISIBLE_STATE_LABEL: Record<VisibleMessageState, string> = {
  DRAFTING: "작성 중",
  NEEDS_FIX: "내용 확인 필요",
  NEEDS_APPROVAL: "승인 필요",
  WAITING_TO_SEND: "발송 대기",
  SENDING: "발송 중",
  SENT: "발송 완료",
  REPLIED: "회신 받음",
  SEND_FAILED: "발송 실패",
  CANCELLED: "취소됨",
};

export const INVALIDATION_LABEL: Record<InvalidationCause, string> = {
  CONTENT_CHANGED: "승인 뒤 내용이 바뀌어 다시 승인해야 합니다",
  PLAN_SUPERSEDED: "근거 계획이 바뀌어 승인이 풀렸습니다",
  USER_REVOKED: "운영자가 승인을 취소했습니다",
};

export interface MessageFacts {
  status: MessageStatusCode;
  /** The draft failed the number check (docs/19 FR-COM-08). */
  numberCheckFailed?: boolean;
  /** A send attempt exists without a result yet — there is no SENDING status code; it is an open attempt. */
  attemptInProgress?: boolean;
  /** The latest approval was revoked or invalidated. */
  invalidation?: InvalidationCause | null;
}

export function visibleMessageState(m: MessageFacts): VisibleMessageState {
  if (m.invalidation) return "CANCELLED";
  switch (m.status) {
    case "DRAFTED":
      return m.numberCheckFailed ? "NEEDS_FIX" : "DRAFTING";
    case "PENDING_APPROVAL":
      return "NEEDS_APPROVAL";
    case "APPROVED":
    case "QUEUED":
      return m.attemptInProgress ? "SENDING" : "WAITING_TO_SEND";
    case "SENT":
      return "SENT";
    case "REPLIED":
      return "REPLIED";
    case "DELIVERY_FAILED":
      return "SEND_FAILED";
    case "REJECTED":
    case "CLOSED":
      return "CANCELLED";
  }
}

/** The main path drawn as steps. Off-path states (failed, cancelled) are shown as a flag on the step reached. */
export const MAIN_PATH: VisibleMessageState[] = ["DRAFTING", "NEEDS_APPROVAL", "WAITING_TO_SEND", "SENDING", "SENT", "REPLIED"];

export function mainPathIndex(state: VisibleMessageState): number {
  if (state === "NEEDS_FIX") return 0;
  if (state === "SEND_FAILED") return MAIN_PATH.indexOf("SENDING");
  if (state === "CANCELLED") return -1;
  return MAIN_PATH.indexOf(state);
}

/**
 * How trustworthy a value is, as the operator must see it (docs/01 3절 · ADR-029: LLM output is a candidate).
 * "AI 제안" appears only when the value really came from an LLM (extraction_method = LLM_EXTRACTED);
 * scenario or rule values are never labelled as AI output.
 */
export type CandidateState = "AI_SUGGESTION" | "PROVISIONAL" | "NEEDS_HUMAN_REVIEW" | "HUMAN_CONFIRMED" | "REJECTED";

export const CANDIDATE_LABEL: Record<CandidateState, string> = {
  AI_SUGGESTION: "AI 제안 · 확정 아님",
  PROVISIONAL: "잠정 정보",
  NEEDS_HUMAN_REVIEW: "사람 확인 필요",
  HUMAN_CONFIRMED: "확인 완료",
  REJECTED: "기각됨",
};

export interface CandidateFacts {
  /** extraction.extraction_method — DIRECT | RULE_PARSED | LLM_EXTRACTED | CALCULATED, or a scenario note. */
  method: string;
  /** extraction.review_status — PENDING | ACCEPTED | REJECTED | SUPERSEDED, when the value is still a candidate. */
  reviewStatus?: "PENDING" | "ACCEPTED" | "REJECTED" | "SUPERSEDED" | null;
  /** value_status of the resulting fact. */
  valueStatus?: string | null;
}

export function candidateState(c: CandidateFacts): CandidateState {
  if (c.reviewStatus === "REJECTED" || c.reviewStatus === "SUPERSEDED") return "REJECTED";
  if (c.reviewStatus === "ACCEPTED" || c.valueStatus === "CONFIRMED") return "HUMAN_CONFIRMED";
  if (c.method === "LLM_EXTRACTED") return "AI_SUGGESTION";
  if (c.reviewStatus === "PENDING") return "NEEDS_HUMAN_REVIEW";
  return "PROVISIONAL";
}
