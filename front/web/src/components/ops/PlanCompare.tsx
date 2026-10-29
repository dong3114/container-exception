import { useEffect, useState } from "react";
import { type Plan, type PlanSummary, getPlan } from "@/api/plans";
import { krw } from "@/components/format";
import { PLAN_STATUS_LABEL } from "@/components/plan/planLabels";
import { useAsyncAction } from "@/state/async";
import { EmptyState } from "@/components/ui/primitives";
import { ErrorNotice } from "./ErrorNotice";
import { outdatedText, planDiff } from "./opsModel";

const CHANGE: Record<string, { label: string; badge: string }> = {
  ADDED: { label: "+ 추가", badge: "b-green" },
  REMOVED: { label: "− 빠짐", badge: "b-red" },
  MODIFIED: { label: "~ 변경", badge: "b-amber" },
  UNCHANGED: { label: "= 같음", badge: "b-outline" },
};

/** 판 비교 — 두 판의 엔진 결과를 컨테이너별로 맞대 본다(화면은 계산하지 않는다) */
export function PlanCompare({ plans, names: known }: { plans: PlanSummary[]; names?: Map<string, string> }) {
  const sorted = [...plans].sort((a, b) => a.version - b.version);
  const [pair, setPair] = useState<[string, string] | null>(null);
  const a = pair?.[0] ?? sorted.at(-2)?.plan_id ?? null;
  const b = pair?.[1] ?? sorted.at(-1)?.plan_id ?? null;
  const load = useAsyncAction(async (signal, x: string, y: string) => {
    const [p, q] = await Promise.all([getPlan(x, signal), getPlan(y, signal)]);
    return { data: [p.data, q.data] as [Plan, Plan], requestId: q.requestId };
  });
  const { run } = load;
  useEffect(() => {
    if (a && b && a !== b) run(a, b);
  }, [run, a, b]);

  if (sorted.length < 2)
    return (
      <EmptyState icon="⇄" title={sorted.length ? "비교할 이전 판이 없습니다(판이 하나뿐입니다)." : "아직 계획 판이 없습니다."} testId="plan-compare-empty">
        사실이 바뀌어 계획을 다시 계산하면 판(v1 → v2 …)이 쌓이고, 무엇이 바뀌었는지 여기서 비교합니다.
      </EmptyState>
    );
  const data = load.state.status === "SUCCESS" ? load.state.data : null;
  const rows = data ? planDiff(data[0].items, data[1].items) : [];
  const names = new Map<string, string>(known ?? []);
  for (const p of data ?? []) for (const i of p.items) if (i.target_id && i.target_name) names.set(i.target_id, i.target_name);
  const count = (c: string) => rows.filter((r) => r.change === c).length;
  return (
    <div style={{ display: "grid", gap: 8 }} data-testid="plan-compare">
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <b>판 비교</b>
        {[0, 1].map((side) => (
          <select key={side} value={(side === 0 ? a : b) ?? ""} onChange={(e) => setPair(side === 0 ? [e.target.value, b!] : [a!, e.target.value])} aria-label={side === 0 ? "이전 판" : "나중 판"}>
            {sorted.map((p) => (
              <option key={p.plan_id} value={p.plan_id}>
                v{p.version} · {PLAN_STATUS_LABEL[p.plan_status] ?? p.plan_status}
              </option>
            ))}
          </select>
        ))}
      </div>
      <ErrorNotice error={load.state.status === "FAILED" ? load.state.error : null} />
      {data && (
        <>
          <div className="plan-head-grid" data-testid="plan-compare-kpi">
            <div className="metric">
              <span className="metric-label">추천 계획 예상 손실</span>
              <span className="num">
                v{data[0].version} {krw(data[0].objective_krw)} → <b>v{data[1].version} {krw(data[1].objective_krw)}</b>
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">조치 없음(Baseline)</span>
              <span className="num">
                {krw(data[0].baseline_total_krw)} → {krw(data[1].baseline_total_krw)}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">컨테이너별 변화</span>
              <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {(["ADDED", "REMOVED", "MODIFIED", "UNCHANGED"] as const).map((c) => (
                  <span key={c} className={`badge ${CHANGE[c]!.badge}`}>
                    {CHANGE[c]!.label} {count(c)}
                  </span>
                ))}
              </span>
            </div>
          </div>
          {(data[0].outdated_reasons ?? []).length > 0 && (
            <div style={{ fontSize: 12.5 }} data-testid="plan-compare-reasons">
              v{data[0].version} 이 바뀐 이유:{" "}
              {(data[0].outdated_reasons as Record<string, unknown>[]).map((r, i) => (
                <span key={i}>
                  {i > 0 ? " · " : ""}
                  {outdatedText(r, names)}
                </span>
              ))}
            </div>
          )}
          {count("ADDED") + count("REMOVED") + count("MODIFIED") === 0 && <span className="muted">두 판의 컨테이너별 조치가 같습니다.</span>}
          <table className="ops-table">
            <thead>
              <tr>
                <th>컨테이너</th>
                <th>변화</th>
                <th>v{data[0].version}</th>
                <th>v{data[1].version}</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => r.change !== "UNCHANGED")
                .map((r) => (
                  <tr key={r.container_id} data-testid="plan-diff-row" data-change={r.change}>
                    <td className="mono">{r.container_id.slice(-8)}</td>
                    <td>
                      <span className={`badge ${CHANGE[r.change]!.badge}`}>{CHANGE[r.change]!.label}</span>
                    </td>
                    <td>{r.before ?? "—"}</td>
                    <td>{r.after ?? "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {count("UNCHANGED") > 0 && <span className="muted">같은 조치 {count("UNCHANGED")}건은 접어 두었습니다.</span>}
        </>
      )}
    </div>
  );
}
