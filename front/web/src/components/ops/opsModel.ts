import type { AgentRun, AgentRunListItem } from "@/api/agentRuns";
import type { Draft, InboundItem, RunList } from "@/api/drafts";
import type { ContactAddress, Counterparty, FollowUpView } from "@/api/ops";
import type { Plan, PlanItem, PlanSummary } from "@/api/plans";
import type { FactCoordinate } from "@/api/truth";
import { nodeLabel } from "@/components/agent/agentLabels";
import { ACTION_LABEL, outdatedLabel } from "@/components/plan/planLabels";
import { HUMAN_REASON, RECORD_KIND_LABEL, type RunGroup, reasonTitle } from "./opsLabels";

/**
 * 운영 화면의 판단 없는 조합(T-120). 순수 — Backend 가 낸 기록(실행 · Agent · 초안 · 회신 · 계획 · 사실)을 한데 모아
 * "지금 사람이 할 일" · 실행 묶음 · 타임라인 · 판 비교를 만든다. 새 사실을 만들거나 숫자를 계산하지 않는다(계획 숫자는 엔진 값 그대로).
 */
export type RunSummary = RunList["runs"][number];
export type OpsTab = "overview" | "agent" | "facts" | "comms" | "plan" | "changes" | "timeline" | "inputs";

export interface RunRow {
  run: RunSummary;
  agent: AgentRunListItem | null;
  plan: PlanSummary | null;
}

/** 실행마다 가장 최근 Agent 실행 */
export function latestAgentByRun(agents: AgentRunListItem[]): Map<string, AgentRunListItem> {
  const out = new Map<string, AgentRunListItem>();
  for (const a of agents) {
    const prev = out.get(a.recovery_run_id);
    if (!prev || a.started_at > prev.started_at) out.set(a.recovery_run_id, a);
  }
  return out;
}

export const draftRunId = (d: Draft) => d.source_run?.run_id ?? d.thread.related_run_id ?? null;

export interface ActionItem {
  key: string;
  runId: string | null;
  icon: string;
  title: string;
  detail: string;
  target: string | null;
  tab: OpsTab;
  /** 화면이 바로 열 대상(초안 · 회신 · 계획) */
  ref: { type: "AGENT_RUN" | "COMM_MESSAGE" | "INBOUND" | "PLAN" | "FOLLOW_UP"; id: string } | null;
}

const TAB_FOR_REASON: Record<string, OpsTab> = {
  CONTACT_REGISTRATION_REQUIRED: "agent",
  CONTACT_SELECTION_REQUIRED: "agent",
  REPLY_REVIEW_REQUIRED: "comms",
  HUMAN_APPROVAL_REQUIRED: "comms",
  HUMAN_ACTION_REQUIRED: "comms",
  AWAITING_SEND_REQUEST: "comms",
  AWAITING_FACT_VERIFICATION: "facts",
  AWAITING_PLAN_DECISION: "plan",
};

export interface ActionInputs {
  rows: RunRow[];
  drafts: Draft[];
  inbound: InboundItem[];
  /** 선택한 실행의 승인된 판 후속(있을 때만) */
  followUps?: { planId: string; runId: string; actions: FollowUpView[] } | null;
  names?: Map<string, string>;
}

/**
 * 사람이 할 일 — Agent 의 사람 대기 · 승인 대기 초안 · 발송 요청 대기 · 검토할 답장 · 승인 대기 계획 · 담당자가 필요한 후속.
 * 같은 일을 두 번 세지 않는다(Agent 가 기다리는 초안 = 그 초안 한 건).
 */
