import type { components } from "@contracts/openapi";
import { apiRequest } from "./client";

/**
 * Registry · Contact Gate (T-087). Types come from the generated OpenAPI contract
 * (packages/contracts/openapi.d.ts ← `npm run openapi:types`), never from backend source.
 * The backend decides eligibility; the screen only shows the verdict and its reasons (docs/19 FR-ELG-02 · 04).
 */
export type CounterpartyList = components["schemas"]["CounterpartyListDto"];
export type ContactEligibility = components["schemas"]["ContactEligibilityDto"];
export type GateReason = components["schemas"]["GateReasonDto"];

export function getCounterparties(signal?: AbortSignal) {
  return apiRequest<CounterpartyList>("/registry/counterparties", { signal });
}

export function getContactEligibility(addressId: string, signal?: AbortSignal) {
  return apiRequest<ContactEligibility>(`/registry/addresses/${encodeURIComponent(addressId)}/eligibility`, { signal });
}
