import { apiUrl } from "./config";
import { ApiError, isApiErrorBody } from "./errors";

/**
 * Minimal JSON client for the Main Backend. Stateless on purpose: no session affinity, no per-instance
 * state, no cookies beyond the same origin — any API instance behind a load balancer can answer.
 * Typed endpoint functions (src/api/*.ts) wrap it; from T-087 their types come from the generated
 * OpenAPI contract (packages/contracts/openapi.json), never from backend source.
 */
export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Cancels the request (component unmount, newer request). */
  signal?: AbortSignal;
  /** Client time limit. Default 15 s — long AI work must not hold one request open (docs/23 7.1). */
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 15_000;

export interface ApiResponse<T> {
  data: T;
  status: number;
  requestId: string | null;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}, fetchImpl: typeof fetch = fetch): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onOuterAbort, { once: true });

  try {
    let res: Response;
    try {
      res = await fetchImpl(apiUrl(path), {
        method: options.method ?? "GET",
        headers: { Accept: "application/json", ...(options.body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (cause) {
      if (timedOut) throw new ApiError("TIMEOUT", "Backend did not answer in time");
      if (controller.signal.aborted) throw new ApiError("ABORTED", "Request cancelled");
      throw new ApiError("NETWORK", cause instanceof Error ? cause.message : "Network error");
    }

    const requestId = res.headers.get("x-request-id");
    let payload: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        if (res.ok) throw new ApiError("INVALID_RESPONSE", "Response is not JSON", { status: res.status, requestId });
      }
    }

    if (!res.ok) {
      if (isApiErrorBody(payload)) {
        throw new ApiError("HTTP", payload.message, { status: res.status, code: payload.code, requestId: payload.request_id ?? requestId });
      }
      throw new ApiError("HTTP", `HTTP ${res.status}`, { status: res.status, code: `HTTP_${res.status}`, requestId });
    }
    return { data: payload as T, status: res.status, requestId };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onOuterAbort);
  }
}
