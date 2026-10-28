import { STATUS_LABEL } from "@/components/agent/agentLabels";
import { PLAN_STATUS_LABEL } from "@/components/plan/planLabels";
import { RUN_GROUP_BADGE, RUN_GROUP_LABEL, type RunGroup, reasonTitle, shortId, shortTime } from "./opsLabels";
import { type ActionItem, type RunRow, exceptionText, runGroup } from "./opsModel";

const ORDER: RunGroup[] = ["ACTION", "ACTIVE", "DONE", "STOPPED"];

/** 복구 실행 목록 — 사람 조치 필요 · 진행 중 · 완료 · 중단/오류로 묶는다 */
export function RunList({ rows, actions, selectedId, onSelect }: { rows: RunRow[]; actions: ActionItem[]; selectedId: string | null; onSelect: (runId: string) => void }) {
  const grouped = ORDER.map((g) => ({ g, items: rows.filter((r) => runGroup(r, actions) === g) }));
  return (
    <nav className="card" data-testid="run-list" aria-label="복구 실행 목록">
      <div className="card-head">
        <span className="card-title">복구 실행</span>
        <span className="card-meta">{rows.length}건</span>
      </div>
      <div className="card-body" style={{ display: "grid", gap: 10 }}>
        {rows.length === 0 && <div className="muted">아직 복구 실행이 없습니다.</div>}
        {grouped
          .filter((x) => x.items.length > 0)
          .map(({ g, items }) => (
            <div key={g} style={{ display: "grid", gap: 4 }} data-testid={`run-group-${g}`}>
              <span className={`badge ${RUN_GROUP_BADGE[g]}`} style={{ justifySelf: "start" }}>
                {RUN_GROUP_LABEL[g]} · {items.length}
              </span>
              {items.map(({ run, agent, plan }) => {
                const need = actions.filter((a) => a.runId === run.run_id).length;
                return (
                  <button
                    key={run.run_id}
                    type="button"
                    className={`ops-run${selectedId === run.run_id ? " selected" : ""}`}
                    onClick={() => onSelect(run.run_id)}
                    aria-current={selectedId === run.run_id ? "true" : undefined}
                    data-testid="run-item"
                    data-run-id={run.run_id}
                  >
                    <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <b className="mono">#{shortId(run.run_id)}</b>
                      <span className={`badge ${run.contains_simulated ? "b-sim" : "b-blue"}`}>{run.contains_simulated ? "시뮬레이션" : "실제"}</span>
                      {run.source === "AUTO_DETECTED" && <span className="badge b-violet" data-testid="auto-detected">자동 탐지</span>}
                      {need > 0 && <span className="badge b-amber">⚠ 조치 {need}</span>}
                    </span>
                    {run.exception && (
                      <span style={{ fontSize: 11.5 }} data-testid="run-exception">
                        {exceptionText(run.exception)}
                      </span>
                    )}
                    <span className="muted" style={{ fontSize: 11.5 }}>
                      {run.trigger_ref} · 시작 {shortTime(run.executed_at)}
                    </span>
                    <span style={{ fontSize: 11.5 }}>
                      Agent: {agent ? `${STATUS_LABEL[agent.status]}${agent.waiting_reason ? ` — ${reasonTitle(agent.waiting_reason)}` : ""}` : "시작 전"}
                      {agent ? ` · 변경 ${shortTime(agent.finished_at ?? agent.started_at)}` : ""}
                    </span>
                    <span style={{ fontSize: 11.5 }}>계획: {plan ? `v${plan.version} ${PLAN_STATUS_LABEL[plan.plan_status] ?? plan.plan_status}` : "없음"}</span>
                  </button>
                );
              })}
            </div>
          ))}
      </div>
    </nav>
  );
}
