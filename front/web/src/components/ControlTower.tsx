import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ActivityItem,
  CommunicationThread,
  ContainerView,
  DataTrustSummary,
  OperationsToday,
  RecoveryPlanCurrent,
  ResourceStatus,
  ScenarioInfo,
} from "@/contracts/cera";
import { createProvider } from "@/data";
import { ActivityTimeline } from "./ActivityTimeline";
import { Communications } from "./Communications";
import { ContainerDrawer } from "./ContainerDrawer";
import { ContainerTable } from "./ContainerTable";
import { DataTrustPanel } from "./DataTrustPanel";
import { ExceptionPanel } from "./ExceptionPanel";
import { KpiStrip } from "./KpiStrip";
import { OperationsMap } from "./OperationsMap";
import { PlaybackBar } from "./PlaybackBar";
import { RecoveryConsole } from "./RecoveryConsole";

interface ViewData {
  stepId: string;
  ops: OperationsToday;
  containers: ContainerView[];
  resources: ResourceStatus;
  plan: RecoveryPlanCurrent;
  comms: CommunicationThread[];
  activity: ActivityItem[];
  trust: DataTrustSummary;
}

const PLAY_INTERVAL_MS = 3600;

export function ControlTower() {
  const provider = useMemo(() => createProvider(), []);
  const [scenario, setScenario] = useState<ScenarioInfo | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<ViewData | null>(null);
  const [previous, setPrevious] = useState<ViewData | null>(null);
  const viewRef = useRef<ViewData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    provider.getScenario().then(setScenario);
  }, [provider]);

  const step = scenario?.steps[stepIndex];

  useEffect(() => {
    if (!step) return;
    let cancelled = false;
    const asOf = step.as_of;
    Promise.all([
      provider.getOperationsToday(asOf),
      provider.getContainers(asOf),
      provider.getResources(asOf),
      provider.getCurrentRecoveryPlan(asOf),
      provider.getCommunications(asOf),
      provider.getActivity(asOf),
      provider.getDataTrust(asOf),
    ]).then(([ops, containers, resources, plan, comms, activity, trust]) => {
      if (cancelled) return;
      const next: ViewData = {
        stepId: ops.meta.step_id,
        ops: ops.data,
        containers: containers.data,
        resources: resources.data,
        plan: plan.data,
        comms: comms.data,
        activity: activity.data,
        trust: trust.data,
      };
      setPrevious(viewRef.current);
      viewRef.current = next;
      setView(next);
    });
    return () => {
      cancelled = true;
    };
  }, [provider, step]);

  const last = (scenario?.steps.length ?? 1) - 1;
  const go = useCallback((i: number) => setStepIndex(Math.max(0, Math.min(last, i))), [last]);
  const reset = useCallback(() => {
    setPlaying(false);
    setStepIndex(0);
  }, []);

  const isPlaying = playing && stepIndex < last;
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setTimeout(() => setStepIndex((i) => Math.min(last, i + 1)), PLAY_INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [isPlaying, stepIndex, last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight") go(stepIndex + 1);
      else if (e.key === "ArrowLeft") go(stepIndex - 1);
      else if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, stepIndex]);

  if (!scenario || !step || !view) {
    return <div className="empty">시나리오를 불러오는 중…</div>;
  }

  const selected = selectedId ? view.containers.find((c) => c.id === selectedId) ?? null : null;
  const selectedAction = selected ? view.plan.plan?.actions.find((a) => a.container_id === selected.id) ?? null : null;
  const selectedBaseline = selected ? view.plan.baseline?.actions.find((a) => a.container_id === selected.id) ?? null : null;
  const tone = narrativeTone(step.step_id, view);

  return (
    <>
      <PlaybackBar
        scenario={scenario}
        stepIndex={stepIndex}
        asOf={step.as_of}
        playing={isPlaying}
        onGo={(i) => {
          setPlaying(false);
          go(i);
        }}
        onReset={reset}
        onTogglePlay={() => {
          if (isPlaying) {
            setPlaying(false);
            return;
          }
          if (stepIndex >= last) setStepIndex(0);
          setPlaying(true);
        }}
      />
      <main className="shell">
        <section className={`narrative ${tone}`} aria-live="polite" data-testid="narrative">
          <div className="narrative-step">
            STEP {step.index + 1}/{scenario.steps.length}
          </div>
          <div>
            <div className="narrative-title">{view.ops.narrative.title}</div>
            <div className="narrative-caption">{view.ops.narrative.caption}</div>
          </div>
        </section>

        <KpiStrip summary={view.ops.summary} previous={previous?.ops.summary ?? null} stepId={view.stepId} />

        <div className="quick-nav" role="navigation" aria-label="섹션 바로가기">
          <a href="#sec-map" className="quick-nav-link">
            <span>🗺️</span> 관제 지도 및 예외
          </a>
          <a href="#sec-console" className="quick-nav-link">
            <span>⚡</span> 복구 계획 콘솔
          </a>
          <a href="#sec-comms" className="quick-nav-link">
            <span>✉️</span> 외부 채널 소통
          </a>
          <a href="#sec-containers" className="quick-nav-link">
            <span>📦</span> 컨테이너 상세 현황 ({view.containers.length}대)
          </a>
          <a href="#sec-trust" className="quick-nav-link">
            <span>🛡️</span> 데이터 신뢰도
          </a>
        </div>

        <div className="grid-main" id="sec-map">
          <OperationsMap
            containers={view.containers}
            resources={view.resources}
            plan={view.plan.plan}
            exception={view.ops.exceptions[0] ?? null}
            onSelect={setSelectedId}
            hoveredId={hoveredId}
            onHover={setHoveredId}
          />
          <div className="stack">
            <ExceptionPanel exceptions={view.ops.exceptions} onSelect={setSelectedId} />
            <ActivityTimeline items={view.activity} />
          </div>
        </div>

        <div className="block" id="sec-console">
          <RecoveryConsole
            current={view.plan}
            containers={view.containers}
            plannedToday={view.ops.summary.warehouse.planned_today}
            affectedCount={view.ops.summary.affected_count}
            onSelect={setSelectedId}
            hoveredId={hoveredId}
            onHover={setHoveredId}
          />
        </div>

        <div className="grid-two">
          <div id="sec-comms">
            <Communications threads={view.comms} />
          </div>
          <div id="sec-trust">
            <DataTrustPanel trust={view.trust} />
          </div>
        </div>

        <div id="sec-containers">
          <ContainerTable
            containers={view.containers}
            onSelect={setSelectedId}
            hoveredId={hoveredId}
            onHover={setHoveredId}
          />
        </div>

        <footer className="footer">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="badge b-sim">시뮬레이션 모드</span>
              <span className="muted" style={{ fontSize: 11.5 }}>실제 항만 및 외부 통신 연동 전 프로토타입 화면입니다.</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11.5, color: "var(--text-3)" }}>
              <span>단축키:</span>
              <kbd style={{ padding: "2px 6px", background: "var(--slate-soft)", border: "1px solid var(--line)", borderRadius: 4, fontFamily: "var(--mono)", fontSize: 11 }}>← 이전</kbd>
              <kbd style={{ padding: "2px 6px", background: "var(--slate-soft)", border: "1px solid var(--line)", borderRadius: 4, fontFamily: "var(--mono)", fontSize: 11 }}>→ 다음</kbd>
              <kbd style={{ padding: "2px 6px", background: "var(--slate-soft)", border: "1px solid var(--line)", borderRadius: 4, fontFamily: "var(--mono)", fontSize: 11 }}>Esc 닫기</kbd>
            </div>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-3)", fontSize: 11 }}>
            {view.ops.disclaimers.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </footer>
      </main>
      {selected && (
        <ContainerDrawer container={selected} action={selectedAction} baseline={selectedBaseline} planLabel={view.plan.plan?.label ?? null} onClose={() => setSelectedId(null)} />
      )}
    </>
  );
}

function narrativeTone(stepId: string, view: ViewData): string {
  const status = view.ops.exceptions[0]?.status;
  if (view.activity.some((a) => a.is_new_in_step && a.kind === "HUMAN")) return "human";
  if (status === "OPEN" || status === "REPLAN_NEEDED") return "alert";
  if (view.activity.some((a) => a.is_new_in_step && a.kind === "RESULT") && stepId !== "S1") return "plan";
  return "";
}
