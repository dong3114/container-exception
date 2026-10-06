import { describeApiError } from "@/api/errors";
import type { AsyncState } from "@/state/async";

/**
 * Inline status for one backend request. It never blocks the rest of the screen: LOADING is a small note,
 * FAILED says why and offers a retry only when retrying can help (ApiError.retryable).
 */
export function AsyncStatus<T>({
  state,
  onRetry,
  loadingLabel = "요청 중…",
}: {
  state: AsyncState<T>;
  onRetry?: () => void;
  loadingLabel?: string;
}) {
  if (state.status === "IDLE" || state.status === "SUCCESS") return null;
  if (state.status === "LOADING") {
    return (
      <span className="badge b-outline" role="status" aria-live="polite" data-testid="async-loading">
        {loadingLabel}
      </span>
    );
  }
  const { error } = state;
  return (
    <span role="alert" data-testid="async-failed" style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <span className={`badge ${error.retryable ? "b-amber" : "b-red"}`}>{describeApiError(error)}</span>
      {error.kind === "HTTP" && <span className="mono muted" style={{ fontSize: 11 }}>{error.code}</span>}
      {error.requestId && (
        <span className="mono muted" style={{ fontSize: 11 }} title="문의할 때 이 요청 id 를 알려 주세요">
          req {error.requestId.slice(0, 13)}…
        </span>
      )}
      {error.retryable && onRetry && (
        <button type="button" className="pb-btn" onClick={onRetry}>
          다시 시도
        </button>
      )}
    </span>
  );
}
