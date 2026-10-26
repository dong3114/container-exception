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
export type RejectFactRequest = components["schemas"]["RejectFactRequestDto"];
export type FactReasonCode = RejectFactRequest["reason_code"];

export function listFacts(recoveryRunId: string, signal?: AbortSignal, fetchImpl?: typeof fetch) {
  return apiRequest<FactList>(`/truth/facts?recovery_run_id=${encodeURIComponent(recoveryRunId)}`, { signal }, fetchImpl);
}

const eventPath = (eventId: string, action: string) => `/truth/events/${encodeURIComponent(eventId)}/${action}`;

export function confirmFact(eventId: string, note: string | undefined, actorId: string, signal?: AbortSignal, fetchImpl?: typeof fetch) {
  return apiRequest<FactCoordinate>(
    eventPath(eventId, "confirm"),
    { method: "POST", body: { command_id: crypto.randomUUID(), ...(note ? { note } : {}) }, headers: { [ACTOR_HEADER]: actorId }, signal },
    fetchImpl,
  );
}

export function rejectFact(eventId: string, reasonCode: FactReasonCode, note: string | undefined, actorId: string, signal?: AbortSignal, fetchImpl?: typeof fetch) {
  return apiRequest<FactCoordinate>(
    eventPath(eventId, "reject"),
    { method: "POST", body: { command_id: crypto.randomUUID(), reason_code: reasonCode, ...(note ? { note } : {}) }, headers: { [ACTOR_HEADER]: actorId }, signal },
    fetchImpl,
  );
}

export function correctFact(eventId: string, value: number, reasonCode: FactReasonCode, note: string | undefined, actorId: string, signal?: AbortSignal, fetchImpl?: typeof fetch) {
  return apiRequest<FactCoordinate>(
    eventPath(eventId, "correct"),
    { method: "POST", body: { command_id: crypto.randomUUID(), value, reason_code: reasonCode, ...(note ? { note } : {}) }, headers: { [ACTOR_HEADER]: actorId }, signal },
    fetchImpl,
  );
}
