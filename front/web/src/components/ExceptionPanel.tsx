import type { ActiveException } from "@/contracts/cera";
import { hms, md } from "./format";

const STATUS: Record<string, [string, string]> = {
  OPEN: ["b-red", "대응 전"],
  PLAN_PROPOSED: ["b-amber", "계획 승인 대기"],
  RECOVERY_IN_PROGRESS: ["b-teal", "복구 진행"],
  REPLAN_NEEDED: ["b-red", "재계획 필요"],
  RESOLVED: ["b-green", "해결"],
};

export function ExceptionPanel({ exceptions, onSelect }: { exceptions: ActiveException[]; onSelect: (id: string) => void }) {
  return (
    <section className="card" data-testid="exception-panel">
      <div className="card-head">
        <span className="card-title">Active Exceptions</span>
        <span className="card-meta">{exceptions.length}건</span>
      </div>
      <div className="card-body">
        {exceptions.length === 0 ? (
          <div className="exc calm">
            <b>활성 예외 없음</b>
            <div className="sub" style={{ marginTop: 4 }}>
              창고 A 오늘 20대 입고 예정 · 수용 20. 통관 대기 2대(HIGH)는 예외가 아니라 위험 목록에서 관리합니다.
            </div>
          </div>
        ) : (
          exceptions.map((e) => {
            const [tone, label] = STATUS[e.status];
            return (
              <div className="exc" key={e.exception_id}>
                <div className="exc-title">
                  ⚠ {e.resource_name} Equipment Failure
                  <span className={`badge ${tone}`} style={{ marginLeft: "auto" }}>
                    {label}
                  </span>
                </div>
                <div className="exc-cap">
                  <span className="muted">오늘 수용량</span>
                  <span className="exc-cap-from">{e.capacity_before}</span>
                  <span>→</span>
                  <span className="exc-cap-to" data-testid="exc-capacity">
                    {e.capacity_after}
                  </span>
                  <span className="muted">({md(e.day)})</span>
                </div>
                <dl className="kv">
                  <dt>Affected</dt>
                  <dd>
                    <b className="num" style={{ color: "var(--red)", fontSize: 15 }} data-testid="exc-affected">
                      {e.affected_count}대
                    </b>{" "}
                    <span className="muted">/ 오늘 입고 예정 {e.planned_today}대</span>
                  </dd>
                  <dt>Detected</dt>
                  <dd className="num">{hms(e.detected_at)}</dd>
                  <dt>Source</dt>
                  <dd>
                    {e.source.type === "HUMAN_UI" && e.source.value_status === "CONFIRMED" && <span className="badge b-green">Human Confirmed</span>}{" "}
                    {e.source.is_simulated && <span className="badge b-sim">Simulated</span>}
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                      {e.source.label} · {e.source.event_id}
                    </div>
                  </dd>
                  <dt>상태</dt>
                  <dd className="sub">{e.status_note}</dd>
                  <dt>영향 컨테이너</dt>
                  <dd>
                    <div className="chips">
                      {e.affected_container_ids.map((id) => (
                        <button key={id} className="chip red" onClick={() => onSelect(id)}>
                          {id}
                        </button>
                      ))}
                    </div>
                  </dd>
                </dl>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
