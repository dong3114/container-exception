import type { components } from "@contracts/openapi";
import { apiRequest } from "./client";
import { ACTOR_HEADER } from "./drafts";

/**
 * Recovery plans (T-114). Every number comes from the backend's deterministic cost engine and solver — the screen
 * only lists the stored plan versions, asks the backend to recalculate on the current facts, and sends a person's
 * approval quoting the plan fingerprint. Approval is not dispatch: nothing is sent or booked.
 */
export type Plan = components["schemas"]["PlanDto"];
export type PlanItem = components["schemas"]["PlanItemDto"];
export type PlanList = components["schemas"]["PlanListDto"];
export type PlanSummary = components["schemas"]["PlanSummaryDto"];

export function listPlans(recoveryRunId: string, signal?: AbortSignal, fetchImpl?: typeof fetch) {
  return apiRequest<PlanList>(`/planning/runs/${encodeURIComponent(recoveryRunId)}/plans`, { signal }, fetchImpl);
}

export function getPlan(planId: string, signal?: AbortSignal, fetchImpl?: typeof fetch) {
  return apiRequest<Plan>(`/planning/plans/${encodeURIComponent(planId)}`, { signal }, fetchImpl);
}

/** Runs the cost engine + solver on the current facts; the same inputs return the current version. */
export function recalculatePlan(recoveryRunId: string, actorId: string, signal?: AbortSignal, fetchImpl?: typeof fetch) {
  return apiRequest<Plan>(`/planning/runs/${encodeURIComponent(recoveryRunId)}/plans`, { method: "POST", body: {}, headers: { [ACTOR_HEADER]: actorId }, signal, timeoutMs: 60_000 }, fetchImpl);
}

export function approvePlan(planId: string, planHash: string, actorId: string, signal?: AbortSignal, fetchImpl?: typeof fetch) {
  return apiRequest<Plan>(`/planning/plans/${encodeURIComponent(planId)}/approve`, { method: "POST", body: { plan_hash: planHash }, headers: { [ACTOR_HEADER]: actorId }, signal }, fetchImpl);
}
