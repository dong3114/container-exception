import { useEffect } from "react";
import { getHealth } from "@/api/health";
import { useAsyncAction } from "@/state/async";
import { AsyncStatus } from "./workflow/AsyncStatus";

/**
 * Shows, separately, where the screen's data comes from and whether the Main Backend answers.
 * Today the operational data is Mock (scenario) even when the backend is up — the two are never merged into
 * one "live" impression (docs/01 4절 규칙 9 · Mock / Simulated / Real 구분).
 */
export function BackendStatus({ dataSource }: { dataSource: "mock" | "api" }) {
  const { state, run } = useAsyncAction((signal) => getHealth(signal));
  useEffect(() => {
    run();
  }, [run]);

  return (
    <span data-testid="backend-status" style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <span className={`badge ${dataSource === "mock" ? "b-sim" : "b-blue"}`} data-testid="data-source">
        데이터: {dataSource === "mock" ? "Mock (시나리오)" : "Backend API"}
      </span>
      {state.status === "SUCCESS" && (
        <span className="badge b-green" title={`checked_at ${state.data.checked_at}`}>
          Backend 연결됨{state.data.db === "up" ? " · DB up" : ""}
        </span>
      )}
      <AsyncStatus state={state} onRetry={run} loadingLabel="Backend 확인 중…" />
    </span>
  );
}
