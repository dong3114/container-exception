import { useState } from "react";
import { type ExceptionObservation, type OperationalException, getException } from "@/api/exceptions";
import { describeApiError } from "@/api/errors";
import { toApiError } from "@/state/async";
import { EmptyState } from "@/components/ui/primitives";
import { exceptionTypeLabel, shortId } from "./opsLabels";
import { clock } from "./systemStatusText";

const KIND_LABEL: Record<ExceptionObservation["kind"], string> = { DETECTED: "탐지", CHANGED: "변경", RESOLVED: "해소", INDETERMINATE: "판단 불가" };
/** 관측 기록 한 줄의 업무 말 — "수용량 부족 자동 탐지" · "수용량 변경" · "정상화" */
const KIND_TEXT: Record<ExceptionObservation["kind"], { text: string; icon: string }> = {
  DETECTED: { text: "수용량 부족 자동 탐지", icon: "⚡" },
  CHANGED: { text: "수용량 · 예정 반입 변경", icon: "↻" },
  RESOLVED: { text: "정상화 — 부족 해소", icon: "✓" },
  INDETERMINATE: { text: "판단 불가 — 수용량 사실이 없거나 확인 전", icon: "?" },
};
const SOURCE_LABEL: Record<string, string> = { AUTO_DETECTED: "자동 탐지", MANUAL: "사람이 만듦", SCENARIO: "시나리오" };

/**
 * 현재 예외(T-133) — 결정론 탐지기가 찾은 창고 수용량 부족. 진행 중 / 해소됨을 나누고, 관측 기록(탐지 · 변경 · 해소)을 시간순으로 보인다.
 * 기록은 지우지 않는다(해소돼도 남는다). 예외에서 바로 그 복구 실행으로 간다. `compact` = 개요 화면의 짧은 목록(진행 중만).
 */
