import { apiRequest } from "./client";

/**
 * Demo / test helpers (`/dev/demo/*`). The backend mounts them only when APP_ENV is local or test — they are not part of
 * the product contract (excluded from OpenAPI), so the shapes are typed here.
 */
export interface DemoStatus {
  app_env: string;
  agent_tools_enabled: boolean;
  ai_server: "up" | "down";
  public_data_mode: string;
  gmail_enabled: boolean;
  sending_paused: boolean;
  auth_mode?: string;
  execution_queue?: "up" | "down" | "disabled";
  seed: {
    present: boolean;
    scenario_run_id: string;
    operator_actor_id: string;
    as_of: string | null;
    plan_date: string | null;
    facilities: { warehouse_a: string; warehouse_b: string; odcy_a: string; odcy_b: string };
    truck_pool_partner: string;
  };
}

export function getDemoStatus(signal?: AbortSignal) {
  return apiRequest<DemoStatus>("/dev/demo/status", { signal });
}

/** A mock counterparty answers the inquiry (mock inbox). The worker ingests it on its next cycle — real code from there on. */
export function injectMockReply(body: { reply_to_message_id: string; body: string; from?: string }, signal?: AbortSignal) {
  return apiRequest<{ injected: string; from: string; thread: string | null }>("/dev/demo/mock-reply", { method: "POST", body, signal });
}

export interface RuntimeStatus {
  reachable: boolean;
  tools_enabled: boolean;
  tool_count: number;
}

export function getRuntimeStatus(signal?: AbortSignal) {
  return apiRequest<RuntimeStatus>("/agent-runs/runtime", { signal });
}
