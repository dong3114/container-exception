/**
 * Where the browser sends Main Backend (NestJS) requests.
 *
 * - Development: `/backend` — the Vite dev server proxies it to CERA_API_URL (vite.config.ts).
 * - Production: a path behind the same reverse proxy / load balancer (e.g. `/api`) or a deployment base URL,
 *   set at build time with VITE_CERA_API_BASE.
 *
 * Never hard-code a host such as localhost:3100 in product code. The browser talks only to the Main Backend —
 * never to the Python AI Server, an LLM provider or PostgreSQL — and holds no secrets (docs/23 7.1).
 */
export const DEFAULT_API_BASE = "/backend";

export function resolveApiBase(raw: string | undefined): string {
  const value = (raw ?? "").trim() || DEFAULT_API_BASE;
  if (!value.startsWith("/") && !/^https?:\/\//.test(value)) {
    throw new Error(`VITE_CERA_API_BASE must be a path ("/api") or an http(s) URL, got "${value}"`);
  }
  return value.replace(/\/+$/, "");
}

export const API_BASE = resolveApiBase(import.meta.env.VITE_CERA_API_BASE);

/** Joins the base and an endpoint path ("/health") without doubling slashes. */
export function apiUrl(path: string, base: string = API_BASE): string {
  return `${base}/${path.replace(/^\/+/, "")}`;
}