export function ExceptionBoard({ exceptions, runSource, onOpenRun, compact = false, onShowAll }: { exceptions: OperationalException[] | null; runSource: (runId: string) => string | null; onOpenRun: (runId: string) => void; compact?: boolean; onShowAll?: () => void }) {
  const active = (exceptions ?? []).filter((e) => e.status === "ACTIVE");
  const resolved = (exceptions ?? []).filter((e) => e.status === "RESOLVED");
  return (
    <section className="card" data-testid="exception-board" aria-labelledby="exception-board-title">
      <div className="card-head">
        <span className="card-title" id="exception-board-title">
          현재 예외
        </span>
        <span className={`badge ${active.length ? "b-amber" : "b-green"}`} data-testid="exception-active-count">
          {active.length ? `진행 중 ${active.length}` : "진행 중 없음"}
        </span>
        {compact && onShowAll && (exceptions?.length ?? 0) > 0 && (
          <button type="button" className="link-btn card-head-actions" onClick={onShowAll} data-testid="exception-show-all">
            전체 · 이력 보기 →
          </button>
        )}
      </div>
      <div className="card-body" style={{ display: "grid", gap: 10 }}>
        {exceptions === null && (
          <EmptyState icon="?" title="예외 탐지 기록을 읽지 못했습니다.">
            자동 탐지가 꺼져 있거나 서버에 닿지 않습니다. 잠시 뒤 다시 읽습니다.
          </EmptyState>
        )}
        {exceptions !== null && active.length === 0 && (
          <EmptyState icon="✓" title="현재 처리 중인 예외가 없습니다." testId="exception-empty">
            CERA 는 운영 기준 계획과 창고 수용량을 계속 비교합니다. 부족이 생기면 자동으로 예외를 만들고 복구 실행을 엽니다.
          </EmptyState>
        )}
        {active.map((e) => (
          <ExceptionCard key={e.exception_id} ex={e} source={e.recovery_run_id ? runSource(e.recovery_run_id) : null} onOpenRun={onOpenRun} compact={compact} />
        ))}
        {!compact && resolved.length > 0 && (
          <details data-testid="exception-resolved">
            <summary className="muted">해소된 예외 {resolved.length}건(기록 보존)</summary>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              {resolved.map((e) => (
                <ExceptionCard key={e.exception_id} ex={e} source={e.recovery_run_id ? runSource(e.recovery_run_id) : null} onOpenRun={onOpenRun} />
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

function ExceptionCard({ ex, source, onOpenRun, compact = false }: { ex: OperationalException; source: string | null; onOpenRun: (runId: string) => void; compact?: boolean }) {
  const [history, setHistory] = useState<ExceptionObservation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = history !== null;
  const toggle = () => {
    if (open) return setHistory(null);
    getException(ex.exception_id).then(
      (r) => setHistory(r.data.observations),
      (err) => setError(describeApiError(toApiError(err))),
    );
  };
  const resolvedNow = ex.status === "RESOLVED";
  return (
    <article className={`ex-card${resolvedNow ? " resolved" : ""}`} data-testid="exception-card" data-status={ex.status}>
      <div className="ex-card-head">
        <span className="badge b-amber" data-testid="exception-auto">
          ⚡ 자동 탐지
        </span>
        <b className="ex-card-title">
          {ex.facility_name} · {exceptionTypeLabel(ex.exception_type)}
        </b>
        <span className={`badge ${resolvedNow ? "b-green" : "b-red"}`}>{resolvedNow ? "✓ 해소됨" : "● 진행 중"}</span>
        {ex.is_simulated && <span className="badge b-sim">시뮬레이션(합성)</span>}
        {ex.basis === "PROVISIONAL" && <span className="badge b-outline" title="수용량 값이 아직 사람 확인 전입니다">◐ 임시 사실 기준</span>}
      </div>
      <div className="ex-figures" data-testid="exception-numbers">
        <div className="fig">
          <span className="fig-label">대상 날짜</span>
          <b className="fig-value num">{ex.window_day.slice(5).replace("-", "/")}</b>
        </div>
        <div className="fig">
          <span className="fig-label">예정 반입</span>
          <b className="fig-value num">{ex.scheduled_demand}대</b>
        </div>
        <div className="fig">
          <span className="fig-label">현재 가능</span>
          <b className="fig-value num">{ex.capacity === null ? "?" : `${ex.capacity}대`}</b>
        </div>
        <div className="fig fig-impact">
          <span className="fig-label">영향</span>
          <b className="fig-value num">{ex.shortage}대</b>
        </div>
      </div>
      <div className="ex-card-foot">
        <span className="muted">
          탐지 {clock(ex.detected_at)}
          {ex.resolved_at ? ` · 해소 ${clock(ex.resolved_at)}` : ""}
          {source ? ` · 출처 ${SOURCE_LABEL[source] ?? source}` : ""}
        </span>
        <span style={{ flex: 1 }} />
        {!compact && (
          <button type="button" className="act-btn" onClick={toggle} data-testid="exception-history-toggle" aria-expanded={open}>
            {open ? "이력 닫기" : "이력 보기"}
          </button>
        )}
        {ex.recovery_run_id ? (
          <button type="button" className="act-btn primary" onClick={() => onOpenRun(ex.recovery_run_id!)} data-testid="exception-open-run">
            복구 실행 #{shortId(ex.recovery_run_id)} 열기 →
          </button>
        ) : (
          <span className="muted">복구 실행 없음 — 수용량 값을 사람이 확인하면 만들어집니다</span>
        )}
      </div>
      {error && <div className="muted">{error}</div>}
      {history && (
        <ol className="v-timeline" data-testid="exception-timeline">
          {history.map((o, i) => {
            const prev = history[i - 1];
            const k = KIND_TEXT[o.kind];
            return (
              <li key={o.observation_id} data-kind={o.kind} className={`vt-${o.kind.toLowerCase()}`}>
                <span className="vt-dot" aria-hidden>
                  {k.icon}
                </span>
                <span className="vt-time mono">{clock(o.observed_at)}</span>
                <span className="vt-body">
                  <b>{k.text}</b>
                  <span className="sr-only"> ({KIND_LABEL[o.kind]})</span>
                  <span className="muted">
                    {" "}
                    예정 {o.scheduled_demand} · 가능 {prev && prev.capacity !== o.capacity ? `${prev.capacity ?? "?"} → ` : ""}
                    {o.capacity ?? "?"} · 부족 {o.shortage}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <details className="tech">
        <summary>기술 상세</summary>
        <span className="mono">
          {ex.exception_type} · {ex.scope} · basis {ex.basis} · id {ex.exception_id}
        </span>
      </details>
    </article>
  );
}
