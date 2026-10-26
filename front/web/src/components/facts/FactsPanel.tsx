import { useEffect, useState } from "react";
import { type FactCandidate, type FactCoordinate, type FactList, type FactReasonCode, confirmFact, correctFact, listFacts, rejectFact } from "@/api/truth";
import { useAsyncAction } from "@/state/async";
import {
  CONFLICT_LABEL,
  FACT_STATE_BADGE,
  FACT_STATE_LABEL,
  GENERATED_BY_LABEL,
  HOLD_LABEL,
  PROVISIONAL_NOTE,
  REASON_OPTIONS,
  ROLE_LABEL,
  USABILITY_LABEL,
  factErrorText,
  factTitle,
  formatTime,
  formatValue,
  formatWindow,
  isActionable,
  sourceLabel,
} from "./factLabels";

type Mode = "reject" | "correct" | null;

/** 한 후보(근거) 줄 — 값 · 역할 · 누가 말했나 · 원문 인용 · 만든 방식, 그리고 사람의 확인 · 거절 · 정정. */
function CandidateRow({ c, actorId, onUpdated }: { c: FactCandidate; actorId: string | null; onUpdated: (f: FactCoordinate) => void }) {
  const [mode, setMode] = useState<Mode>(null);
  const [reason, setReason] = useState<FactReasonCode>("MODEL_MISREAD");
  const [note, setNote] = useState("");
  const [value, setValue] = useState("");
  const done = (res: { data: FactCoordinate; requestId: string | null }) => {
    setMode(null);
    setNote("");
    onUpdated(res.data);
    return res;
  };
  const confirm = useAsyncAction(async (signal, actor: string) => done(await confirmFact(c.event_id, note.trim() || undefined, actor, signal)));
  const reject = useAsyncAction(async (signal, actor: string) => done(await rejectFact(c.event_id, reason, note.trim() || undefined, actor, signal)));
  const correct = useAsyncAction(async (signal, actor: string, n: number) => done(await correctFact(c.event_id, n, reason, note.trim() || undefined, actor, signal)));
  const busy = [confirm, reject, correct].some((a) => a.state.status === "LOADING");
  const failed = [confirm, reject, correct].map((a) => a.state).find((s) => s.status === "FAILED");
  const parsed = Number(value);
  const validValue = value.trim() !== "" && Number.isInteger(parsed) && parsed >= 0 && parsed <= 999999;
  const actionable = isActionable(c);

  return (
    <li data-testid="fact-candidate" data-role={c.role} style={{ display: "grid", gap: 2, fontSize: 12 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <b className="num">{formatValue(c.value, c.unit)}</b>
        <span className="badge b-outline">{ROLE_LABEL[c.role]}</span>
        <span className={`badge ${c.generated_by === "RECORDED_REPLAY" ? "b-sim" : c.generated_by === "HUMAN" ? "b-green" : "b-violet"}`}>{GENERATED_BY_LABEL[c.generated_by]}</span>
        {c.verification === "CONFIRMED" && <span className="badge b-green">사람 확인 완료</span>}
        <span className="muted">
          {sourceLabel(c.source_type)}
          {c.source_role ? ` · ${c.source_role}` : ""} · 근거 시각 {formatTime(c.evidence_time)}
        </span>
      </div>
      {c.evidence_quote && <div className="muted" style={{ fontSize: 11.5 }}>근거: “{c.evidence_quote}”</div>}
      {c.model_version && <div className="muted" style={{ fontSize: 11 }}>모델: {c.model_version}</div>}
      {actionable && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="act-btn primary" disabled={!actorId || busy} onClick={() => actorId && confirm.run(actorId)} data-testid="fact-confirm">
            확인
          </button>
          <button type="button" className="act-btn" disabled={!actorId || busy} onClick={() => setMode(mode === "reject" ? null : "reject")} data-testid="fact-reject-open">
            거절
          </button>
          <button type="button" className="act-btn" disabled={!actorId || busy} onClick={() => setMode(mode === "correct" ? null : "correct")} data-testid="fact-correct-open">
            정정
          </button>
          {!actorId && <span className="muted">확인할 담당자를 불러오지 못해 누를 수 없습니다</span>}
        </div>
      )}
      {actionable && mode && (
        <form
          style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "end" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!actorId) return;
            if (mode === "reject") reject.run(actorId);
            else if (validValue) correct.run(actorId, parsed);
          }}
        >
          {mode === "correct" && (
            <label style={{ display: "grid", gap: 2 }}>
              <span className="muted">운영자가 읽은 값</span>
              <input type="number" min={0} max={999999} step={1} value={value} onChange={(e) => setValue(e.target.value)} style={{ width: 90 }} data-testid="fact-correct-value" />
            </label>
          )}
          <label style={{ display: "grid", gap: 2 }}>
            <span className="muted">사유</span>
            <select value={reason} onChange={(e) => setReason(e.target.value as FactReasonCode)} data-testid="fact-reason">
              {REASON_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 2 }}>
            <span className="muted">메모(선택)</span>
            <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} style={{ width: 180 }} />
          </label>
          <button type="submit" className="act-btn primary" disabled={busy || (mode === "correct" && !validValue)} data-testid="fact-submit">
            {mode === "reject" ? "거절하기" : "정정하기"}
          </button>
        </form>
      )}
      {failed?.status === "FAILED" && (
        <div role="alert" className="badge b-red" style={{ whiteSpace: "normal", justifySelf: "start" }} data-testid="fact-error">
          {factErrorText(failed.error.code, failed.error.message)}
        </div>
      )}
    </li>
  );
}

