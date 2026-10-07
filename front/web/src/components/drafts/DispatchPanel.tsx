import { useEffect } from "react";
import { type Draft, getDraft, sendDraft } from "@/api/drafts";
import { describeApiError } from "@/api/errors";
import { useAsyncAction } from "@/state/async";

type Dispatch = Draft["dispatch"];

const STATE_LABEL: Record<Dispatch["state"], string> = {
  NOT_REQUESTED: "발송 요청 전",
  QUEUED: "발송 대기",
  SENDING: "발송 중",
  RETRY_WAIT: "일시 실패 — 다시 시도 대기",
  SENT: "발송 완료",
  FAILED: "발송 실패",
};
const STATE_BADGE: Record<Dispatch["state"], string> = {
  NOT_REQUESTED: "b-outline",
  QUEUED: "b-blue",
  SENDING: "b-blue",
  RETRY_WAIT: "b-amber",
  SENT: "b-green",
  FAILED: "b-red",
};
const BLOCK_LABEL: Record<Dispatch["blocked_reasons"][number], string> = {
  ALREADY_SENT: "이미 발송됨",
  MESSAGE_SUPERSEDED: "새 수정본으로 대체된 초안",
  NOT_APPROVED: "아직 승인되지 않음",
  APPROVAL_MISSING: "유효한 승인이 없음",
  APPROVAL_EXPIRED: "승인 유효 기한이 지남 — 다시 승인 필요",
  APPROVAL_REVOKED: "승인이 취소됨 — 다시 승인 필요",
  APPROVAL_INVALIDATED: "승인이 풀림(내용 변경 · 계획 교체) — 다시 승인 필요",
  APPROVAL_CONTENT_MISMATCH: "승인한 내용과 지금 내용이 다름",
  APPROVAL_RECIPIENT_MISMATCH: "승인한 받는 사람과 지금 받는 사람이 다름",
  APPROVAL_COPY_INVALID: "승인 사본을 확인할 수 없음",
  CONTENT_HASH_MISMATCH: "저장된 내용이 메시지 지문과 맞지 않음",
  RECIPIENT_NOT_ELIGIBLE: "받는 사람이 지금 발송 자격이 없음(Contact Gate)",
  PLAN_SUPERSEDED: "근거 계획이 새 실행으로 바뀜",
  SIMULATION_MISMATCH: "가상 메시지는 실제 채널로 보낼 수 없음",
  CHANNEL_UNAVAILABLE: "이 채널은 아직 연결되지 않음",
};
const RESULT_LABEL: Record<NonNullable<Dispatch["attempts"][number]["result"]>, string> = {
  SUCCESS: "성공",
  RETRYABLE_FAILURE: "일시 실패",
  PERMANENT_FAILURE: "영구 실패",
  UNKNOWN: "결과 확인 중",
};
const ACTIVE: Dispatch["state"][] = ["QUEUED", "SENDING", "RETRY_WAIT"];
const POLL_MS = 2_000;
const time = (iso: string | null) => (iso ? iso.slice(0, 19).replace("T", " ") : "—");

/**
 * 발송 영역(T-090). [발송 요청]은 Backend 에 "검증 뒤 발송 대기열에 넣어 달라"고 요청할 뿐이다 — 실제 발송은 별도 Worker 가 한다.
 * 그래서 Worker 가 꺼져 있으면 "발송 대기"에 머무는 것이 정상이다. 대기 · 발송 중에는 화면이 상태를 다시 읽는다(Worker 를 직접 부르지 않는다).
 */
