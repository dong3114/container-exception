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
export type ApproverList = components["schemas"]["ApproverListDto"];
export type ReviseDraftRequest = components["schemas"]["ReviseDraftRequestDto"];

/**
 * Approval decisions (T-089). The screen never decides or stores an approval: it sends the content_hash of what the
 * operator is looking at and who the operator is; the backend re-checks everything and answers with the draft as it now is.
 * The operator header is a development stand-in until authentication exists — the backend verifies it.
 */
export const ACTOR_HEADER = "X-CERA-Actor-Id";

export function createDraft(body: CreateDraftRequest, signal?: AbortSignal) {
  return apiRequest<Draft>("/communication/drafts", { method: "POST", body, signal });
}

export function reviseDraft(messageId: string, body: ReviseDraftRequest, signal?: AbortSignal) {
  return apiRequest<Draft>(`/communication/drafts/${encodeURIComponent(messageId)}/revisions`, { method: "POST", body, signal });
}

export function approveDraft(messageId: string, contentHash: string, actorId: string, signal?: AbortSignal, fetchImpl?: typeof fetch) {
  return apiRequest<Draft>(
    `/communication/drafts/${encodeURIComponent(messageId)}/approve`,
    { method: "POST", body: { content_hash: contentHash }, headers: { [ACTOR_HEADER]: actorId }, signal },
    fetchImpl,
  );
}

export function rejectDraft(messageId: string, contentHash: string, reason: string, actorId: string, signal?: AbortSignal) {
  return apiRequest<Draft>(`/communication/drafts/${encodeURIComponent(messageId)}/reject`, {
    method: "POST",
    body: { content_hash: contentHash, reason },
    headers: { [ACTOR_HEADER]: actorId },
    signal,
  });
}

export function revokeApproval(approvalId: string, reason: string | null, actorId: string, signal?: AbortSignal) {
  return apiRequest<Draft>(`/communication/approvals/${encodeURIComponent(approvalId)}/revoke`, {
    method: "POST",
    body: reason ? { reason } : {},
    headers: { [ACTOR_HEADER]: actorId },
    signal,
  });
}

export function listApprovers(signal?: AbortSignal) {
  return apiRequest<ApproverList>("/communication/approvers", { signal });
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
