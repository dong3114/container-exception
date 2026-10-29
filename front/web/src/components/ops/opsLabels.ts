import type { Me } from "@/api/auth";
import { ApiError, describeApiError } from "@/api/errors";

/**
 * 운영 화면의 말(T-120). 순수 — Backend 가 알려 준 코드를 운영자 말로 바꿀 뿐, 판단하지 않는다. 모르는 코드는 그대로 보인다(지어내지 않는다).
 * 색만으로 상태를 나타내지 않도록 모든 상태에 글자 · 기호를 함께 준다.
 */

/** 사람이 해야 할 일 — Agent 의 대기 사유(WAITING_HUMAN) */
export const HUMAN_REASON: Record<string, { title: string; detail: string; icon: string }> = {
  CONTACT_REGISTRATION_REQUIRED: { icon: "☎", title: "연락 가능한 담당자가 없습니다", detail: "이 시설 · 트럭 풀에 연락할 수 있는 담당자가 등록되어 있지 않습니다. 담당자를 등록 · 승인하거나 값을 직접 입력하세요. CERA 는 다른 회사에 대신 묻지 않습니다." },
  CONTACT_SELECTION_REQUIRED: { icon: "☎", title: "연락할 담당자를 선택해야 합니다", detail: "연락 가능한 담당자가 여러 명이라 CERA 가 고르지 않았습니다. 이번 문의를 받을 사람을 고르세요." },
  REPLY_REVIEW_REQUIRED: { icon: "✉", title: "답장이 왔지만 AI 가 내용을 확정하지 못했습니다", detail: "답장을 읽고 다시 읽기를 요청하거나, 값을 직접 입력하세요." },
  HUMAN_APPROVAL_REQUIRED: { icon: "✔", title: "문의 초안 승인이 필요합니다", detail: "누구에게 어떤 내용이 나가는지 확인하고 승인 또는 거절하세요. Agent 는 승인하지 않습니다." },
  HUMAN_ACTION_REQUIRED: { icon: "✎", title: "문의 초안을 고쳐야 합니다", detail: "숫자 검사 등을 통과하지 못했습니다. 초안을 확인하세요." },
  AWAITING_SEND_REQUEST: { icon: "➤", title: "승인된 문의의 발송 요청이 필요합니다", detail: "승인만으로는 나가지 않습니다. 발송 요청을 누르세요." },
  AWAITING_FACT_VERIFICATION: { icon: "?", title: "임시 값의 확인이 필요합니다", detail: "답장에서 읽은 값이 아직 임시입니다. 확인 · 거절 · 정정하세요." },
  AWAITING_PLAN_DECISION: { icon: "▣", title: "복구 계획 승인이 필요합니다", detail: "제안된 계획을 검토하고 승인하세요. 승인은 배차 · 발송 지시가 아닙니다." },
};

/** 사람이 아닌 것을 기다리는 사유 — 알려 주기만 한다 */
export const WAIT_REASON: Record<string, string> = {
  AWAITING_DELIVERY: "발송 대기열에서 나가기를 기다립니다",
  AWAITING_REPLY: "상대 업체의 답장을 기다립니다",
  AWAITING_REPLIES: "보낸 문의들의 답장을 기다립니다",
  AGENT_RUNTIME_UNAVAILABLE: "Agent Runtime 에 닿지 않아 정해진 시각에 다시 시도합니다",
  AGENT_RUNTIME_TIMEOUT: "Agent Runtime 응답이 늦어 정해진 시각에 다시 시도합니다",
};

export const reasonTitle = (reason: string | null): string | null => (reason ? (HUMAN_REASON[reason]?.title ?? WAIT_REASON[reason] ?? reason) : null);

/** 할 일의 종류(심각도 아님) — 어떤 손이 필요한가 */
export const ACTION_KIND_LABEL: Record<"START" | "APPROVE" | "SEND" | "REVIEW" | "SELECT" | "FIX" | "CONFIRM", { label: string; badge: string }> = {
  START: { label: "시작", badge: "b-violet" },
  APPROVE: { label: "승인", badge: "b-blue" },
  SEND: { label: "발송", badge: "b-teal" },
  REVIEW: { label: "검토", badge: "b-orange" },
  SELECT: { label: "선택", badge: "b-cyan" },
  FIX: { label: "수정", badge: "b-red" },
  CONFIRM: { label: "확인", badge: "b-amber" },
};

/** 예외 종류 — 코드 대신 업무 말(코드는 기술 상세에서) */
export const EXCEPTION_TYPE_LABEL: Record<string, string> = { WAREHOUSE_CAPACITY_SHORTAGE: "창고 수용량 부족" };
export const exceptionTypeLabel = (code: string) => EXCEPTION_TYPE_LABEL[code] ?? code;

