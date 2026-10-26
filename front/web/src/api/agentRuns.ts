import { apiRequest } from "./client";
import { ACTOR_HEADER } from "./drafts";

/**
 * Agent runs (T-104 · T-105). The backend Coordinator owns every state change — this screen only starts a run that a
 * person scoped (recovery run + inquiry numbers + optional public-data window), reads its progress, and lets a person
 * wake or cancel it. Approve / send stay in the existing draft panels: the agent never approves or sends.
 *
 * The OpenAPI schema for the run view is a loose object (the view grows with the runtime), so the fields the screen
 * reads are typed here. Anything else is ignored.
 */
export type AgentRunStatus = "CREATED" | "RUNNING" | "WAITING_HUMAN" | "WAITING_EXTERNAL" | "WAITING_RUNTIME" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface AgentStep {
  seq: number;
  kind: "START" | "NODE" | "INTERRUPT" | "RESUME" | "TERMINAL";
  node: string | null;
  outcome: string;
  detail_code: string | null;
  started_at: string;
}

export interface AgentToolCall {
  tool_call_id: string;
  tool_name: string;
  category: string;
  status: "STARTED" | "SUCCEEDED" | "FAILED" | "REJECTED";
  error_code: string | null;
  started_at: string;
  duration_ms: number | null;
}

export type ResultSummary = Record<string, string | number | boolean | null | string[]>;

export interface AgentRun {
  agent_run_id: string;
  recovery_run_id: string;
  goal: string;
  status: AgentRunStatus;
  current_node: string | null;
  waiting_reason: string | null;
  pending_ref: { type: string; id: string } | null;
  last_error_code: string | null;
  started_at: string;
  finished_at: string | null;
  updated_at: string | null;
  runtime_attempts: number;
  next_attempt_at: string | null;
  result_summary: ResultSummary | null;
  is_simulated: boolean;
  /** What the person asked for when creating the run (inquiry numbers, public-data window, plan_recovery). */
  parameters?: { plan_recovery?: boolean } & Record<string, unknown>;
  steps: AgentStep[];
  tool_calls: AgentToolCall[];
}

export interface AgentRunListItem {
  agent_run_id: string;
  recovery_run_id: string;
  status: AgentRunStatus;
  current_node: string | null;
  waiting_reason: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface CreateAgentRunRequest {
  recovery_run_id: string;
  goal: string;
  parameters: {
    inquiry: { quantity: number; window_from?: string; window_to?: string };
    public_data?: { from_date: string; to_date?: string };
    /** T-114: after the gaps, let the run compute costs, solve and propose a plan (a person still approves it). */
    plan_recovery?: boolean;
  };
}

export function listAgentRuns(signal?: AbortSignal) {
  return apiRequest<{ runs: AgentRunListItem[] }>("/agent-runs?limit=20", { signal });
}

export function getAgentRun(id: string, signal?: AbortSignal) {
  return apiRequest<AgentRun>(`/agent-runs/${encodeURIComponent(id)}`, { signal });
}

export function createAgentRun(body: CreateAgentRunRequest, actorId: string, signal?: AbortSignal) {
  return apiRequest<AgentRun>("/agent-runs", { method: "POST", body, headers: { [ACTOR_HEADER]: actorId }, signal });
}

/** Runs the graph until it waits or ends — may take a while (public data, drafting). */
export function startAgentRun(id: string, actorId: string, signal?: AbortSignal) {
  return apiRequest<AgentRun>(`/agent-runs/${encodeURIComponent(id)}/start`, { method: "POST", body: {}, headers: { [ACTOR_HEADER]: actorId }, signal, timeoutMs: 130_000 });
}

/** A person asks the run to look again now. The graph re-reads the backend state; if nothing changed it waits again. */
export function resumeAgentRun(id: string, actorId: string, signal?: AbortSignal) {
  return apiRequest<AgentRun>(`/agent-runs/${encodeURIComponent(id)}/resume`, { method: "POST", body: { reason: "OPERATOR_RESUME" }, headers: { [ACTOR_HEADER]: actorId }, signal, timeoutMs: 130_000 });
}

export function cancelAgentRun(id: string, actorId: string, signal?: AbortSignal) {
  return apiRequest<AgentRun>(`/agent-runs/${encodeURIComponent(id)}/cancel`, { method: "POST", body: {}, headers: { [ACTOR_HEADER]: actorId }, signal });
}
