import type { Draft } from "@/api/drafts";
import { useMe } from "@/app/MeContext";
import { DraftView } from "@/components/drafts/DraftView";
import { EmptyState } from "@/components/ui/primitives";
import type { FactCoordinate } from "@/api/truth";
import { DELTA_LABEL, FOLLOW_UP_KIND, can, messageStatus, shortTime } from "./opsLabels";
import { questionAnswered } from "./opsModel";

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
export function CommsList({ drafts, tags, openId, onOpen, onChanged, facts = [] }: { drafts: Draft[]; tags: Map<string, FollowUpTag>; openId: string | null; onOpen: (id: string | null) => void; onChanged: (d: Draft) => void; facts?: FactCoordinate[] }) {
  const me = useMe();
  const approver = can(me, "communication.approve") ? (me?.actor_id ?? null) : null;
  const sorted = [...drafts].sort((a, b) => a.message.created_at.localeCompare(b.message.created_at));
  if (sorted.length === 0)
    return (
      <EmptyState icon="✉" title="이 실행에서 나간 문의 · 요청이 아직 없습니다." testId="comms-empty">
        Agent 가 확인이 필요한 정보를 찾으면 담당 업체에 보낼 문의 초안을 만듭니다. 초안은 사람이 승인해야 나갑니다.
      </EmptyState>
    );
  return (
    <div style={{ display: "grid", gap: 6 }} data-testid="comms-list">
      <div className="sub-head">
        <b>연락</b>
        <span className="muted">문의 · 후속 요청 · 정정 · 취소와 받은 답장 — 한 건을 열면 승인 · 발송 요청 · 답장 검토를 합니다</span>
      </div>
      {!approver && <span className="muted">승인 · 발송 요청은 운영자 · 관리자만 할 수 있습니다.</span>}
      {sorted.map((d) => {
        const id = d.message.message_id;
        const tag = tags.get(id);
        const kind = tag ? FOLLOW_UP_KIND[tag.kind]! : { label: "[문의]", badge: "b-outline" };
        const st = messageStatus(d.message.status);
        const answered = questionAnswered(d, facts);
        // 답장의 검토 표시는 Backend 그대로 두되, 물은 정보가 이미 채워졌으면 '처리 완료'로 보인다(아직 할 일로 오해하지 않게)
        const review = d.replies.some((r) => r.extraction?.needs_review) && !answered;
        const reviewDone = d.replies.some((r) => r.extraction?.needs_review) && answered;
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
              {d.plan_based && <span className="badge b-outline" title="복구 계획에서 나온 요청">▣ 계획 근거{d.source_run?.trigger_ref ? ` · ${d.source_run.trigger_ref}` : ""}</span>}
              {d.replies.length > 0 && <span className="badge b-green">✉ 답장 {d.replies.length}</span>}
              {review && <span className="badge b-amber">! 답장 검토 필요</span>}
              {reviewDone && <span className="badge b-green" data-testid="review-done">✓ 처리 완료(정보가 이미 채워짐)</span>}
              {superseded && <span className="badge b-orange">↻ 이전 계획 기준</span>}
              <span className="muted mono">{shortTime(d.dispatch.sent_at ?? d.message.created_at)}</span>
            </button>
            {superseded && (
              <span className="muted" style={{ fontSize: 12 }}>
                이 초안이 기댄 계획이 바뀌어 승인 · 발송할 수 없습니다. 새 계획의 후속 요청을 쓰세요.
              </span>
            )}
            {openId === id && reviewDone && (
              <span className="muted" style={{ fontSize: 12 }}>
                이 답장에서 AI 가 값을 얻지 못했지만, 물은 정보는 이미 다른 길(직접 입력 등)로 채워졌습니다 — 다시 추출할 필요가 없습니다.
              </span>
            )}
            {openId === id && <DraftView key={`${id}:${d.message.status}:${d.approval.history.length}:${d.replies.length}`} draft={d} approverId={approver} onChanged={onChanged} />}
          </div>
        );
      })}
    </div>
  );
}
