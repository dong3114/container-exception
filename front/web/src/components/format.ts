/** Display formatting only. No business calculation lives here. */
import type { BusinessPriority, RiskGrade, RouteCode, TrustCategory } from "@/contracts/cera";

export const krw = (n: number | null | undefined): string => (n == null ? "—" : `${n.toLocaleString("ko-KR")}원`);

/** "2026-10-13T11:00:02+09:00" → "11:00:02" (string slicing keeps the +09:00 wall time; no Date parsing). */
export const hms = (iso: string | null | undefined): string => (iso ? iso.slice(11, 19) : "—");
export const hm = (iso: string | null | undefined): string => (iso ? iso.slice(11, 16) : "—");

const WEEKDAY: Record<string, string> = { "2026-10-11": "일", "2026-10-12": "월", "2026-10-13": "화", "2026-10-14": "수", "2026-10-15": "목" };
export const md = (isoDate: string | null | undefined): string => {
  if (!isoDate) return "—";
  const d = isoDate.slice(0, 10);
  return `${d.slice(5, 7)}/${d.slice(8, 10)}${WEEKDAY[d] ? `(${WEEKDAY[d]})` : ""}`;
};

export const RISK_LABEL: Record<RiskGrade, string> = { CRITICAL: "Critical", HIGH: "High", WATCH: "Watch", LOW: "Low" };
export const PRIORITY_LABEL: Record<BusinessPriority, string> = { CRITICAL: "필수", HIGH: "높음", NORMAL: "보통" };

export const ROUTE_SHORT: Record<RouteCode, string> = {
  WAREHOUSE_DIRECT: "창고 A 직송",
  ODCY_A: "ODCY A",
  ODCY_B: "ODCY B",
  TERMINAL_WAIT: "터미널 대기",
  WAREHOUSE_B_DIRECT: "창고 B 직송",
  PLANNED_LATER: "다른 날",
  BLOCKED: "수용 불가",
};

export const TRUST_LABEL: Record<TrustCategory, string> = {
  HUMAN_VERIFIED: "사람 확인",
  PARTNER: "파트너",
  PUBLIC: "공공 API",
  EXTRACTED: "메일 추출",
  SIMULATED: "시뮬레이션",
  PREDICTED: "예상",
};

export const PHASE_LABEL: Record<string, string> = {
  PICKUP_READY: "반출 가능",
  CUSTOMS_PENDING: "통관 대기",
  CUSTOMS_CLEARED: "통관 완료",
  ARRIVING: "입항 전",
};

export const FRESHNESS_LABEL: Record<string, string> = {
  FRESH: "신선",
  AGING: "노화",
  STALE: "오래됨",
  UNKNOWN: "시각 모름",
  EXPIRED: "만료",
  N_A: "",
};

export const VALUE_STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "확인됨",
  OBSERVED: "관측",
  PROVISIONAL: "잠정",
  INFERRED: "추정",
  UNKNOWN: "값 없음",
  SCENARIO_VALUE: "시나리오 값",
};

export const PLAN_STATUS_LABEL: Record<string, string> = {
  PROPOSED: "승인 대기",
  APPROVED: "승인됨",
  SUPERSEDED: "대체됨",
  REJECTED: "거절됨",
};

export const carrierShort = (c: string): string => c.replace("CARRIER_", "선사 ");
