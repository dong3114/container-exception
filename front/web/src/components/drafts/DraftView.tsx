import { useState } from "react";
import { type Draft, approveDraft, rejectDraft, reviseDraft, revokeApproval } from "@/api/drafts";
import { describeApiError } from "@/api/errors";
import { useAsyncAction } from "@/state/async";
import { AsyncStatus } from "../workflow/AsyncStatus";
import { DispatchPanel } from "./DispatchPanel";
import { RepliesPanel } from "./InboundViews";
import { GateBlockers } from "../workflow/GateBlockers";
import { MessageLifecycle } from "../workflow/MessageLifecycle";
import { INVALIDATION_LABEL } from "../workflow/lifecycle";

const BLOCK_LABEL: Record<Draft["blocked_reasons"][number], string> = {
  BLOCKED_NUMBER_CHECK: "본문의 숫자 · 날짜가 구조화 값과 다름(숫자 검사 실패)",
  RECIPIENT_NOT_ELIGIBLE: "받는 사람이 지금 발송 자격이 없음(Contact Gate)",
  CONTENT_MISSING: "메시지 내용을 내용 저장소에서 찾을 수 없음",
  CONTENT_HASH_MISMATCH: "저장된 내용이 메시지 지문과 맞지 않음(내용 무결성)",
  PLAN_SUPERSEDED: "근거 계획이 새 실행으로 바뀜 — 새 계획으로 문의를 다시 만들어야 함",
  MESSAGE_SUPERSEDED: "새 수정본으로 대체된 초안 — 최신 수정본을 승인해야 함",
  NOT_PENDING_APPROVAL: "승인 대기 상태가 아님",
  ALREADY_APPROVED: "이미 이 내용으로 승인됨",
};
const APPROVAL_STATE_LABEL: Record<Draft["approval"]["state"], string> = {
  NONE: "승인 전",
  ACTIVE: "승인됨",
  EXPIRED: "승인 기한 지남 — 다시 승인해야 합니다",
  REVOKED: INVALIDATION_LABEL.USER_REVOKED,
  INVALIDATED: "승인이 풀렸습니다",
  REJECTED: "반려됨",
};
const KIND_LABEL = { DATE: "날짜", TIME: "시각", MONEY: "금액", QUANTITY: "수량" } as const;
const KEY_LABEL: Record<string, string> = { quantity: "수량", date: "날짜", window_from: "시작 시각", window_to: "종료 시각", leg: "구간", size_type: "규격" };
const GATE_LABEL: Record<string, string> = {
  COUNTERPARTY_INACTIVE: "거래처 비활성",
  CONTACT_INACTIVE: "연락처 비활성",
  NOT_ACTIVE: "통신 중지 · 비활성",
  NOT_VERIFIED: "주소 미확인",
  NOT_APPROVED: "업무 관계 미승인",
  NOT_IN_TEST_ALLOWLIST: "개발 환경 수신자 목록 밖",
};
/** 수정 화면에서 바꿀 수 있는 값 — 질문 대상을 정하는 날짜 · 시간창 · 규격은 바꾸지 않는다(새 문의로). */
const EDITABLE_VALUE_KEYS = new Set(["quantity"]);

const shortHash = (h: string) => `${h.slice(0, 15)}…`;
const time = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "—");

/**
 * 초안 한 건 — Backend 가 정한 상태를 그대로 보여준다(숫자 검사 · Contact Gate · 승인 가능 여부 · 승인 상태 모두 서버 판정).
 * 승인 · 반려 · 승인 취소 버튼은 NestJS API 를 부른다. 화면은 지금 보고 있는 내용의 content_hash 와 승인자만 보내고,
 * 승인 여부를 스스로 정하거나 저장하지 않는다.
 */
