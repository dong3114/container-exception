import { useCallback, useEffect, useMemo, useState } from "react";
import { useMe } from "../MeContext";
import { type AgentRun, type AgentRunListItem, createAgentRun, getAgentRun, listAgentRuns, resumeAgentRun, startAgentRun } from "@/api/agentRuns";
import { type DemoStatus, type RuntimeStatus, getDemoStatus, getRuntimeStatus, injectMockReply } from "@/api/demo";
import { type Draft, approveDraft, listDrafts, listRuns, sendDraft } from "@/api/drafts";
import { ReplyReview } from "@/components/drafts/InboundViews";
import { describeApiError } from "@/api/errors";
import { type FollowUps, type Plan, type PlanList, approvePlan, createFollowUps, getPlan, listFollowUps, listPlans } from "@/api/plans";
import { type FactCoordinate, type FactList, confirmFact, correctFact, enterFact, listFacts } from "@/api/truth";
import { toApiError } from "@/state/async";
import { STATUS_BADGE, STATUS_LABEL, nodeLabel, waitingLabel } from "@/components/agent/agentLabels";
import { FACT_STATE_BADGE, FACT_STATE_LABEL } from "@/components/facts/factLabels";
import { krw } from "@/components/format";
import { PLAN_STATUS_BADGE, PLAN_STATUS_LABEL, actionCounts } from "@/components/plan/planLabels";

/**
 * 시연 · 테스트 콘솔(`/demo`) — 30대 합성 시나리오 한 판을 처음부터 끝까지 단계별로 따라가며 실제 Backend 를 부른다.
 * 숫자 · 상태는 전부 Backend 응답이다(화면이 계산하거나 지어내지 않는다). "예상" 칸은 시나리오 문서에 적힌 기대값이고,
 * "지금" 칸이 실제 응답이다 — 둘이 다르면 그것이 시험 결과다. Mock 업체 회신만 개발 도우미(`/dev/demo/mock-reply`)로 넣는다.
 * 상세 시나리오: 바탕화면 `CERA_시연_테스트_시나리오.md`.
 */
const POLL_MS = 3_000;

/** 녹화 재생(AI Server CERA_LLM_MODE=replay)은 녹화된 문장에만 답한다 — 그래서 문장을 고정해 둔다. */
const REPLY_PRESETS = [
  { id: "ok", label: "정상 — 오후 3시 이후 4대 가능", body: "오후 3시 이후 차량 4대 가능합니다.", expect: "후보 통과 → K운송 차량 4대 '임시 사실(사람 확인 전)' → 계획 v1 자동 생성" },
  { id: "unparseable", label: "예외 — 값이 없는 답", body: "확인했습니다. 요청하신 대로 가능합니다.", expect: "AI 가 값을 못 찾음(NO_CANDIDATE · UNPARSEABLE) → 사실 없음 · 계획 없음 · Agent 는 사람 검토를 기다림(REPLY_REVIEW_REQUIRED) — [다시 추출] 또는 직접 입력" },
  { id: "hallucinated", label: "예외 — AI 가 인용을 지어냄", body: "확인 후 다시 연락드리겠습니다.", expect: "AI 는 '4대'를 냈지만 인용이 원문에 없음 → 검증 REJECTED(QUOTE_NOT_IN_SOURCE) · 사실 없음 · Agent 는 사람 검토를 기다림" },
  { id: "money", label: "예외 — 금액을 수량으로 읽음", body: "대당 18만원이면 가능합니다.", expect: "수량 자리에 180000 KRW → 검증 REJECTED(UNIT_MISMATCH:KRW · VALUE_NOT_IN_QUOTE) · 사실 없음" },
  { id: "norecord", label: "예외 — 녹화 없는 문장", body: "내일 다시 확인해 보겠습니다. 담당자 부재중입니다.", expect: "녹화 재생에 그 문장이 없음 → 3회 시도 뒤 추출 FAILED(EXTRACTION_PROVIDER_FAILED) · 원문은 보존 · 사실 없음 · Agent 는 사람 검토를 기다림 — [다시 추출] 또는 직접 입력" },
  { id: "stranger", label: "예외 — 등록 안 된 발신자", body: "오후 3시 이후 차량 4대 가능합니다.", from: "stranger@example.invalid", expect: "발신자 판정 = 미등록 → 보류함(HOLD · UNKNOWN_SENDER) · AI 에 보내지 않음 · 문의 상태 · Agent 대기 그대로" },
] as const;