/** 실행 묶음 — 진행 중 · 사람 조치 필요 · 완료 · 중단/오류 */
export type RunGroup = "ACTION" | "ACTIVE" | "DONE" | "STOPPED";
export const RUN_GROUP_LABEL: Record<RunGroup, string> = { ACTION: "⚠ 사람 조치 필요", ACTIVE: "▶ 진행 중", DONE: "✓ 완료", STOPPED: "✕ 중단 · 오류" };
export const RUN_GROUP_BADGE: Record<RunGroup, string> = { ACTION: "b-amber", ACTIVE: "b-blue", DONE: "b-green", STOPPED: "b-red" };

/** 메시지 상태(문의 · 후속) */
export const MESSAGE_STATUS: Record<string, { label: string; badge: string }> = {
  DRAFTED: { label: "✎ 초안", badge: "b-outline" },
  PENDING_APPROVAL: { label: "⏳ 승인 대기", badge: "b-amber" },
  APPROVED: { label: "✔ 승인됨(발송 전)", badge: "b-teal" },
  REJECTED: { label: "✕ 거절됨", badge: "b-slate" },
  QUEUED: { label: "➤ 발송 대기열", badge: "b-blue" },
  SENT: { label: "➤ 보냄", badge: "b-green" },
  REPLIED: { label: "✉ 답장 받음", badge: "b-green" },
  DELIVERY_FAILED: { label: "✕ 발송 실패", badge: "b-red" },
  CLOSED: { label: "■ 종료", badge: "b-slate" },
  SUPERSEDED: { label: "↻ 새 초안으로 바뀜", badge: "b-slate" },
};
export const messageStatus = (s: string | null | undefined) => (s ? (MESSAGE_STATUS[s] ?? { label: s, badge: "b-outline" }) : { label: "초안 없음", badge: "b-outline" });

/** 후속의 종류(T-128) */
export const FOLLOW_UP_KIND: Record<string, { label: string; badge: string }> = {
  REQUEST: { label: "[요청]", badge: "b-blue" },
  CORRECTION: { label: "[정정]", badge: "b-orange" },
  CANCELLATION: { label: "[취소]", badge: "b-red" },
};
export const DELTA_LABEL: Record<string, string> = { ADDED: "새로 필요", MODIFIED: "수량 변경", REMOVED: "더는 필요 없음", CONTACT_CHANGED: "상대 회사 변경" };
export const FOLLOW_UP_BLOCKED: Record<string, string> = {
  NO_ELIGIBLE_CONTACT: "연락 가능한 담당자가 없습니다 — 담당자를 등록 · 승인해야 초안을 만들 수 있습니다",
  CONTACT_SELECTION_REQUIRED: "담당자가 여러 명입니다 — 이번 건을 받을 사람을 고르세요",
  RECIPIENT_NOT_ELIGIBLE: "받는 주소를 지금 쓸 수 없습니다",
};

/** 사실 상태 — 짧은 운영자 말(자세한 설명은 기존 사실 카드) */
export const TRUTH_SHORT: Record<string, { label: string; badge: string }> = {
  CONFIRMED: { label: "✓ 확정", badge: "b-green" },
  OBSERVED: { label: "◉ 공식 기록", badge: "b-blue" },
  PROVISIONAL: { label: "◐ 임시", badge: "b-amber" },
  NEEDS_REVIEW: { label: "! 확인 필요", badge: "b-red" },
  AGING: { label: "◔ 다시 확인 필요", badge: "b-amber" },
  STALE: { label: "◷ 오래되어 사용 주의", badge: "b-orange" },
  REVOKED: { label: "⊘ 철회", badge: "b-slate" },
  SUPERSEDED: { label: "↻ 새 값으로 대체", badge: "b-slate" },
  CONFLICTED: { label: "⚡ 값 충돌", badge: "b-red" },
  UNKNOWN: { label: "○ 값 없음", badge: "b-outline" },
};
export const truthShort = (state: string) => TRUTH_SHORT[state] ?? { label: state, badge: "b-outline" };

/** 계획 입력 준비도 */
export const READINESS: Record<string, { label: string; badge: string }> = {
  READY: { label: "✓ 계산 가능", badge: "b-green" },
  READY_WITH_PROVISIONAL: { label: "◐ 계산 가능(임시 값 포함)", badge: "b-amber" },
  NOT_READY: { label: "✕ 계산할 수 없음", badge: "b-red" },
};
export const MISSING_LABEL: Record<string, string> = {
  CONTAINER_SCOPE_EMPTY: "이 실행의 컨테이너가 없습니다",
  CONTAINER_RECORD: "컨테이너 계획 정보가 없습니다",
  CONTAINER_LFD: "컨테이너 LFD(무료기간 끝)가 없습니다",
  CONTAINER_DESTINATION: "컨테이너 목적지가 활성 창고가 아닙니다",
  TERMINAL_AMBIGUOUS: "한 실행에 출발 터미널이 여럿입니다",
  FACILITY_PROFILE: "시설 계획 정보(받는 규격 · 운영 시간)가 없습니다",
  FACILITY_CAPACITY: "시설 수용량이 없습니다",
  TRUCK_AVAILABILITY: "쓸 수 있는 트럭 시간창이 없습니다",
  OWN_TRUCK_NOT_CONFIRMED: "자사 트럭 가용이 확인되지 않았습니다",
  PARTNER_TRUCK_SLOTS: "협력 트럭 가용 시간창이 없습니다",
  RATE_MISSING: "계약 요율이 없습니다",
};
export const missingLabel = (code: string) => MISSING_LABEL[code] ?? code;

