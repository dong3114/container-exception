import type { ComponentLevel, SystemStatus } from "@/api/systemStatus";
import { EmptyState, LoadingState } from "@/components/ui/primitives";
import { LEVEL_CLASS, LEVEL_LABEL, type Line, OVERALL_CLASS, OVERALL_LABEL, REASON_LABEL, clock, coreLines, integrationLines, queueLines, queueText } from "./systemStatusText";

const LEVEL_ICON: Record<ComponentLevel, string> = { HEALTHY: "✓", DEGRADED: "!", DOWN: "✕", DISABLED: "–" };
const OVERALL_ICON: Record<SystemStatus["overall"]["status"], string> = { HEALTHY: "✓", DEGRADED: "!", ACTION_REQUIRED: "⚠", DOWN: "✕" };

/**
 * 시스템 상태(T-133) — CERA 자체가 일하고 있는가. ADMIN · OPERATOR 에게만 보인다(Backend 가 403 으로 막는다).
 * 전체 상태 하나 + 이유(쉬운 말) → 핵심 구성 요소 카드 → 외부 연동 카드 → 대기 작업(PostgreSQL 기준). 판정은 Backend 규칙 그대로다.
 * 상태는 같은 모양(아이콘 + 글자 + 색)으로만 보인다: 정상 · 지연 · 장애 · 사용 안 함.
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
            {OVERALL_ICON[status.overall.status]} {OVERALL_LABEL[status.overall.status]}
          </span>
        )}
        {status && <span className="card-meta">확인 {clock(status.checked_at)}</span>}
      </div>
      <div className="card-body" style={{ display: "grid", gap: 14 }}>
        {!status && (error ? <EmptyState icon="?" title="시스템 상태를 읽지 못했습니다.">{error}</EmptyState> : <LoadingState text="확인 중…" />)}
        {status && status.overall.reasons.length > 0 && (
          <ul className="health-reasons" data-testid="overall-reasons">
            {status.overall.reasons.map((r) => (
              <li key={r}>{REASON_LABEL[r] ?? r}</li>
            ))}
          </ul>
        )}
        {status && (
          <>
            <Group title="핵심 구성 요소" lines={coreLines(status)} />
            <Group title="외부 연동" lines={integrationLines(status)} />
            <div>
              <div className="group-title">대기 작업(PostgreSQL 기준)</div>
              <div className="queue-row" data-testid="queue-lines">
                {queueLines(status).map((q) => (
                  <span key={q.key} className={`queue-chip${q.line.count > 0 ? " busy" : ""}`} data-testid={`queue-${q.key}`}>
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
      <div className="group-title">{title}</div>
      <div className="health-grid">
        {lines.map((l) => (
          <HealthCard key={l.key} line={l} />
        ))}
      </div>
    </div>
  );
}

/** 구성 요소 하나 — 이름 · 상태(아이콘 + 글자) · 쉬운 설명. 비밀값 · 주소는 없다 */
export function HealthCard({ line }: { line: Line }) {
  return (
    <div className={`health-card lv-${line.level.toLowerCase()}`} data-testid={`health-${line.key}`} data-level={line.level}>
      <div className="health-card-head">
        <b>{line.name}</b>
        <span className={`badge ${LEVEL_CLASS[line.level]}`}>
          {LEVEL_ICON[line.level]} {LEVEL_LABEL[line.level]}
        </span>
      </div>
      <span className="health-card-text">{line.text}</span>
    </div>
  );
}
