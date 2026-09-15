import type { ContainerView, RecoveryPlanCurrent, RouteCode } from "@/contracts/cera";
import { RouteBadge, RiskBadge, SimTag } from "./badges";
import { PLAN_STATUS_LABEL, PRIORITY_LABEL, ROUTE_SHORT, carrierShort, hm, hms, krw, md } from "./format";

interface Props {
  current: RecoveryPlanCurrent;
  containers: ContainerView[];
  plannedToday: number;
  affectedCount: number;
  onSelect: (id: string) => void;
}

const ROUTE_ORDER: RouteCode[] = ["WAREHOUSE_DIRECT", "ODCY_A", "ODCY_B", "TERMINAL_WAIT"];

export function RecoveryConsole({ current, containers, plannedToday, affectedCount, onSelect }: Props) {
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
        <span className="card-meta">{plan ? `생성 ${hms(plan.generated_at)} · 시나리오 결과 (Solver 아님)` : ""}</span>
      </div>

      {!baseline && <div className="empty">활성 예외가 없어 복구 계획이 없습니다. 원래 입고 계획대로 진행합니다.</div>}

      {baseline && (
        <div className="card-body">
          {plan?.status_flags.includes("INPUT_CHANGED") && (
            <div className="rc-note warn" style={{ marginBottom: 10, background: "var(--red-soft)", borderColor: "#f0b3b3" }} data-testid="input-changed">
              <b style={{ color: "var(--red)" }}>계획 입력 변경 — 재계획 필요.</b> {plan.status_note}
            </div>
          )}
          {plan?.status === "PROPOSED" && plan.active_approved_plan_id && (
            <div className="rc-note" style={{ marginBottom: 10 }}>
              {plan.label}은 승인 대기입니다. 승인 전까지 실행 기준은 {plan.active_approved_plan_id} (승인된 계획)입니다.
            </div>
          )}

          <div className="rc-costs">
            <div className="rc-cost">
              <div className="rc-cost-label">Baseline Cost (조치 없음)</div>
              <div className="rc-cost-value num" data-testid="baseline-cost">
                {krw(baseline.total_cost_krw)}
              </div>
              <div className="rc-cost-note">영향 12대를 터미널에서 기다리게 할 때</div>
            </div>
            <div className="rc-cost">
              <div className="rc-cost-label">Simulated Recovery Plan Cost</div>
              <div className="rc-cost-value num" data-testid="plan-cost">
                {plan ? krw(plan.plan_cost_krw) : "계획 대기"}
              </div>
              <div className="rc-cost-note">
                {plan?.previous ? `이전 ${plan.previous.plan_id}: ${krw(plan.previous.plan_cost_krw)}` : plan ? "같은 12대 · 같은 입고일" : "다음 이벤트에서 계획 생성"}
              </div>
            </div>
            <div className="rc-cost saving">
              <div className="rc-cost-label">Potential Saving (시뮬레이션 기준)</div>
              <div className="rc-cost-value num" data-testid="potential-saving">
                {plan ? krw(plan.potential_saving_krw) : "—"}
              </div>
              <div className="rc-cost-note">{plan?.previous ? `이전 ${krw(plan.previous.potential_saving_krw)}` : "실제 절감 실적 아님"}</div>
            </div>
          </div>

          <div className="rc-bars" aria-hidden>
            <Bar label="Baseline" value={baseline.total_cost_krw} max={baseline.total_cost_krw} color="#d9a0a0" />
            {plan?.previous && <Bar label={`${plan.previous.plan_id} (이전)`} value={plan.previous.plan_cost_krw} max={baseline.total_cost_krw} color="#b9c9ee" />}
            {plan && <Bar label={plan.label} value={plan.plan_cost_krw} max={baseline.total_cost_krw} color="#0f8a80" />}
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
              <div className="rc-sum-block" style={{ borderColor: "#f0b3b3" }}>
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
                    <th>우선</th>
                    <th>LFD</th>
                    <th>위험</th>
                    <th>Recovery Action</th>
                    <th>출발 · 트럭</th>
                    <th>입고</th>
                    <th className="r">Baseline</th>
                    <th className="r">Plan</th>
                    <th className="r">절감</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.actions.map((a) => {
                    const c = byId.get(a.container_id)!;
                    const changed = a.change_from_previous?.kind === "ROUTE_CHANGED";
                    return (
                      <tr key={a.container_id} className={`clickable ${changed ? "changed" : ""}`} onClick={() => onSelect(a.container_id)} data-testid={`action-${a.container_id}`}>
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
                          <span className="muted">터미널 → </span>
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
                      창고 A 직송 유지 {plan.unchanged_direct.count}대 ({plan.unchanged_direct.container_ids.join(", ")}) — {krw(plan.unchanged_direct.cost_krw)}. Reefer(ODCY 불가)와 우선순위 필수 화물. 세 계획에서 같아 비교에서 뺐습니다.
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
                    {plan.previous?.plan_id} → {plan.label}에서 바뀐 것
                  </h4>
                  <ul>
                    {plan.change_summary.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="rc-note warn">
                <h4>잠정 입력 {plan.provisional_inputs.length}건 (PROVISIONAL — 사람 확인 전)</h4>
                <ul>
                  {plan.provisional_inputs.map((p) => (
                    <li key={p.ref}>{p.label}</li>
                  ))}
                </ul>
              </div>
              <div className="rc-note">
                <h4>막고 있는 제약</h4>
                <ul>
                  {plan.binding_constraints.map((b) => (
                    <li key={b.type + b.ref}>{b.note}</li>
                  ))}
                </ul>
              </div>
              {plan.resource_gaps.length > 0 && (
                <div className="rc-note">
                  <h4>부족한 자원 → 문의 대상</h4>
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
                <h4>사람 승인 (G3)</h4>
                {plan.approval ? (
                  <div>
                    {plan.approval.decided_by} · {hms(plan.approval.decided_at)} 승인. 잠정 입력 {plan.approval.acknowledged_provisional_inputs.length}건 인지. 계획 승인은 사실 확인이 아니다 — 입력은 계속 잠정.
                  </div>
                ) : (
                  <div>승인 전. 승인하려면 잠정 입력 {plan.provisional_inputs.length}건을 인지했다고 기록해야 한다.</div>
                )}
              </div>
            </div>
          )}
          <p className="muted" style={{ fontSize: 11, margin: "10px 0 0" }}>
            {plan ? `${plan.definitions.total_cost} · ${plan.definitions.saving} · ${plan.definitions.delivery_day_rule}` : ""}
          </p>
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