/** 사실 하나(좌표) — 이름 · 상태 · 현재 값, 그리고 펼치면 근거 후보 목록. */
export function FactCard({ fact, actorId, onUpdated }: { fact: FactCoordinate; actorId: string | null; onUpdated: (f: FactCoordinate) => void }) {
  const hints = [USABILITY_LABEL[fact.decision_usability], HOLD_LABEL[fact.hold_status], CONFLICT_LABEL[fact.conflict_status]].filter(Boolean);
  const cur = fact.current;
  return (
    <div data-testid="fact-card" data-fact-state={fact.fact_state} style={{ display: "grid", gap: 4, borderLeft: "3px solid var(--line-strong)", paddingLeft: 8 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 12.5 }}>{fact.entity_name ?? fact.entity_id.slice(0, 8)}</b>
        <span>{factTitle(fact.fact_key)}</span>
        <span className={`badge ${FACT_STATE_BADGE[fact.fact_state]}`} data-testid="fact-state">
          {FACT_STATE_LABEL[fact.fact_state]}
        </span>
        {fact.is_simulated && <span className="badge b-sim">시뮬레이션</span>}
      </div>
      <div style={{ fontSize: 12.5 }} data-testid="fact-current">
        {cur ? (
          <>
            현재 값 <b className="num">{formatValue(cur.value, cur.unit)}</b>
            {formatWindow(cur.valid_from, cur.valid_until) ? <span className="muted"> · 적용 {formatWindow(cur.valid_from, cur.valid_until)}</span> : null}
          </>
        ) : (
          <span className="muted">쓸 수 있는 값이 아직 없습니다</span>
        )}
      </div>
      {fact.fact_state === "PROVISIONAL" && <div className="muted" style={{ fontSize: 11.5 }}>{PROVISIONAL_NOTE}</div>}
      {hints.length > 0 && <div className="muted" style={{ fontSize: 11.5 }}>{hints.join(" · ")}</div>}
      <details>
        <summary style={{ fontSize: 12, cursor: "pointer" }}>근거 {fact.candidates.length}건 보기</summary>
        <ul style={{ margin: "4px 0 0", paddingLeft: 16, display: "grid", gap: 8, listStyle: "none" }}>
          {fact.candidates.map((c) => (
            <CandidateRow key={c.event_id} c={c} actorId={actorId} onUpdated={onUpdated} />
          ))}
        </ul>
      </details>
    </div>
  );
}

const sameCoordinate = (a: FactCoordinate, b: FactCoordinate) => a.entity_id === b.entity_id && a.fact_key === b.fact_key;

/**
 * 사실 판단(T-093) — Backend 가 근거를 모아 판단한 결과를 읽어 보여 주고, 사람이 확인 · 거절 · 정정한다.
 * AI 가 낸 값은 임시 사실일 뿐이며 이 화면의 사람 확인 없이는 확정되지 않는다.
 * `refreshKey` 가 바뀌면(Agent 상태가 바뀜) 다시 읽는다.
 */
export function FactsPanel({ recoveryRunId, actorId, refreshKey }: { recoveryRunId: string; actorId: string | null; refreshKey?: string | null }) {
  const facts = useAsyncAction((signal) => listFacts(recoveryRunId, signal));
  const { run: load } = facts;
  // Coordinates replaced by an action answer belong to the list they were made on; a fresh read drops them.
  const [replacedOn, setReplacedOn] = useState<{ base: FactList | null; items: FactCoordinate[] }>({ base: null, items: [] });

  useEffect(() => {
    load();
  }, [load, recoveryRunId, refreshKey]);

  const loaded = facts.state.status === "SUCCESS" ? facts.state.data : null;
  const replaced = replacedOn.base === loaded ? replacedOn.items : [];
  const onUpdated = (f: FactCoordinate) => setReplacedOn({ base: loaded, items: [...replaced.filter((p) => !sameCoordinate(p, f)), f] });
  const list = loaded ? loaded.facts.map((f) => replaced.find((r) => sameCoordinate(r, f)) ?? f) : [];

  return (
    <div data-testid="facts-panel" style={{ display: "grid", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 12.5 }}>사실 판단 — 근거와 사람 확인</b>
        <button type="button" className="act-btn" onClick={() => load()} disabled={facts.state.status === "LOADING"}>
          사실 새로 고침
        </button>
      </div>
      {facts.state.status === "FAILED" && (
        <div role="alert" className="badge b-red" style={{ whiteSpace: "normal", justifySelf: "start" }}>
          {factErrorText(facts.state.error.code, facts.state.error.message)}
        </div>
      )}
      {loaded && list.length === 0 && <div className="muted" style={{ fontSize: 12 }}>아직 판단할 사실이 없습니다 — 회신이 오면 여기에 올라옵니다.</div>}
      {list.map((f) => (
        <FactCard key={`${f.entity_id}:${f.fact_key}`} fact={f} actorId={actorId} onUpdated={onUpdated} />
      ))}
      {loaded && loaded.limitations.length > 0 && (
        <ul className="muted" style={{ margin: 0, paddingLeft: 16, fontSize: 11 }} data-testid="facts-limitations">
          {loaded.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
