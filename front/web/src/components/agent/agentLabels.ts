import type { AgentRun, AgentRunStatus } from "@/api/agentRuns";

/**
 * Agent progress in operator words (T-105). Pure — the screen does not decide anything, it only names what the
 * backend reports. Codes it does not know are shown as they are (never guessed).
 */
export const STATUS_LABEL: Record<AgentRunStatus, string> = {
  CREATED: "시작 전",
  RUNNING: "진행 중",
  WAITING_HUMAN: "사람 대기",
  WAITING_EXTERNAL: "외부 대기",
  WAITING_RUNTIME: "재시도 대기",
  COMPLETED: "완료",
  FAILED: "실패",
  CANCELLED: "취소됨",
};

export const STATUS_BADGE: Record<AgentRunStatus, string> = {
  CREATED: "b-outline",
  RUNNING: "b-blue",
  WAITING_HUMAN: "b-amber",
  WAITING_EXTERNAL: "b-violet",
  WAITING_RUNTIME: "b-orange",
  COMPLETED: "b-green",
  FAILED: "b-red",
  CANCELLED: "b-slate",
};

const NODE_LABEL: Record<string, string> = {
  load_context: "계획 맥락 읽기",
  observe_public_data: "공공데이터 조회(입항 정보)",
  inspect_gaps: "정보 공백 확인",
  choose_next_action: "다음 행동 결정",
  prepare_inquiry: "물어볼 상대 · 연락처 찾기",
  create_draft: "문의 초안 작성",
  request_approval: "승인 요청",
  wait_for_human: "승인 대기",
  track_message: "문의 상태 확인",
  wait_send_request: "발송 요청 대기",
  wait_delivery: "발송 대기",
  wait_reply: "회신 대기",
  read_reply: "회신 · 추출 후보 읽기",
  reassess_gaps: "정보 공백 다시 평가",
  build_result: "결과 정리",
  fetch_public_data: "공공데이터 조회",
  wait_external: "외부 대기",
  refresh_context: "맥락 다시 읽기",
};

export const nodeLabel = (node: string | null) => (node ? (NODE_LABEL[node] ?? node) : "—");

const WAITING_LABEL: Record<string, string> = {
  HUMAN_APPROVAL_REQUIRED: "문의 초안 승인을 기다립니다 — 아래 '문의 초안'에서 승인 또는 반려하세요. Agent 는 승인하지 않습니다.",
  HUMAN_ACTION_REQUIRED: "초안에 사람의 수정이 필요합니다 — 아래 '문의 초안'에서 확인하세요.",
  AWAITING_SEND_REQUEST: "승인됐습니다. 발송 요청을 기다립니다 — Agent 는 보내지 않습니다. 아래 '문의 초안'의 [발송 요청]을 누르세요.",
  AWAITING_DELIVERY: "발송 대기열에 있습니다 — 발송 Worker 가 보내기를 기다립니다.",
  AWAITING_REPLY: "상대 업체의 회신을 기다립니다. 회신이 오고 추출이 끝나면 자동으로 이어 갑니다.",
  AWAITING_REPLIES: "묻는 중인 문의의 회신을 기다립니다.",
  AGENT_RUNTIME_UNAVAILABLE: "Agent Runtime 에 닿지 않습니다 — 정해진 시각에 자동으로 다시 시도합니다.",
  AGENT_RUNTIME_TIMEOUT: "Agent Runtime 응답이 늦었습니다 — 정해진 시각에 자동으로 다시 시도합니다.",
};

export const waitingLabel = (reason: string | null) => (reason ? (WAITING_LABEL[reason] ?? reason) : null);

const RESULT_LABEL: Record<string, string> = {
  CANDIDATE_RECEIVED_PENDING_CONFIRMATION: "회신에서 검증을 통과한 값 후보가 도착했습니다. 아직 확정 사실이 아닙니다(사람 확인 · 다음 단계에서 반영).",
  REPLY_NEEDS_HUMAN_REVIEW: "회신은 왔지만 검증을 통과한 후보가 없습니다 — 사람이 회신을 읽고 판단해야 합니다.",
  INQUIRY_REJECTED: "문의 초안이 반려되어 이번 실행을 마쳤습니다.",
  APPROVAL_WITHDRAWN: "승인이 취소 · 무효화되어 이번 실행을 마쳤습니다.",
  NO_INFORMATION_GAPS: "지금 계획에 필요한 정보 공백이 없습니다.",
};

export const resultLabel = (code: string | null) => (code ? (RESULT_LABEL[code] ?? code) : null);

export interface Milestone {
  key: string;
  label: string;
  done: boolean;
}

/** The slice as checkpoints the operator recognises, read only from the run's recorded steps. */
export function milestones(run: AgentRun): Milestone[] {
  const steps = run.steps;
  const has = (pred: (s: AgentRun["steps"][number]) => boolean) => steps.some(pred);
  const nodeDetail = (node: string, codes: string[]) => has((s) => s.node === node && codes.includes(s.detail_code ?? ""));
  const terminal = steps.find((s) => s.kind === "TERMINAL");
  return [
    { key: "draft", label: "문의 초안 · 승인 요청", done: has((s) => s.node === "request_approval") },
    { key: "approved", label: "사람 승인", done: nodeDetail("track_message", ["AWAIT_SEND_REQUEST", "AWAIT_DELIVERY", "AWAIT_REPLY", "REPLY_READY"]) },
    { key: "sent", label: "발송(Worker)", done: nodeDetail("track_message", ["AWAIT_REPLY", "REPLY_READY"]) },
    { key: "reply", label: "회신 도착 · AI 추출 완료", done: nodeDetail("track_message", ["REPLY_READY"]) || has((s) => s.node === "read_reply") },
    { key: "reassess", label: "정보 공백 재평가", done: has((s) => s.node === "reassess_gaps") },
    { key: "result", label: "최종 결과", done: Boolean(terminal) },
  ];
}

export function terminalCode(run: AgentRun): string | null {
  return run.steps.find((s) => s.kind === "TERMINAL")?.detail_code ?? null;
}

export const isActive = (status: AgentRunStatus) => status !== "COMPLETED" && status !== "FAILED" && status !== "CANCELLED";

const SUMMARY_LABEL: Record<string, string> = {
  reply_outcome: "회신 결과",
  candidate_state: "후보 상태(작업 흐름)",
  business_gap_state: "업무 공백 상태(사실 기준)",
  candidate_fields: "후보가 온 항목",
  facts_confirmed: "확정된 사실",
  public_data_mode: "공공데이터 출처",
  public_data_outcome: "공공데이터 조회 결과",
  public_vessel_call_count: "조회된 입항 건",
  reply_count: "회신 수",
  gap_kind: "공백 종류",
};

/** Rows for the result card — known keys only, in a fixed order; values as reported. */
export function summaryRows(summary: AgentRun["result_summary"]): { label: string; value: string }[] {
  if (!summary) return [];
  return Object.keys(SUMMARY_LABEL)
    .filter((k) => summary[k] !== undefined && summary[k] !== null)
    .map((k) => {
      const v = summary[k];
      const value = Array.isArray(v) ? v.join(", ") || "—" : typeof v === "boolean" ? (v ? "예" : "아니오 — 아직 후보") : String(v);
      return { label: SUMMARY_LABEL[k] ?? k, value };
    });
}