export function deriveActions({ rows, drafts, inbound, followUps, names }: ActionInputs): ActionItem[] {
  const out = new Map<string, ActionItem>();
  const add = (a: ActionItem) => {
    if (!out.has(a.key)) out.set(a.key, a);
  };
  const name = (id: string | undefined | null) => (id ? (names?.get(id) ?? null) : null);

  for (const { agent } of rows) {
    if (!agent || agent.status !== "WAITING_HUMAN" || !agent.waiting_reason) continue;
    const r = HUMAN_REASON[agent.waiting_reason];
    const ref = agent.pending_ref ?? null;
    const key = ref?.type === "COMM_MESSAGE" ? `msg:${ref.id}` : ref?.type === "RECOVERY_PLAN" ? `plan:${ref.id}` : `agent:${agent.agent_run_id}`;
    add({
      key,
      runId: agent.recovery_run_id,
      icon: r?.icon ?? "!",
      title: r?.title ?? agent.waiting_reason,
      detail: r?.detail ?? "",
      target: name(ref?.id) ?? null,
      tab: TAB_FOR_REASON[agent.waiting_reason] ?? "agent",
      ref: ref?.type === "COMM_MESSAGE" ? { type: "COMM_MESSAGE", id: ref.id } : ref?.type === "RECOVERY_PLAN" ? { type: "PLAN", id: ref.id } : { type: "AGENT_RUN", id: agent.agent_run_id },
    });
  }

  for (const d of drafts) {
    const id = d.message.message_id;
    const who = `${d.thread.counterparty_name}${d.thread.contact_name ? ` · ${d.thread.contact_name}` : ""}`;
    if (d.message.status === "PENDING_APPROVAL") {
      add({ key: `msg:${id}`, runId: draftRunId(d), icon: "✔", title: "문의 초안 승인이 필요합니다", detail: d.message.subject ?? "", target: who, tab: "comms", ref: { type: "COMM_MESSAGE", id } });
    } else if (d.message.status === "APPROVED" && d.dispatch.can_request_send) {
      add({ key: `msg:${id}`, runId: draftRunId(d), icon: "➤", title: "승인된 문의의 발송 요청이 필요합니다", detail: d.message.subject ?? "", target: who, tab: "comms", ref: { type: "COMM_MESSAGE", id } });
    }
  }

  const runOfThread = new Map(drafts.map((d) => [d.thread.thread_id, draftRunId(d)]));
  for (const i of inbound) {
    if (i.status !== "NORMAL" || !i.extraction?.needs_review) continue;
    const runId = runOfThread.get(i.thread_id ?? "") ?? null;
    // Agent 가 이 실행에서 회신 검토를 기다리면 그 항목이 같은 일이다
    if (runId && [...out.values()].some((a) => a.runId === runId && a.title === HUMAN_REASON.REPLY_REVIEW_REQUIRED!.title)) continue;
    // Agent 가 이미 다음으로 넘어갔으면(값을 직접 넣었거나 다른 길로 앎) 이 답장은 더는 일을 막지 않는다 — 기록은 연락 탭에 남는다.
    // (답장의 needs_review 는 그 답장 추출에 대한 표시라 공백이 닫혀도 남는다)
    const agentOfRun = runId ? rows.find((r) => r.run.run_id === runId)?.agent : null;
    if (agentOfRun && agentOfRun.waiting_reason !== "REPLY_REVIEW_REQUIRED") continue;
    add({ key: `in:${i.message_id ?? i.raw_input_id}`, runId, icon: "✉", title: HUMAN_REASON.REPLY_REVIEW_REQUIRED!.title, detail: i.subject ?? "", target: i.sender_label?.counterparty_name ?? i.thread_counterparty_name ?? i.from_address, tab: "comms", ref: { type: "INBOUND", id: i.message_id ?? i.raw_input_id } });
  }

  for (const { run, plan } of rows) {
    if (plan?.plan_status === "PROPOSED") add({ key: `plan:${plan.plan_id}`, runId: run.run_id, icon: "▣", title: `복구 계획 v${plan.version} 승인이 필요합니다`, detail: "제안된 계획을 검토하고 승인하세요. 승인은 배차 · 발송 지시가 아닙니다.", target: run.trigger_ref, tab: "plan", ref: { type: "PLAN", id: plan.plan_id } });
  }

  for (const f of followUps?.actions ?? []) {
    if (f.message_id || !f.blocked_reason) continue;
    if (f.blocked_reason !== "CONTACT_SELECTION_REQUIRED" && f.blocked_reason !== "NO_ELIGIBLE_CONTACT") continue;
    add({
      key: `fu:${followUps!.planId}:${f.action_key}`,
      runId: followUps!.runId,
      icon: "☎",
      title: f.blocked_reason === "CONTACT_SELECTION_REQUIRED" ? "후속 요청을 받을 담당자를 선택해야 합니다" : "후속 요청을 보낼 담당자가 없습니다",
      detail: `${f.follow_up_kind === "CANCELLATION" ? "[취소]" : f.follow_up_kind === "CORRECTION" ? "[정정]" : "[요청]"} ${f.target_name} ${f.date} ${f.quantity}`,
      target: f.target_name,
      tab: "changes",
      ref: { type: "FOLLOW_UP", id: f.action_key },
    });
  }
  return [...out.values()];
}

