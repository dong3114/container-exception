import { EmptyState } from "@/components/ui/primitives";
import { ACTION_KIND_LABEL, shortTime } from "./opsLabels";
import type { ActionItem } from "./opsModel";

/**
 * 첫 화면 — 지금 사람이 해야 할 일. 코드가 아니라 쉬운 말로: 무슨 일(종류) · 왜(이유) · 무엇에 대해(대상 · 실행) · 언제 생겼나 · 바로 가기.
 * 종류 표시는 심각도가 아니다(Backend 에 심각도가 없다) — 승인 · 검토 · 선택처럼 "어떤 손이 필요한가"만 말한다.
 */
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
        <span className="card-meta">CERA 가 사람을 기다리는 일만 모았습니다</span>
      </div>
      <div className="card-body action-list">
        {actions.length === 0 && (
          <EmptyState icon="✓" title="지금 사람이 처리할 일이 없습니다." testId="action-empty">
            CERA 가 진행 중인 일은 ‘복구 실행’에서 볼 수 있습니다. 새 예외가 탐지되거나 승인 · 검토가 필요해지면 여기에 나타납니다.
          </EmptyState>
        )}
        {actions.map((a) => {
          const kind = ACTION_KIND_LABEL[a.kind ?? "CONFIRM"];
          return (
            <button key={a.key} type="button" className={`ops-action kind-${(a.kind ?? "CONFIRM").toLowerCase()}`} onClick={() => onOpen(a)} data-testid="action-item" data-action-key={a.key} data-kind={a.kind ?? ""}>
              <span className="ops-action-icon" aria-hidden>
                {a.icon}
              </span>
              <span className="ops-action-text">
                <span className="ops-action-title">
                  <span className={`badge ${kind.badge}`} data-testid="action-kind">
                    {kind.label}
                  </span>
                  <b>{a.title}</b>
                </span>
                {a.detail && <span className="ops-action-why">{a.detail}</span>}
                <span className="ops-action-meta">
                  {a.target && <span>대상 {a.target}</span>}
                  <span>{runLabel(a.runId)}</span>
                  {a.at && <span data-testid="action-at">발생 {shortTime(a.at)}</span>}
                </span>
              </span>
              <span className="ops-action-go" data-testid="action-cta">
                {a.cta ?? "열기 →"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
