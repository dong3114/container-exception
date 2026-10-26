import { useCallback, useEffect, useState } from "react";
import { type AgentRun, cancelAgentRun, createAgentRun, getAgentRun, listAgentRuns, resumeAgentRun, startAgentRun } from "@/api/agentRuns";
import { type Draft, getDraft, listApprovers, listRuns } from "@/api/drafts";
import { describeApiError } from "@/api/errors";
import { DraftView } from "@/components/drafts/DraftView";
import { FactsPanel } from "@/components/facts/FactsPanel";
import { useAsyncAction } from "@/state/async";
import { STATUS_BADGE, STATUS_LABEL, isActive, milestones, nodeLabel, resultLabel, summaryRows, terminalCode, waitingLabel } from "./agentLabels";

const POLL_MS = 2_500;
const time = (iso: string | null) => (iso ? iso.slice(0, 19).replace("T", " ") : "—");

/**
 * Agent 진행(T-105) — 실제 Backend. 사람이 범위(계획 실행 · 문의 수량 · 시간창 · 공공데이터 기간)를 정해 실행을 시작하고,
 * 화면은 Coordinator 가 기록한 상태 · 단계 · Tool 호출을 읽기만 한다. 승인 · 발송은 기존 초안 화면(DraftView)으로 사람이 한다 —
 * Agent 는 승인 · 발송하지 않는다. 기다리는 동안 화면이 상태를 다시 읽는다(Agent 를 직접 부르지 않는다).
 */
