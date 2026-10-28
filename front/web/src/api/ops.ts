import { apiRequest } from "./client";
import { ACTOR_HEADER } from "./drafts";
import type { components } from "@contracts/openapi";

/**
 * 운영 화면(T-120)이 쓰는 Backend 호출 중 아직 다른 모듈에 없는 것. **Backend 계약은 그대로** — 이미 있는 endpoint 만 부른다.
 * 행위자 머리말은 세션 모드에서 Backend 가 세션으로 덮어쓴다(사칭 차단). 권한 판정은 언제나 Backend 다(401 · 403).
 */
export type Counterparty = components["schemas"]["CounterpartySummaryDto"];
export type ContactAddress = components["schemas"]["AddressSummaryDto"];
export type ContactSelection = components["schemas"]["ContactSelectionDto"];
export type ImportReport = components["schemas"]["PlanningInputImportReportDto"];
export type RowError = components["schemas"]["RowErrorDto"];

const actor = (actorId: string) => ({ [ACTOR_HEADER]: actorId });
const commandId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`);

// ── 계획 입력 준비도(T-115 · T-123) — OpenAPI 는 느슨한 object 라 화면이 읽는 칸만 적는다 ──
export interface MissingInput {
  code: string;
  group: string;
  severity: "BLOCKING" | "OPTIONAL";
  scope: string;
  count: number;
  fields: string[];
  examples: string[];
  provide_via: string;
}
export interface Readiness {
  mode: "SCENARIO" | "LIVE";
  status: "READY" | "READY_WITH_PROVISIONAL" | "NOT_READY";
  ready: boolean;
  plan_day: string;
  missing_inputs: MissingInput[];
  note: string;
}
export function getReadiness(runId: string, signal?: AbortSignal) {
  return apiRequest<Readiness>(`/planning/runs/${encodeURIComponent(runId)}/input-readiness`, { signal });
}

// ── 승인된 계획의 후속(T-116 · T-128 정정 · 취소) ──
export interface FollowUpView {
  action_key: string;
  kind: "ODCY_RECEIVE" | "PARTNER_TRUCKS";
  intent: string;
  target_id: string;
  target_name: string;
  date: string;
  quantity: number;
  window: { from: string; to: string } | null;
  message_id: string | null;
  message_status: string | null;
  blocked_reason: string | null;
  follow_up_kind: "REQUEST" | "CORRECTION" | "CANCELLATION";
  delta: "ADDED" | "MODIFIED" | "REMOVED" | "CONTACT_CHANGED";
  refers_to_message_id: string | null;
  previous_quantity: number | null;
}
export interface FollowUpList {
  plan_id: string;
  plan_status: string;
  actions: FollowUpView[];
  unchanged: string[];
  note: string;
}
export function getFollowUps(planId: string, signal?: AbortSignal) {
  return apiRequest<FollowUpList>(`/planning/plans/${encodeURIComponent(planId)}/follow-ups`, { signal });
}
export function draftFollowUps(planId: string, actorId: string, signal?: AbortSignal) {
  return apiRequest<FollowUpList>(`/planning/plans/${encodeURIComponent(planId)}/follow-ups`, { method: "POST", body: {}, headers: actor(actorId), signal });
}

// ── 사람의 받는 주소 선택(T-129) — 이번 한 건에만. Backend 가 회사 · 역할 · Mock/Real · Contact Gate 를 다시 본다 ──
export function selectRunContact(agentRunId: string, addressId: string, note: string | undefined, actorId: string, signal?: AbortSignal) {
  return apiRequest<ContactSelection>(`/agent-runs/${encodeURIComponent(agentRunId)}/contact-selection`, { method: "POST", body: { address_id: addressId, ...(note ? { note } : {}) }, headers: actor(actorId), signal });
}
export function selectFollowUpContact(planId: string, actionKey: string, addressId: string, note: string | undefined, actorId: string, signal?: AbortSignal) {
  return apiRequest<ContactSelection>(`/planning/plans/${encodeURIComponent(planId)}/follow-ups/contact-selection`, {
    method: "POST",
    body: { action_key: actionKey, address_id: addressId, ...(note ? { note } : {}) },
    headers: actor(actorId),
    signal,
  });
}

// ── 등록부(T-127 · T-129, ADMIN) — 지금 일을 풀 최소 흐름만 ──
export function createCounterparty(body: { display_name: string; source_role: "ODCY" | "WAREHOUSE" | "TRUCKING" }, actorId: string, signal?: AbortSignal) {
  return apiRequest<Counterparty>("/registry/counterparties", { method: "POST", body, headers: actor(actorId), signal });
}
export function createContact(counterpartyId: string, body: { person_name: string; team?: string; channel_type: "GMAIL" | "MOCK"; address: string }, actorId: string, signal?: AbortSignal) {
  return apiRequest<Counterparty>(`/registry/counterparties/${encodeURIComponent(counterpartyId)}/contacts`, { method: "POST", body, headers: actor(actorId), signal });
}
export function approveAddress(addressId: string, actorId: string, signal?: AbortSignal) {
  return apiRequest<components["schemas"]["ContactEligibilityDto"]>(`/registry/addresses/${encodeURIComponent(addressId)}/approve`, { method: "POST", body: {}, headers: actor(actorId), signal });
}
export function setFacilityOperator(facilityId: string, counterpartyId: string | null, actorId: string, signal?: AbortSignal) {
  return apiRequest<components["schemas"]["FacilitySummaryDto"]>(`/registry/facilities/${encodeURIComponent(facilityId)}/operator`, { method: "PATCH", body: { counterparty_id: counterpartyId }, headers: actor(actorId), signal });
}

// ── 운영 기록 입력(T-123) — 검증만(dry_run) 먼저, 오류가 없을 때만 저장 ──
export type InputKind = "containers" | "rates" | "facility-profiles";
export function importOperationalInput(kind: InputKind, runId: string | null, csv: string, dryRun: boolean, actorId: string, signal?: AbortSignal) {
  // 컨테이너: 실행이 있으면 그 실행의 입력, 없으면 운영 기준 계획(T-132 — 실행 밖, 저장되면 예외 탐지)
  const path = kind === "containers" ? (runId ? `/planning/runs/${encodeURIComponent(runId)}/inputs/containers` : "/planning/inputs/containers") : `/planning/inputs/${kind}`;
  return apiRequest<ImportReport>(path, { method: "POST", body: { command_id: commandId(), dry_run: dryRun, csv }, headers: actor(actorId), signal, timeoutMs: 60_000 });
}

// ── 실제(LIVE) 계획 실행 열기(T-123) ──
export function createLiveRun(note: string, actorId: string, signal?: AbortSignal) {
  return apiRequest<{ recovery_run_id: string; plan_day: string }>("/planning/runs", { method: "POST", body: { command_id: commandId(), note }, headers: actor(actorId), signal });
}
