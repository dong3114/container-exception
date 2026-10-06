import {
  INVALIDATION_LABEL,
  MAIN_PATH,
  type MessageFacts,
  VISIBLE_STATE_LABEL,
  mainPathIndex,
  visibleMessageState,
} from "./lifecycle";

/**
 * Where an outbound inquiry is in its life: 작성 → 승인 → 발송 대기 → 발송 중 → 발송 완료 → 회신 (docs/19 15.1).
 * A failed send or a cancelled approval is flagged on the step it reached; an approval invalidated by a content or
 * plan change says that a new approval is needed (docs/19 FR-APV-06 · docs/22 15.3~15.5).
 */
export function MessageLifecycle({ facts, compact = false }: { facts: MessageFacts; compact?: boolean }) {
  const state = visibleMessageState(facts);
  const reached = mainPathIndex(state);
  const flagged = state === "SEND_FAILED" || state === "CANCELLED" || state === "NEEDS_FIX";
  return (
    <div data-testid="message-lifecycle" data-state={state} style={{ display: "grid", gap: 4 }}>
      {!compact && (
        <ol aria-label="메시지 진행 단계" style={{ display: "flex", gap: 4, listStyle: "none", margin: 0, padding: 0, flexWrap: "wrap" }}>
          {MAIN_PATH.map((step, i) => {
            const done = reached >= 0 && i < reached;
            const current = i === reached;
            return (
              <li
                key={step}
                aria-current={current ? "step" : undefined}
                className={`badge ${current ? (flagged ? "b-red" : "b-blue") : done ? "b-slate" : "b-outline"}`}
                style={{ opacity: done || current ? 1 : 0.55 }}
              >
                {VISIBLE_STATE_LABEL[step]}
              </li>
            );
          })}
        </ol>
      )}
      <span className={`badge ${flagged ? "b-red" : "b-blue"}`} style={{ justifySelf: "start" }}>
        {VISIBLE_STATE_LABEL[state]}
      </span>
      {facts.invalidation && (
        <span className="muted" style={{ fontSize: 11.5 }} data-testid="approval-invalidated">
          {INVALIDATION_LABEL[facts.invalidation]}
        </span>
      )}
    </div>
  );
}
