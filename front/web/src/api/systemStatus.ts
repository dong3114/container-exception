import { apiRequest } from "./client";
import type { DeploymentMode } from "./auth";

/**
 * 운영 화면의 시스템 상태(T-133) — `GET /ops/system-status`(ADMIN · OPERATOR 만). 응답 모양은 Backend `SystemStatusService`
 * (OpenAPI 에는 응답 스키마가 없어 여기서 적는다). 화면은 판정하지 않는다 — 상태 · 전체 상태는 Backend 의 결정론 규칙이 정한다.
 */
export type ComponentLevel = "HEALTHY" | "DEGRADED" | "DOWN" | "DISABLED";
export type OverallStatus = "HEALTHY" | "DEGRADED" | "ACTION_REQUIRED" | "DOWN";

export interface QueueLine {
  count: number;
  oldest_age_seconds: number | null;
  retrying?: number;
}

export interface SystemStatus {
  checked_at: string;
  mode: DeploymentMode;
  overall: { status: OverallStatus; reasons: string[] };
  core: {
    api: { level: ComponentLevel; version: string; commit: string | null; uptime_seconds: number };
    database: { level: ComponentLevel; connected: boolean; latency_ms: number | null };
    redis: { level: ComponentLevel; state: "up" | "down" | "disabled"; fallback: "POSTGRES_POLLING" | null };
    worker: { level: ComponentLevel; last_seen_at: string | null; last_seen_seconds_ago: number | null; last_cycle_ms: number | null; failed_steps: string[]; queue_consumer: boolean | null };
    ai_server: { level: ComponentLevel; reachable: boolean; provider_mode: "REPLAY" | "COMMERCIAL" | null };
    agent_runtime: { level: ComponentLevel; reachable: boolean; tools_enabled: boolean };
  };
  integrations: {
    llm: { level: ComponentLevel; mode?: "REPLAY" | "COMMERCIAL" | null; provider?: string | null; model?: string | null; last_success_at?: string | null; last_failure_at?: string | null; last_failure_code?: string | null };
    gmail: { level: ComponentLevel; enabled?: boolean; connection?: "CONNECTED" | "AUTH_FAILED" | "CHECK_FAILED" | "NOT_CHECKED"; connection_checked_at?: string | null; last_error_code?: string | null; last_send_at?: string | null; last_send_failure_at?: string | null; last_receive_at?: string | null };
    public_data: { level: ComponentLevel; mode?: string; last_request_at?: string | null; last_outcome?: string | null; last_success_at?: string | null; corroboration?: { last_at: string | null; last_24h: Record<string, number> } };
  };
  queues: { send: QueueLine & { retrying: number }; extraction: QueueLine; extraction_retry: QueueLine; agent_retry: QueueLine };
}

export function getSystemStatus(signal?: AbortSignal) {
  return apiRequest<SystemStatus>("/ops/system-status", { signal, timeoutMs: 8_000 });
}
