import type { Plan, PlanItem } from "@/api/plans";

/**
 * Recovery plan in operator words (T-114). Pure — the screen names what the backend engine reported, it never
 * computes, adds up or chooses. Codes it does not know are shown as they are (never guessed).
 */
export const ACTION_LABEL: Record<string, string> = {
  KEEP_CURRENT_PLAN: "원래 계획대로 직송",
  MOVE_TO_ODCY: "ODCY 경유",
  WAIT_AT_TERMINAL: "터미널 대기 후 직송",
  MOVE_TO_WAREHOUSE: "다른 창고로",
};

export const ACTION_BADGE: Record<string, string> = {
  KEEP_CURRENT_PLAN: "b-green",
  MOVE_TO_ODCY: "b-blue",
  WAIT_AT_TERMINAL: "b-amber",
  MOVE_TO_WAREHOUSE: "b-violet",
};

export const PLAN_STATUS_LABEL: Record<string, string> = {
  PROPOSED: "제안 — 사람 검토 대기",
  APPROVED: "사람 승인됨",
  SUPERSEDED: "새 판으로 대체됨",
  OUTDATED: "다시 계산 필요 — 기댄 사실이 바뀜",
  INFEASIBLE: "실행 가능한 조합 없음",
};

export const PLAN_STATUS_BADGE: Record<string, string> = {
  PROPOSED: "b-blue",
  APPROVED: "b-green",
  SUPERSEDED: "b-slate",
  OUTDATED: "b-orange",
  INFEASIBLE: "b-red",
};

const OUTDATED_LABEL: Record<string, string> = {
  FACT_REVOKED: "철회됨",
  FACT_SUPERSEDED: "새 값으로 바뀜",
  FACT_STATE_CHANGED: "상태가 바뀜(예: 사람 확인)",
  FACT_STALE: "오래됨 · 만료",
  FACT_CONFLICTED: "충돌 — 검토 필요",
  FACT_ADDED: "새 사실이 생김",
  FACT_GONE: "사실이 사라짐",
};
export const outdatedLabel = (code: string) => OUTDATED_LABEL[code] ?? code;

const USAGE_LABEL: Record<string, string> = {
  USED: "계획에 씀",
  USED_WITH_WARNING: "경고와 함께 씀(위험 벌점)",
  EXCLUDED: "계획에서 뺌",
};
export const usageLabel = (usage: string) => USAGE_LABEL[usage] ?? usage;

const EXCLUDE_REASON_LABEL: Record<string, string> = {
  FACT_MISSING: "사실 없음",
  FACT_STALE: "오래됨 · 만료",
  FACT_REVOKED: "철회됨",
  FACT_CONFLICTED: "충돌 — 검토 필요",
  FACT_PROVISIONAL_NOT_ALLOWED: "잠정 사실 사용 금지(정책)",
  PROVISIONAL: "잠정 — 사람 확인 전",
  AGING: "오래되는 중",
};
export const factReasonLabel = (code: string | null | undefined) => (code ? (EXCLUDE_REASON_LABEL[code] ?? code) : "");

/** 자원 키(`WAREHOUSE_DAY:<id>:<day>` · `ODCY:<id>:<size>`) → 사람 말. */
export function resourceLabel(key: string, names: Map<string, string>): string {
  const [kind, id = "", extra = ""] = key.split(":");
  const name = names.get(id) ?? id.slice(0, 8);
  if (kind === "WAREHOUSE_DAY") return `${name} ${extra.slice(5)} 입고 용량`;
  if (kind === "ODCY") return `${name}${extra && extra !== "ALL" ? ` ${extra}` : ""} 용량`;
  return key;
}

/** 이유 코드 → 사람 말. 더 싼 선택지가 막힌 이유는 어떤 자원이 찼는지까지. */
export function reasonLabel(code: string, names: Map<string, string>): string {
  if (code === "LOWEST_COST_OPTION") return "이 컨테이너에서 가장 싼 선택지";
  if (code === "KEEPS_ORIGINAL_PLAN") return "원래 계획 유지";
  if (code === "NO_DEMURRAGE") return "Demurrage 없음";
  if (code === "DEMURRAGE_INCURRED") return "Demurrage 발생";
  if (code === "RELIES_ON_PROVISIONAL_FACT") return "잠정 사실에 기댐(사람 확인 전)";
  if (code === "RELIES_ON_AGING_FACT") return "오래되는 중인 사실에 기댐";
  const blocked = /^CHEAPER_OPTION_BLOCKED:(.+)$/.exec(code);
  if (blocked) {
    const what = blocked[1]!;
    if (what.startsWith("CAPACITY_FULL:")) return `더 싼 선택지가 막힘 — ${resourceLabel(what.slice("CAPACITY_FULL:".length), names)}이 다른 컨테이너에 쓰임`;
    if (what === "TRUCKS_BUSY") return "더 싼 선택지에 쓸 트럭 · 출발 시각이 남지 않음";
    if (what === "TOTAL_COST_TRADEOFF") return "전체 합계가 더 작아지는 쪽을 택함";
    return `더 싼 선택지가 막힘 — ${what}`;
  }
  return code;
}

