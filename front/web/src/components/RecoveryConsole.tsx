import type { ContainerView, RecoveryPlanCurrent, RouteCode } from "@/contracts/cera";
import { RouteBadge, RiskBadge, SimTag } from "./badges";
import { PLAN_STATUS_LABEL, PRIORITY_LABEL, ROUTE_SHORT, carrierShort, hm, hms, krw, md } from "./format";

interface Props {
  current: RecoveryPlanCurrent;
  containers: ContainerView[];
  plannedToday: number;
  affectedCount: number;
  onSelect: (id: string) => void;
  hoveredId?: string | null;
  onHover?: (id: string | null) => void;
}

const ROUTE_ORDER: RouteCode[] = ["WAREHOUSE_DIRECT", "ODCY_A", "ODCY_B", "TERMINAL_WAIT"];

export function RecoveryConsole({ current, containers, plannedToday, affectedCount, onSelect, hoveredId, onHover }: Props) {
  const { plan, baseline, history } = current;
  const byId = new Map(containers.map((c) => [c.id, c]));

  return (
    <section className="card" data-testid="recovery-console">
      <div className="card-head">
        <span className="card-title">Recovery Console</span>
        <SimTag>Simulated Recovery Plan</SimTag>
        {plan && (
          <span className={`badge ${plan.status === "PROPOSED" ? "b-amber" : plan.status === "APPROVED" ? "b-teal" : "b-slate"}`} data-testid="plan-status">
            {plan.label} · {PLAN_STATUS_LABEL[plan.status]}
          </span>
        )}
        {history.length > 1 && (
          <span className="chips">
            {history.map((h) => (
              <span key={h.plan_id} className="badge b-outline">
                {h.label} {PLAN_STATUS_LABEL[h.status]}
              </span>
            ))}
          </span>
        )}
        <span className="card-meta">{plan ? `생성 ${hms(plan.generated_at)} · 시뮬레이션 계획` : ""}</span>
      </div>

      {!baseline && <div className="empty">활성 예외가 없어 복구 계획이 필요하지 않습니다. 정상 배차를 유지합니다.</div>}

      {baseline && (
        <div className="card-body">
          {plan?.status_flags.includes("INPUT_CHANGED") && (
            <div className="rc-note warn" style={{ marginBottom: 12, background: "var(--red-soft)", borderColor: "var(--red-border)" }} data-testid="input-changed">
              <b style={{ color: "var(--red)" }}>계획 입력 변경 — 재계획 필요.</b> {plan.status_note}
            </div>
          )}
          {plan?.status === "PROPOSED" && plan.active_approved_plan_id && (
            <div className="rc-note" style={{ marginBottom: 12 }}>
              {plan.label}은 승인 대기 중입니다. 승인 전 실행 기준은 <b>{plan.active_approved_plan_id}</b> (기존 승인 계획)입니다.
            </div>
          )}

          <div className="rc-costs">
            <div className="rc-cost">
              <div className="rc-cost-label">Baseline Cost (미조치 시)</div>
              <div className="rc-cost-value num" data-testid="baseline-cost">
                {krw(baseline.total_cost_krw)}
              </div>
              <div className="rc-cost-note">영향 12대 터미널 대기 기준 예상 총비용</div>
            </div>
            <div className="rc-cost">
              <div className="rc-cost-label">Recovery Plan Cost (복구 계획)</div>
              <div className="rc-cost-value num" data-testid="plan-cost">
                {plan ? krw(plan.plan_cost_krw) : "계획 대기"}
              </div>
              <div className="rc-cost-note">
                {plan?.previous ? `이전 계획(${plan.previous.plan_id}): ${krw(plan.previous.plan_cost_krw)}` : plan ? "우회 반출 및 분산 배치" : "다음 이벤트에서 계획 생성"}
              </div>
            </div>
            <div className="rc-cost saving">
              <div className="rc-cost-label">Potential Saving (예상 절감액)</div>
              <div className="rc-cost-value num" data-testid="potential-saving">
                {plan ? krw(plan.potential_saving_krw) : "—"}
              </div>
              <div className="rc-cost-note">{plan?.previous ? `이전 대비 절감액: ${krw(plan.previous.potential_saving_krw)}` : "Baseline 대비 순 절감"}</div>
            </div>
          </div>

          <div className="rc-bars" aria-hidden>
            <Bar label="Baseline" value={baseline.total_cost_krw} max={baseline.total_cost_krw} color="#f87171" />
            {plan?.previous && <Bar label={`${plan.previous.plan_id} (이전)`} value={plan.previous.plan_cost_krw} max={baseline.total_cost_krw} color="#93c5fd" />}
            {plan && <Bar label={plan.label} value={plan.plan_cost_krw} max={baseline.total_cost_krw} color="#0d9488" />}
          </div>

          {plan && (
            <div className="rc-summary" data-testid="route-summary">
              <div className="rc-sum-block">
                <div className="rc-sum-title">창고 A 오늘 입고 예정 {plannedToday}대의 배치</div>
                <div className="rc-sum-items">
                  {ROUTE_ORDER.filter((r) => plan.route_summary_20[r]).map((r, i) => (
                    <span key={r} className="chips" style={{ alignItems: "center" }}>
                      {i > 0 && <span className="rc-eq">+</span>}
                      <RouteBadge route={r} /> <b className="num">{plan.route_summary_20[r]}</b>
                    </span>
                  ))}
                  <span className="rc-eq">= {plannedToday}대</span>
                </div>
              </div>
              <div className="rc-sum-block" style={{ borderColor: "var(--red-border)" }}>
                <div className="rc-sum-title">영향 {affectedCount}대 Recovery Actions</div>
                <div className="rc-sum-items" data-testid="action-summary">
                  {ROUTE_ORDER.filter((r) => plan.recovery_action_summary_12[r]).map((r, i) => (
                    <span key={r} className="chips" style={{ alignItems: "center" }}>
                      {i > 0 && <span className="rc-eq">+</span>}
                      <RouteBadge route={r} /> <b className="num">{plan.recovery_action_summary_12[r]}</b>
                    </span>
                  ))}
                  <span className="rc-eq">= {affectedCount}대</span>
                </div>
              </div>
            </div>
          )}

          {plan ? (
            <div className="tbl-wrap">
              <table className="tbl" data-testid="action-table">
                <thead>
                  <tr>
                    <th>컨테이너</th>
                    <th>규격 · 선사</th>
                    <th>우선순위</th>
                    <th>LFD</th>
                    <th>위험 등급</th>
                    <th>Recovery Action</th>
                    <th>출발 · 트럭</th>
                    <th>입고일</th>
                    <th className="r">Baseline</th>
                    <th className="r">Plan</th>
                    <th className="r">절감액</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.actions.map((a) => {
                    const c = byId.get(a.container_id)!;
                    const changed = a.change_from_previous?.kind === "ROUTE_CHANGED";
                    const isHovered = hoveredId === a.container_id;
                    return (
                      <tr
                        key={a.container_id}
                        className={`clickable ${changed ? "changed" : ""} ${isHovered ? "is-hovered" : ""}`}
                        onClick={() => onSelect(a.container_id)}
                        onMouseEnter={() => onHover?.(a.container_id)}
                        onMouseLeave={() => onHover?.(null)}
                        data-testid={`action-${a.container_id}`}
                      >
                        <td>
                          <b>{a.container_id}</b>
                          <div className="muted mono" style={{ fontSize: 10.5 }}>
                            {c.container_no}
                          </div>
                        </td>
                        <td>
                          {c.size_label}
                          <div className="muted">{carrierShort(c.carrier)}</div>
                        </td>
                        <td>{PRIORITY_LABEL[c.business_priority]}</td>
                        <td className="num">{md(c.lfd)}</td>
                        <td>
                          <RiskBadge grade={c.risk.grade} />
                        </td>
                        <td className="wrap" style={{ minWidth: 260 }}>
                          <span className="muted" style={{ fontSize: 11.5 }}>터미널 → </span>
                          <RouteBadge route={a.route} />
                          {a.uses_provisional_input && <span className="badge b-amber b-dashed" style={{ marginLeft: 4 }}>잠정 입력</span>}
                          {a.change_from_previous && (
                            <div style={{ fontSize: 11, marginTop: 2, color: changed ? "var(--blue)" : "var(--text-3)", fontWeight: changed ? 700 : 500 }}>
                              {changed ? `변경: ${ROUTE_SHORT[a.change_from_previous.previous_route]} → ${ROUTE_SHORT[a.route]}` : a.change_from_previous.note}
                            </div>
                          )}
                          <div className="muted" style={{ fontSize: 11, marginTop: 2, maxWidth: 520 }}>
                            {a.rationale}
                          </div>
                        </td>
                        <td className="num">{a.depart_at ? `${hm(a.depart_at)} · ${a.truck_id}` : "—"}</td>
                        <td className="num">{md(a.delivery_day)}</td>
                        <td className="r num">{krw(a.baseline_cost_krw)}</td>
                        <td className="r num">{krw(a.cost_krw)}</td>
                        <td className="r num" style={{ color: a.saving_krw > 0 ? "var(--teal)" : "var(--text-3)", fontWeight: 700 }}>
                          {a.saving_krw > 0 ? krw(a.saving_krw) : "0원"}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="row-detail">
                    <td colSpan={11} className="wrap">
                      <b>직송 유지 {plan.unchanged_direct.count}대</b> ({plan.unchanged_direct.container_ids.join(", ")}) — 비용 {krw(plan.unchanged_direct.cost_krw)}. 리퍼 및 필수 우선순위 화물은 기존 창고 직송을 유지합니다.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rc-note warn" data-testid="baseline-only">
              <b>Baseline:</b> {baseline.rule}
            </div>
          )}

          {plan && (
            <div className="rc-notes">
              {plan.change_summary.length > 0 && (
                <div className="rc-note change" data-testid="change-summary">
                  <h4>
                    {plan.previous?.plan_id} → {plan.label} 변경 사항
                  </h4>
                  <ul>
                    {plan.change_summary.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="rc-note warn">
                <h4>잠정 입력 {plan.provisional_inputs.length}건 (사람 확인 전)</h4>
                <ul>
                  {plan.provisional_inputs.map((p) => (
                    <li key={p.ref}>{p.label}</li>
                  ))}
                </ul>
              </div>
              <div className="rc-note">
                <h4>운영 제약</h4>
                <ul>
                  {plan.binding_constraints.map((b) => (
                    <li key={b.type + b.ref}>{b.note}</li>
                  ))}
                </ul>
              </div>
              {plan.resource_gaps.length > 0 && (
                <div className="rc-note">
                  <h4>부족 자원 및 문의 대상</h4>
                  <ul>
                    {plan.resource_gaps.map((g) => (
                      <li key={g.type + g.note}>
                        {g.note} <span className="muted">→ {g.ask}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="rc-note">
                <h4>운영자 승인 (G3)</h4>
                {plan.approval ? (
                  <div style={{ lineHeight: 1.4 }}>
                    <b>{plan.approval.decided_by}</b> ({hms(plan.approval.decided_at)}) 승인 완료. 잠정 입력 {plan.approval.acknowledged_provisional_inputs.length}건 인지 기록됨.
                  </div>
                ) : (
                  <div style={{ color: "var(--text-3)" }}>승인 대기 중 (잠정 입력 {plan.provisional_inputs.length}건 인지 필요)</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="rc-bar-row">
      <span className="sub">{label}</span>
      <span className="rc-bar-track">
        <span className="rc-bar-fill" style={{ display: "block", width: `${(value / max) * 100}%`, background: color }} />
      </span>
      <span className="num" style={{ textAlign: "right" }}>
        {krw(value)}
      </span>
    </div>
  );
}