type Snapshot = {
  status: DemoStatus | null;
  runtime: RuntimeStatus | null;
  facts: FactList | null;
  plans: PlanList | null;
  plan: Plan | null;
  agent: AgentRun | null;
  draft: Draft | null;
  followUps: FollowUps | null;
  error: string | null;
};

const EMPTY: Snapshot = { status: null, runtime: null, facts: null, plans: null, plan: null, agent: null, draft: null, followUps: null, error: null };

function findFact(facts: FactList | null, entity: string | undefined, key: string | ((k: string) => boolean)): FactCoordinate | undefined {
  if (!facts || !entity) return undefined;
  return facts.facts.find((f) => f.entity_id === entity && (typeof key === "string" ? f.fact_key === key : key(f.fact_key)));
}

const value = (f: FactCoordinate | undefined) => (f?.current && typeof (f.current as { value?: unknown }).value === "number" ? ((f.current as { value: number }).value) : null);
const winner = (f: FactCoordinate | undefined) => f?.candidates.find((c) => c.role === "WINNER") ?? null;

export default function DemoPage() {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<{ at: string; text: string; ok: boolean }[]>([]);
  const [quantity, setQuantity] = useState("4");
  const [preset, setPreset] = useState<string>("ok");
  const [customBody, setCustomBody] = useState("");
  const me = useMe();

  // T-132: 탐지기가 예외를 찾아 실행을 만들면 그 실행을 따라간다(없으면 시드 실행)
  const runId = snap.status?.active_run_id ?? snap.status?.seed.scenario_run_id ?? null;
  const actor = snap.status?.seed.operator_actor_id ?? null;
  const D = snap.status?.seed.plan_date ?? null;
  const fac = snap.status?.seed.facilities;

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const status = (await getDemoStatus(signal)).data;
      const run = status.active_run_id ?? status.seed.scenario_run_id;
      const [runtime, facts, plans, runs, drafts] = await Promise.all([
        getRuntimeStatus(signal).then((r) => r.data).catch(() => null),
        listFacts(run, signal).then((r) => r.data).catch(() => null),
        listPlans(run, signal).then((r) => r.data).catch(() => null),
        listAgentRuns(signal).then((r) => r.data.runs).catch(() => [] as AgentRunListItem[]),
        listDrafts(signal).then((r) => r.data.drafts).catch(() => [] as Draft[]),
      ]);
      const latestRun = runs.find((r) => r.recovery_run_id === run && r.status !== "CANCELLED") ?? null;
      const agent = latestRun ? (await getAgentRun(latestRun.agent_run_id, signal)).data : null;
      // 이 실행이 만든 문의(가장 최근) — Agent 가 기다리는 메시지가 있으면 그것
      const pendingMessage = agent?.pending_ref?.type === "COMM_MESSAGE" ? agent.pending_ref.id : (agent?.result_summary?.message_id as string | undefined);
      // 목록의 source_run 은 Agent 초안에서 비어 있을 수 있다 — 대기 대상 id, 없으면 이 Agent 실행이 시작된 뒤 만든 가장 최근 초안
      const recent = [...drafts].sort((a, b) => (a.message.created_at < b.message.created_at ? 1 : -1));
      const draft = recent.find((d) => d.message.message_id === pendingMessage) ?? (agent ? recent.find((d) => d.message.created_at >= agent.started_at) : undefined) ?? null;
      const plan = plans?.current_plan_id ? (await getPlan(plans.current_plan_id, signal)).data : null;
      const followUps = plan && plan.plan_status === "APPROVED" ? (await listFollowUps(plan.plan_id, signal)).data : null;
      setSnap({ status, runtime, facts, plans, plan, agent, draft, followUps, error: null });
    } catch (error) {
      setSnap((s) => ({ ...s, error: describeApiError(toApiError(error)) }));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    const timer = setInterval(() => load(controller.signal), POLL_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [load]);

  const act = useCallback(
    async (name: string, work: () => Promise<string>) => {
      setBusy(name);
      try {
        const text = await work();
        setLog((l) => [{ at: new Date().toLocaleTimeString("ko-KR"), text: `${name}: ${text}`, ok: true }, ...l].slice(0, 30));
      } catch (error) {
        setLog((l) => [{ at: new Date().toLocaleTimeString("ko-KR"), text: `${name} 실패: ${describeApiError(toApiError(error))}`, ok: false }, ...l].slice(0, 30));
      } finally {
        setBusy(null);
        load();
      }
    },
    [load],
  );

  // ── 단계 판정(전부 Backend 응답에서) ──
  const whA = findFact(snap.facts, fac?.warehouse_a, `capacity.day(${D})`);
  const odcyA = findFact(snap.facts, fac?.odcy_a, `capacity.day(${D})`);
  const truck = findFact(snap.facts, snap.status?.seed.truck_pool_partner, (k) => k.startsWith(`available.slot(${D}`));
  const draftStatus = snap.draft?.message.status ?? null;
  const dispatch = snap.draft?.dispatch.state ?? null;
  const normalReply = snap.draft?.replies.find((r) => r.status === "NORMAL") ?? null;
  const plans = snap.plans?.plans ?? [];
  const current = snap.plan;

  const env = snap.status;
  const envOk = Boolean(env && env.seed.present && env.agent_tools_enabled && env.ai_server === "up" && snap.runtime?.reachable);
  const manualDone = value(whA) === 8 && Boolean(findFact(snap.facts, fac?.odcy_b, `capacity.day(${D})`));
  const agentStarted = Boolean(snap.agent);
  const approved = draftStatus !== null && !["DRAFTED", "PENDING_APPROVAL", "REJECTED"].includes(draftStatus);
  const sent = dispatch === "SENT" || draftStatus === "SENT" || draftStatus === "REPLIED";
  const replied = Boolean(normalReply);
  const provisional = Boolean(truck && (truck.fact_state === "PROVISIONAL" || truck.fact_state === "CONFIRMED"));
  const hasPlan = plans.length > 0;
  const truckConfirmed = truck?.fact_state === "CONFIRMED";
  const corrected = value(odcyA) === 2;
  const planApproved = current?.plan_status === "APPROVED";

  const steps = [
    { title: "환경 점검", done: envOk },
    { title: "예외 발생 · 현장 값 5건 입력", done: manualDone },
    { title: "Agent 시작", done: agentStarted },
    { title: "문의 초안 승인", done: approved },
    { title: "발송 요청 → Worker 발송", done: sent },
    { title: "업체 회신(Mock)", done: replied },
    { title: "AI 추출 → 임시 사실", done: provisional },
    { title: "복구 계획 v1", done: hasPlan },
    { title: "사람 확인 → v2", done: truckConfirmed && plans.some((p) => p.version >= 2) },
    { title: "사실 변경 ODCY A 4→2 → v3", done: corrected && plans.some((p) => p.version >= 3) },
    { title: "계획 승인 → Agent 완료", done: planApproved && snap.agent?.status === "COMPLETED" },
    { title: "후속 문의 초안(승인된 계획)", done: Boolean(snap.followUps && snap.followUps.actions.length > 0 && snap.followUps.actions.every((a) => a.message_id || a.blocked_reason)) },
  ];
  const now = steps.findIndex((s) => !s.done);

  const presetDef = useMemo(() => REPLY_PRESETS.find((p) => p.id === preset) ?? REPLY_PRESETS[0], [preset]);

  return (
    <div style={{ maxWidth: 1360, margin: "0 auto", padding: "16px 16px 40px", display: "grid", gap: 12 }} data-testid="demo-page">
      <header className="card demo-head" data-testid="demo-header">
        <div style={{ display: "grid", gap: 4 }}>
          <div className="intro-kicker" style={{ color: "var(--amber)" }}>GUIDED DEMO · 단계별 체험</div>
          <div className="card-title" style={{ fontSize: 17 }}>창고 수용량 부족 → 복구 계획까지, 12단계로 따라가 보기</div>
          <div className="muted" style={{ fontSize: 12 }}>
            부산항 · 컨테이너 30대 <b>합성 시나리오</b>(시뮬레이션). 업체 · 요율 · 컨테이너는 가상이고, 숫자는 실제 Cost Engine · Solver 계산 결과입니다. 업체 회신은 Mock 메일함, AI 추출은 녹화 재생입니다. 실제 업무 화면은 운영 콘솔입니다.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="act-btn" href="/">운영 콘솔 열기</a>
          <button type="button" className="act-btn" onClick={() => load()}>새로 고침</button>
        </div>
        <div className="demo-now" data-testid="demo-now">
          <div className="demo-progress" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={steps.filter((s) => s.done).length} aria-label="체험 진행">
            <span style={{ width: `${Math.round((steps.filter((s) => s.done).length / steps.length) * 100)}%` }} />
          </div>
          <span>
            <b>{steps.filter((s) => s.done).length}</b> / {steps.length} 단계 완료
          </span>
          {now >= 0 ? (
            <>
              <span>
                지금: <a href={`#step-${now + 1}`}><b>{now + 1}. {steps[now]!.title}</b></a>
              </span>
              {steps[now + 1] && <span className="muted">다음: {now + 2}. {steps[now + 1]!.title}</span>}
            </>
          ) : (
            <span className="badge b-green">✓ 모든 단계를 마쳤습니다</span>
          )}
        </div>
      </header>

      {snap.error && <div className="card" style={{ color: "var(--red)" }}>Backend 응답 없음: {snap.error} — API(3100) · Worker · AI Server 가 떠 있는지 확인하세요.</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 300px) 1fr", gap: 12, alignItems: "start" }}>
        <nav className="card" style={{ display: "grid", gap: 4 }} aria-label="시연 단계">
          {steps.map((s, i) => (
            <a key={s.title} href={`#step-${i + 1}`} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 4px", borderRadius: 6, background: i === now ? "var(--blue-soft)" : undefined, textDecoration: "none", color: "inherit", fontSize: 13 }}>
              <span className={`badge ${s.done ? "b-green" : i === now ? "b-blue" : "b-outline"}`} style={{ minWidth: 22, textAlign: "center" }}>{s.done ? "✓" : i + 1}</span>
              <span style={{ fontWeight: i === now ? 600 : 400 }}>{s.title}</span>
            </a>
          ))}
          <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            처음부터 다시: 시나리오 문서 0절의 <code>down -v</code> → <code>up</code> → <code>db:seed</code>.
          </div>
        </nav>

        <main style={{ display: "grid", gap: 12 }}>
          <Step n={1} title="환경 점검" active={now === 0} done={steps[0]!.done}
            expect="모두 ✓ — 시드 있음 · Agent Tool 켜짐 · AI Server up · Agent Runtime 연결(Tool 14개)">
            {env ? (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                <li>APP_ENV {env.app_env} · 시드 {env.seed.present ? `있음(계획 날짜 ${env.seed.plan_date}, 기준 시각 ${env.seed.as_of?.slice(11, 16)})` : "없음 — db:seed 필요"}</li>
                <li>Agent Tool {env.agent_tools_enabled ? "✓ 켜짐" : "✗ 꺼짐(CERA_AGENT_TOOLS_ENABLED)"} · Runtime {snap.runtime?.reachable ? `✓ 연결(Tool ${snap.runtime.tool_count})` : "✗ 연결 안 됨"}</li>
                <li>AI Server {env.ai_server === "up" ? "✓" : "✗"} · 공공데이터 {env.public_data_mode} · Gmail {env.gmail_enabled ? "켜짐" : "꺼짐(Mock 만)"} · 발송 차단 {env.sending_paused ? "켜짐" : "꺼짐"}</li>
                <li>실행 큐(Redis) {env.execution_queue === "up" ? "✓ 연결" : env.execution_queue === "down" ? "✗ 끊김 — 폴링으로 계속 동작(느려짐)" : "꺼짐 — 폴링만"} · 로그인 {env.auth_mode ?? "—"}</li>
              </ul>
            ) : (
              <div className="muted">불러오는 중…</div>
            )}
          </Step>

          <Step n={2} title="예외 발생 · 현장 값 5건 입력(운영자 직접 입력)" active={now === 1} done={steps[1]!.done}
            expect={`창고 A 오늘 수용량 20 → 8(예외) · 창고 A 내일 11 · 창고 B 10 · ODCY A 4 · ODCY B 6 — 모두 '확인됨(사람)'`}>
            <FactRows facts={snap.facts} />
            <button type="button" className="act-btn" disabled={!actor || !fac || !D || busy !== null || manualDone}
              onClick={() => act("현장 값 5건 입력", async () => {
                const asOf = snap.facts?.evaluated_at;
                const tomorrow = nextDay(D!);
                const entries: [string, string, number][] = [[fac!.warehouse_a, D!, 8], [fac!.warehouse_a, tomorrow, 11], [fac!.warehouse_b, D!, 10], [fac!.odcy_a, D!, 4], [fac!.odcy_b, D!, 6]];
                const scenarioId = await scenarioOf(snap);
                for (const [target, date, v] of entries) {
                  await enterFact(actor!, { kind: "FACILITY_CAPACITY", target_id: target, date, value: v, source_note: "시연: 현장 전화 확인", ...(scenarioId ? { scenario_id: scenarioId } : {}) }, undefined, undefined, asOf);
                }
                return "5건 입력됨";
              })}>
              5건 한 번에 입력
            </button>
            {snap.status?.exception_detection === "on" && (
              <div style={{ fontSize: 12 }} data-testid="demo-auto-detection">
                {snap.status.auto_exception
                  ? <>⚡ <b>자동 탐지</b>: CERA 가 창고 A 수용량 부족을 스스로 찾아 복구 실행 <code>#{snap.status.auto_exception.recovery_run_id.slice(-6)}</code> 을 만들었습니다{snap.status.auto_exception.status === "RESOLVED" ? "(지금은 해소됨)" : ""}. 아래 단계는 이 실행으로 이어집니다.</>
                  : <span className="muted">자동 탐지 켜짐 — 값을 넣으면 CERA 가 예정 반입과 수용량을 비교해 부족을 스스로 찾습니다.</span>}
              </div>
            )}
          </Step>

          <Step n={3} title="Agent 시작(정보 공백 → 문의 → 계획까지)" active={now === 2} done={steps[2]!.done}
            expect="수 초 안에 '사람 대기 · 승인 대기'. Agent 가 K운송(협력 운송사)에 '10월 13일 15:00~18:00 트럭 N대' 문의 초안을 만든다 — 승인 · 발송은 하지 않는다">
            <AgentLine agent={snap.agent} />
            <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", fontSize: 12 }}>
              <label style={{ display: "grid", gap: 2 }}>
                <span className="muted">문의 수량(사람이 정함)</span>
                <input value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ width: 70 }} />
              </label>
              <button type="button" className="act-btn" disabled={!actor || !runId || busy !== null || (snap.agent !== null && snap.agent.status !== "FAILED" && snap.agent.status !== "COMPLETED")}
                onClick={() => act("Agent 시작", async () => {
                  const created = await createAgentRun({ recovery_run_id: runId!, goal: "정보 공백을 메우고 최저 손실 복구 계획을 제안한다", parameters: { inquiry: { quantity: Number(quantity), window_from: "15:00", window_to: "18:00" }, plan_recovery: true } }, actor!);
                  const r = await startAgentRun(created.data.agent_run_id, actor!);
                  return `${STATUS_LABEL[r.data.status]} · ${waitingLabel(r.data.waiting_reason) ?? ""}`;
                })}>
                Agent 시작
              </button>
              {snap.agent && (snap.agent.status === "WAITING_HUMAN" || snap.agent.status === "WAITING_EXTERNAL") && (
                <button type="button" className="act-btn" disabled={busy !== null} onClick={() => act("Agent 다시 확인", async () => STATUS_LABEL[(await resumeAgentRun(snap.agent!.agent_run_id, actor!)).data.status])}>
                  Agent 지금 다시 확인
                </button>
              )}
            </div>
          </Step>

          <Step n={4} title="문의 초안 승인(사람)" active={now === 3} done={steps[3]!.done}
            expect="초안 상태 '승인 대기' → [승인] → '승인됨'. 받는 곳은 K운송 배차팀(가상 · Mock 주소). Agent 는 '발송 요청 대기'로 넘어간다">
            {snap.draft ? (
              <div style={{ fontSize: 13, display: "grid", gap: 4 }}>
                <div><span className="badge b-outline">{snap.draft.message.status}</span> <b>{snap.draft.message.subject}</b> <span className="muted">· {snap.draft.message.channel_type} · 숫자 검사 {snap.draft.number_check && (snap.draft.number_check as { passed?: boolean }).passed === false ? "실패" : "통과"}</span></div>
                <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 12, background: "var(--panel-muted)", padding: 8, borderRadius: 6 }}>{snap.draft.message.body}</pre>
              </div>
            ) : (
              <div className="muted">Agent 가 초안을 만들면 여기에 보입니다.</div>
            )}
            <button type="button" className="act-btn" disabled={!snap.draft || !actor || busy !== null || draftStatus !== "PENDING_APPROVAL"}
              onClick={() => act("초안 승인", async () => (await approveDraft(snap.draft!.message.message_id, snap.draft!.message.content_hash, actor!), "승인됨"))}>
              승인
            </button>
          </Step>

          <Step n={5} title="발송 요청 → Worker 발송" active={now === 4} done={steps[4]!.done}
            expect="[발송 요청] → '발송 대기(QUEUED)' → Worker 다음 주기(약 5초) 안에 '발송됨(SENT)'. Agent 는 '외부 대기 · 회신 대기'">
            <div style={{ fontSize: 13 }}>발송 상태: <b>{dispatch ?? "—"}</b> {snap.draft?.dispatch.sent_at ? `· 발송 ${snap.draft.dispatch.sent_at.slice(11, 19)}` : ""}</div>
            <button type="button" className="act-btn" disabled={!snap.draft || !actor || busy !== null || draftStatus !== "APPROVED"}
              onClick={() => act("발송 요청", async () => (await sendDraft(snap.draft!.message.message_id, snap.draft!.message.content_hash, actor!), "대기열에 넣음"))}>
              발송 요청
            </button>
          </Step>

          <Step n={6} title="업체 회신(Mock 메일함)" active={now === 5} done={steps[5]!.done}
            expect={presetDef.expect}>
            <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
              <select value={preset} onChange={(e) => setPreset(e.target.value)}>
                {REPLY_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              <div>보낼 문장: <code>{customBody || presetDef.body}</code>{"from" in presetDef && presetDef.from ? <> · 발신자 <code>{presetDef.from}</code></> : " · 발신자 = 문의 받은 주소"}</div>
              {/* 공개 포트폴리오 데모는 정해진 문장만 받는다(Backend 가 거부 — T-131) */}
              {!me?.portfolio_demo && <input placeholder="(선택) 직접 쓴 문장 — 녹화가 없으면 추출 실패가 정상" value={customBody} onChange={(e) => setCustomBody(e.target.value)} />}
              <div>
                <button type="button" className="act-btn" disabled={!snap.draft || busy !== null || !sent}
                  onClick={() => act("업체 회신 넣기", async () => {
                    const r = await injectMockReply({ reply_to_message_id: snap.draft!.message.message_id, body: customBody || presetDef.body, ...("from" in presetDef && presetDef.from ? { from: presetDef.from } : {}) });
                    return `Mock 수신함에 넣음(${r.data.from}) — Worker 가 곧 가져갑니다`;
                  })}>
                  회신 넣기
                </button>
              </div>
              {snap.draft?.replies.map((r) => (
                <div key={r.raw_input_id} style={{ background: "var(--panel-muted)", padding: 6, borderRadius: 6 }}>
                  <span className="badge b-teal">회신</span> {r.from_address} · “{r.preview}” · 추출 {r.extraction?.state ?? "—"}
                  {r.extraction?.last_error_code ? ` (${r.extraction.last_error_code})` : ""}
                  {r.extraction?.no_candidate_outcome ? ` · ${r.extraction.no_candidate_outcome}` : ""}
                  <ReplyReview item={r} />
                </div>
              ))}
            </div>
          </Step>

          <Step n={7} title="AI 추출 → 임시 사실(사람 확인 전)" active={now === 6} done={steps[6]!.done}
            expect="K운송 '10월 13일 15:00~18:00 차량' = 4대 · 상태 '임시(확인 전)' · 출처 EMAIL · 근거 인용 '차량 4대 가능합니다'">
            {truck ? <FactLine f={truck} /> : <div className="muted">아직 없음 — 회신 후 Worker 가 추출하면 생깁니다(수 초).</div>}
          </Step>

          <Step n={8} title="복구 계획 v1(Agent 가 계산 · 제안)" active={now === 7} done={steps[7]!.done}
            expect="v1 '제안 — 사람 검토 대기' · 총 예상 손실 5,735,000원 · Baseline 7,220,000원 · 절감 1,485,000원 · 대상 23대 = 원래 계획대로 직송 11(창고 A 8 · 창고 B 3) · ODCY 경유 8(ODCY A 4 · ODCY B 4) · 터미널 대기 후 직송 4">
            <PlanBox plan={current} list={snap.plans} />
          </Step>

          <Step n={9} title="사람 확인 → v1 무효 → v2" active={now === 8} done={steps[8]!.done}
            expect="[확인] → K운송 4대 '확인됨' → v1 무효(사실 상태 바뀜) → Agent 가 깨어나 v2 제안(금액은 v1 과 같은 5,735,000원 — 값은 같고 근거 강도만 올라감)">
            <button type="button" className="act-btn" disabled={!actor || !winner(truck) || truck?.fact_state !== "PROVISIONAL" || busy !== null}
              onClick={() => act("임시 사실 확인", async () => `${FACT_STATE_LABEL[(await confirmFact(winner(truck)!.event_id, "시연: 전화로 재확인", actor!, undefined, undefined, snap.facts?.evaluated_at)).data.fact_state]}`)}>
              K운송 4대 확인
            </button>
          </Step>

          <Step n={10} title="사실 변경: ODCY A 수용량 4 → 2(정정)" active={now === 9} done={steps[9]!.done}
            expect="[정정] → ODCY A = 2 '확인됨' → v2 무효(사실 교체) → v3 제안 · 총 예상 손실 5,835,000원 · 절감 1,385,000원 · ODCY 경유가 ODCY A 2 · ODCY B 6 으로 바뀜(나머지 같음)">
            <div style={{ fontSize: 13 }}>ODCY A 지금 값: <b>{value(odcyA) ?? "—"}</b></div>
            <button type="button" className="act-btn" disabled={!actor || !winner(odcyA) || value(odcyA) === 2 || busy !== null}
              onClick={() => act("ODCY A 정정", async () => `ODCY A = ${value((await correctFact(winner(odcyA)!.event_id, 2, "OPERATOR_CORRECTION", "시연: ODCY A 가 2대만 가능하다고 다시 알림", actor!, undefined, undefined, snap.facts?.evaluated_at)).data)}`)}>
              ODCY A 를 2 로 정정
            </button>
          </Step>

          <Step n={11} title="계획 승인(사람) → Agent 완료" active={now === 10} done={steps[10]!.done}
            expect="[승인] → 지금 판 '승인됨' → Agent '완료 · 계획 승인됨(PLAN_APPROVED)'. 승인은 실행 지시가 아니다 — 배차 · 발송은 일어나지 않는다">
            <button type="button" className="act-btn" disabled={!actor || !current || current.plan_status !== "PROPOSED" || busy !== null}
              onClick={() => act("계획 승인", async () => `v${current!.version} ${PLAN_STATUS_LABEL[(await approvePlan(current!.plan_id, current!.plan_hash, actor!)).data.plan_status] ?? ""}`)}>
              지금 판 승인
            </button>
            <AgentLine agent={snap.agent} />
          </Step>

          <Step n={12} title="승인된 계획 → 후속 문의 초안(사람 승인 대기 · 발송 안 함)" active={now === 11} done={steps[11]!.done}
            expect="[후속 문의 초안 만들기] → 승인된 판의 조치(ODCY 반입 · 협력 트럭 배차)마다 초안 하나 · 상태 PENDING_APPROVAL. 자동 발송 없음 — 초안마다 사람이 승인 · 발송 요청. 판이 무효가 되면 그 초안은 승인 · 발송이 막힌다(PLAN_SUPERSEDED)">
            {snap.followUps ? (
              <div style={{ display: "grid", gap: 2, fontSize: 13 }}>
                {snap.followUps.actions.map((a) => (
                  <div key={a.action_key}>
                    {a.kind === "ODCY_RECEIVE" ? "ODCY 반입" : "협력 트럭"} · {a.target_name} · {a.date}
                    {a.window ? ` ${a.window.from}~${a.window.to}` : ""} · {a.quantity}대 → {a.message_id ? <b>{a.message_status}</b> : a.blocked_reason ? <span style={{ color: "var(--red)" }}>{a.blocked_reason}</span> : "초안 없음"}
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted">계획이 승인되면 필요한 조치가 여기에 보입니다.</div>
            )}
            <button type="button" className="act-btn" disabled={!actor || !current || current.plan_status !== "APPROVED" || busy !== null}
              onClick={() => act("후속 문의 초안", async () => `${(await createFollowUps(current!.plan_id, actor!)).data.actions.filter((a) => a.message_id).length}건 초안`)}>
              후속 문의 초안 만들기
            </button>
          </Step>

          <section className="card" style={{ display: "grid", gap: 6 }}>
            <div className="card-title">실행 기록(이 화면에서 누른 것)</div>
            {log.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>아직 없음</div> : log.map((l, i) => (
              <div key={i} style={{ fontSize: 12, color: l.ok ? undefined : "var(--red)" }}>{l.at} · {l.text}</div>
            ))}
          </section>
        </main>
      </div>
    </div>
  );
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** 시뮬레이션 실행의 직접 입력은 시나리오 id 가 필요하다 — 실행 목록에서 읽는다(지어내지 않는다). */
async function scenarioOf(snap: Snapshot): Promise<string | null> {
  const runs = (await listRuns()).data.runs;
  return runs.find((r) => r.run_id === snap.status?.seed.scenario_run_id)?.scenario_id ?? null;
}

function Step(props: { n: number; title: string; active: boolean; done: boolean; expect: string; children: React.ReactNode }) {
  return (
    <section id={`step-${props.n}`} className="card" style={{ display: "grid", gap: 8, borderColor: props.active ? "var(--blue-border)" : undefined, boxShadow: props.active ? "0 0 0 2px var(--blue-soft)" : undefined }} data-testid={`demo-step-${props.n}`}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className={`badge ${props.done ? "b-green" : props.active ? "b-blue" : "b-outline"}`}>{props.done ? "완료" : props.active ? "지금" : `${props.n}`}</span>
        <div className="card-title" style={{ margin: 0 }}>{props.n}. {props.title}</div>
      </div>
      <div style={{ fontSize: 12, background: "var(--amber-soft)", border: "1px solid var(--amber-border)", borderRadius: 6, padding: "6px 8px" }}>
        <b>예상</b> {props.expect}
      </div>
      {props.children}
    </section>
  );
}

function AgentLine({ agent }: { agent: AgentRun | null }) {
  if (!agent) return <div className="muted" style={{ fontSize: 12 }}>Agent 실행 없음</div>;
  return (
    <div style={{ fontSize: 13 }}>
      Agent <span className={`badge ${STATUS_BADGE[agent.status]}`}>{STATUS_LABEL[agent.status]}</span> · {nodeLabel(agent.current_node)}
      {agent.waiting_reason ? ` · ${waitingLabel(agent.waiting_reason)}` : ""}
      {agent.last_error_code ? <span style={{ color: "var(--red)" }}> · 오류 {agent.last_error_code}</span> : ""}
      {agent.result_summary?.plan_status ? ` · 결과 ${String(agent.result_summary.plan_status)}` : ""}
    </div>
  );
}

function FactLine({ f }: { f: FactCoordinate }) {
  const w = winner(f);
  return (
    <div style={{ fontSize: 13 }}>
      {f.entity_name} · <code>{f.fact_key}</code> = <b>{value(f) ?? "값 없음"}</b> <span className={`badge ${FACT_STATE_BADGE[f.fact_state]}`}>{FACT_STATE_LABEL[f.fact_state]}</span>
      {w ? <span className="muted"> · 출처 {w.source_type}{w.evidence_quote ? ` · 인용 “${w.evidence_quote}”` : ""}</span> : null}
    </div>
  );
}

function FactRows({ facts }: { facts: FactList | null }) {
  if (!facts) return <div className="muted">불러오는 중…</div>;
  return (
    <div style={{ display: "grid", gap: 2 }}>
      {facts.facts.map((f) => (
        <FactLine key={`${f.entity_id}|${f.fact_key}`} f={f} />
      ))}
      <div className="muted" style={{ fontSize: 11.5 }}>판정 기준 시각 {facts.evaluated_at.slice(0, 16).replace("T", " ")}(시나리오 시각)</div>
    </div>
  );
}

function PlanBox({ plan, list }: { plan: Plan | null; list: PlanList | null }) {
  if (!plan) return <div className="muted">아직 계획 없음 — 회신이 반영되면 Agent 가 계산합니다.</div>;
  return (
    <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
      <div>
        v{plan.version} <span className={`badge ${PLAN_STATUS_BADGE[plan.plan_status] ?? "b-outline"}`}>{PLAN_STATUS_LABEL[plan.plan_status] ?? plan.plan_status}</span> · 총 예상 손실 <b>{krw(plan.objective_krw)}</b> · Baseline {krw(plan.baseline_total_krw)} · 절감 <b>{krw(plan.saving_krw)}</b>
        <span className="muted"> · {plan.result_kind} · Solver {plan.solve_ms}ms</span>
      </div>
      <div>{actionCounts(plan.items).map((c) => `${c.label} ${c.count}`).join(" · ")} · <span className="muted">대상별: {targetCounts(plan)}</span></div>
      <div className="muted" style={{ fontSize: 12 }}>
        판 기록: {list?.plans.map((p) => `v${p.version} ${PLAN_STATUS_LABEL[p.plan_status] ?? p.plan_status} ${krw(p.objective_krw)}`).join(" → ")}
      </div>
    </div>
  );
}

function targetCounts(plan: Plan): string {
  const m = new Map<string, number>();
  for (const i of plan.items) {
    const k = i.target_name ?? i.action;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([k, v]) => `${k} ${v}`).join(" · ");
}
