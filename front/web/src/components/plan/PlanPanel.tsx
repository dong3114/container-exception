import { Fragment, useEffect, useState } from "react";
import { type Plan, approvePlan, getPlan, listPlans, recalculatePlan } from "@/api/plans";
import { describeApiError } from "@/api/errors";
import { krw } from "@/components/format";
import { outdatedText, outdatedValueChange } from "@/components/ops/opsModel";
import { Callout, EmptyState } from "@/components/ui/primitives";
import { useAsyncAction } from "@/state/async";
import {
  scopeLine,
  ACTION_BADGE,
  ACTION_LABEL,
  PLAN_STATUS_BADGE,
  PLAN_STATUS_LABEL,
  actionCounts,
  alternatives,
  costLines,
  factReasonLabel,
  nameMap,
  reasonLabel,
  usageLabel,
} from "./planLabels";

const short = (iso: string | null | undefined) => (iso ? iso.slice(5, 16).replace("T", " ") : "—");

/**
 * 복구 계획(T-114) — 결정론 Cost Engine + Solver 가 만든 **제안 판**을 보여 준다. 숫자는 모두 Backend 엔진 출력이다(화면은 더하지 않는다).
 * 사람은 [다시 계산](지금 사실로) · [승인](본 판의 지문으로)만 한다. 승인은 실행 지시가 아니다 — 배차 · 발송은 없다.
 * 사실이 바뀌어 판이 OUTDATED 가 되면 Agent 가 다시 계산하거나, 사람이 [다시 계산] 을 누른다.
 */
