import { type AgentRun } from "@/api/agentRuns";
import { STATUS_BADGE, STATUS_LABEL } from "@/components/agent/agentLabels";
import { HUMAN_REASON } from "./opsLabels";
import { agentNarrative } from "./opsModel";

/** Agent 가 지금 무엇을 하고 · 무엇을 기다리고 · 마지막에 무엇을 했고 · 다음에 무엇을 할지(기록된 단계로만) */
export function AgentStatus({ run }: { run: AgentRun }) {
  const n = agentNarrative(run);
  const human = run.status === "WAITING_HUMAN" && run.waiting_reason ? HUMAN_REASON[run.waiting_reason] : null;
  return (
    <div style={{ display: "grid", gap: 6 }} data-testid="agent-status" data-status={run.status} data-reason={run.waiting_reason ?? ""}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span className={`badge ${STATUS_BADGE[run.status]}`}>
          {run.status === "WAITING_HUMAN" ? "⚠ " : run.status === "RUNNING" ? "▶ " : ""}
          {STATUS_LABEL[run.status]}
        </span>
        <b>{n.now}</b>
        {run.is_simulated && <span className="badge b-sim">시뮬레이션 실행</span>}
      </div>
      {human && (
        <div className="ops-human" role="status" data-testid="agent-human-needed">
          <b>
            {human.icon} {human.title}
          </b>
          <span>{human.detail}</span>
        </div>
      )}
      {!human && n.waiting && <span>⏳ {n.waiting}</span>}
      <dl className="ops-dl">
        <dt>마지막 작업</dt>
        <dd>{n.last ?? "—"}</dd>
        <dt>다음 예상</dt>
        <dd>{n.next ?? (run.status === "COMPLETED" ? "없음(완료)" : "—")}</dd>
        {run.last_error_code && (
          <>
            <dt>오류 코드</dt>
            <dd className="mono">{run.last_error_code}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