export function DraftView({ draft, approverId, onChanged }: { draft: Draft; approverId: string | null; onChanged: (d: Draft) => void }) {
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [subject, setSubject] = useState(draft.message.subject ?? "");
  const [body, setBody] = useState(draft.message.body ?? "");
  const [reason, setReason] = useState("");
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(draft.structured_values.filter((v) => EDITABLE_VALUE_KEYS.has(v.key)).map((v) => [v.key, v.value_number ?? ""])),
  );
  const m = draft.message;
  // 결정 · 수정 결과는 새 초안 상태로 돌아온다 — 부모가 그 상태로 다시 그린다(key = message_id).
  const done = <T extends { data: Draft }>(res: T) => {
    onChanged(res.data);
    return res;
  };
  const revise = useAsyncAction(async (signal) => {
    const changed = draft.structured_values.some((v) => EDITABLE_VALUE_KEYS.has(v.key) && (values[v.key] ?? "") !== (v.value_number ?? ""));
    const nextValues = changed
      ? draft.structured_values.map((v) => ({
          key: v.key,
          value_number: EDITABLE_VALUE_KEYS.has(v.key) ? Number(values[v.key]) : v.value_number === null ? null : Number(v.value_number),
          value_text: v.value_text,
          unit: v.unit,
        }))
      : undefined;
    return done(await reviseDraft(m.message_id, { subject, body, ...(nextValues ? { values: nextValues } : {}) }, signal));
  });
  const approve = useAsyncAction(async (signal, actor: string) => done(await approveDraft(m.message_id, m.content_hash, actor, signal)));
  const reject = useAsyncAction(async (signal, actor: string, why: string) => done(await rejectDraft(m.message_id, m.content_hash, why, actor, signal)));
  const revoke = useAsyncAction(async (signal, actor: string, approvalId: string) => done(await revokeApproval(approvalId, null, actor, signal)));

  const check = draft.number_check;
  const approval = draft.approval;
  const current = approval.current;
  const editable = m.status === "DRAFTED" || m.status === "PENDING_APPROVAL" || m.status === "APPROVED" || m.status === "REJECTED";
  const ended = approval.state === "REVOKED" || approval.state === "INVALIDATED" ? (approval.ended_by?.invalidation_cause ?? null) : null;
  const busy = [approve, reject, revoke].some((a) => a.state.status === "LOADING");
  const failed = [approve, reject, revoke].find((a) => a.state.status === "FAILED")?.state;

  return (
    <div className="thread" data-testid="draft-view" data-message-id={m.message_id} data-approval-ready={draft.approval_ready} data-approval-state={approval.state} style={{ display: "grid", gap: 10 }}>
      <div className="thread-head" style={{ flexWrap: "wrap", gap: 6 }}>
        <span className="thread-name">{draft.thread.counterparty_name}</span>
        <span className="muted" style={{ fontSize: 12 }}>
          {draft.thread.contact_name} · <span className="mono">{draft.thread.normalized_address}</span>
        </span>
        <span className="badge b-outline">{m.drafted_by === "TEMPLATE" ? "템플릿 초안 · AI 미사용" : m.drafted_by === "HUMAN" ? "운영자 수정본" : "AI 문장 초안"}</span>
        {m.is_simulated && <span className="badge b-sim">MOCK 채널 · 실제 발송 없음</span>}
      </div>

      {draft.revision.previous_approval_invalidated === "CONTENT_CHANGED" && approval.state === "NONE" && (
        <div role="alert" className="badge b-amber" data-testid="reapproval-required" style={{ justifySelf: "start", whiteSpace: "normal" }}>
          내용 변경으로 재승인 필요 — 이전 수정본의 승인은 무효가 됐습니다
        </div>
      )}
      {m.status === "CLOSED" && draft.revision.next_message_id && (
        <div className="badge b-outline" data-testid="superseded" style={{ justifySelf: "start", whiteSpace: "normal" }}>
          새 수정본으로 대체된 초안입니다 — 이 초안의 승인은 발송에 쓸 수 없습니다
        </div>
      )}

      <MessageLifecycle compact facts={{ status: m.status, invalidation: ended, attemptInProgress: draft.dispatch.state === "SENDING" }} />

      {draft.question && (
        <section>
          <div className="muted" style={{ fontSize: 11.5 }}>질문 {draft.question.ask_id}</div>
          <div style={{ fontWeight: 600 }}>{draft.question.question_text}</div>
          <div className="muted mono" style={{ fontSize: 11 }}>
            대상 {draft.question.target_name} · 답을 붙일 사실 {draft.question.target_fact_key} · 기대 단위 {draft.question.expected_unit}
          </div>
        </section>
      )}

      <section className="msg out">
        <div className="msg-meta">
          <b>메시지 초안</b>
          {m.subject && <span style={{ fontWeight: 600, color: "var(--text)" }}>{m.subject}</span>}
        </div>
        <div style={{ fontSize: 12.5, whiteSpace: "pre-wrap" }} data-testid="draft-body">
          {m.body ?? "(내용을 찾을 수 없음)"}
        </div>
        <div className="muted mono" style={{ fontSize: 10.5 }} title={m.content_hash}>
          내용 지문 {shortHash(m.content_hash)} (받는 사람 · 제목 · 본문 · 구조화 값)
        </div>
      </section>

      <section>
        <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>
          구조화 값 — 문장의 숫자가 아니라 이 값이 정본이다 {draft.plan_based ? `· 계획 기반(${draft.source_run?.trigger_ref ?? "실행"})` : "· 계획 무관(운영자 입력)"}
        </div>
        <table style={{ borderCollapse: "collapse", fontSize: 12 }} data-testid="structured-values">
          <tbody>
            {draft.structured_values.map((v) => (
              <tr key={v.key}>
                <td style={{ padding: "2px 10px 2px 0" }}>{KEY_LABEL[v.key] ?? v.key}</td>
                <td style={{ padding: "2px 10px 2px 0", fontWeight: 600 }} className="num">
                  {v.value_number ?? v.value_text} {v.unit ?? ""}
                </td>
                <td className="muted mono" style={{ fontSize: 11 }}>
                  {v.source_run_id ? `계획 ${draft.source_run?.trigger_ref ?? v.source_run_id.slice(0, 8)} · ${v.source_path}` : "직접 입력"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section data-testid="number-check" data-status={check?.status ?? "NONE"}>
        {check?.passed && (
          <span className="badge b-green">숫자 검사 통과 · 제목 · 본문의 숫자 {check.tokens.length}곳이 모두 구조화 값과 일치</span>
        )}
        {check && !check.passed && (
          <div style={{ display: "grid", gap: 4 }}>
            <span className="badge b-red" style={{ justifySelf: "start" }}>숫자 검사 실패 (BLOCKED_NUMBER_CHECK)</span>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
              {check.unmatched.map((t, i) => (
                <li key={`${t.text}-${i}`}>
                  본문의 {KIND_LABEL[t.kind]} <b className="mono">{t.text}</b> — 구조화 값에 없음
                </li>
              ))}
            </ul>
          </div>
        )}
        {check && check.not_mentioned.length > 0 && (
          <div className="muted" style={{ fontSize: 11.5 }}>본문에 나오지 않은 값: {check.not_mentioned.map((k) => KEY_LABEL[k] ?? k).join(", ")}</div>
        )}
      </section>

      {draft.contact_gate && !draft.contact_gate.eligible && (
        <GateBlockers channel={m.channel_type} reasons={draft.contact_gate.reasons.map((r) => ({ code: r.code, label: GATE_LABEL[r.code] ?? r.code, layer: r.layer }))} />
      )}

      <section data-testid="approval-panel" style={{ display: "grid", gap: 6, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: 12.5 }}>발송 승인</b>
          <span
            data-testid="approval-state"
            className={`badge ${approval.state === "ACTIVE" ? "b-green" : approval.state === "NONE" ? "b-outline" : "b-red"}`}
            style={{ whiteSpace: "normal" }}
          >
            {approval.state === "INVALIDATED" && ended ? INVALIDATION_LABEL[ended] : APPROVAL_STATE_LABEL[approval.state]}
          </span>
          {approval.state === "ACTIVE" && (
            <span className="badge b-outline">{draft.dispatch.state === "SENT" ? "이 승인으로 발송됨" : approval.usable_for_send ? "발송에 쓸 수 있는 승인" : "발송에 쓸 수 없음"}</span>
          )}
        </div>

        {current && (
          <dl data-testid="approval-snapshot" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 10px", margin: 0, fontSize: 12 }}>
            <dt className="muted">승인자</dt>
            <dd style={{ margin: 0 }} data-testid="approver-name">{current.approver_name}</dd>
            <dt className="muted">승인 시각</dt>
            <dd style={{ margin: 0 }} className="num">{time(current.decided_at)}</dd>
            <dt className="muted">유효 기한</dt>
            <dd style={{ margin: 0 }} className="num">{time(current.expires_at)}</dd>
            <dt className="muted">승인한 내용</dt>
            <dd style={{ margin: 0 }} className="mono" title={current.approved_content_hash}>
              {shortHash(current.approved_content_hash)} {current.approved_content_hash === m.content_hash ? "· 지금 내용과 같음" : "· 지금 내용과 다름"}
              {current.copy_verified ? " · 승인 사본 확인됨" : " · 승인 사본 확인 실패"}
            </dd>
            {current.approved_plan_run_id && (
              <>
                <dt className="muted">근거 계획</dt>
                <dd style={{ margin: 0 }} className="mono">
                  {draft.source_run?.run_id === current.approved_plan_run_id ? draft.source_run.trigger_ref : current.approved_plan_run_id.slice(0, 8)}
                </dd>
              </>
            )}
          </dl>
        )}
        {approval.ended_by && (approval.state === "REVOKED" || approval.state === "INVALIDATED") && (
          <div className="muted" style={{ fontSize: 11.5 }} data-testid="approval-ended">
            {approval.state === "REVOKED" ? "취소" : "무효 처리"}: {approval.ended_by.actor_type === "SYSTEM" ? "시스템" : approval.ended_by.actor_name} · {time(approval.ended_by.decided_at)}
            {approval.ended_by.reason ? ` · ${approval.ended_by.reason}` : ""}
          </div>
        )}
        {approval.rejection && approval.state === "REJECTED" && (
          <div style={{ fontSize: 12 }} data-testid="rejection">
            반려 사유: {approval.rejection.reason} <span className="muted">({approval.rejection.actor_name} · {time(approval.rejection.decided_at)})</span>
          </div>
        )}

        {!draft.approval_ready && approval.state !== "ACTIVE" && (
          <div data-testid="blocked-reasons">
            <div className="muted" style={{ fontSize: 11.5 }}>지금 승인할 수 없는 이유</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
              {draft.blocked_reasons.map((r) => (
                <li key={r}>{BLOCK_LABEL[r]}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {approval.state !== "ACTIVE" && (
            <button
              type="button"
              className="act-btn primary"
              data-testid="btn-approve"
              disabled={!draft.approval_ready || !approverId || busy}
              onClick={() => approverId && approve.run(approverId)}
            >
              {approval.state === "NONE" ? "이 내용으로 승인" : "이 내용으로 다시 승인"}
            </button>
          )}
          {m.status === "PENDING_APPROVAL" && !rejecting && (
            <button type="button" className="act-btn" data-testid="btn-reject" disabled={!approverId || busy} onClick={() => setRejecting(true)}>
              반려
            </button>
          )}
          {approval.state === "ACTIVE" && current && (m.status === "APPROVED" || (m.status === "QUEUED" && draft.dispatch.state === "QUEUED")) && (
            <button type="button" className="act-btn" data-testid="btn-revoke" disabled={!approverId || busy} onClick={() => approverId && revoke.run(approverId, current.approval_id)}>
              승인 취소
            </button>
          )}
          {!approverId && <span className="muted" style={{ fontSize: 11.5 }}>승인자를 먼저 고르세요</span>}
          {busy && <span className="muted" style={{ fontSize: 11.5 }}>처리 중…</span>}
          {failed?.status === "FAILED" && (
            <span role="alert" style={{ fontSize: 12 }} data-testid="approval-error">
              {failed.error.code ? `${failed.error.code} — ` : ""}
              {failed.error.message || describeApiError(failed.error)}
            </span>
          )}
        </div>
        {rejecting && (
          <form
            style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}
            onSubmit={(e) => {
              e.preventDefault();
              if (approverId && reason.trim()) reject.run(approverId, reason.trim());
            }}
          >
            <input value={reason} onChange={(e) => setReason(e.target.value)} aria-label="반려 사유" placeholder="반려 사유(필수)" style={{ ...inputStyle, minWidth: 220 }} data-testid="reject-reason" />
            <button type="submit" className="act-btn" disabled={!reason.trim() || busy} data-testid="btn-confirm-reject">
              반려 확정
            </button>
            <button type="button" className="act-btn" onClick={() => setRejecting(false)}>
              취소
            </button>
          </form>
        )}
      </section>

      <DispatchPanel draft={draft} approverId={approverId} onChanged={onChanged} />
      <RepliesPanel draft={draft} onChanged={onChanged} />

      {editable && !editing && (
        <button type="button" className="act-btn" style={{ justifySelf: "start" }} onClick={() => setEditing(true)} data-testid="btn-edit-draft">
          본문 · 수량 고치기
        </button>
      )}
      {editing && (
        <form
          style={{ display: "grid", gap: 6 }}
          onSubmit={(e) => {
            e.preventDefault();
            revise.run();
          }}
        >
          <input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="제목" style={inputStyle} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} aria-label="본문" rows={7} style={inputStyle} data-testid="draft-edit-body" />
          {Object.keys(values).map((key) => (
            <label key={key} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
              {KEY_LABEL[key] ?? key}
              <input
                type="number"
                min={1}
                value={values[key]}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                style={{ ...inputStyle, width: 80 }}
                data-testid={`edit-value-${key}`}
              />
            </label>
          ))}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="submit" className="act-btn primary" data-testid="btn-save-revision" disabled={revise.state.status === "LOADING"}>
              고친 내용 저장 · 숫자 다시 검사
            </button>
            <button type="button" className="act-btn" onClick={() => setEditing(false)}>
              취소
            </button>
            <AsyncStatus state={revise.state} loadingLabel="저장 · 검사 중…" />
            {revise.state.status === "FAILED" && <span style={{ fontSize: 12 }}>{revise.state.error.message || describeApiError(revise.state.error)}</span>}
          </div>
          <span className="muted" style={{ fontSize: 11 }}>
            고치면 새 메시지가 되고(내용은 바뀌지 않는다) 이전 초안은 닫힌다. 승인된 초안을 고치면 그 승인은 무효가 되어 다시 승인해야 한다. 바꾼 수량은 계획 값이 아니라
            직접 입력 값이 된다.
          </span>
        </form>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: "6px 8px", border: "1px solid var(--line-strong)", borderRadius: 6, font: "inherit", fontSize: 12.5 };
