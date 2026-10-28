import type { ActionItem } from "./opsModel";

/** 첫 화면 — 지금 사람이 해야 할 일. 코드가 아니라 쉬운 말로, 무엇에 대한 일인지와 함께 */
export function ActionRequired({ actions, runLabel, onOpen }: { actions: ActionItem[]; runLabel: (runId: string | null) => string; onOpen: (a: ActionItem) => void }) {
  return (
    <section className="card" data-testid="action-required" aria-labelledby="action-required-title">
      <div className="card-head">
        <span className="card-title" id="action-required-title">
          지금 해야 할 일
        </span>
        <span className={`badge ${actions.length ? "b-amber" : "b-green"}`} data-testid="action-count">
          {actions.length ? `⚠ ${actions.length}건` : "✓ 없음"}
        </span>
      </div>
      <div className="card-body" style={{ display: "grid", gap: 6 }}>
        {actions.length === 0 && (
          <div className="muted" data-testid="action-empty">
            지금 사람이 처리할 일이 없습니다. 진행 중인 일은 실행 목록에서 볼 수 있습니다.
          </div>
        )}
        {actions.map((a, i) => (
          <button key={a.key} type="button" className="ops-action" onClick={() => onOpen(a)} data-testid="action-item" data-action-key={a.key}>
            <span className="ops-action-icon" aria-hidden>
              {a.icon}
            </span>
            <span style={{ display: "grid", gap: 2, textAlign: "left" }}>
              <b>
                {i + 1}. {a.title}
              </b>
              <span className="muted" style={{ fontSize: 12 }}>
                {a.target ? `${a.target} · ` : ""}
                {runLabel(a.runId)}
                {a.detail ? ` — ${a.detail}` : ""}
              </span>
            </span>
            <span className="ops-action-go" data-testid="action-cta">{a.cta ?? "열기 →"}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
