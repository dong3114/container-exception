import type { BaselineView, ContainerView, CostLine, RecoveryAction } from "@/contracts/cera";
import { FreshnessBadge, RiskBadge, RouteBadge, SimTag, TrustBadge, UsabilityBadge, ValueStatusBadge } from "./badges";
import { PHASE_LABEL, PRIORITY_LABEL, carrierShort, hm, krw, md } from "./format";

interface Props {
  container: ContainerView;
  action: RecoveryAction | null;
  baseline: BaselineView["actions"][number] | null;
  planLabel: string | null;
  onClose: () => void;
}

export function ContainerDrawer({ container: c, action, baseline, planLabel, onClose }: Props) {
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`${c.id} 상세 정보`} data-testid="container-drawer">
        <div className="drawer-head">
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, display: "flex", alignItems: "baseline", gap: 8 }}>
              {c.id} <span className="mono muted" style={{ fontSize: 13 }}>{c.container_no}</span>
            </div>
            <div className="sub" style={{ marginTop: 4, fontSize: 12 }}>
              {c.size_label} · {carrierShort(c.carrier)} · {c.cargo} · 우선순위 {PRIORITY_LABEL[c.business_priority]} · {PHASE_LABEL[c.phase] ?? c.phase}
            </div>
            <div className="chips" style={{ marginTop: 8 }}>
              <RiskBadge grade={c.risk.grade} />
              <RouteBadge route={c.current_route} />
              {c.impact === "AFFECTED" && <span className="badge b-red">창고 A 수용 부족 대상</span>}
              <UsabilityBadge usability={c.worst_usability} />
            </div>
          </div>
          <button className="drawer-close" onClick={onClose} title="닫기 (Esc)">
            ✕ 닫기
          </button>
        </div>
        <div className="drawer-body">
          <div className="section-title" style={{ marginTop: 0 }}>
            위험 등급 진단 근거 <SimTag>시나리오 결과</SimTag>
          </div>
          <div className="fact">
            <div style={{ fontSize: 13, lineHeight: 1.45 }}>{c.risk.explanation}</div>
            <div className="fact-src" style={{ marginTop: 6 }}>
              사유 코드: <b>{c.risk.reasons.join(", ") || "없음"}</b> · 미조치 시 추가비용 <b>{krw(c.risk.exposure_krw)}</b>
              {c.risk.residual_exposure_krw ? ` · 승인 계획 잔여 노출 ${krw(c.risk.residual_exposure_krw)}` : ""}
            </div>
          </div>

          {action && (
            <>
              <div className="section-title">
                {planLabel} 조치 계획 — {action.route_label}
              </div>
              <div className="fact">
                <div style={{ fontSize: 13, lineHeight: 1.45 }}>{action.rationale}</div>
                <div className="fact-src" style={{ marginTop: 6 }}>
                  {action.depart_at ? `출발: ${hm(action.depart_at)} (${action.truck_id})` : "오늘 이동 없음"} · 입고 예정일: {md(action.delivery_day)}
                  {action.change_from_previous ? ` · ${action.change_from_previous.kind === "ROUTE_CHANGED" ? `이전 계획: ${action.change_from_previous.previous_route_label}` : action.change_from_previous.note}` : ""}
                </div>
              </div>
              <CostCompare planLabel={planLabel ?? "Plan"} plan={action.cost_breakdown} planTotal={action.cost_krw} baseline={baseline?.cost_breakdown ?? []} baselineTotal={action.baseline_cost_krw} saving={action.saving_krw} />
            </>
          )}
          {!action && baseline && (
            <>
              <div className="section-title">Baseline (미조치 시 터미널 대기) 비용</div>
              <CostTable lines={baseline.cost_breakdown} total={baseline.cost_krw} />
            </>
          )}

          <div className="section-title">수집 사실 및 출처 근거 (Trust & Freshness)</div>
          {c.facts.map((f) => (
            <div className="fact" key={f.key} data-testid={`fact-${f.key}`}>
              <div className="fact-top">
                <span className="fact-label">{f.label}</span>
                <span className="fact-value">{f.display}</span>
              </div>
              <div className="chips" style={{ marginTop: 5 }}>
                <TrustBadge category={f.trust.category} />
                <ValueStatusBadge status={f.trust.value_status} />
                <FreshnessBadge status={f.trust.freshness_status} />
                {f.trust.decision_usability !== "USABLE" && <UsabilityBadge usability={f.trust.decision_usability} />}
              </div>
              <div className="fact-src">
                {f.trust.source_label} ({f.trust.source_type}/{f.trust.source_role})
                {f.trust.evidence_time ? ` · 근거 시각 ${md(f.trust.evidence_time)} ${hm(f.trust.evidence_time)}` : ""}
                {f.trust.evidence_time_quality ? ` (${f.trust.evidence_time_quality}, 시각 신뢰 ${f.trust.temporal_confidence})` : ""}
                {f.trust.event_id ? ` · ${f.trust.event_id}` : ""}
              </div>
              {f.trust.note && <div className="fact-note">{f.trust.note}</div>}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}

function CostCompare(props: { planLabel: string; plan: CostLine[]; planTotal: number; baseline: CostLine[]; baselineTotal: number; saving: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      <div>
        <div className="muted" style={{ fontSize: 11.5, fontWeight: 650, marginBottom: 4 }}>
          Baseline (터미널 대기)
        </div>
        <CostTable lines={props.baseline} total={props.baselineTotal} />
      </div>
      <div>
        <div className="muted" style={{ fontSize: 11.5, fontWeight: 650, marginBottom: 4 }}>
          {props.planLabel} · 절감(시뮬레이션 기준) <b style={{ color: "var(--teal)" }}>{krw(props.saving)}</b>
        </div>
        <CostTable lines={props.plan} total={props.planTotal} />
      </div>
    </div>
  );
}

function CostTable({ lines, total }: { lines: CostLine[]; total: number }) {
  return (
    <table className="tbl" style={{ border: "1px solid var(--line)", borderRadius: 8 }}>
      <tbody>
        {lines.map((l, i) => (
          <tr key={i} title={l.basis}>
            <td className="wrap">
              {l.label}
              <div className="muted" style={{ fontSize: 10.5 }}>
                {l.qty} × {l.unit_krw.toLocaleString("ko-KR")} · {l.basis}
              </div>
            </td>
            <td className="r num">{krw(l.amount_krw)}</td>
          </tr>
        ))}
        <tr>
          <td>
            <b>합계</b>
          </td>
          <td className="r num">
            <b>{krw(total)}</b>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
