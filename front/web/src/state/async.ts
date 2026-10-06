import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/api/errors";

/**
 * State of one backend request as the screen sees it. Every action that calls the backend — and later every
 * AI-backed action (draft a message, extract a reply), which goes Browser → NestJS → AI Server, never
 * directly — moves through these four states. The rest of the screen stays usable while one is LOADING.
 *
 * If the backend later answers long work with 202 Accepted + a job to poll, add an ACCEPTED/PENDING state
 * here; components that switch on `status` then show it without changing how they start the request.
 */
export type AsyncState<T> =
  | { status: "IDLE" }
  | { status: "LOADING" }
  | { status: "SUCCESS"; data: T; requestId: string | null }
  | { status: "FAILED"; error: ApiError };

export const IDLE: AsyncState<never> = { status: "IDLE" };

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError("INVALID_RESPONSE", error instanceof Error ? error.message : String(error));
}

/**
 * Runs a backend call and tracks its AsyncState. A newer run cancels the older one, and unmounting cancels
 * the in-flight request, so a slow answer never overwrites a newer screen state. Cancellation is not a
 * failure — the state simply stays on the newer request.
 */
export function useAsyncAction<T, A extends unknown[]>(
  action: (signal: AbortSignal, ...args: A) => Promise<{ data: T; requestId: string | null }>,
): { state: AsyncState<T>; run: (...args: A) => void; reset: () => void } {
  const [state, setState] = useState<AsyncState<T>>(IDLE);
  const current = useRef<AbortController | null>(null);
  const actionRef = useRef(action);
  useEffect(() => {
    actionRef.current = action;
  });

  useEffect(() => () => current.current?.abort(), []);

  const run = useCallback((...args: A) => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    setState({ status: "LOADING" });
    actionRef.current(controller.signal, ...args).then(
      (res) => {
        if (current.current === controller) setState({ status: "SUCCESS", data: res.data, requestId: res.requestId });
      },
      (error: unknown) => {
        const apiError = toApiError(error);
        if (current.current === controller && apiError.kind !== "ABORTED") setState({ status: "FAILED", error: apiError });
      },
    );
  }, []);

  const reset = useCallback(() => {
    current.current?.abort();
    current.current = null;
    setState(IDLE);
  }, []);

  return { state, run, reset };
}
