import type { SystemStatus } from "@/api/systemStatus";
import { LEVEL_CLASS, LEVEL_LABEL, type Line, OVERALL_CLASS, OVERALL_LABEL, REASON_LABEL, clock, coreLines, integrationLines, queueLines, queueText } from "./systemStatusText";

/**
 * 시스템 상태(T-133) — CERA 자체가 일하고 있는가. ADMIN · OPERATOR 에게만 보인다(Backend 가 403 으로 막는다).
 * 전체 상태 하나 + 이유(쉬운 말) → 핵심 구성 요소 → 외부 연동 → 대기 작업(PostgreSQL 기준). 판정은 Backend 규칙 그대로다.
 */
export function SystemHealth({ status, error }: { status: SystemStatus | null; error: string | null }) {
  return (
    <section className="card" data-testid="system-health" aria-labelledby="system-health-title">
      <div className="card-head">
        <span className="card-title" id="system-health-title">
          시스템 상태
        </span>
        {status && (
          <span className={`badge ${OVERALL_CLASS[status.overall.status]}`} data-testid="overall-status" data-status={status.overall.status}>
            {OVERALL_LABEL[status.overall.status]}
          </span>
        )}
        {status && <span className="card-meta">확인 {clock(status.checked_at)}</span>}
      </div>
      <div className="card-body" style={{ display: "grid", gap: 10 }}>
        {!status && <div className="muted">{error ?? "확인 중…"}</div>}
        {status && status.overall.reasons.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18 }} data-testid="overall-reasons">
            {status.overall.reasons.map((r) => (
              <li key={r}>{REASON_LABEL[r] ?? r}</li>
            ))}
          </ul>
        )}
        {status && (
          <>
            <Group title="핵심" lines={coreLines(status)} />
            <Group title="외부 연동" lines={integrationLines(status)} />
            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                대기 작업(PostgreSQL 기준)
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} data-testid="queue-lines">
                {queueLines(status).map((q) => (
                  <span key={q.key} className="badge b-outline" data-testid={`queue-${q.key}`}>
                    {q.name} <b>{queueText(q.line)}</b>
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Group({ title, lines }: { title: string; lines: Line[] }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        {lines.map((l) => (
          <div key={l.key} style={{ display: "grid", gridTemplateColumns: "110px 72px 1fr", gap: 8, alignItems: "center" }} data-testid={`health-${l.key}`} data-level={l.level}>
            <b>{l.name}</b>
            <span className={`badge ${LEVEL_CLASS[l.level]}`}>{LEVEL_LABEL[l.level]}</span>
            <span style={{ fontSize: 13 }}>{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