/** 시설 · 풀 id → 이름(계획 응답 안의 정보만). */
export function nameMap(plan: Plan): Map<string, string> {
  const names = new Map<string, string>();
  for (const f of plan.facts) if (typeof f.subject_id === "string" && typeof f.subject_name === "string") names.set(f.subject_id, f.subject_name);
  for (const i of plan.items) names.set(i.target_id, i.target_name);
  return names;
}

export interface ActionCount {
  action: string;
  label: string;
  count: number;
}

/** 조치별 컨테이너 수(표시용 집계 — 금액이 아니다). */
export function actionCounts(items: PlanItem[]): ActionCount[] {
  const order = ["KEEP_CURRENT_PLAN", "MOVE_TO_ODCY", "WAIT_AT_TERMINAL", "MOVE_TO_WAREHOUSE"];
  return order
    .map((a) => ({ action: a, label: ACTION_LABEL[a] ?? a, count: items.filter((i) => i.action === a).length }))
    .filter((c) => c.count > 0);
}

export interface CostLineView {
  label: string;
  amount: number;
  qty: number;
  unit: number | null;
  item: string;
  status: string;
  assumption: string | null;
  source: string;
}

/** 배정 하나의 비용 항목(엔진 출력 그대로). 0원 항목은 계산 근거가 있을 때만(가정 · NOT_AVAILABLE). */
export function costLines(item: PlanItem): CostLineView[] {
  const detail = item.detail as { cost?: { lines?: { label: string; amount_krw: number; qty: number; unit_krw: number | null; item: string; status: string; assumption: string | null; source_ref: string }[] } };
  return (detail.cost?.lines ?? [])
    .filter((l) => l.amount_krw > 0 || l.status === "NOT_AVAILABLE")
    .map((l) => ({ label: l.label, amount: l.amount_krw, qty: l.qty, unit: l.unit_krw, item: l.item, status: l.status, assumption: l.assumption, source: l.source_ref }));
}

export interface AlternativeView {
  action: string;
  target: string;
  day: string;
  total: number;
  difference: number;
  blockedBy: string[];
}

export function alternatives(item: PlanItem, names: Map<string, string>): AlternativeView[] {
  const detail = item.detail as { alternatives?: { action: string; target_id: string; delivery_day: string; total: number; difference: number; blocked_by: string[] }[] };
  return (detail.alternatives ?? []).map((a) => ({
    action: ACTION_LABEL[a.action] ?? a.action,
    target: names.get(a.target_id) ?? a.target_id,
    day: a.delivery_day,
    total: a.total,
    difference: a.difference,
    blockedBy: a.blocked_by.map((b) => (b.startsWith("CAPACITY_FULL:") ? `${resourceLabel(b.slice(14), names)} 가득` : b === "TRUCKS_BUSY" ? "트럭 · 시각 없음" : b === "TOTAL_COST_TRADEOFF" ? "전체 합 기준" : b)),
  }));
}

/** T-136 — 예외 영향 컨테이너만 재배치 후보, 나머지는 원래 계획 고정(용량 · 트럭은 함께 셈). 범위 제한이 없으면(예외 없이 연 실행) 표시하지 않는다 */
export function scopeLine(items: PlanItem[]): string | null {
  const affected = items.filter((i) => i.detail.scope === "AFFECTED");
  const fixed = items.filter((i) => i.detail.scope === "FIXED").length;
  if (affected.length === 0 && fixed === 0) return null;
  const parts = actionCounts(affected).map((c) => `${c.label} ${c.count}`);
  return `예외 영향 ${affected.length}대 재배치 후보${parts.length ? `(${parts.join(" · ")})` : ""} · 영향 없는 ${fixed}대는 원래 계획 고정`;
}