export function runGroup(row: RunRow, actions: ActionItem[]): RunGroup {
  if (actions.some((a) => a.runId === row.run.run_id)) return "ACTION";
  const s = row.agent?.status;
  if (s === "FAILED" || s === "CANCELLED") return "STOPPED";
  if (s === "COMPLETED") return "DONE";
  if (!row.agent && row.plan?.plan_status === "APPROVED") return "DONE";
  return "ACTIVE";
}

/** Agent 가 지금 무엇을 하고 · 무엇을 기다리고 · 마지막에 무엇을 했고 · 다음에 무엇을 할지 — 기록된 단계만으로 */
export interface AgentNarrative {
  now: string;
  waiting: string | null;
  last: string | null;
  next: string | null;
}
const NEXT_AFTER: Record<string, string> = {
  HUMAN_APPROVAL_REQUIRED: "사람이 승인하면 발송 요청을 기다립니다",
  AWAITING_SEND_REQUEST: "발송 요청이 오면 Worker 가 보내고, 답장을 기다립니다",
  AWAITING_DELIVERY: "보내지면 답장을 기다립니다",
  AWAITING_REPLY: "답장이 오면 AI 가 읽고 정보 공백을 다시 평가합니다",
  REPLY_REVIEW_REQUIRED: "다시 읽기가 값을 얻거나 사람이 값을 넣으면 다음 공백으로 갑니다",
  AWAITING_FACT_VERIFICATION: "사람이 확인 · 거절하면 정보 공백을 다시 평가합니다",
  CONTACT_REGISTRATION_REQUIRED: "담당자가 등록 · 승인되면 문의 초안을 만듭니다",
  CONTACT_SELECTION_REQUIRED: "담당자를 고르면 그 사람에게 문의 초안을 만듭니다",
  AWAITING_PLAN_DECISION: "사람이 승인하면 실행을 마칩니다 · 사실이 바뀌면 다시 계산합니다",
};
export function agentNarrative(run: Pick<AgentRun, "status" | "current_node" | "waiting_reason" | "steps" | "last_error_code">): AgentNarrative {
  const nodes = run.steps.filter((s) => s.kind === "NODE" && s.node);
  const lastNode = nodes.at(-1);
  const now =
    run.status === "COMPLETED" ? "실행을 마쳤습니다" : run.status === "FAILED" ? `실패했습니다${run.last_error_code ? ` (${run.last_error_code})` : ""}` : run.status === "CANCELLED" ? "취소되었습니다" : nodeLabel(run.current_node);
  return {
    now,
    waiting: run.status.startsWith("WAITING") ? reasonTitle(run.waiting_reason) : null,
    last: lastNode ? `${nodeLabel(lastNode.node)}${lastNode.detail_code ? ` — ${lastNode.detail_code}` : ""}` : null,
    next: run.waiting_reason ? (NEXT_AFTER[run.waiting_reason] ?? null) : null,
  };
}

