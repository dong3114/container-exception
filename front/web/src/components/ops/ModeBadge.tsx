import type { DeploymentMode } from "@/api/auth";
import { MODE_HINT, MODE_LABEL } from "./systemStatusText";

/** 지금 어느 배포에 있는가(T-133) — 공개 데모와 비공개 검증 환경을 헷갈리지 않게 모든 화면 위에 */
export function ModeBadge({ mode }: { mode: DeploymentMode | undefined }) {
  if (!mode) return null;
  const cls = mode === "PRIVATE_STAGING" || mode === "PRODUCTION" ? "b-blue" : mode === "PUBLIC_PORTFOLIO_DEMO" ? "b-sim" : "b-outline";
  return (
    <span className={`badge ${cls}`} data-testid="mode-badge" data-mode={mode} title={MODE_HINT[mode]}>
      <b style={{ letterSpacing: 1 }}>{MODE_LABEL[mode]}</b>
    </span>
  );
}
