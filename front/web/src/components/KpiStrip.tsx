import type { OperationsSummary } from "@/contracts/cera";
import { krw } from "./format";

interface Props {
  summary: OperationsSummary;
  previous: OperationsSummary | null;
  stepId: string;
}

export function KpiStrip({ summary, previous, stepId }: Props) {
  const changed = (a: unknown, b: unknown) => (previous ? a !== b : false);
  const wh = summary.warehouse;
  const cut = wh.capacity_today < wh.normal_capacity;
  return (
    <section className="kpis" data-testid="kpis" key={stepId}>
      <Kpi label="Active Containers" value={String(summary.active_containers)} hint="활성 컨테이너 (시나리오)" stepId={stepId} changed={false} testId="kpi-active" />
      <Kpi
        label="Critical"
        value={String(summary.critical_count)}
        hint="현재 계획대로면 LFD 경과"
        tone={summary.critical_count > 0 ? "red" : undefined}
        stepId={stepId}
        changed={changed(summary.critical_count, previous?.critical_count)}
        testId="kpi-critical"
      />
      <Kpi
        label="High Risk"
        value={String(summary.high_count)}
        hint="수용 부족 대상 · 통관 대기"
        tone={summary.high_count > 0 ? "orange" : undefined}
        stepId={stepId}
        changed={changed(summary.high_count, previous?.high_count)}
        testId="kpi-high"
      />
      <Kpi
        label="Current Exposure"
        value={krw(summary.current_exposure_krw)}
        hint="조치하지 않을 때 추가비용 · 시뮬레이션"
        small
        tone={summary.current_exposure_krw > 0 ? "red" : undefined}
        stepId={stepId}
        changed={changed(summary.current_exposure_krw, previous?.current_exposure_krw)}
        testId="kpi-exposure"
      />
      <Kpi
        label="Recoverable Exposure"
        value={summary.recoverable_exposure_krw == null ? "—" : krw(summary.recoverable_exposure_krw)}
        hint={summary.recoverable_plan_id ? `Simulated Plan 절감 가능액 (${summary.recoverable_plan_id})` : "복구 계획 없음"}
        small
        tone={summary.recoverable_exposure_krw ? "teal" : undefined}
        stepId={stepId}
        changed={changed(summary.recoverable_exposure_krw, previous?.recoverable_exposure_krw)}
        testId="kpi-recoverable"
      />
      <div className={`kpi ${changed(wh.capacity_today, previous?.warehouse.capacity_today) ? "changed" : ""} ${cut ? "tone-red" : ""}`} data-testid="kpi-warehouse">
        <div className="kpi-label">
          <span>{wh.name} Capacity (오늘)</span>
          {cut && <span className="badge b-red">설비 장애</span>}
        </div>
        <div className="kpi-value num">
          {wh.capacity_today}
          <span style={{ fontSize: 14, color: "var(--text-3)", fontWeight: 600 }}> / 정상 {wh.normal_capacity}</span>
        </div>
        <div className="kpi-bar" aria-hidden>
          {Array.from({ length: wh.planned_today }, (_, i) => (
            <span key={i} style={{ flex: 1, marginRight: 1, background: i < wh.capacity_today ? "#2463eb" : "#f09a9a" }} />
          ))}
        </div>
        <div className="kpi-hint">입고 예정 {wh.planned_today}대 · {cut ? `${summary.affected_count}대 수용 불가` : "정상"}</div>
      </div>
    </section>
  );
}

function Kpi(props: { label: string; value: string; hint: string; tone?: "red" | "orange" | "teal"; small?: boolean; changed: boolean; stepId: string; testId: string }) {
  return (
    <div className={`kpi ${props.tone ? `tone-${props.tone}` : ""} ${props.changed ? "changed" : ""}`} data-testid={props.testId}>
      <div className="kpi-label">{props.label}</div>
      <div className={`kpi-value num ${props.small ? "small" : ""}`}>{props.value}</div>
      <div className="kpi-hint">{props.hint}</div>
    </div>
  );
}
