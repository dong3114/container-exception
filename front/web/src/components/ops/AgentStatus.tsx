import { type AgentRun } from "@/api/agentRuns";
import { STATUS_BADGE, STATUS_LABEL, milestones } from "@/components/agent/agentLabels";
import { HUMAN_REASON } from "./opsLabels";
import { agentNarrative, agentWorkLog } from "./opsModel";

/**
 * Agent 가 지금 무엇을 하고 · 무엇을 기다리고 · 마지막에 무엇을 했고 · 다음에 무엇을 할지(기록된 단계로만).
 * 그래프 노드 이름을 그대로 보이지 않는다 — 운영자 말로 바꾼 것만. 원래 단계 기록은 Agent 탭의 기술 상세에 있다.
 */
export function AgentStatus({ run }: { run: AgentRun }) {
  const n = agentNarrative(run);
  const human = run.status === "WAITING_HUMAN" && run.waiting_reason ? HUMAN_REASON[run.waiting_reason] : null;
  return (
    <div className="agent-status" data-testid="agent-status" data-status={run.status} data-reason={run.waiting_reason ?? ""}>
      <div className="agent-status-head">
        <span className="agent-avatar" aria-hidden>
          ◆
        </span>
        <b>복구 Agent</b>
        <span className={`badge ${STATUS_BADGE[run.status]}`}>
          {run.status === "WAITING_HUMAN" ? "⚠ " : run.status === "RUNNING" ? "▶ " : run.status === "COMPLETED" ? "✓ " : ""}
          {STATUS_LABEL[run.status]}
        </span>
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
      <dl className="agent-narr">
        <div>
          <dt>현재</dt>
          <dd>{n.now}</dd>
        </div>
        <div>
          <dt>기다리는 것</dt>
          <dd>{n.waiting ?? (run.status === "RUNNING" ? "없음 — 진행 중" : "—")}</dd>
        </div>
        <div>
          <dt>마지막 작업</dt>
          <dd>{n.last ?? "—"}</dd>
        </div>
        <div>
          <dt>다음 예상</dt>
          <dd>{n.next ?? (run.status === "COMPLETED" ? "없음(완료)" : "—")}</dd>
        </div>
      </dl>
      {run.last_error_code && (
        <details className="tech">
          <summary>오류 코드</summary>
          <span className="mono">{run.last_error_code}</span>
        </details>
      )}
    </div>
  );
}

/** 이 Agent 가 지나온 업무 단계(체크포인트) — 기록된 단계에서만 읽는다 */
export function AgentMilestones({ run }: { run: AgentRun }) {
  const ms = milestones(run);
  return (
    <ol className="milestones" data-testid="agent-milestones" aria-label="Agent 진행 단계">
      {ms.map((m) => (
        <li key={m.key} className={m.done ? "done" : ""} data-done={m.done ? "true" : "false"}>
          <span className="ms-mark" aria-hidden>
            {m.done ? "✓" : "○"}
          </span>
          <span>{m.label}</span>
          <span className="sr-only">{m.done ? " 완료" : " 아직"}</span>
        </li>
      ))}
    </ol>
  );
}

export function AgentWorkLog({ run }: { run: AgentRun }) {
  const log = agentWorkLog(run);
  if (log.length === 0) return null;
  return (
    <ol className="v-timeline" data-testid="agent-worklog">
      {log.map((e, i) => (
        <li key={`${e.at}:${i}`} className={`vt-${e.kind}`}>
          <span className="vt-dot" aria-hidden>
            {e.icon}
          </span>
          <span className="vt-time mono">{e.at.slice(11, 16)}</span>
          <span className="vt-body">{e.text}</span>
        </li>
      ))}
    </ol>
  );
}
