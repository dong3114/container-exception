import { describe, expect, it } from "vitest";
import { apiRequest } from "./client";
import { DEFAULT_API_BASE, apiUrl, resolveApiBase } from "./config";
import { approveDraft } from "./drafts";
import { ApiError } from "./errors";

describe("API base URL (no hard-coded backend host)", () => {
  it("defaults to the dev proxy path and accepts a production path or URL", () => {
    expect(resolveApiBase(undefined)).toBe(DEFAULT_API_BASE);
    expect(resolveApiBase("  ")).toBe("/backend");
    expect(resolveApiBase("/api/")).toBe("/api");
    expect(resolveApiBase("https://ops.example.invalid/api")).toBe("https://ops.example.invalid/api");
  });

  it("rejects a bare host so a misconfigured build fails loudly", () => {
    expect(() => resolveApiBase("localhost:3100")).toThrow(/VITE_CERA_API_BASE/);
  });

  it("joins base and path without doubling slashes", () => {
    expect(apiUrl("/health", "/api")).toBe("/api/health");
    expect(apiUrl("health", "/backend")).toBe("/backend/health");
  });
});

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const fakeFetch = (respond: (init: RequestInit) => Promise<Response>): typeof fetch =>
  ((_url: string, init: RequestInit) => respond(init)) as unknown as typeof fetch;

describe("apiRequest", () => {
  it("returns data and the backend request id", async () => {
    const res = await apiRequest<{ status: string }>("/health", {}, fakeFetch(async () => jsonResponse(200, { status: "ok" }, { "x-request-id": "req-1" })));
    expect(res).toEqual({ data: { status: "ok" }, status: 200, requestId: "req-1" });
  });

  it("turns the common error body into an ApiError with code and request id", async () => {
    const call = apiRequest("/x", {}, fakeFetch(async () => jsonResponse(409, { code: "CONTACT_NOT_VERIFIED", message: "address not verified", request_id: "req-2" })));
    await expect(call).rejects.toMatchObject({ kind: "HTTP", status: 409, code: "CONTACT_NOT_VERIFIED", requestId: "req-2", retryable: false });
  });

  it("marks server faults and overload as retryable, client errors as not", async () => {
    const statusOf = async (status: number) => {
      try {
        await apiRequest("/x", {}, fakeFetch(async () => jsonResponse(status, { code: `HTTP_${status}`, message: "m", request_id: null })));
      } catch (error) {
        return (error as ApiError).retryable;
      }
      throw new Error("expected a failure");
    };
    expect(await statusOf(503)).toBe(true);
    expect(await statusOf(500)).toBe(true);
    expect(await statusOf(422)).toBe(false);
    expect(await statusOf(404)).toBe(false);
  });

  it("reports a lost connection as NETWORK (retryable)", async () => {
    const call = apiRequest("/x", {}, fakeFetch(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(call).rejects.toMatchObject({ kind: "NETWORK", retryable: true });
  });

  it("gives up after the client time limit with TIMEOUT instead of hanging", async () => {
    const hanging = fakeFetch(
      (init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    await expect(apiRequest("/slow", { timeoutMs: 20 }, hanging)).rejects.toMatchObject({ kind: "TIMEOUT", retryable: true });
  });

  it("a caller cancellation is ABORTED, not a failure to show", async () => {
    const controller = new AbortController();
    const hanging = fakeFetch(
      (init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const call = apiRequest("/slow", { signal: controller.signal }, hanging);
    controller.abort();
    await expect(call).rejects.toMatchObject({ kind: "ABORTED", retryable: false });
  });

  it("an error status without the common body still becomes an HTTP ApiError", async () => {
    const call = apiRequest("/x", {}, fakeFetch(async () => new Response("<html>bad gateway</html>", { status: 502 })));
    await expect(call).rejects.toMatchObject({ kind: "HTTP", status: 502, code: "HTTP_502", retryable: true });
  });
});

describe("approval command (T-089)", () => {
  it("sends only the reviewed content hash and the operator header — the screen never claims approval itself", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = ((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(jsonResponse(200, { ok: true }));
    }) as unknown as typeof fetch;
    const hash = `sha256:${"c".repeat(64)}`;
    await approveDraft("msg-1", hash, "actor-1", undefined, fetchImpl);
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0] as { url: string; init: RequestInit };
    expect(url).toMatch(/\/communication\/drafts\/msg-1\/approve$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ content_hash: hash });
    expect((init.headers as Record<string, string>)["X-CERA-Actor-Id"]).toBe("actor-1");
  });
});
