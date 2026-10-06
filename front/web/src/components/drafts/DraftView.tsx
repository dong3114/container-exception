import { useState } from "react";
import { type Draft, reviseDraft } from "@/api/drafts";
import { describeApiError } from "@/api/errors";
import { useAsyncAction } from "@/state/async";
import { AsyncStatus } from "../workflow/AsyncStatus";
import { GateBlockers } from "../workflow/GateBlockers";
import { MessageLifecycle } from "../workflow/MessageLifecycle";

const BLOCK_LABEL: Record<Draft["blocked_reasons"][number], string> = {
  BLOCKED_NUMBER_CHECK: "본문의 숫자 · 날짜가 구조화 값과 다름(숫자 검사 실패)",
  RECIPIENT_NOT_ELIGIBLE: "받는 사람이 지금 발송 자격이 없음(Contact Gate)",
  CONTENT_MISSING: "메시지 내용을 내용 저장소에서 찾을 수 없음",
  NOT_PENDING_APPROVAL: "승인 대기 상태가 아님",
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

/** 초안 한 건 — Backend 가 정한 상태를 그대로 보여준다(숫자 검사 · 승인 가능 여부 · Contact Gate 모두 서버 판정). */
export function DraftView({ draft, onRevised }: { draft: Draft; onRevised: (d: Draft) => void }) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(draft.message.subject ?? "");
  const [body, setBody] = useState(draft.message.body ?? "");
  // 저장되면 부모가 새 메시지로 바꿔 그린다(key = message_id → 이 컴포넌트는 새로 시작한다).
  const revise = useAsyncAction(async (signal, s: string, b: string) => {
    const res = await reviseDraft(draft.message.message_id, { subject: s, body: b }, signal);
    onRevised(res.data);
    return res;
  });

  const m = draft.message;
  const check = draft.number_check;
  const editable = m.status === "DRAFTED" || m.status === "PENDING_APPROVAL";

  return (
    <div className="thread" data-testid="draft-view" data-message-id={m.message_id} data-approval-ready={draft.approval_ready} style={{ display: "grid", gap: 10 }}>
      <div className="thread-head" style={{ flexWrap: "wrap", gap: 6 }}>
        <span className="thread-name">{draft.thread.counterparty_name}</span>
        <span className="muted" style={{ fontSize: 12 }}>
          {draft.thread.contact_name} · <span className="mono">{draft.thread.normalized_address}</span>
        </span>
        <span className="badge b-outline">{m.drafted_by === "TEMPLATE" ? "템플릿 초안 · AI 미사용" : m.drafted_by === "HUMAN" ? "운영자 수정본" : "AI 문장 초안"}</span>
        {m.is_simulated && <span className="badge b-sim">MOCK 채널 · 실제 발송 없음</span>}
      </div>

      <div
        role="status"
        data-testid="approval-readiness"
        className={`badge ${draft.approval_ready ? "b-green" : "b-red"}`}
        style={{ justifySelf: "start", whiteSpace: "normal" }}
      >
        {draft.approval_ready ? "승인 단계로 넘길 수 있음 (승인은 다음 단계에서)" : "승인 단계로 넘길 수 없음"}
      </div>
      {!draft.approval_ready && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }} data-testid="blocked-reasons">
          {draft.blocked_reasons.map((r) => (
            <li key={r}>{BLOCK_LABEL[r]}</li>
          ))}
        </ul>
      )}

      <MessageLifecycle compact facts={{ status: m.status, invalidation: null, attemptInProgress: false }} />

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

      {editable && !editing && (
        <button type="button" className="act-btn" style={{ justifySelf: "start" }} onClick={() => setEditing(true)} data-testid="btn-edit-draft">
          본문 고치기
        </button>
      )}
      {editing && (
        <form
          style={{ display: "grid", gap: 6 }}
          onSubmit={(e) => {
            e.preventDefault();
            revise.run(subject, body);
          }}
        >
          <input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="제목" style={inputStyle} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} aria-label="본문" rows={7} style={inputStyle} data-testid="draft-edit-body" />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="submit" className="act-btn primary" data-testid="btn-save-revision" disabled={revise.state.status === "LOADING"}>
              고친 본문 저장 · 숫자 다시 검사
            </button>
            <button type="button" className="act-btn" onClick={() => setEditing(false)}>
              취소
            </button>
            <AsyncStatus state={revise.state} loadingLabel="저장 · 검사 중…" />
            {revise.state.status === "FAILED" && <span style={{ fontSize: 12 }}>{revise.state.error.message || describeApiError(revise.state.error)}</span>}
          </div>
          <span className="muted" style={{ fontSize: 11 }}>고치면 새 메시지가 되고(내용은 바뀌지 않는다) 이전 초안은 닫힌다. 구조화 값은 그대로다.</span>
        </form>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: "6px 8px", border: "1px solid var(--line-strong)", borderRadius: 6, font: "inherit", fontSize: 12.5 };
