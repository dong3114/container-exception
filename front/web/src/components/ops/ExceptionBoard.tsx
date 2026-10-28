import { useState } from "react";
import { type ExceptionObservation, type OperationalException, getException } from "@/api/exceptions";
import { describeApiError } from "@/api/errors";
import { toApiError } from "@/state/async";
import { shortId } from "./opsLabels";
import { clock } from "./systemStatusText";

const KIND_LABEL: Record<ExceptionObservation["kind"], string> = { DETECTED: "탐지", CHANGED: "변경", RESOLVED: "해소", INDETERMINATE: "판단 불가" };
const SOURCE_LABEL: Record<string, string> = { AUTO_DETECTED: "자동 탐지", MANUAL: "사람이 만듦", SCENARIO: "시나리오" };

/**
 * 현재 예외(T-133) — 결정론 탐지기가 찾은 창고 수용량 부족. 진행 중 / 해소됨을 나누고, 관측 기록(탐지 · 변경 · 해소)을 시간순으로 보인다.
 * 기록은 지우지 않는다(해소돼도 남는다). 예외에서 바로 그 복구 실행으로 간다.
 */
export function ExceptionBoard({ exceptions, runSource, onOpenRun }: { exceptions: OperationalException[] | null; runSource: (runId: string) => string | null; onOpenRun: (runId: string) => void }) {
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
      </div>
      <div className="card-body" style={{ display: "grid", gap: 8 }}>
        {exceptions === null && <div className="muted">예외 탐지 기록을 읽지 못했습니다.</div>}
        {exceptions !== null && active.length === 0 && <div className="muted">지금 진행 중인 예외가 없습니다.</div>}
        {active.map((e) => (
          <ExceptionCard key={e.exception_id} ex={e} source={e.recovery_run_id ? runSource(e.recovery_run_id) : null} onOpenRun={onOpenRun} />
        ))}
        {resolved.length > 0 && (
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

function ExceptionCard({ ex, source, onOpenRun }: { ex: OperationalException; source: string | null; onOpenRun: (runId: string) => void }) {
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
  return (
    <div className="ops-exception" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 10, display: "grid", gap: 6 }} data-testid="exception-card" data-status={ex.status}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span className="badge b-amber" data-testid="exception-auto">
          ⚡ 자동 탐지
        </span>
        <b>{ex.facility_name} 수용량 부족</b>
        <span className={`badge ${ex.status === "ACTIVE" ? "b-red" : "b-green"}`}>{ex.status === "ACTIVE" ? "진행 중(ACTIVE)" : "해소됨(RESOLVED)"}</span>
        {ex.is_simulated && <span className="badge b-sim">시뮬레이션(합성)</span>}
        {ex.basis === "PROVISIONAL" && <span className="badge b-outline">임시 사실 기준</span>}
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }} data-testid="exception-numbers">
        <span>날짜 <b>{ex.window_day}</b></span>
        <span>예정 <b>{ex.scheduled_demand}</b></span>
        <span>가능 <b>{ex.capacity ?? "?"}</b></span>
        <span>영향 <b>{ex.shortage}대</b></span>
        <span className="muted">탐지 {clock(ex.detected_at)}{ex.resolved_at ? ` · 해소 ${clock(ex.resolved_at)}` : ""}</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {ex.recovery_run_id ? (
          <button type="button" className="act-btn" onClick={() => onOpenRun(ex.recovery_run_id!)} data-testid="exception-open-run">
            복구 실행 #{shortId(ex.recovery_run_id)} 열기 →
          </button>
        ) : (
          <span className="muted">복구 실행 없음(임시 사실 — 사람이 확인하면 만들어집니다)</span>
        )}
        {source && <span className={`badge ${source === "AUTO_DETECTED" ? "b-amber" : "b-outline"}`}>출처: {SOURCE_LABEL[source] ?? source}</span>}
        <button type="button" className="act-btn" onClick={toggle} data-testid="exception-history-toggle">
          {open ? "이력 닫기" : "이력 보기"}
        </button>
      </div>
      {error && <div className="muted">{error}</div>}
      {history && (
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13 }} data-testid="exception-timeline">
          {history.map((o) => (
            <li key={o.observation_id} data-kind={o.kind}>
              {clock(o.observed_at)} · <b>{KIND_LABEL[o.kind]}</b> — 예정 {o.scheduled_demand} / 가능 {o.capacity ?? "?"} · 부족 {o.shortage}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
