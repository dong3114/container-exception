import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type AgentRun, type AgentRunListItem, cancelAgentRun, createAgentRun, getAgentRun, listAgentRuns, resumeAgentRun, startAgentRun } from "@/api/agentRuns";
import { type Draft, type InboundItem, listDrafts, listInbound, listRuns } from "@/api/drafts";
import { ApiError } from "@/api/errors";
import { getRuntimeStatus } from "@/api/demo";
import { getHealth } from "@/api/health";
import { type ExceptionList, listExceptions } from "@/api/exceptions";
import { type SystemStatus as SystemStatusData, getSystemStatus } from "@/api/systemStatus";
import { describeApiError } from "@/api/errors";
import { type FollowUpList, type Readiness, createLiveRun, getReadiness } from "@/api/ops";
import { type PlanSummary, listPlans } from "@/api/plans";
import { type FactCoordinate, listFacts } from "@/api/truth";
import { useMe } from "@/app/MeContext";
import { isActive } from "@/components/agent/agentLabels";
import { FactsPanel } from "@/components/facts/FactsPanel";
import { PlanPanel } from "@/components/plan/PlanPanel";
import { ActionRequired } from "@/components/ops/ActionRequired";
import { AgentStatus } from "@/components/ops/AgentStatus";
import { CommsList, type FollowUpTag } from "@/components/ops/CommsList";
import { ContactResolver } from "@/components/ops/ContactResolver";
import { ErrorNotice } from "@/components/ops/ErrorNotice";
import { ExceptionBoard } from "@/components/ops/ExceptionBoard";
import { SystemHealth } from "@/components/ops/SystemHealth";
import { OVERALL_CLASS, OVERALL_LABEL } from "@/components/ops/systemStatusText";
import { FollowUpsPanel } from "@/components/ops/FollowUpsPanel";
import { GapTable } from "@/components/ops/GapTable";
import { OperationalInput } from "@/components/ops/OperationalInput";
import { PlanCompare } from "@/components/ops/PlanCompare";
import { ReadinessPanel } from "@/components/ops/ReadinessPanel";
import { RunList } from "@/components/ops/RunList";
import { Timeline } from "@/components/ops/Timeline";
import { HUMAN_REASON, can, shortId } from "@/components/ops/opsLabels";
import { type ActionItem, type OpsTab, type RunRow, buildTimeline, createPoller, deriveActions, draftRunId, gapRows, latestAgentByRun, ownerFromInquiries, runGroup } from "@/components/ops/opsModel";
import { toApiError, useAsyncAction } from "@/state/async";

const POLL_MS = 5_000;
const PLAN_ROWS = 15; // 계획 판 요약을 읽는 최근 실행 수(실행마다 한 번 묻는다)

const TABS: { tab: OpsTab; label: string }[] = [
  { tab: "overview", label: "개요" },
  { tab: "agent", label: "Agent" },
  { tab: "facts", label: "정보 · 사실" },
  { tab: "comms", label: "연락" },
  { tab: "plan", label: "복구 계획" },
  { tab: "changes", label: "변경 · 후속" },
  { tab: "timeline", label: "기록" },
  { tab: "inputs", label: "운영 입력" },
];

interface Board {
  rows: RunRow[];
  drafts: Draft[];
  inbound: InboundItem[];
  health: { db?: string; queue?: string } | null;
  /** T-132 운영 예외(목록 + 요약) — 탐지가 없거나 실패하면 null */
  exceptions: ExceptionList | null;
  /** T-133 시스템 상태 — `system.monitor` 권한이 있을 때만 읽는다 */
  system: SystemStatusData | null;
  systemError: string | null;
  error: ApiError | null;
  at: string;
}
interface Detail {
  runId: string;
  agent: AgentRun | null;
  plans: PlanSummary[];
  currentPlanId: string | null;
  facts: FactCoordinate[];
  readiness: Readiness | null;
}

/** 화면이 보이는 동안만 주기적으로 다시 읽는다(`createPoller`). deps 가 바뀌면 다시 시작한다 */
function usePoll(fn: (signal: AbortSignal) => Promise<void>, deps: unknown[]) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(
    () => createPoller((signal) => ref.current(signal), POLL_MS, () => document.visibilityState !== "hidden"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );
}

