import type { components } from "@contracts/openapi";
import { apiRequest } from "./client";

/**
 * Inquiry drafts (T-088). This is the screen's real-backend provider for the draft area only — the rest of the
 * Control Tower still plays the scenario through MockProvider. Types are generated from the OpenAPI contract.
 *
 * The backend decides everything that matters: Contact Gate, question target, number check, approval readiness.
 * The screen sends structured values (from the plan gap or typed by the operator) and shows the verdict.
 */
export type Draft = components["schemas"]["DraftDto"];
export type DraftList = components["schemas"]["DraftListDto"];
export type CreateDraftRequest = components["schemas"]["CreateDraftRequestDto"];
export type StructuredValueInput = components["schemas"]["StructuredValueInputDto"];
export type RunList = components["schemas"]["RunListDto"];
export type FacilityList = components["schemas"]["FacilityListDto"];

export function createDraft(body: CreateDraftRequest, signal?: AbortSignal) {
  return apiRequest<Draft>("/communication/drafts", { method: "POST", body, signal });
}

export function reviseDraft(messageId: string, body: { subject: string; body: string }, signal?: AbortSignal) {
  return apiRequest<Draft>(`/communication/drafts/${encodeURIComponent(messageId)}/revisions`, { method: "POST", body, signal });
}

export function listDrafts(signal?: AbortSignal) {
  return apiRequest<DraftList>("/communication/drafts", { signal });
}

export function listRuns(signal?: AbortSignal) {
  return apiRequest<RunList>("/planning/runs", { signal });
}

export function listFacilities(signal?: AbortSignal) {
  return apiRequest<FacilityList>("/registry/facilities", { signal });
}