export function PlanPanel({ recoveryRunId, actorId, refreshKey }: { recoveryRunId: string; actorId: string | null; refreshKey?: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const list = useAsyncAction((signal) => listPlans(recoveryRunId, signal));
  const detail = useAsyncAction((signal, planId: string) => getPlan(planId, signal));
  const { run: loadList } = list;
  const { run: loadDetail } = detail;

  useEffect(() => {
    loadList();
  }, [loadList, recoveryRunId, refreshKey]);

  const plans = list.state.status === "SUCCESS" ? list.state.data.plans : [];
  const current = list.state.status === "SUCCESS" ? list.state.data.current_plan_id : null;
  const shown = selected ?? current;
  useEffect(() => {
    if (shown) loadDetail(shown);
  }, [loadDetail, shown, refreshKey]);

  const recalc = useAsyncAction(async (signal, actor: string) => {
    const res = await recalculatePlan(recoveryRunId, actor, signal);
    setSelected(null);
    loadList();
    loadDetail(res.data.plan_id);
    return res;
  });
  const approve = useAsyncAction(async (signal, plan: Plan, actor: string) => {
    const res = await approvePlan(plan.plan_id, plan.plan_hash, actor, signal);
    loadList();
    loadDetail(plan.plan_id);
    return res;
  });

  const plan = detail.state.status === "SUCCESS" ? detail.state.data : null;
  const error = [recalc, approve, list, detail].map((a) => a.state).find((s) => s.status === "FAILED");
  const names = plan ? nameMap(plan) : new Map<string, string>();
  const result = (plan?.result ?? {}) as { assumptions?: string[]; warnings?: string[]; binding_constraints?: { type: string; ref: string; note: string }[]; unplanned?: { container_id: string; reasons: string[] }[]; timings_ms?: { cost: number; model: number; solve: number }; engine?: string };
  const warnFacts = plan ? plan.facts.filter((f) => f.usage !== "USED") : [];
  const warehouses = plan ? ((plan.problem as { warehouses?: { facility_id: string; name: string; planned: number; capacity: number | null; shortfall: number | null }[] }).warehouses ?? []) : [];

  return (
    <section style={{ display: "grid", gap: 10, borderTop: "1px solid var(--line)", paddingTop: 8 }} data-testid="plan-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <b style={{ fontSize: 13 }}>📦 복구 계획</b>
          <div className="muted" style={{ fontSize: 11.5 }}>
            결정론 비용 엔진 + Solver(HiGHS)가 계산한 제안입니다. 숫자는 엔진 출력이며, 승인은 사람만 합니다 — 승인해도 배차 · 발송은 하지 않습니다.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" className="act-btn" disabled={!actorId || recalc.state.status === "LOADING"} onClick={() => actorId && recalc.run(actorId)} data-testid="plan-recalculate">
            {recalc.state.status === "LOADING" ? "계산 중…" : "지금 사실로 다시 계산"}
          </button>
          {plan?.plan_status === "PROPOSED" && (
            <button type="button" className="act-btn primary" disabled={!actorId || approve.state.status === "LOADING"} onClick={() => actorId && approve.run(plan, actorId)} data-testid="plan-approve">
              이 계획 승인
            </button>
          )}
        </div>
      </div>

      {error?.status === "FAILED" && (
        <Callout tone="danger" testId="plan-error" title={error.error.code === "PLANNING_INPUT_UNAVAILABLE" ? "계획 계산에 필요한 정보가 부족합니다." : "계획을 처리하지 못했습니다."}>
          <details className="tech">
            <summary>기술 상세</summary>
            <span className="mono">
              {error.error.code ? `${error.error.code} — ` : ""}
              {error.error.message || describeApiError(error.error)}
              {error.error.status ? ` · HTTP ${error.error.status}` : ""}
              {error.error.requestId ? ` · request ${error.error.requestId}` : ""}
            </span>
          </details>
        </Callout>
      )}

      {plans.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 11.5 }} data-testid="plan-versions">
          {plans.map((p) => (
            <button key={p.plan_id} type="button" className={`act-btn${shown === p.plan_id ? " primary" : ""}`} onClick={() => setSelected(p.plan_id)} style={{ fontSize: 11.5 }}>
              v{p.version} <span className={`badge ${PLAN_STATUS_BADGE[p.plan_status] ?? "b-outline"}`}>{PLAN_STATUS_LABEL[p.plan_status] ?? p.plan_status}</span> {krw(p.objective_krw)}
            </button>
          ))}
        </div>
      )}
      {list.state.status === "SUCCESS" && plans.length === 0 && (
        <EmptyState icon="▣" title="아직 계산된 계획이 없습니다." testId="plan-empty">
          필요한 정보가 모이면 Agent 가 계산합니다. 지금 사실로 바로 계산하려면 [지금 사실로 다시 계산] 을 누르세요.
        </EmptyState>
      )}

      {plan && (
        <div style={{ display: "grid", gap: 10 }} data-testid="plan-detail" data-plan-status={plan.plan_status} data-version={plan.version}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
            <span className={`badge ${PLAN_STATUS_BADGE[plan.plan_status] ?? "b-outline"}`} data-testid="plan-status">
              v{plan.version} · {PLAN_STATUS_LABEL[plan.plan_status] ?? plan.plan_status}
            </span>
            <span className="badge b-outline">Solver {plan.solver_status}</span>
            {plan.contains_simulated && <span className="badge b-sim">시뮬레이션 입력(합성 컨테이너 · 요율)</span>}
            <span className="muted">사실 판정 시각 {short(plan.as_of)} · 계산 {short(plan.created_at)}</span>
            {plan.approved_at && <span className="badge b-green">승인 {short(plan.approved_at)}</span>}
          </div>

          {warehouses
            .filter((w) => (w.shortfall ?? 0) > 0)
            .map((w) => (
              <div key={w.facility_id} className="badge b-red" style={{ whiteSpace: "normal", justifySelf: "start", fontSize: 12.5 }} data-testid="plan-problem">
                문제: {w.name} 오늘 들어올 컨테이너 {w.planned}대 · 받을 수 있는 수 {w.capacity}대 → {w.shortfall}대가 자리를 잃음
              </div>
            ))}

          {plan.plan_status === "OUTDATED" && plan.outdated_reasons && (
            <Callout
              tone="warn"
              icon="↻"
              testId="plan-outdated"
              title="이 계획 이후 계획이 기댄 정보가 바뀌었습니다 — 새 계획이 필요합니다."
              actions={
                <button type="button" className="act-btn primary" disabled={!actorId || recalc.state.status === "LOADING"} onClick={() => actorId && recalc.run(actorId)} data-testid="plan-outdated-recalculate">
                  {recalc.state.status === "LOADING" ? "계산 중…" : "다시 계산"}
                </button>
              }
            >
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {plan.outdated_reasons.map((r, i) => {
                  const rec = r as Record<string, unknown>;
                  const change = outdatedValueChange(rec);
                  return (
                    <li key={i} data-testid="plan-outdated-reason">
                      {outdatedText(rec, names)}
                      {change && (
                        <span data-testid="plan-outdated-change">
                          {" "}
                          · 기존 <b className="num">{change.before ?? "없음"}</b> → 현재 <b className="num">{change.after ?? "없음"}</b>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <span className="muted">사실이 바뀌면 Agent 가 다시 계산할 수도 있습니다. 지금 바로 계산하려면 [다시 계산] 을 누르세요.</span>
            </Callout>
          )}

          <div className="plan-head-grid" data-testid="plan-kpi">
            <div className="metric">
              <span className="metric-label">조치 없음(Baseline) 예상 손실</span>
              <b className="metric-value num" style={{ fontSize: 18 }} data-testid="plan-baseline">{krw(plan.baseline_total_krw)}</b>
              <span className="metric-hint">실비용 {krw(plan.baseline_base_cost_krw)}</span>
            </div>
            <div className="metric tone-info">
              <span className="metric-label">추천 계획 예상 손실</span>
              <b className="metric-value num" style={{ fontSize: 18 }} data-testid="plan-objective">{krw(plan.objective_krw)}</b>
              <span className="metric-hint">실비용 {krw(plan.base_cost_krw)} + 위험 벌점 {krw(plan.risk_penalty_krw)}</span>
            </div>
            <div className="metric tone-ok">
              <span className="metric-label">예상 절감(시뮬레이션 기준)</span>
              <b className="metric-value num" style={{ fontSize: 18, color: "var(--green)" }} data-testid="plan-saving">{krw(plan.saving_krw)}</b>
              <span className="metric-hint">실비용 절감 {krw(plan.base_saving_krw)} · 실제 절감 실적 아님</span>
            </div>
            <div className="metric" style={{ fontSize: 12 }}>
              <span className="metric-label">조치 {plan.changed_count}대 변경 / 대상 {plan.candidate_count}대</span>
              {scopeLine(plan.items) && <span className="metric-hint" data-testid="plan-scope">{scopeLine(plan.items)}</span>}
              {actionCounts(plan.items).map((c) => (
                <div key={c.action}>
                  <span className={`badge ${ACTION_BADGE[c.action] ?? "b-outline"}`}>{c.label}</span> {c.count}대
                </div>
              ))}
            </div>
          </div>

          <CostCompare baseline={plan.baseline_total_krw} recommended={plan.objective_krw} />

          {(warnFacts.length > 0 || (result.binding_constraints ?? []).length > 0) && (
            <div style={{ display: "grid", gap: 4, fontSize: 12 }} data-testid="plan-warnings">
              {warnFacts.map((f, i) => (
                <div key={i} className={`badge ${f.usage === "EXCLUDED" ? "b-red" : "b-amber"}`} style={{ whiteSpace: "normal", justifySelf: "start" }}>
                  {usageLabel(String(f.usage))}: {String(f.subject_name ?? f.subject_id)} {String(f.fact_key)} = {f.value === null ? "값 없음" : String(f.value)} ({factReasonLabel(f.reason as string | null)} · 출처 {String(f.source)})
                </div>
              ))}
              {(result.binding_constraints ?? []).map((b, i) => (
                <div key={`b${i}`} className="muted">
                  꽉 찬 제약: {b.type === "TRUCK" ? `트럭 — ${b.note}` : `${b.ref.split(":").length > 1 ? names.get(b.ref.split(":")[1]!) ?? b.ref : b.ref} ${b.ref.split(":")[2] ?? ""} ${b.note}`}
                </div>
              ))}
            </div>
          )}

          {(result.unplanned ?? []).length > 0 && (
            <div className="badge b-red" style={{ whiteSpace: "normal", justifySelf: "start", fontSize: 12 }} data-testid="plan-unplanned">
              계획할 수 없는 컨테이너 {result.unplanned!.length}대:{" "}
              {result.unplanned!.map((u) => `${u.container_id} (${u.reasons.slice(0, 2).join(" / ")})`).join(" · ")}
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ fontSize: 12, width: "100%" }} data-testid="plan-items">
              <thead>
                <tr>
                  <th>컨테이너</th>
                  <th>추천 조치</th>
                  <th>오늘 갈 곳</th>
                  <th>창고 입고일</th>
                  <th>출발 · 트럭</th>
                  <th style={{ textAlign: "right" }}>예상 손실</th>
                  <th style={{ textAlign: "right" }}>Baseline</th>
                  <th>이유</th>
                </tr>
              </thead>
              <tbody>
                {plan.items.map((i) => (
                  <Fragment key={i.container_id}>
                    <tr onClick={() => setOpen(open === i.container_id ? null : i.container_id)} style={{ cursor: "pointer" }} data-testid="plan-item" data-container={i.container_id} data-action={i.action}>
                      <td className="num">{i.container_id}</td>
                      <td>
                        <span className={`badge ${ACTION_BADGE[i.action] ?? "b-outline"}`}>{ACTION_LABEL[i.action] ?? i.action}</span>
                      </td>
                      <td>{i.target_name}</td>
                      <td className="num">{i.delivery_day.slice(5)}</td>
                      <td className="num">{i.scheduled_time ? `${i.scheduled_time.slice(11, 16)} · ${i.truck_id?.includes("#") ? "협력 트럭" : i.truck_id}` : "—"}</td>
                      <td className="num" style={{ textAlign: "right" }}>{krw(i.total_krw)}</td>
                      <td className="num muted" style={{ textAlign: "right" }}>{krw(i.baseline_total_krw)}</td>
                      <td style={{ fontSize: 11 }}>{i.reason_codes.filter((c) => c !== "NO_DEMURRAGE").slice(0, 2).map((c) => reasonLabel(c, names)).join(" · ")}</td>
                    </tr>
                    {open === i.container_id && (
                      <tr data-testid="plan-item-detail">
                        <td colSpan={8} style={{ background: "var(--bg-soft, #f7f7f9)" }}>
                          <div className="grid-two" style={{ gap: 10, fontSize: 11.5 }}>
                            <div>
                              <b>비용 내역(엔진 · 출처 · 가정)</b>
                              <ul style={{ margin: 0, paddingLeft: 16 }}>
                                {costLines(i).map((l, k) => (
                                  <li key={k}>
                                    {l.label}: {l.status === "NOT_AVAILABLE" ? "계산 불가(요율 없음)" : `${l.unit === null ? "" : `${l.qty} × ${krw(l.unit)} = `}${krw(l.amount)}`}
                                    {l.item === "risk" || l.item === "delay" ? <span className="muted"> · 정책 벌점</span> : null}
                                    {l.assumption ? <span className="muted"> · {l.assumption}</span> : null}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <b>다른 선택지(왜 안 골랐나)</b>
                              <ul style={{ margin: 0, paddingLeft: 16 }}>
                                {alternatives(i, names).map((a, k) => (
                                  <li key={k}>
                                    {a.action} {a.target} {a.day.slice(5)}: {krw(a.total)} ({a.difference >= 0 ? "+" : ""}
                                    {krw(a.difference)}){a.blockedBy.length ? ` — ${a.blockedBy.join(", ")}` : ""}
                                  </li>
                                ))}
                              </ul>
                              <div className="muted" style={{ marginTop: 4 }}>{i.reason_codes.map((c) => reasonLabel(c, names)).join(" · ")}</div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <details style={{ fontSize: 11.5 }}>
            <summary className="muted">가정 · 엔진 정보</summary>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {(result.assumptions ?? []).map((a, k) => (
                <li key={k}>{a}</li>
              ))}
              <li>
                엔진: {result.engine ?? plan.solver_version} · 비용 계산 {result.timings_ms?.cost ?? plan.cost_ms} ms · Solver {plan.solve_ms} ms · 입력 지문 {plan.input_hash.slice(7, 19)}
              </li>
            </ul>
          </details>
        </div>
      )}
    </section>
  );
}

/** Baseline 과 추천안을 막대로 맞대 본다 — 두 값 모두 엔진 출력이고, 화면은 길이만 비율로 그린다(새 숫자를 만들지 않는다) */
function CostCompare({ baseline, recommended }: { baseline: number | null; recommended: number | null }) {
  if (baseline === null || recommended === null || baseline <= 0) return null;
  const max = Math.max(baseline, recommended);
  const width = (v: number) => `${Math.max(2, Math.round((v / max) * 100))}%`;
  return (
    <div className="cost-compare" data-testid="plan-cost-compare" aria-label="예상 손실 비교">
      <div className="cost-bar-row">
        <span>조치 없음(Baseline)</span>
        <span className="cost-bar" aria-hidden>
          <span className="base" style={{ width: width(baseline) }} />
        </span>
        <span className="cost-amount num">{krw(baseline)}</span>
      </div>
      <div className="cost-bar-row">
        <span>추천 계획</span>
        <span className="cost-bar" aria-hidden>
          <span className="rec" style={{ width: width(recommended) }} />
        </span>
        <span className="cost-amount num">{krw(recommended)}</span>
      </div>
    </div>
  );
}

