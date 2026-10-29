import type { components } from "@contracts/openapi";
import { apiRequest } from "./client";
import { ACTOR_HEADER } from "./drafts";

/**
 * Truth pipeline (T-093). The backend judges which value is the current fact and whether a person has confirmed it.
 * The screen only lists the judgement and sends a person's confirm / reject / correct decision (with the acting operator).
 * An AI value never becomes a confirmed fact without one of these commands.
 */
export type FactList = components["schemas"]["FactListDto"];
export type FactCoordinate = components["schemas"]["FactCoordinateDto"];
export type FactCandidate = components["schemas"]["FactCandidateDto"];
export type Corroboration = components["schemas"]["CorroborationDto"];
export type CorroborationList = components["schemas"]["CorroborationListDto"];
export type RejectFactRequest = components["schemas"]["RejectFactRequestDto"];
export type FactReasonCode = RejectFactRequest["reason_code"];
export type RevokeFactRequest = components["schemas"]["RevokeFactRequestDto"];
export type RevokeReasonCode = RevokeFactRequest["reason_code"];
export type ManualFactRequest = components["schemas"]["ManualFactRequestDto"];
export type ManualFactKind = ManualFactRequest["kind"];

/** `?as_of=` suffix — judge the answer at the same reference time as the list it was made on. */
const asOfQuery = (asOf?: string) => (asOf ? `as_of=${encodeURIComponent(asOf)}` : "");
const withQuery = (path: string, asOf?: string) => (asOf ? `${path}?${asOfQuery(asOf)}` : path);

/** `asOf` (ISO with offset) judges freshness at that time; without it the backend uses scenario time (simulated) or now (real). */
export function listFacts(recoveryRunId: string, signal?: AbortSignal, fetchImpl?: typeof fetch, asOf?: string) {
  const query = `recovery_run_id=${encodeURIComponent(recoveryRunId)}${asOf ? `&${asOfQuery(asOf)}` : ""}`;
  return apiRequest<FactList>(`/truth/facts?${query}`, { signal }, fetchImpl);
}

/**
 * Every action takes an optional `asOf`: pass the `evaluated_at` of the list on screen so the returned coordinate is
 * judged at the same time as the rest (a simulated, past-dated fact would otherwise come back STALE right after a confirm).
 */
const eventPath = (eventId: string, action: string, asOf?: string) => withQuery(`/truth/events/${encodeURIComponent(eventId)}/${action}`, asOf);

export function confirmFact(eventId: string, note: string | undefined, actorId: string, signal?: AbortSignal, fetchImpl?: typeof fetch, asOf?: string) {
  return apiRequest<FactCoordinate>(
    eventPath(eventId, "confirm", asOf),
    { method: "POST", body: { command_id: crypto.randomUUID(), ...(note ? { note } : {}) }, headers: { [ACTOR_HEADER]: actorId }, signal },
    fetchImpl,
  );
}

export function rejectFact(
  eventId: string,
  reasonCode: FactReasonCode,
  note: string | undefined,
  actorId: string,
  signal?: AbortSignal,
  fetchImpl?: typeof fetch,
  asOf?: string,
) {
  return apiRequest<FactCoordinate>(
    eventPath(eventId, "reject", asOf),
    { method: "POST", body: { command_id: crypto.randomUUID(), reason_code: reasonCode, ...(note ? { note } : {}) }, headers: { [ACTOR_HEADER]: actorId }, signal },
    fetchImpl,
  );
}

export function correctFact(
  eventId: string,
  value: number,
  reasonCode: FactReasonCode,
  note: string | undefined,
  actorId: string,
  signal?: AbortSignal,
  fetchImpl?: typeof fetch,
  asOf?: string,
) {
  return apiRequest<FactCoordinate>(
    eventPath(eventId, "correct", asOf),
    { method: "POST", body: { command_id: crypto.randomUUID(), value, reason_code: reasonCode, ...(note ? { note } : {}) }, headers: { [ACTOR_HEADER]: actorId }, signal },
    fetchImpl,
  );
}

/** Withdraw a value (T-111): the fact is left without a current value until a new one arrives. Works on confirmed values too. */
export function revokeFact(
  eventId: string,
  actorId: string,
  req: { reason_code: RevokeReasonCode; note?: string },
  signal?: AbortSignal,
  fetchImpl?: typeof fetch,
  asOf?: string,
) {
  return apiRequest<FactCoordinate>(
    eventPath(eventId, "revoke", asOf),
    { method: "POST", body: { command_id: crypto.randomUUID(), reason_code: req.reason_code, ...(req.note ? { note: req.note } : {}) }, headers: { [ACTOR_HEADER]: actorId }, signal },
    fetchImpl,
  );
}

/** Operator direct entry (T-111): a fact the operator confirmed by phone / visit. The backend records it as CONFIRMED human input. */
export function enterFact(actorId: string, body: Omit<ManualFactRequest, "command_id" | "intent">, signal?: AbortSignal, fetchImpl?: typeof fetch, asOf?: string) {
  const request: ManualFactRequest = { command_id: crypto.randomUUID(), intent: "OPERATOR_DIRECT_ENTRY", ...body };
  return apiRequest<FactCoordinate>(withQuery("/truth/facts/manual", asOf), { method: "POST", body: request, headers: { [ACTOR_HEADER]: actorId }, signal }, fetchImpl);
}

/** T-136 — 공공 근거 교차 확인(업체 주장 ↔ 공공 관측, 결정론 판정) — 한 주체의 최신순 */
export function listCorroborations(entityId: string, signal?: AbortSignal, fetchImpl?: typeof fetch) {
  return apiRequest<CorroborationList>(`/truth/corroborations?entity_id=${encodeURIComponent(entityId)}`, { signal }, fetchImpl);
}