/**
 * 운영 콘솔(T-120) — Backend 가 이미 하는 업무를 사람이 이해하고 필요한 순간에 승인 · 선택 · 검토 · 입력하게 한다.
 * 첫 화면 = 지금 해야 할 일. 숫자 · 상태는 모두 Backend 기록이고, 화면은 모으고 쉬운 말로 바꿀 뿐이다(Mock 데이터 없음 — 시연은 /demo).
 */
export function OpsConsole() {
  const me = useMe();
  const [board, setBoard] = useState<Board>({ rows: [], drafts: [], inbound: [], health: null, exceptions: null, system: null, systemError: null, error: null, at: "" });
  const monitor = can(me, "system.monitor");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(window.location.search).get("run"));
  const [tab, setTab] = useState<OpsTab>("overview");
  const [openMessage, setOpenMessage] = useState<string | null>(null);
  const [followUpsOf, setFollowUpsOf] = useState<{ runId: string; list: FollowUpList } | null>(null);
  const followUps = followUpsOf && followUpsOf.runId === selected ? followUpsOf.list : null;
  const [nonce, setNonce] = useState(0);
  const bump = useCallback(() => setNonce((n) => n + 1), []);

  usePoll(
    async (signal) => {
      try {
        const [runs, agents, drafts, inbound, health, exceptions, system] = await Promise.all([
          listRuns(signal),
          listAgentRuns(signal),
          listDrafts(signal),
          listInbound("NORMAL", signal),
          getHealth(signal).catch(() => null),
          listExceptions(signal).catch(() => null),
          monitor ? getSystemStatus(signal).then((r) => ({ data: r.data, error: null }), (e) => ({ data: null, error: describeApiError(toApiError(e)) })) : Promise.resolve({ data: null, error: null }),
        ]);
        const byRun = latestAgentByRun(agents.data.runs as AgentRunListItem[]);
        const recent = runs.data.runs.slice(0, PLAN_ROWS);
        const plans = await Promise.all(recent.map((r) => listPlans(r.run_id, signal).then((p) => p.data.plans.find((x) => x.plan_id === p.data.current_plan_id) ?? p.data.plans[0] ?? null, () => null)));
        const rows: RunRow[] = runs.data.runs.map((run, i) => ({ run, agent: byRun.get(run.run_id) ?? null, plan: i < PLAN_ROWS ? (plans[i] ?? null) : null }));
        setBoard({ rows, drafts: drafts.data.drafts, inbound: inbound.data.items, health: health ? { db: health.data.db, queue: (health.data as { queue?: string }).queue } : null, exceptions: exceptions?.data ?? null, system: system.data, systemError: system.error, error: null, at: new Date().toISOString() });
      } catch (e) {
        const err = toApiError(e);
        if (err.kind !== "ABORTED") setBoard((b) => ({ ...b, error: err }));
      }
    },
    [nonce, monitor],
  );

  const row = board.rows.find((r) => r.run.run_id === selected) ?? null;
  const agentId = row?.agent?.agent_run_id ?? null;
  usePoll(
    async (signal) => {
      if (!selected) return setDetail(null);
      const [agent, plans, facts, readiness] = await Promise.all([
        agentId ? getAgentRun(agentId, signal).then((r) => r.data, () => null) : Promise.resolve(null),
        listPlans(selected, signal).then((r) => r.data, () => ({ plans: [] as PlanSummary[], current_plan_id: null })),
        listFacts(selected, signal).then((r) => r.data.facts, () => [] as FactCoordinate[]),
        getReadiness(selected, signal).then((r) => r.data, () => null),
      ]);
      setDetail({ runId: selected, agent, plans: plans.plans, currentPlanId: plans.current_plan_id ?? null, facts, readiness });
    },
    [selected, agentId, nonce],
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("run", selected);
    else url.searchParams.delete("run");
    window.history.replaceState(null, "", url);
  }, [selected]);

  const runDrafts = useMemo(() => board.drafts.filter((d) => draftRunId(d) === selected), [board.drafts, selected]);
  const approvedPlan = detail?.plans.filter((p) => p.plan_status === "APPROVED").sort((a, b) => b.version - a.version)[0] ?? null;
  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of detail?.facts ?? []) if (f.entity_name) m.set(f.entity_id, f.entity_name);
    for (const d of board.drafts) if (d.question?.target_entity_id && d.question.target_name) m.set(d.question.target_entity_id, d.question.target_name);
    return m;
  }, [detail?.facts, board.drafts]);
  const actions = useMemo(
    () => deriveActions({ rows: board.rows, drafts: board.drafts, inbound: board.inbound, followUps: followUps && approvedPlan && selected ? { planId: followUps.plan_id, runId: selected, actions: followUps.actions } : null, names }),
    [board, followUps, approvedPlan, selected, names],
  );
  const tags = useMemo(() => {
    const m = new Map<string, FollowUpTag>();
    for (const f of followUps?.actions ?? []) if (f.message_id) m.set(f.message_id, { kind: f.follow_up_kind, delta: f.delta, previous_quantity: f.previous_quantity, quantity: f.quantity });
    return m;
  }, [followUps]);
  const runLabel = useCallback((runId: string | null) => {
    if (!runId) return "실행 미상";
    const r = board.rows.find((x) => x.run.run_id === runId);
    return `실행 #${shortId(runId)}${r ? ` (${r.run.trigger_ref})` : ""}`;
  }, [board.rows]);

  const openRun = (runId: string) => {
    setSelected(runId);
    setTab("overview");
    setOpenMessage(null);
    document.querySelector('[data-testid="run-detail"]')?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  const runSource = (runId: string) => board.rows.find((r) => r.run.run_id === runId)?.run.source ?? null;

  const open = (a: ActionItem) => {
    if (a.runId) setSelected(a.runId);
    setTab(a.tab);
    if (a.ref?.type === "COMM_MESSAGE") setOpenMessage(a.ref.id);
    if (a.ref?.type === "INBOUND") {
      const d = board.drafts.find((x) => x.replies.some((r) => r.message_id === a.ref!.id));
      if (d) setOpenMessage(d.message.message_id);
    }
  };

  const agent = detail?.runId === selected ? detail.agent : null;
  const contactWait = agent && agent.status === "WAITING_HUMAN" && (agent.waiting_reason === "CONTACT_REGISTRATION_REQUIRED" || agent.waiting_reason === "CONTACT_SELECTION_REQUIRED") && agent.pending_ref ? agent : null;
  const isLive = row ? !row.run.contains_simulated : false;
  const tabs = TABS.filter((t) => t.tab !== "inputs" || isLive);
  const badge = (t: OpsTab) => actions.filter((a) => a.runId === selected && a.tab === t).length;

  return (
    <main className="ops-shell" data-testid="ops-console">
      <header className="ops-top">
        <h1>CERA 운영 콘솔</h1>
        <SystemStatus board={board} monitor={monitor} />
        <span style={{ flex: 1 }} />
        <NewLiveRun onCreated={(id) => { setSelected(id); setTab("inputs"); bump(); }} />
        <a className="act-btn" href="/demo">시연 콘솔(별도) →</a>
      </header>
      <ErrorNotice error={board.error} />
      <OpsCounters board={board} actions={actions} />

      <ActionRequired actions={actions} runLabel={runLabel} onOpen={open} />
      <ExceptionBoard exceptions={board.exceptions?.exceptions ?? null} runSource={runSource} onOpenRun={openRun} />

      <div className="ops-main">
        <RunList rows={board.rows} actions={actions} selectedId={selected} onSelect={openRun} />
        <section className="card" data-testid="run-detail" aria-label="선택한 실행">
          {!row && <div className="card-body muted">왼쪽에서 복구 실행을 고르세요.</div>}
          {row && (
            <>
              <div className="card-head">
                <span className="card-title">
                  실행 #{shortId(row.run.run_id)} · {row.run.trigger_ref}
                </span>
                <span className={`badge ${row.run.contains_simulated ? "b-sim" : "b-blue"}`}>{row.run.contains_simulated ? "시뮬레이션 실행(합성 데이터)" : "실제 실행"}</span>
                <span className="card-meta mono">{row.run.run_id}</span>
              </div>
              <div className="ops-tabs" role="tablist">
                {tabs.map((t) => (
                  <button key={t.tab} type="button" role="tab" className="ops-tab" aria-selected={tab === t.tab} onClick={() => setTab(t.tab)} data-testid={`tab-${t.tab}`}>
                    {t.label}
                    {badge(t.tab) > 0 && <span className="badge b-amber">{badge(t.tab)}</span>}
                  </button>
                ))}
              </div>
              <div className="card-body" style={{ display: "grid", gap: 12 }}>
                {tab === "overview" && (
                  <>
                    {agent ? <AgentStatus run={agent} /> : <div className="muted">이 실행에는 아직 Agent 가 없습니다 — Agent 탭에서 시작할 수 있습니다.</div>}
                    {contactWait && <ContactResolver key={`${contactWait.agent_run_id}:${contactWait.waiting_reason}`} problem={{ scope: "AGENT", agentRunId: contactWait.agent_run_id, reason: contactWait.waiting_reason as "CONTACT_SELECTION_REQUIRED", subject: contactWait.pending_ref! }} simulated={row.run.contains_simulated} ownerHint={ownerFromInquiries(board.drafts, contactWait.pending_ref!.id)} onResolved={bump} />}
                    {detail?.readiness && <ReadinessPanel readiness={detail.readiness} />}
                    <GapTable rows={gapRows(detail?.facts ?? [], runDrafts)} />
                  </>
                )}
                {tab === "agent" && <AgentTab row={row} agent={agent} contactWait={contactWait} ownerHint={contactWait ? ownerFromInquiries(board.drafts, contactWait.pending_ref!.id) : null} onChanged={bump} />}
                {tab === "facts" && (
                  <>
                    <GapTable rows={gapRows(detail?.facts ?? [], runDrafts)} />
                    <FactsPanel recoveryRunId={row.run.run_id} actorId={can(me, "truth.manual_entry") || can(me, "truth.review") ? (me?.actor_id ?? null) : null} refreshKey={`${nonce}:${agent?.updated_at ?? ""}`} isSimulated={row.run.contains_simulated} scenarioId={row.run.scenario_id ?? null} />
                  </>
                )}
                {tab === "comms" && <CommsList drafts={runDrafts} tags={tags} openId={openMessage} onOpen={setOpenMessage} onChanged={bump} facts={detail?.facts ?? []} />}
                {tab === "plan" && (
                  <>
                    {detail?.readiness && <ReadinessPanel readiness={detail.readiness} />}
                    <PlanPanel recoveryRunId={row.run.run_id} actorId={can(me, "plan.approve") || can(me, "plan.recalculate") ? (me?.actor_id ?? null) : null} refreshKey={`${nonce}:${detail?.currentPlanId ?? ""}:${detail?.plans.map((p) => p.plan_status).join(",") ?? ""}`} />
                  </>
                )}
                {tab === "changes" && (
                  <>
                    <PlanCompare plans={detail?.plans ?? []} names={names} />
                    {approvedPlan ? (
                      <FollowUpsPanel key={approvedPlan.plan_id} planId={approvedPlan.plan_id} runId={row.run.run_id} simulated={row.run.contains_simulated} drafts={board.drafts} onChanged={bump} onLoaded={(list) => setFollowUpsOf({ runId: row.run.run_id, list })} />
                    ) : (
                      <div className="muted">승인된 계획이 아직 없습니다 — 계획을 승인하면 필요한 후속 요청이 여기에 나옵니다.</div>
                    )}
                  </>
                )}
                {tab === "timeline" && <Timeline entries={buildTimeline({ agent, drafts: runDrafts, plans: detail?.plans ?? [] })} />}
                {tab === "inputs" && isLive && (
                  <>
                    {detail?.readiness && <ReadinessPanel readiness={detail.readiness} />}
                    <OperationalInput runId={row.run.run_id} />
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>
      {can(me, "planning.input") && !me?.portfolio_demo && (
        <details className="card" data-testid="baseline-input">
          <summary className="card-head" style={{ cursor: "pointer" }}>
            <span className="card-title">운영 기준 계획 입력</span>
            <span className="card-meta">실제 화물 CSV · 검증 → 저장 → CERA 가 예외를 찾습니다</span>
          </summary>
          <div className="card-body">
            <OperationalInput runId={null} />
          </div>
        </details>
      )}
      {monitor && <SystemHealth status={board.system} error={board.systemError} />}
      <footer className="muted" style={{ fontSize: 11 }}>
        상태는 {POLL_MS / 1000}초마다 다시 읽습니다. 버튼을 숨기거나 끄는 것은 편의일 뿐이고, 권한은 Backend 가 판정합니다. 계획 승인은 배차 · 발송 지시가 아닙니다.
      </footer>
    </main>
  );
}

/** 업무 숫자(T-132 · T-133) — 진행 중 예외 · 오늘 자동 탐지 · 사람 조치 대기 · 진행 중 복구 실행 · 승인 대기 계획 · 검토 필요 회신. 분석 대시보드가 아니라 지금 상태 한 줄 */
function OpsCounters({ board, actions }: { board: Board; actions: ActionItem[] }) {
  const activeRuns = board.rows.filter((r) => ["ACTION", "ACTIVE"].includes(runGroup(r, actions))).length;
  const plansWaiting = board.rows.filter((r) => r.plan?.plan_status === "PROPOSED").length;
  const repliesToReview = actions.filter((a) => a.title === HUMAN_REASON.REPLY_REVIEW_REQUIRED!.title).length;
  const items: [string, string, number | string][] = [
    ["kpi-active-exceptions", "진행 중 예외", board.exceptions?.summary.active ?? "—"],
    ["kpi-detected-today", "오늘 자동 탐지", board.exceptions?.summary.detected_today ?? "—"],
    ["kpi-waiting-human", "사람 조치 대기", actions.length],
    ["kpi-active-runs", "진행 중 복구 실행", activeRuns],
    ["kpi-plans-waiting", "승인 대기 계획", plansWaiting],
    ["kpi-replies-review", "검토 필요 회신", repliesToReview],
  ];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "0 0 8px" }} data-testid="ops-kpis">
      {items.map(([id, label, value]) => (
        <span key={id} className="badge b-outline" data-testid={id}>
          {label} <b>{value}</b>
        </span>
      ))}
    </div>
  );
}

function SystemStatus({ board, monitor }: { board: Board; monitor: boolean }) {
  const runtime = useAsyncAction((signal) => getRuntimeStatus(signal));
  const { run } = runtime;
  useEffect(() => {
    run();
  }, [run, board.at]);
  const rt = runtime.state.status === "SUCCESS" ? runtime.state.data : null;
  const down = board.error?.kind === "NETWORK" || board.error?.kind === "TIMEOUT";
  // T-133: 운영 권한이 있으면 전체 상태 하나(자세한 것은 아래 시스템 상태). 없으면(데모 방문자 · 현장 담당자) 내부 구성 요소를 늘어놓지 않는다
  if (monitor && board.system && !down) {
    return (
      <a href="#system-health-title" className={`badge ${OVERALL_CLASS[board.system.overall.status]}`} data-testid="system-status" data-status={board.system.overall.status}>
        시스템 {OVERALL_LABEL[board.system.overall.status]}
      </a>
    );
  }
  if (!monitor) {
    return (
      <span className={`badge ${down ? "b-red" : "b-green"}`} data-testid="system-status">
        {down ? "✕ 서버 연결 안 됨" : "✓ 서비스 연결됨"}
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }} data-testid="system-status">
      <span className={`badge ${down ? "b-red" : board.health?.db === "up" ? "b-green" : "b-amber"}`}>{down ? "✕ Backend 연결 안 됨" : board.health?.db === "up" ? "✓ Backend · DB 정상" : "? Backend 확인 중"}</span>
      {board.health?.queue && <span className={`badge ${board.health.queue === "up" ? "b-green" : "b-amber"}`}>{board.health.queue === "up" ? "✓ 실행 큐" : "! 실행 큐 없음(폴링으로 동작)"}</span>}
      {rt && <span className={`badge ${(rt as { reachable?: boolean }).reachable ? "b-green" : "b-amber"}`}>{(rt as { reachable?: boolean }).reachable ? "✓ Agent Runtime" : "! Agent Runtime 응답 없음"}</span>}
    </span>
  );
}

