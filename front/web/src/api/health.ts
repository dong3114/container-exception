import { apiRequest } from "./client";

/**
 * GET /health — the only Main Backend endpoint today. The response body is not in the OpenAPI document yet,
 * so this small type is hand-written; endpoints from T-087 on use generated contract types instead.
 */
export interface HealthResponse {
  status: "ok" | "degraded";
  app: "up";
  db?: "up" | "down";
  checked_at: string;
}

export function getHealth(signal?: AbortSignal) {
  return apiRequest<HealthResponse>("/health", { signal, timeoutMs: 5_000 });
}
