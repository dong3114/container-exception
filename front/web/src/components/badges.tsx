import type { DecisionUsability, FreshnessStatus, RiskGrade, RouteCode, TrustCategory, TrustView } from "@/contracts/cera";
import { FRESHNESS_LABEL, RISK_LABEL, ROUTE_SHORT, TRUST_LABEL, VALUE_STATUS_LABEL } from "./format";

const RISK_TONE: Record<RiskGrade, string> = { CRITICAL: "b-red", HIGH: "b-orange", WATCH: "b-amber", LOW: "b-slate" };
export function RiskBadge({ grade }: { grade: RiskGrade }) {
  return <span className={`badge ${RISK_TONE[grade]}`}>{RISK_LABEL[grade]}</span>;
}

export const ROUTE_COLOR: Record<RouteCode, string> = {
  WAREHOUSE_DIRECT: "#2463eb",
  ODCY_A: "#0f8a80",
  ODCY_B: "#6d3fd6",
  TERMINAL_WAIT: "#b7860b",
  WAREHOUSE_B_DIRECT: "#5b6475",
  PLANNED_LATER: "#aab1bf",
  BLOCKED: "#d62d2d",
};
const ROUTE_TONE: Record<RouteCode, string> = {
  WAREHOUSE_DIRECT: "b-blue",
  ODCY_A: "b-teal",
  ODCY_B: "b-violet",
  TERMINAL_WAIT: "b-amber",
  WAREHOUSE_B_DIRECT: "b-slate",
  PLANNED_LATER: "b-outline",
  BLOCKED: "b-red",
};
export function RouteBadge({ route }: { route: RouteCode }) {
  return <span className={`badge ${ROUTE_TONE[route]}`}>{ROUTE_SHORT[route]}</span>;
}

const TRUST_TONE: Record<TrustCategory, string> = {
  HUMAN_VERIFIED: "b-green",
  PARTNER: "b-blue",
  PUBLIC: "b-slate",
  EXTRACTED: "b-amber b-dashed",
  SIMULATED: "b-sim",
  PREDICTED: "b-cyan b-dashed",
};
export const TRUST_COLOR: Record<TrustCategory, string> = {
  HUMAN_VERIFIED: "#16834a",
  PARTNER: "#2463eb",
  PUBLIC: "#5b6475",
  EXTRACTED: "#b7860b",
  SIMULATED: "#6d3fd6",
  PREDICTED: "#0e7fa8",
};
export function TrustBadge({ category }: { category: TrustCategory }) {
  return <span className={`badge ${TRUST_TONE[category]}`}>{TRUST_LABEL[category]}</span>;
}

const FRESH_TONE: Record<string, string> = { FRESH: "b-green", AGING: "b-amber", STALE: "b-red", UNKNOWN: "b-outline b-dashed", EXPIRED: "b-slate" };
export function FreshnessBadge({ status }: { status: FreshnessStatus }) {
  if (status === "N_A") return null;
  return <span className={`badge ${FRESH_TONE[status]}`}>{status === "UNKNOWN" ? "시각 모름" : FRESHNESS_LABEL[status]}</span>;
}

export function ValueStatusBadge({ status }: { status: string }) {
  const tone = status === "CONFIRMED" ? "b-green" : status === "PROVISIONAL" ? "b-amber" : status === "OBSERVED" ? "b-slate" : "b-outline";
  return <span className={`badge ${tone}`}>{VALUE_STATUS_LABEL[status] ?? status}</span>;
}

const USABILITY: Record<DecisionUsability, [string, string]> = {
  USABLE: ["b-green", "판단 사용 가능"],
  USABLE_WITH_WARNING: ["b-amber", "주의해서 사용"],
  APPROVAL_BLOCKED: ["b-red", "승인 차단"],
  UNUSABLE: ["b-slate", "사용 불가"],
};
export function UsabilityBadge({ usability }: { usability: DecisionUsability }) {
  const [tone, label] = USABILITY[usability];
  return <span className={`badge ${tone}`}>{label}</span>;
}

export function TrustLine({ trust }: { trust: TrustView }) {
  return (
    <span className="chips" style={{ gap: 4 }}>
      <TrustBadge category={trust.category} />
      <ValueStatusBadge status={trust.value_status} />
      <FreshnessBadge status={trust.freshness_status} />
    </span>
  );
}

export function SimTag({ children = "SIMULATED" }: { children?: React.ReactNode }) {
  return <span className="badge b-sim">{children}</span>;
}
