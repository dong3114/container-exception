import { STATUS_LABEL } from "@/components/agent/agentLabels";
import { PLAN_STATUS_LABEL } from "@/components/plan/planLabels";
import { RUN_GROUP_BADGE, RUN_GROUP_LABEL, shortId, shortTime } from "./opsLabels";
import { type ActionItem, type RunRow, runGroup } from "./opsModel";

const SOURCE_LABEL: Record<string, string> = { AUTO_DETECTED: "⚡ 자동 탐지", MANUAL: "👤 사람이 시작", SCENARIO: "▤ 시나리오(합성)" };

/**
 * 복구 실행 머리(1차 제품 UI) — 어느 탭에 있든 늘 보이는 요약: 상태 · 원인 · 대상 시설 · 영향 · 출처 · 시작 시각 · Agent · 계획.
 * 값은 실행 목록 응답(Backend) 그대로다. 예외가 없는 실행(사람이 연 실행 · 시나리오)은 원인 칸에 실행 이름을 쓴다.
 */
export function RecoveryHeader({ row, actions }: { row: RunRow; actions: ActionItem[] }) {
  const { run, agent, plan } = row;
  const g = runGroup(row, actions);
  const ex = run.exception;
  const need = actions.filter((a) => a.runId === run.run_id).length;
  return (
    <div className="rec-header" data-testid="recovery-header">
      <div className="rec-title">
        <span className={`badge ${RUN_GROUP_BADGE[g]}`} data-testid="recovery-state">
          {RUN_GROUP_LABEL[g]}
        </span>
        <h2>{ex ? `${ex.facility_name} 수용량 부족 복구` : (run.trigger_ref ?? "복구 실행")}</h2>
        <span className={`badge ${run.contains_simulated ? "b-sim" : "b-blue"}`}>{run.contains_simulated ? "시뮬레이션 실행(합성 데이터)" : "실제 실행"}</span>
        {need > 0 && <span className="badge b-amber">⚠ 사람 조치 {need}</span>}
        <span className="card-meta mono" title={run.run_id}>
          #{shortId(run.run_id)}
        </span>
      </div>
      <dl className="rec-facts">
        <div>
          <dt>발생 원인</dt>
          <dd>{ex ? `창고 수용량 부족${ex.status === "RESOLVED" ? " (해소됨)" : ""}` : (run.trigger_ref ?? "—")}</dd>
        </div>
        <div>
          <dt>대상 시설</dt>
          <dd>{ex?.facility_name ?? "—"}</dd>
        </div>
        <div>
          <dt>영향 수량</dt>
          <dd className="num">{ex ? `${ex.shortage}대 (예정 ${ex.scheduled_demand} / 가능 ${ex.capacity ?? "?"})` : "—"}</dd>
        </div>
        <div>
          <dt>출처</dt>
          <dd>{SOURCE_LABEL[run.source] ?? run.source}</dd>
        </div>
        <div>
          <dt>시작 시각</dt>
          <dd className="num">{shortTime(run.executed_at)}</dd>
        </div>
        <div>
          <dt>Agent · 계획</dt>
          <dd>
            {agent ? STATUS_LABEL[agent.status] : "Agent 시작 전"} · {plan ? `v${plan.version} ${PLAN_STATUS_LABEL[plan.plan_status] ?? plan.plan_status}` : "계획 없음"}
          </dd>
        </div>
      </dl>
    </div>
  );
}