/** 시간 순서 기록 — Agent 단계 · 초안 · 승인 · 발송 · 답장 · 계획. 새 사건을 만들지 않고 이미 있는 기록을 늘어놓는다 */
export interface TimelineEntry {
  at: string;
  who: "AGENT" | "HUMAN" | "SYSTEM" | "PARTNER";
  text: string;
}
const KEY_NODES = new Set(["inspect_gaps", "prepare_inquiry", "create_draft", "request_approval", "read_reply", "reassess_gaps", "calculate_costs", "solve_recovery", "propose_plan", "build_result"]);
export function buildTimeline(input: { agent?: Pick<AgentRun, "steps"> | null; drafts: Draft[]; plans: PlanSummary[]; approvedPlans?: Pick<Plan, "plan_id" | "version" | "approved_at">[] }): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (const s of input.agent?.steps ?? []) {
    if (s.kind === "START") out.push({ at: s.started_at, who: "AGENT", text: "Agent 시작" });
    else if (s.kind === "INTERRUPT") out.push({ at: s.started_at, who: "AGENT", text: `대기: ${reasonTitle(s.detail_code) ?? "—"}` });
    else if (s.kind === "RESUME") out.push({ at: s.started_at, who: "SYSTEM", text: `재개${s.detail_code ? ` (${s.detail_code})` : ""}` });
    else if (s.kind === "TERMINAL") out.push({ at: s.started_at, who: "AGENT", text: `종료 — ${s.detail_code ?? s.outcome}` });
    else if (s.node && KEY_NODES.has(s.node)) out.push({ at: s.started_at, who: "AGENT", text: `${nodeLabel(s.node)}${s.detail_code ? ` · ${s.detail_code}` : ""}` });
  }
  for (const d of input.drafts) {
    const to = d.thread.counterparty_name;
    out.push({ at: d.message.created_at, who: d.message.drafted_by === "HUMAN" ? "HUMAN" : "AGENT", text: `문의 초안 → ${to}: ${d.message.subject}` });
    for (const h of d.approval.history) if (h.decided_at) out.push({ at: h.decided_at, who: h.actor_type === "HUMAN" ? "HUMAN" : "SYSTEM", text: `${h.decision === "APPROVED" ? "승인" : h.decision === "REJECTED" ? "거절" : h.decision} — ${to}${h.actor_name ? ` (${h.actor_name})` : ""}` });
    if (d.dispatch.sent_at) out.push({ at: d.dispatch.sent_at, who: "SYSTEM", text: `발송 → ${to}` });
    for (const r of d.replies) {
      out.push({ at: r.received_at, who: "PARTNER", text: `답장 수신 ← ${r.sender_label?.counterparty_name ?? r.from_address}` });
      for (const a of r.extraction?.attempts ?? []) if (a.at) out.push({ at: a.at, who: a.trigger === "HUMAN_RETRY" ? "HUMAN" : "SYSTEM", text: `AI 읽기 ${a.attempt_no}회차 — ${a.result}${a.error_code ? ` (${a.error_code})` : ""}` });
    }
  }
  for (const p of input.plans) out.push({ at: p.created_at, who: p.agent_run_id ? "AGENT" : "HUMAN", text: `계획 v${p.version} 계산 — ${p.solver_status}` });
  for (const p of input.approvedPlans ?? []) if (p.approved_at) out.push({ at: p.approved_at, who: "HUMAN", text: `계획 v${p.version} 승인` });
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** 두 판의 컨테이너별 조치 비교 — 엔진이 낸 항목을 그대로 맞대 본다(계산하지 않는다) */
export interface PlanDiffRow {
  container_id: string;
  change: "ADDED" | "REMOVED" | "MODIFIED" | "UNCHANGED";
  before: string | null;
  after: string | null;
}
const describeItem = (i: PlanItem) => `${ACTION_LABEL[i.action] ?? i.action}${i.target_name ? ` → ${i.target_name}` : ""}${i.delivery_day ? ` · ${i.delivery_day}` : ""}${i.scheduled_time ? ` ${i.scheduled_time.slice(11, 16)}` : ""}`;
const sameItem = (a: PlanItem, b: PlanItem) => a.action === b.action && a.target_id === b.target_id && a.delivery_day === b.delivery_day && a.scheduled_time === b.scheduled_time && a.truck_id === b.truck_id;
export function planDiff(before: PlanItem[], after: PlanItem[]): PlanDiffRow[] {
  const a = new Map(before.map((i) => [i.container_id, i]));
  const b = new Map(after.map((i) => [i.container_id, i]));
  const ids = [...new Set([...a.keys(), ...b.keys()])].sort();
  return ids.map((id) => {
    const x = a.get(id);
    const y = b.get(id);
    if (!x) return { container_id: id, change: "ADDED", before: null, after: describeItem(y!) };
    if (!y) return { container_id: id, change: "REMOVED", before: describeItem(x), after: null };
    return { container_id: id, change: sameItem(x, y) ? "UNCHANGED" : "MODIFIED", before: describeItem(x), after: describeItem(y) };
  });
}