function NewLiveRun({ onCreated }: { onCreated: (runId: string) => void }) {
  const me = useMe();
  const create = useAsyncAction(async (signal) => {
    const res = await createLiveRun("운영 콘솔에서 연 실제 실행", me!.actor_id, signal);
    onCreated(res.data.recovery_run_id);
    return res;
  });
  if (!can(me, "planning.input")) return null;
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <button type="button" className="act-btn" onClick={() => create.run()} disabled={create.state.status === "LOADING"} data-testid="new-live-run">
        + 새 실제 실행
      </button>
      <ErrorNotice error={create.state.status === "FAILED" ? create.state.error : null} />
    </span>
  );
}

function AgentTab({ row, agent, contactWait, ownerHint, onChanged }: { row: RunRow; agent: AgentRun | null; contactWait: AgentRun | null; ownerHint: string | null; onChanged: () => void }) {
  const me = useMe();
  const [qty, setQty] = useState("2");
  const [plan, setPlan] = useState(true);
  const manage = can(me, "agent_run.manage");
  const start = useAsyncAction(async (signal) => {
    const created = await createAgentRun({ recovery_run_id: row.run.run_id, goal: "정보 공백을 메우고 최저 손실 복구 계획을 제안한다", parameters: { inquiry: { quantity: Number(qty) }, plan_recovery: plan } }, me!.actor_id, signal);
    const res = await startAgentRun(created.data.agent_run_id, me!.actor_id, signal);
    onChanged();
    return res;
  });
  const wake = useAsyncAction(async (signal, id: string) => {
    const res = await resumeAgentRun(id, me!.actor_id, signal);
    onChanged();
    return res;
  });
  const cancel = useAsyncAction(async (signal, id: string) => {
    const res = await cancelAgentRun(id, me!.actor_id, signal);
    onChanged();
    return res;
  });
  const err = [start, wake, cancel].map((x) => x.state).find((s) => s.status === "FAILED");
  return (
    <div style={{ display: "grid", gap: 10 }} data-testid="agent-tab">
      {agent && <AgentStatus run={agent} />}
      {contactWait && <ContactResolver key={`${contactWait.agent_run_id}:${contactWait.waiting_reason}`} problem={{ scope: "AGENT", agentRunId: contactWait.agent_run_id, reason: contactWait.waiting_reason as "CONTACT_SELECTION_REQUIRED", subject: contactWait.pending_ref! }} simulated={row.run.contains_simulated} ownerHint={ownerHint} onResolved={onChanged} />}
      {agent && manage && isActive(agent.status) && agent.status !== "RUNNING" && (
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" className="act-btn" onClick={() => wake.run(agent.agent_run_id)} disabled={wake.state.status === "LOADING"} data-testid="agent-wake">
            지금 다시 확인
          </button>
          <button type="button" className="act-btn" onClick={() => cancel.run(agent.agent_run_id)} disabled={cancel.state.status === "LOADING"}>
            Agent 취소
          </button>
        </div>
      )}
      {(!agent || !isActive(agent.status)) && manage && (
        <form
          className="ops-subcard"
          onSubmit={(e) => {
            e.preventDefault();
            start.run();
          }}
          data-testid="agent-start-form"
        >
          <b>{agent ? "Agent 다시 시작" : "Agent 시작"}</b>
          <label>
            문의할 수량(사람이 정함 — Agent 는 숫자를 지어내지 않습니다){" "}
            <input type="number" min={1} max={99} value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 64 }} />
          </label>
          <label>
            <input type="checkbox" checked={plan} onChange={(e) => setPlan(e.target.checked)} /> 정보가 모이면 복구 계획까지 계산(승인은 사람)
          </label>
          <button type="submit" className="act-btn primary" disabled={start.state.status === "LOADING" || !(Number(qty) >= 1)} style={{ justifySelf: "start" }} data-testid="agent-start">
            {start.state.status === "LOADING" ? "진행 중…" : "Agent 시작"}
          </button>
        </form>
      )}
      {!manage && <span className="muted">Agent 시작 · 취소는 운영자 · 관리자만 할 수 있습니다.</span>}
      <ErrorNotice error={err?.status === "FAILED" ? err.error : null} />
      {agent && (
        <details>
          <summary>단계 기록({agent.steps.length}) · Tool 호출({agent.tool_calls.length})</summary>
          <ol style={{ fontSize: 12, margin: 0, paddingLeft: 18 }}>
            {agent.steps.map((s) => (
              <li key={s.seq}>
                <span className="mono muted">{s.started_at.slice(11, 19)}</span> {s.kind} {s.node ?? ""} {s.detail_code ?? ""} — {s.outcome}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