export function DispatchPanel({ draft, approverId, onChanged }: { draft: Draft; approverId: string | null; onChanged: (d: Draft) => void }) {
  const d = draft.dispatch;
  const m = draft.message;
  const request = useAsyncAction(async (signal, actor: string) => {
    const res = await sendDraft(m.message_id, m.content_hash, actor, signal);
    onChanged(res.data);
    return res;
  });
  const active = ACTIVE.includes(d.state);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      getDraft(m.message_id, controller.signal).then(
        (res) => {
          if (res.data.dispatch.state !== d.state || res.data.dispatch.attempts.length !== d.attempts.length || res.data.message.status !== m.status) onChanged(res.data);
        },
        () => undefined,
      );
    }, POLL_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [active, d.state, d.attempts.length, m.message_id, m.status, onChanged]);

  const showRequest = m.status === "APPROVED" && draft.approval.state === "ACTIVE";
  const last = d.attempts.at(-1) ?? null;

  return (
    <section data-testid="dispatch-panel" data-dispatch-state={d.state} style={{ display: "grid", gap: 6, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 12.5 }}>발송</b>
        <span className={`badge ${STATE_BADGE[d.state]}`} data-testid="dispatch-state">
          {STATE_LABEL[d.state]}
        </span>
        {d.sending_paused && active && <span className="badge b-amber">발송 일시 중지됨(kill switch) — 대기열에 머묾</span>}
        {d.state === "QUEUED" && !d.sending_paused && <span className="muted" style={{ fontSize: 11.5 }}>발송 Worker 가 처리하기를 기다리는 중</span>}
      </div>

      {(d.queued_at || d.sent_at || d.next_attempt_at) && (
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 10px", margin: 0, fontSize: 12 }} data-testid="dispatch-facts">
          {d.queued_at && (
            <>
              <dt className="muted">발송 요청</dt>
              <dd style={{ margin: 0 }} className="num">{time(d.queued_at)}</dd>
            </>
          )}
          {d.sent_at && (
            <>
              <dt className="muted">발송 완료</dt>
              <dd style={{ margin: 0 }} className="num" data-testid="sent-at">{time(d.sent_at)}</dd>
            </>
          )}
          {d.approval_id_used && (
            <>
              <dt className="muted">사용한 승인</dt>
              <dd style={{ margin: 0 }}>
                {draft.approval.current?.approval_id === d.approval_id_used
                  ? `${draft.approval.current.approver_name} · ${time(draft.approval.current.decided_at)} 승인`
                  : "이전 승인"}
              </dd>
            </>
          )}
          {d.next_attempt_at && (
            <>
              <dt className="muted">다음 시도</dt>
              <dd style={{ margin: 0 }} className="num">{time(d.next_attempt_at)}</dd>
            </>
          )}
        </dl>
      )}

      {d.attempts.length > 0 && (
        <div style={{ fontSize: 12 }} data-testid="dispatch-attempts">
          발송 시도 {d.attempts.length}회
          {last && (
            <span className="muted">
              {" "}
              · 마지막: {last.result ? RESULT_LABEL[last.result] : "진행 중"}
              {last.error_code ? ` (${last.error_code})` : ""}
              {last.reconciled ? " · 채널 조회로 확인" : ""}
            </span>
          )}
        </div>
      )}

      {d.dequeued_reason && (
        <div className="badge b-red" style={{ justifySelf: "start", whiteSpace: "normal" }} data-testid="dequeued">
          발송 직전 검사에서 막혀 대기열에서 빠졌습니다 — 사유를 확인한 뒤 다시 요청하세요
        </div>
      )}

      {d.blocked_reasons.length > 0 && (
        <div data-testid="send-blocked-reasons">
          <div className="muted" style={{ fontSize: 11.5 }}>지금 발송할 수 없는 이유</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
            {d.blocked_reasons.map((r) => (
              <li key={r}>{BLOCK_LABEL[r]}</li>
            ))}
          </ul>
        </div>
      )}

      {showRequest && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="act-btn primary"
            data-testid="btn-send"
            disabled={!d.can_request_send || !approverId || request.state.status === "LOADING"}
            onClick={() => approverId && request.run(approverId)}
          >
            발송 요청
          </button>
          <span className="muted" style={{ fontSize: 11 }}>승인한 내용 그대로 Mock 채널로 한 번 보냅니다(실제 메일 없음)</span>
          {request.state.status === "FAILED" && (
            <span role="alert" style={{ fontSize: 12 }} data-testid="send-error">
              {request.state.error.code ? `${request.state.error.code} — ` : ""}
              {request.state.error.message || describeApiError(request.state.error)}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