/** 계획이 무효(OUTDATED)가 된 이유 — 운영 기록 변경(T-123) 종류 */
export const RECORD_KIND_LABEL: Record<string, string> = { RATE: "계약 요율 변경", CONTAINER: "컨테이너 정보 변경", FACILITY_PROFILE: "시설 계획 정보 변경", CONTAINERS: "컨테이너 정보 변경", RATES: "계약 요율 변경", FACILITY_PROFILES: "시설 계획 정보 변경" };

/** Backend 오류 코드 → 운영자 말. 기술 상세(코드 · 요청 id)는 펼쳐 보기로 따로 */
export const ERROR_TEXT: Record<string, string> = {
  PLANNING_INPUT_UNAVAILABLE: "계획 계산에 필요한 정보가 부족합니다.",
  PLAN_SUPERSEDED: "이 초안은 이전 계획 기준이라 승인 · 발송할 수 없습니다.",
  PLAN_NOT_APPROVED: "승인된 계획에서만 후속 요청을 만들 수 있습니다.",
  RECIPIENT_NOT_ELIGIBLE: "선택한 담당자는 지금 사용할 수 없습니다(중지 · 거절 · 미승인).",
  CONTACT_NO_LONGER_ELIGIBLE: "선택한 담당자는 더 이상 사용할 수 없습니다.",
  WRONG_COUNTERPARTY: "이 건을 받아야 할 회사의 담당자가 아닙니다.",
  ROLE_MISMATCH: "이 건에 맞는 역할(운송사 · ODCY · 창고)의 회사가 아닙니다.",
  SIMULATION_MISMATCH: "시뮬레이션 실행과 실제 실행의 주소를 섞을 수 없습니다.",
  NOT_WAITING_FOR_CONTACT_SELECTION: "이 실행은 지금 담당자 선택을 기다리고 있지 않습니다(이미 풀렸을 수 있습니다).",
  GAP_ALREADY_RESOLVED: "필요했던 정보가 이미 채워졌습니다.",
  NO_OWNER_REGISTERED: "이 시설 · 트럭 풀의 운영 회사가 등록되어 있지 않습니다.",
  FOLLOW_UP_ALREADY_DRAFTED: "이 조치는 이미 초안이 있습니다 — 그 초안을 거절한 뒤 다시 하세요.",
  ADDRESS_ALREADY_REGISTERED: "이미 등록된 주소입니다.",
  COUNTERPARTY_ALREADY_REGISTERED: "같은 이름 · 역할의 회사가 이미 있습니다.",
  ADDRESS_REJECTED: "거절된 주소는 다시 쓸 수 없습니다 — 새 주소를 등록하세요.",
  PERMISSION_DENIED: "이 작업을 할 권한이 없습니다.",
  ACTOR_NOT_ALLOWED: "이 작업을 할 권한이 없습니다.",
  AUTH_REQUIRED: "로그인이 필요합니다.",
  EXTRACTION_IN_PROGRESS: "이미 다시 읽는 중입니다.",
  REPLY_SUPERSEDED: "더 최근 답장이 있어 이 답장은 다시 읽지 않습니다.",
  EXTRACTION_NOT_REQUIRED: "이 답장은 다시 읽을 필요가 없습니다.",
  INVALID_IMPORT_REQUEST: "입력 형식이 올바르지 않습니다.",
};
export function errorText(error: ApiError): string {
  return ERROR_TEXT[error.code] ?? (error.status === 403 ? ERROR_TEXT.PERMISSION_DENIED! : error.status === 401 ? ERROR_TEXT.AUTH_REQUIRED! : describeApiError(error));
}

/** 화면에서 버튼을 숨기거나 끈다 — 편의일 뿐, 막는 것은 Backend(401 · 403)다 */
export type Permission =
  | "agent_run.manage"
  | "communication.draft"
  | "communication.approve"
  | "communication.send"
  | "truth.review"
  | "truth.manual_entry"
  | "extraction.retry"
  | "plan.recalculate"
  | "plan.approve"
  | "planning.input"
  | "contact.select"
  | "registry.manage"
  | "system.monitor";
export const can = (me: Pick<Me, "permissions"> | null, p: Permission) => Boolean(me?.permissions.includes(p));

export const shortTime = (iso: string | null | undefined) => (iso ? iso.slice(5, 16).replace("T", " ") : "—");
export const shortId = (id: string) => id.slice(-6);