export function AgentPanel() {
  const runs = useAsyncAction((signal) => listAgentRuns(signal));
  const plans = useAsyncAction((signal) => listRuns(signal));
  const approvers = useAsyncAction((signal) => listApprovers(signal));
  const [selected, setSelected] = useState<string | null>(null);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ plan: "", quantity: "2", from: "15:00", to: "17:00", pubFrom: today, pubTo: today, usePublic: true });
  const { run: loadRuns } = runs;
  const { run: loadPlans } = plans;
  const { run: loadApprovers } = approvers;

  useEffect(() => {
    loadRuns();
    loadPlans();
    loadApprovers();
  }, [loadRuns, loadPlans, loadApprovers]);

  const actor = approvers.state.status === "SUCCESS" ? (approvers.state.data.approvers[0]?.actor_id ?? null) : null;
  const planList = plans.state.status === "SUCCESS" ? plans.state.data.runs : [];
  const planId = form.plan || planList[0]?.run_id || "";

  const refresh = useCallback(
    async (id: string, signal?: AbortSignal) => {
      const res = await getAgentRun(id, signal);
      setRun(res.data);
      const pending = res.data.pending_ref;
      if (pending?.type === "COMM_MESSAGE") {
        const d = await getDraft(pending.id, signal);
        setDraft(d.data);
      } else if (!isActive(res.data.status)) {
        setDraft(null);
      }
      return res;
    },
    [],
  );

  const open = useAsyncAction(async (signal, id: string) => {
    setSelected(id);
    return refresh(id, signal);
  });

  const start = useAsyncAction(async (signal, actorId: string) => {
    const quantity = Number(form.quantity);
    const created = await createAgentRun(
      {
        recovery_run_id: planId,
        goal: "계획의 정보 공백 하나를 상대 업체 문의로 메운다",
        parameters: {
          inquiry: { quantity, window_from: form.from || undefined, window_to: form.to || undefined },
          ...(form.usePublic ? { public_data: { from_date: form.pubFrom, to_date: form.pubTo } } : {}),
        },
      },
      actorId,
      signal,
    );
    setSelected(created.data.agent_run_id);
    setRun(created.data);
    const res = await startAgentRun(created.data.agent_run_id, actorId, signal);
    await refresh(created.data.agent_run_id, signal);
    loadRuns();
    return res;
  });

  const wake = useAsyncAction(async (signal, id: string, actorId: string) => {
    const res = await resumeAgentRun(id, actorId, signal);
    await refresh(id, signal);
    return res;
  });
  const cancel = useAsyncAction(async (signal, id: string, actorId: string) => {
    const res = await cancelAgentRun(id, actorId, signal);
    await refresh(id, signal);
    loadRuns();
    return res;
  });

  // 진행 중 · 대기 중에는 상태를 다시 읽는다(승인 · 발송 · 회신은 다른 곳에서 일어난다)
  const active = run ? isActive(run.status) : false;
  useEffect(() => {
    if (!selected || !active) return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      refresh(selected, controller.signal).catch(() => undefined);
    }, POLL_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [selected, active, refresh]);

  const error = [start, wake, cancel, open].map((a) => a.state).find((s) => s.status === "FAILED");
  const steps = run ? run.steps.filter((s) => s.kind !== "NODE" || s.node !== "choose_next_action").slice(-14) : [];
  const tools = run ? run.tool_calls.slice(0, 6) : []; // the API lists tool calls newest first
  const code = run ? terminalCode(run) : null;

  return (
    <section className="card" data-testid="agent-panel" style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div className="card-title">🤖 Agent 진행 (Backend)</div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            CERA Recovery Agent 가 정보 공백을 찾아 상대 업체에 묻고, 사람 승인 · 회신을 기다렸다가 이어서 판단합니다. 승인 · 발송은 사람이 합니다.
          </div>
        </div>
        <button type="button" className="act-btn" onClick={() => loadRuns()} data-testid="agent-refresh">
          새로 고침
        </button>
      </div>

      <form
        style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", fontSize: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (actor && planId) start.run(actor);
        }}
      >
        <label style={{ display: "grid", gap: 2 }}>
          <span className="muted">계획 실행</span>
          <select value={planId} onChange={(e) => setForm({ ...form, plan: e.target.value })} data-testid="agent-plan">
            {planList.map((p) => (
              <option key={p.run_id} value={p.run_id}>
                {p.trigger_ref ?? p.run_id.slice(0, 8)} · {time(p.executed_at)}
                {p.contains_simulated ? " · 시뮬레이션" : ""}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 2 }}>
          <span className="muted">문의 수량(사람 입력)</span>
          <input type="number" min={1} max={999} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} style={{ width: 70 }} data-testid="agent-quantity" />
        </label>
        <label style={{ display: "grid", gap: 2 }}>
          <span className="muted">시간창</span>
          <span style={{ display: "flex", gap: 4 }}>
            <input value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} style={{ width: 56 }} />
            <input value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} style={{ width: 56 }} />
          </span>
        </label>
        <label style={{ display: "grid", gap: 2 }}>
          <span className="muted">
            <input type="checkbox" checked={form.usePublic} onChange={(e) => setForm({ ...form, usePublic: e.target.checked })} /> 공공데이터(입항) 조회 기간
          </span>
          <span style={{ display: "flex", gap: 4 }}>
            <input type="date" value={form.pubFrom} onChange={(e) => setForm({ ...form, pubFrom: e.target.value })} disabled={!form.usePublic} />
            <input type="date" value={form.pubTo} onChange={(e) => setForm({ ...form, pubTo: e.target.value })} disabled={!form.usePublic} />
          </span>
        </label>
        <button type="submit" className="act-btn primary" disabled={!actor || !planId || start.state.status === "LOADING"} data-testid="agent-start">
          {start.state.status === "LOADING" ? "Agent 실행 중…" : "Agent 시작"}
        </button>
      </form>

      {error?.status === "FAILED" && (
        <div role="alert" className="badge b-red" style={{ whiteSpace: "normal", justifySelf: "start" }} data-testid="agent-error">
          {error.error.code ? `${error.error.code} — ` : ""}
          {error.error.message || describeApiError(error.error)}
        </div>
      )}

      {runs.state.status === "SUCCESS" && runs.state.data.runs.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} data-testid="agent-run-list">
          {runs.state.data.runs.slice(0, 8).map((r) => (
            <button
              key={r.agent_run_id}
              type="button"
              className={`act-btn${selected === r.agent_run_id ? " primary" : ""}`}
              onClick={() => open.run(r.agent_run_id)}
              style={{ fontSize: 11.5 }}
            >
              <span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span> {time(r.started_at).slice(5, 16)}
            </button>
          ))}
        </div>
      )}

      {run && (
        <div style={{ display: "grid", gap: 10 }} data-testid="agent-run" data-status={run.status} data-waiting={run.waiting_reason ?? ""}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className={`badge ${STATUS_BADGE[run.status]}`} data-testid="agent-status">
              {STATUS_LABEL[run.status]}
            </span>
            <span style={{ fontSize: 12.5 }}>
              지금: <b data-testid="agent-node">{nodeLabel(run.current_node)}</b>
            </span>
            {run.is_simulated && <span className="badge b-sim">시뮬레이션 계획</span>}
            <span className="muted num" style={{ fontSize: 11 }}>
              {run.agent_run_id.slice(0, 8)} · 시작 {time(run.started_at)}
              {run.finished_at ? ` · 끝 ${time(run.finished_at)}` : ""}
            </span>
            {actor && isActive(run.status) && run.status !== "RUNNING" && (
              <>
                <button type="button" className="act-btn" onClick={() => wake.run(run.agent_run_id, actor)} disabled={wake.state.status === "LOADING"} data-testid="agent-wake">
                  지금 다시 확인
                </button>
                <button type="button" className="act-btn" onClick={() => cancel.run(run.agent_run_id, actor)} disabled={cancel.state.status === "LOADING"}>
                  실행 취소
                </button>
              </>
            )}
          </div>

          {waitingLabel(run.waiting_reason) && (
            <div className="badge b-amber" style={{ whiteSpace: "normal", justifySelf: "start", fontSize: 12 }} data-testid="agent-waiting">
              {waitingLabel(run.waiting_reason)}
              {run.status === "WAITING_RUNTIME" && run.next_attempt_at ? ` (다음 시도 ${time(run.next_attempt_at)} · ${run.runtime_attempts}회 실패)` : ""}
            </div>
          )}

          <ol style={{ display: "flex", gap: 6, flexWrap: "wrap", listStyle: "none", padding: 0, margin: 0, fontSize: 11.5 }} data-testid="agent-milestones">
            {milestones(run).map((m) => (
              <li key={m.key} className={`badge ${m.done ? "b-green" : "b-outline"}`} data-done={m.done}>
                {m.done ? "✓ " : ""}
                {m.label}
              </li>
            ))}
          </ol>

          {code && (
            <div style={{ display: "grid", gap: 6, borderTop: "1px solid var(--line)", paddingTop: 8 }} data-testid="agent-result">
              <b style={{ fontSize: 12.5 }}>결과</b>
              <div style={{ fontSize: 12.5 }}>{resultLabel(code)}</div>
              {run.status === "FAILED" && run.last_error_code && <div className="badge b-red">{run.last_error_code}</div>}
              <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 10px", margin: 0, fontSize: 12 }}>
                {summaryRows(run.result_summary).map((r) => (
                  <div key={r.label} style={{ display: "contents" }}>
                    <dt className="muted">{r.label}</dt>
                    <dd style={{ margin: 0 }}>{r.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <div className="grid-two" style={{ gap: 10 }}>
            <div>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>최근 단계</div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }} data-testid="agent-steps">
                {steps.map((s) => (
                  <li key={s.seq}>
                    <span className="num muted">{s.started_at.slice(11, 19)}</span>{" "}
                    {s.kind === "NODE" ? nodeLabel(s.node) : s.kind === "INTERRUPT" ? "⏸ 대기" : s.kind === "RESUME" ? "▶ 다시 깨어남" : s.kind === "START" ? "▶ 시작" : "■ 끝"}
                    {s.detail_code ? <span className="muted"> · {s.detail_code}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>최근 Tool 호출(Backend 기록)</div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }} data-testid="agent-tools">
                {tools.map((t) => (
                  <li key={t.tool_call_id}>
                    <code>{t.tool_name}</code> <span className={`badge ${t.status === "SUCCEEDED" ? "b-green" : t.status === "STARTED" ? "b-blue" : "b-red"}`}>{t.status}</span>
                    {t.error_code ? <span className="muted"> {t.error_code}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <FactsPanel recoveryRunId={run.recovery_run_id} actorId={actor} refreshKey={`${run.status}:${run.updated_at ?? ""}:${run.current_node ?? ""}`} />

          {draft && run.status === "WAITING_HUMAN" && (
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }} data-testid="agent-pending-draft">
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>Agent 가 기다리는 문의 — 사람이 승인 · 발송 요청합니다</div>
              <DraftView key={`${draft.message.message_id}:${draft.message.status}:${draft.approval.history.length}`} draft={draft} approverId={actor} onChanged={setDraft} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
