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
import { type FactCoordinate, type OpenConflict, listFacts, listOpenConflicts } from "@/api/truth";
import { useMe } from "@/app/MeContext";
import { isActive } from "@/components/agent/agentLabels";
import { FactsPanel } from "@/components/facts/FactsPanel";
import { HeldMailList } from "@/components/drafts/InboundViews";
import { PlanPanel } from "@/components/plan/PlanPanel";
import { ActionRequired } from "@/components/ops/ActionRequired";
import { AppShell, type NavItem, type OpsView } from "@/components/ops/AppShell";
import { RecoveryHeader } from "@/components/ops/RecoveryHeader";
import { EmptyState, LoadingState, MetricCard, PageHeader, SectionHeader, Updating } from "@/components/ui/primitives";
import { STATUS_LABEL } from "@/components/agent/agentLabels";
import { PLAN_STATUS_LABEL } from "@/components/plan/planLabels";
import { AgentMilestones, AgentStatus, AgentWorkLog } from "@/components/ops/AgentStatus";
import { CommsList, type FollowUpTag } from "@/components/ops/CommsList";
import { ContactResolver } from "@/components/ops/ContactResolver";
import { ErrorNotice } from "@/components/ops/ErrorNotice";
import { ExceptionBoard } from "@/components/ops/ExceptionBoard";
import { SystemHealth } from "@/components/ops/SystemHealth";
import { OVERALL_CLASS, OVERALL_LABEL, REASON_LABEL } from "@/components/ops/systemStatusText";
import { FollowUpsPanel } from "@/components/ops/FollowUpsPanel";
import { GapTable } from "@/components/ops/GapTable";
import { OperationalInput } from "@/components/ops/OperationalInput";
import { PlanCompare } from "@/components/ops/PlanCompare";
import { ReadinessPanel } from "@/components/ops/ReadinessPanel";
import { RunList } from "@/components/ops/RunList";
import { Timeline } from "@/components/ops/Timeline";
import { HUMAN_REASON, RUN_GROUP_BADGE, RUN_GROUP_LABEL, can, shortId } from "@/components/ops/opsLabels";
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
  /** T-137 사람이 아직 판단하지 않은 공공 근거 충돌 — 읽지 못하면 빈 목록(할 일이 사라질 뿐 화면은 그대로) */
  conflicts: OpenConflict[];
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
  const [board, setBoard] = useState<Board>({ rows: [], drafts: [], inbound: [], health: null, exceptions: null, system: null, systemError: null, conflicts: [], error: null, at: "" });
  const monitor = can(me, "system.monitor");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(window.location.search).get("run"));
  const [tab, setTab] = useState<OpsTab>("overview");
  const [view, setView] = useState<OpsView>(() => {
    const q = new URLSearchParams(window.location.search);
    const v = q.get("view") as OpsView | null;
    return v && ["overview", "exceptions", "recovery", "inputs", "system"].includes(v) ? v : q.get("run") ? "recovery" : "overview";
  });
  const [refreshing, setRefreshing] = useState(false);
  const [openMessage, setOpenMessage] = useState<string | null>(null);
  const [followUpsOf, setFollowUpsOf] = useState<{ runId: string; list: FollowUpList } | null>(null);
  const followUps = followUpsOf && followUpsOf.runId === selected ? followUpsOf.list : null;
  const [nonce, setNonce] = useState(0);
  const bump = useCallback(() => setNonce((n) => n + 1), []);

  usePoll(
    async (signal) => {
      setRefreshing(true);
      try {
        const [runs, agents, drafts, inbound, health, exceptions, system, conflicts] = await Promise.all([
          listRuns(signal),
          listAgentRuns(signal),
          listDrafts(signal),
          listInbound(undefined, signal),
          getHealth(signal).catch(() => null),
          listExceptions(signal).catch(() => null),
          monitor ? getSystemStatus(signal).then((r) => ({ data: r.data, error: null }), (e) => ({ data: null, error: describeApiError(toApiError(e)) })) : Promise.resolve({ data: null, error: null }),
          listOpenConflicts(signal).then((r) => r.data.conflicts, () => [] as OpenConflict[]),
        ]);
        const byRun = latestAgentByRun(agents.data.runs as AgentRunListItem[]);
        const recent = runs.data.runs.slice(0, PLAN_ROWS);
        const plans = await Promise.all(recent.map((r) => listPlans(r.run_id, signal).then((p) => p.data.plans.find((x) => x.plan_id === p.data.current_plan_id) ?? p.data.plans[0] ?? null, () => null)));
        const rows: RunRow[] = runs.data.runs.map((run, i) => ({ run, agent: byRun.get(run.run_id) ?? null, plan: i < PLAN_ROWS ? (plans[i] ?? null) : null }));
        setBoard({ rows, drafts: drafts.data.drafts, inbound: inbound.data.items, health: health ? { db: health.data.db, queue: (health.data as { queue?: string }).queue } : null, exceptions: exceptions?.data ?? null, system: system.data, systemError: system.error, conflicts, error: null, at: new Date().toISOString() });
      } catch (e) {
        const err = toApiError(e);
        if (err.kind !== "ABORTED") setBoard((b) => ({ ...b, error: err }));
      } finally {
        if (!signal.aborted) setRefreshing(false);
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
    if (view !== "overview") url.searchParams.set("view", view);
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", url);
  }, [selected, view]);

  const runDrafts = useMemo(() => board.drafts.filter((d) => draftRunId(d) === selected), [board.drafts, selected]);
  const approvedPlan = detail?.plans.filter((p) => p.plan_status === "APPROVED").sort((a, b) => b.version - a.version)[0] ?? null;
  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of detail?.facts ?? []) if (f.entity_name) m.set(f.entity_id, f.entity_name);
    for (const d of board.drafts) if (d.question?.target_entity_id && d.question.target_name) m.set(d.question.target_entity_id, d.question.target_name);
    return m;
  }, [detail?.facts, board.drafts]);
  const actions = useMemo(
    () => deriveActions({ rows: board.rows, drafts: board.drafts, inbound: board.inbound, conflicts: board.conflicts, followUps: followUps && approvedPlan && selected ? { planId: followUps.plan_id, runId: selected, actions: followUps.actions } : null, names }),
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
    setView("recovery");
    window.scrollTo?.({ top: 0 });
  };
  const runSource = (runId: string) => board.rows.find((r) => r.run.run_id === runId)?.run.source ?? null;

  const open = (a: ActionItem) => {
    if (a.runId) setSelected(a.runId);
    setTab(a.tab);
    setView("recovery");
    window.scrollTo?.({ top: 0 });
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

  const goView = (v: OpsView) => {
    setView(v);
    window.scrollTo?.({ top: 0 });
  };
  const activeExceptions = board.exceptions?.summary.active ?? null;
  const navItems: NavItem[] = [
    { view: "overview", label: "개요", icon: "◧", count: actions.length, attention: actions.length > 0 },
    { view: "exceptions", label: "예외", icon: "⚡", count: activeExceptions, attention: Boolean(activeExceptions) },
    { view: "recovery", label: "복구 실행", icon: "↻", count: board.rows.filter((r) => ["ACTION", "ACTIVE"].includes(runGroup(r, actions))).length },
    ...(can(me, "planning.input") && !me?.portfolio_demo ? [{ view: "inputs" as const, label: "운영 입력", icon: "⇪" }] : []),
    ...(monitor ? [{ view: "system" as const, label: "시스템", icon: "◉", attention: Boolean(board.system && board.system.overall.status !== "HEALTHY") }] : []),
  ];
  const loaded = board.at !== "" || board.error !== null;

  return (
    <AppShell
      items={navItems}
      view={view}
      onView={goView}
      status={<SystemStatus board={board} monitor={monitor} onOpen={monitor ? () => goView("system") : undefined} />}
      actions={
        <>
          <Updating busy={refreshing} at={board.at || null} />
          <NewLiveRun
            onCreated={(id) => {
              setSelected(id);
              setTab("inputs");
              setView("recovery");
              bump();
            }}
          />
        </>
      }
    >
      <ErrorNotice error={board.error} />
      {!loaded && <LoadingState text="운영 기록을 불러오는 중…" />}

      {loaded && view === "overview" && (
        <>
          <PageHeader title="개요" description="지금 해야 할 일 → 현재 예외 → 복구 진행 순서로 보세요. 숫자와 상태는 모두 Backend 기록이며, 외부 연락과 계획 승인은 사람이 합니다." />
          <OpsCounters board={board} actions={actions} onView={goView} />
          <div className="overview-grid">
            <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
              <ActionRequired actions={actions} runLabel={runLabel} onOpen={open} />
              {board.inbound.some((i) => i.status === "HOLD") && (
                <section className="card" data-testid="held-mail-card" aria-labelledby="held-mail-title">
                  <SectionHeader title="보류된 회신" id="held-mail-title" meta={<span className="badge b-amber">보류 {board.inbound.filter((i) => i.status === "HOLD").length}</span>}>
                    <span className="card-meta">발신자 · 스레드를 확인할 수 없어 문의에 붙지 않은 메일입니다. 담당자를 등록 · 승인한 뒤 다시 판정하세요</span>
                  </SectionHeader>
                  <div className="card-body">
                    <HeldMailList items={board.inbound.filter((i) => i.status === "HOLD").slice(0, 5)} onChanged={bump} />
                  </div>
                </section>
              )}
            </div>
            <div className="overview-side">
              <ExceptionBoard compact exceptions={board.exceptions?.exceptions ?? null} runSource={runSource} onOpenRun={openRun} onShowAll={() => goView("exceptions")} />
              <RecentRuns rows={board.rows} actions={actions} onOpen={openRun} onShowAll={() => goView("recovery")} />
              {monitor && board.system && <SystemMini status={board.system} onOpen={() => goView("system")} />}
            </div>
          </div>
        </>
      )}

      {loaded && view === "exceptions" && (
        <>
          <PageHeader title="예외" description="CERA 가 운영 기준 계획과 창고 수용량을 비교해 스스로 찾은 문제입니다. 해소돼도 기록은 남습니다." />
          <ExceptionBoard exceptions={board.exceptions?.exceptions ?? null} runSource={runSource} onOpenRun={openRun} />
        </>
      )}

      {loaded && view === "recovery" && (
        <>
          <PageHeader title="복구 실행" description="예외 하나를 복구하는 작업 단위입니다. 실행을 고르면 Agent · 정보 · 연락 · 계획 · 후속 · 기록을 탭으로 봅니다." />
          <div className="ops-main">
            <RunList rows={board.rows} actions={actions} selectedId={selected} onSelect={openRun} />
            <section className="card" data-testid="run-detail" aria-label="선택한 실행">
              {!row && (
                <div className="card-body">
                  <EmptyState icon="↻" title={board.rows.length ? "왼쪽에서 복구 실행을 고르세요." : "아직 복구 실행이 없습니다."}>
                    {board.rows.length ? "사람 조치가 필요한 실행이 목록 맨 위에 있습니다." : "예외가 탐지되면 CERA 가 복구 실행을 자동으로 엽니다."}
                  </EmptyState>
                </div>
              )}
              {row && (
                <>
                  <RecoveryHeader row={row} actions={actions} />
                  <div className="ops-tabs" role="tablist" aria-label="복구 실행 내용">
                    {tabs.map((t) => (
                      <button key={t.tab} type="button" role="tab" className="ops-tab" aria-selected={tab === t.tab} onClick={() => setTab(t.tab)} data-testid={`tab-${t.tab}`}>
                        {t.label}
                        {badge(t.tab) > 0 && (
                          <span className="badge b-amber" aria-label={`할 일 ${badge(t.tab)}건`}>
                            {badge(t.tab)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="card-body" style={{ display: "grid", gap: 14 }}>
                    {tab === "overview" && (
                      <>
                        {agent ? (
                          <AgentStatus run={agent} />
                        ) : (
                          <EmptyState icon="◆" title="이 실행에는 아직 Agent 가 없습니다.">
                            Agent 탭에서 시작하면 필요한 정보를 찾고, 문의 초안과 복구 계획까지 준비합니다. 승인은 사람이 합니다.
                          </EmptyState>
                        )}
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
                          <EmptyState icon="▣" title="승인된 계획이 아직 없습니다.">
                            계획을 승인하면 필요한 후속 요청 · 정정 · 취소가 여기에 나옵니다.
                          </EmptyState>
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
        </>
      )}

      {loaded && view === "inputs" && can(me, "planning.input") && !me?.portfolio_demo && (
        <>
          <PageHeader title="운영 입력" description="원래 반입 계획(운영 기준 계획)을 넣으면 CERA 가 창고 수용량과 비교해 예외를 스스로 찾습니다. 늘 검증을 먼저 하고, 오류가 없을 때만 저장합니다." />
          <section className="card" data-testid="baseline-input" aria-labelledby="baseline-input-title">
            <SectionHeader title="운영 기준 계획 입력" id="baseline-input-title" meta={<span className="card-meta">실제 화물 CSV · 검증 → 저장 → CERA 가 예외를 찾습니다</span>} />
            <div className="card-body">
              <OperationalInput runId={null} />
            </div>
          </section>
        </>
      )}

      {loaded && view === "system" && monitor && (
        <>
          <PageHeader title="시스템" description="CERA 자체가 일하고 있는지 — 구성 요소 · 외부 연동 · 대기 작업. 판정은 Backend 규칙이며, 비밀값 · 주소는 보이지 않습니다." />
          <SystemHealth status={board.system} error={board.systemError} />
        </>
      )}

      <footer className="muted" style={{ fontSize: 11 }}>
        상태는 {POLL_MS / 1000}초마다 다시 읽습니다. 버튼을 숨기거나 끄는 것은 편의일 뿐이고, 권한은 Backend 가 판정합니다. 계획 승인은 배차 · 발송 지시가 아닙니다.
      </footer>
    </AppShell>
  );
}

/** 개요의 복구 진행 — 사람 조치 · 진행 중을 먼저, 다섯 건만 */
function RecentRuns({ rows, actions, onOpen, onShowAll }: { rows: RunRow[]; actions: ActionItem[]; onOpen: (runId: string) => void; onShowAll: () => void }) {
  const order = { ACTION: 0, ACTIVE: 1, DONE: 2, STOPPED: 3 } as const;
  const top = [...rows].sort((a, b) => order[runGroup(a, actions)] - order[runGroup(b, actions)]).slice(0, 5);
  return (
    <section className="card" data-testid="recent-runs" aria-labelledby="recent-runs-title">
      <SectionHeader title="복구 진행" id="recent-runs-title" meta={<span className="card-meta">{rows.length}건</span>}>
        {rows.length > 0 && (
          <button type="button" className="link-btn" onClick={onShowAll} data-testid="recent-runs-all">
            전체 보기 →
          </button>
        )}
      </SectionHeader>
      <div className="card-body" style={{ display: "grid", gap: 6 }}>
        {rows.length === 0 && (
          <EmptyState icon="↻" title="아직 복구 실행이 없습니다.">
            예외가 탐지되면 CERA 가 복구 실행을 엽니다.
          </EmptyState>
        )}
        {top.map((r) => {
          const g = runGroup(r, actions);
          return (
            <button key={r.run.run_id} type="button" className="recent-run" onClick={() => onOpen(r.run.run_id)} data-testid="recent-run">
              <span className={`badge ${RUN_GROUP_BADGE[g]}`}>{RUN_GROUP_LABEL[g]}</span>
              <span className="recent-run-text">
                <b>{r.run.exception ? `${r.run.exception.facility_name} 수용량 부족` : (r.run.trigger_ref ?? `실행 #${shortId(r.run.run_id)}`)}</b>
                <span className="muted">
                  Agent {r.agent ? STATUS_LABEL[r.agent.status] : "시작 전"} · 계획 {r.plan ? `v${r.plan.version} ${PLAN_STATUS_LABEL[r.plan.plan_status] ?? r.plan.plan_status}` : "없음"}
                </span>
              </span>
              <span className="muted" aria-hidden>
                →
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** 개요의 시스템 한 줄 — 정상이 아니면 이유를 쉬운 말로 */
function SystemMini({ status, onOpen }: { status: SystemStatusData; onOpen: () => void }) {
  return (
    <section className="card" data-testid="system-mini">
      <SectionHeader title="시스템" meta={<span className={`badge ${OVERALL_CLASS[status.overall.status]}`}>{OVERALL_LABEL[status.overall.status]}</span>}>
        <button type="button" className="link-btn" onClick={onOpen}>
          자세히 →
        </button>
      </SectionHeader>
      {status.overall.reasons.length > 0 && (
        <ul className="card-body health-reasons" style={{ margin: 0 }}>
          {status.overall.reasons.map((r) => (
            <li key={r}>{REASON_LABEL[r] ?? r}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 업무 숫자(T-132 · T-133) — 진행 중 예외 · 오늘 자동 탐지 · 사람 조치 대기 · 진행 중 복구 실행 · 승인 대기 계획 · 검토 필요 회신. 지금 상태만(비교치 · 추세를 만들지 않는다) */
function OpsCounters({ board, actions, onView }: { board: Board; actions: ActionItem[]; onView: (v: OpsView) => void }) {
  const activeRuns = board.rows.filter((r) => ["ACTION", "ACTIVE"].includes(runGroup(r, actions))).length;
  const plansWaiting = board.rows.filter((r) => r.plan?.plan_status === "PROPOSED").length;
  const repliesToReview = actions.filter((a) => a.title === HUMAN_REASON.REPLY_REVIEW_REQUIRED!.title).length;
  const active = board.exceptions?.summary.active ?? null;
  return (
    <div className="metric-grid" data-testid="ops-kpis">
      <MetricCard testId="kpi-active-exceptions" label="진행 중 예외" value={active ?? "—"} hint={active === null ? "탐지 기록 없음" : "자동 탐지 · 해소 전"} tone={active ? "warn" : "neutral"} onClick={() => onView("exceptions")} />
      <MetricCard testId="kpi-detected-today" label="오늘 자동 탐지" value={board.exceptions?.summary.detected_today ?? "—"} hint="오늘 새로 찾은 예외" onClick={() => onView("exceptions")} />
      <MetricCard testId="kpi-waiting-human" label="사람 조치 대기" value={actions.length} hint="승인 · 검토 · 선택" tone={actions.length ? "warn" : "ok"} />
      <MetricCard testId="kpi-active-runs" label="진행 중 복구" value={activeRuns} hint="사람 조치 포함" tone={activeRuns ? "info" : "neutral"} onClick={() => onView("recovery")} />
      <MetricCard testId="kpi-plans-waiting" label="승인 대기 계획" value={plansWaiting} hint="제안된 복구 계획" tone={plansWaiting ? "info" : "neutral"} />
      <MetricCard testId="kpi-replies-review" label="검토 필요 회신" value={repliesToReview} hint="AI 가 값을 확정하지 못함" tone={repliesToReview ? "warn" : "neutral"} />
    </div>
  );
}

function SystemStatus({ board, monitor, onOpen }: { board: Board; monitor: boolean; onOpen?: () => void }) {
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
      <button type="button" onClick={onOpen} className={`badge badge-btn ${OVERALL_CLASS[board.system.overall.status]}`} data-testid="system-status" data-status={board.system.overall.status} title="시스템 상태 자세히">
        {board.system.overall.status === "HEALTHY" ? "✓" : "!"} 시스템 {OVERALL_LABEL[board.system.overall.status]}
      </button>
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
        <div className="agent-progress">
          <div>
            <div className="group-title">진행 단계</div>
            <AgentMilestones run={agent} />
          </div>
          <div>
            <div className="group-title">작업 기록</div>
            <AgentWorkLog run={agent} />
          </div>
        </div>
      )}
      {agent && (
        <details className="tech">
          <summary>기술 상세 — 단계 기록({agent.steps.length}) · Tool 호출({agent.tool_calls.length})</summary>
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
