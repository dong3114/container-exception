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
            <div style={{ fontWeight: 750, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--green)" }} />
              활성 예외 없음
            </div>
            <div className="sub" style={{ marginTop: 6, fontSize: 12 }}>
              창고 A 입고 20대 정상 수용 가능 · 통관 대기 화물은 위험 관리 탭에서 모니터링 중입니다.
            </div>
          </div>
        ) : (
          exceptions.map((e) => {
            const [tone, label] = STATUS[e.status];
            return (
              <div className="exc" key={e.exception_id}>
                <div className="exc-title">
                  <span>⚠ {e.resource_name} 설비 장애</span>
                  <span className={`badge ${tone}`} style={{ marginLeft: "auto" }}>
                    {label}
                  </span>
                </div>
                <div className="exc-cap">
                  <span className="muted" style={{ fontSize: 12 }}>수용량 변화</span>
                  <span className="exc-cap-from">{e.capacity_before}</span>
                  <span style={{ color: "var(--text-3)" }}>→</span>
                  <span className="exc-cap-to" data-testid="exc-capacity">
                    {e.capacity_after}
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>({md(e.day)})</span>
                </div>
                <dl className="kv">
                  <dt>Affected</dt>
                  <dd>
                    <b className="num" style={{ color: "var(--red)", fontSize: 15 }} data-testid="exc-affected">
                      {e.affected_count}대
                    </b>{" "}
                    <span className="muted">/ 입고 예정 {e.planned_today}대</span>
                  </dd>
                  <dt>Detected</dt>
                  <dd className="num" style={{ fontWeight: 600 }}>{hms(e.detected_at)}</dd>
                  <dt>Source</dt>
                  <dd>
                    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                      {e.source.type === "HUMAN_UI" && e.source.value_status === "CONFIRMED" && <span className="badge b-green">Human Confirmed</span>}
                      {e.source.is_simulated && <span className="badge b-sim">Simulated</span>}
                    </div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                      {e.source.label}
                    </div>
                  </dd>
                  <dt>상태 노트</dt>
                  <dd className="sub">{e.status_note}</dd>
                  <dt>영향 화물</dt>
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
