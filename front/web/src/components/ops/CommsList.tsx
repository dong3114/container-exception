import type { Draft } from "@/api/drafts";
import { useMe } from "@/app/MeContext";
import { DraftView } from "@/components/drafts/DraftView";
import { DELTA_LABEL, FOLLOW_UP_KIND, can, messageStatus, shortTime } from "./opsLabels";

export interface FollowUpTag {
  kind: "REQUEST" | "CORRECTION" | "CANCELLATION";
  delta: string;
  previous_quantity: number | null;
  quantity: number;
}

/**
 * 이 실행의 연락 — 문의 · 후속 요청 · 정정 · 취소와 받은 답장을 시간 순서로. 한 건을 열면 기존 초안 화면(승인 · 거절 · 발송 요청 · 답장 · 다시 읽기)이 그대로 열린다.
 * 버튼은 권한에 맞게 끄지만, 막는 것은 Backend 다. 이전 계획 기준 초안은 승인 · 발송이 막힌 이유를 보여 준다.
 */
export function CommsList({ drafts, tags, openId, onOpen, onChanged }: { drafts: Draft[]; tags: Map<string, FollowUpTag>; openId: string | null; onOpen: (id: string | null) => void; onChanged: (d: Draft) => void }) {
  const me = useMe();
  const approver = can(me, "communication.approve") ? (me?.actor_id ?? null) : null;
  const sorted = [...drafts].sort((a, b) => a.message.created_at.localeCompare(b.message.created_at));
  if (sorted.length === 0)
    return (
      <div className="muted" data-testid="comms-empty">
        이 실행에서 나간 문의 · 요청이 아직 없습니다.
      </div>
    );
  return (
    <div style={{ display: "grid", gap: 6 }} data-testid="comms-list">
      {!approver && <span className="muted">승인 · 발송 요청은 운영자 · 관리자만 할 수 있습니다.</span>}
      {sorted.map((d) => {
        const id = d.message.message_id;
        const tag = tags.get(id);
        const kind = tag ? FOLLOW_UP_KIND[tag.kind]! : { label: "[문의]", badge: "b-outline" };
        const st = messageStatus(d.message.status);
        const review = d.replies.some((r) => r.extraction?.needs_review);
        const superseded = d.blocked_reasons.includes("PLAN_SUPERSEDED");
        return (
          <div key={id} className="ops-subcard" data-testid="comm-item" data-message-id={id} data-kind={tag?.kind ?? "INQUIRY"} data-status={d.message.status}>
            <button type="button" className="ops-comm-head" onClick={() => onOpen(openId === id ? null : id)} aria-expanded={openId === id}>
              <span className={`badge ${kind.badge}`}>{kind.label}</span>
              <span className={`badge ${st.badge}`}>{st.label}</span>
              <span>
                → <b>{d.thread.counterparty_name}</b>
                {d.thread.contact_name ? ` · ${d.thread.contact_name}` : ""}
              </span>
              <span className="muted">{d.message.subject}</span>
              {tag && tag.kind !== "REQUEST" && (
                <span className="muted">
                  ({DELTA_LABEL[tag.delta] ?? tag.delta}
                  {tag.previous_quantity !== null ? ` · ${tag.previous_quantity} → ${tag.kind === "CANCELLATION" ? 0 : tag.quantity}` : ""})
                </span>
              )}
              {d.replies.length > 0 && <span className="badge b-green">✉ 답장 {d.replies.length}</span>}
              {review && <span className="badge b-amber">! 답장 검토 필요</span>}
              {superseded && <span className="badge b-orange">↻ 이전 계획 기준</span>}
              <span className="muted mono">{shortTime(d.dispatch.sent_at ?? d.message.created_at)}</span>
            </button>
            {superseded && (
              <span className="muted" style={{ fontSize: 12 }}>
                이 초안이 기댄 계획이 바뀌어 승인 · 발송할 수 없습니다. 새 계획의 후속 요청을 쓰세요.
              </span>
            )}
            {openId === id && <DraftView key={`${id}:${d.message.status}:${d.approval.history.length}:${d.replies.length}`} draft={d} approverId={approver} onChanged={onChanged} />}
          </div>
        );
      })}
    </div>
  );
}