/** 정보 공백 한 줄 — 무엇이 · 대상 · 상태 · 누구에게 물었나 · 답장 · 지금 값 · 확정 여부 */
export interface GapRow {
  key: string;
  what: string;
  target: string;
  state: string;
  askedTo: string | null;
  askStatus: string | null;
  replied: boolean;
  value: string | null;
  confirmed: boolean;
}
export function gapRows(facts: FactCoordinate[], drafts: Draft[]): GapRow[] {
  return facts.map((f) => {
    const asked = drafts.filter((d) => d.question?.target_entity_id === f.entity_id).sort((x, y) => y.message.created_at.localeCompare(x.message.created_at))[0];
    return {
      key: `${f.entity_id}:${f.fact_key}`,
      what: factKeyLabel(f.fact_key),
      target: f.entity_name ?? f.entity_id.slice(0, 8),
      state: f.fact_state,
      askedTo: asked ? `${asked.thread.counterparty_name}${asked.thread.contact_name ? ` · ${asked.thread.contact_name}` : ""}` : null,
      askStatus: asked?.message.status ?? null,
      replied: Boolean(asked && asked.replies.length > 0),
      value: f.current ? `${f.current.value}${f.current.unit ? ` ${f.current.unit}` : ""}` : null,
      confirmed: f.fact_state === "CONFIRMED" || f.fact_state === "OBSERVED",
    };
  });
}

/** `capacity.day(2026-10-13)` · `available.slot(2026-10-13T15:00-18:00)` 를 읽기 쉬운 말로 */
export function factKeyLabel(key: string): string {
  const cap = /^capacity\.(?:[A-Z0-9]+\.)?day\((\d{4}-\d{2}-\d{2})\)$/.exec(key);
  if (cap) return `${cap[1]!.slice(5).replace("-", "/")} 수용 가능량`;
  const slot = /^available\.slot\((\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})-(\d{2}:\d{2})\)$/.exec(key);
  if (slot) return `${slot[1]!.slice(5).replace("-", "/")} ${slot[2]}~${slot[3]} 트럭 가용`;
  return key;
}

/** 주소의 사용 상태 한 단어 — 거절 · 중지/사용 안 함 · 확인 전 · 승인 전 · 사용 중 */
export function addressState(a: Pick<ContactAddress, "relationship_status" | "communication_status" | "email_verification_status">): string {
  if (a.relationship_status === "REJECTED") return "REJECTED";
  if (a.communication_status !== "ACTIVE") return a.communication_status;
  if (a.email_verification_status !== "VERIFIED") return "UNVERIFIED";
  if (a.relationship_status !== "APPROVED") return "PENDING";
  return "ACTIVE";
}
export const usable = (a: ContactAddress, contactActive: boolean, simulated: boolean) => a.eligible && contactActive && a.is_simulated === simulated;

