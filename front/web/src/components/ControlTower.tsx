"use client";

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

        <div className="grid-main">
          <OperationsMap containers={view.containers} resources={view.resources} plan={view.plan.plan} exception={view.ops.exceptions[0] ?? null} onSelect={setSelectedId} />
          <div className="stack">
            <ExceptionPanel exceptions={view.ops.exceptions} onSelect={setSelectedId} />
            <ActivityTimeline items={view.activity} />
          </div>
        </div>

        <div className="block">
          <RecoveryConsole
            current={view.plan}
            containers={view.containers}
            plannedToday={view.ops.summary.warehouse.planned_today}
            affectedCount={view.ops.summary.affected_count}
            onSelect={setSelectedId}
          />
        </div>

        <div className="grid-two">
          <Communications threads={view.comms} />
          <DataTrustPanel trust={view.trust} />
        </div>

        <ContainerTable containers={view.containers} onSelect={setSelectedId} />

        <footer className="footer">
          <ul>
            {view.ops.disclaimers.map((d) => (
              <li key={d}>{d}</li>
            ))}
            <li>시뮬레이션 화면 — 실제 항만 배치가 아니다. 키보드: ← 이전 · → 다음 · Esc 닫기.</li>
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
