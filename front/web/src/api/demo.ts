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
  portfolio_demo?: boolean;
  /** T-132: on 이면 결정론 탐지기가 수용량 부족을 찾아 복구 실행을 만든다 */
  exception_detection?: "off" | "on";
  /** T-132: 시연 화면이 따라갈 실행 — 탐지기가 만든 실행(있으면) · 아니면 시드 실행 */
  active_run_id?: string;
  auto_exception?: { exception_id: string; status: "ACTIVE" | "RESOLVED"; recovery_run_id: string } | null;
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