/** 고를 후보 회사들 — 주인이 알려져 있으면 그 회사만. 모르면(트럭 풀 소유 운송사는 사람용 API 에 없다) 그 역할의 회사들 */
export function candidateCompanies(all: Counterparty[], ownerId: string | null, role: string | null): Counterparty[] {
  if (ownerId) return all.filter((c) => c.counterparty_id === ownerId);
  return role ? all.filter((c) => c.source_role === role && c.is_active) : [];
}

/** 무효(OUTDATED)가 된 이유 한 줄 — 사실 변경이면 대상 · 사실, 운영 기록 변경이면 종류 · 키 */
export function outdatedText(r: Record<string, unknown>, names: Map<string, string>): string {
  const code = String(r.code ?? "");
  if (code.startsWith("OPERATIONAL_RECORD")) {
    const what = RECORD_KIND_LABEL[String(r.kind ?? "")] ?? "운영 기록 변경";
    const verb = code.endsWith("ADDED") ? "추가" : code.endsWith("REMOVED") ? "삭제" : "변경";
    return `${what} (${verb}${r.key ? ` · ${String(r.key)}` : ""})`;
  }
  const subject = names.get(String(r.subject_id ?? "")) ?? (r.subject_id ? String(r.subject_id).slice(0, 8) : "");
  return `${subject} ${r.fact_key ? String(r.fact_key) : ""} — ${outdatedLabel(code)}`.trim();
}


/**
 * 주기적으로 다시 읽기(Agent · Worker · Gmail 은 비동기 — 새 WebSocket 없이). 곧바로 한 번, 그 뒤 `ms` 마다.
 * 화면이 안 보이면(`visible()` false) 건너뛴다. 이전 읽기가 끝나기 전에는 겹쳐 부르지 않는다. 돌려준 함수로 멈춘다.
 */
export function createPoller(fn: (signal: AbortSignal) => Promise<unknown>, ms: number, visible: () => boolean = () => true): () => void {
  const controller = new AbortController();
  let busy = false;
  const tick = () => {
    if (busy || controller.signal.aborted || !visible()) return;
    busy = true;
    void fn(controller.signal)
      .catch(() => undefined)
      .finally(() => {
        busy = false;
      });
  };
  tick();
  const id = setInterval(tick, ms);
  return () => {
    controller.abort();
    clearInterval(id);
  };
}

/**
 * 트럭 풀 · 시설의 상대 회사 단서 — 그 대상에 이미 나간 문의의 받는 회사. Backend 는 문의를 대상의 주인(운영 거래처 · 풀 소유 운송사)에게만
 * 보내므로(운영 준비) 이 기록이 주인이다. 기록이 없으면 null(모른다 — 지어내지 않는다). 최종 판정은 여전히 Backend(WRONG_COUNTERPARTY).
 */
export function ownerFromInquiries(drafts: Draft[], targetId: string | null): string | null {
  if (!targetId) return null;
  const hit = drafts.filter((d) => d.question?.target_entity_id === targetId).sort((a, b) => b.message.created_at.localeCompare(a.message.created_at))[0];
  return hit?.thread.counterparty_id ?? null;
}

/** 이 문의가 물은 정보가 이미 값이 있나(사람 직접 입력 · 확인 등) — 답장 검토 표시를 "처리 완료"로 바꾸는 데만 쓴다(Backend 표시는 그대로) */
export function questionAnswered(d: Draft, facts: FactCoordinate[]): boolean {
  const q = d.question;
  if (!q) return false;
  return facts.some((f) => f.entity_id === q.target_entity_id && f.fact_key === q.target_fact_key && f.current !== null && ["CONFIRMED", "OBSERVED", "PROVISIONAL"].includes(f.fact_state));
}
