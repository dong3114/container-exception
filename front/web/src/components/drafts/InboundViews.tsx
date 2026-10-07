import { useEffect } from "react";
import { type Draft, type InboundItem, getDraft, listInbound } from "@/api/drafts";
import { useAsyncAction } from "@/state/async";
import { AsyncStatus } from "../workflow/AsyncStatus";
import { ExtractionView } from "./ExtractionView";

/** 보류 사유(docs/19 15.5 실패표의 말) — Backend 가 수신 순간 정한 코드를 그대로 옮긴다. */
const HOLD_LABEL: Record<InboundItem["hold_reasons"][number], string> = {
  NO_MATCHING_THREAD: "연결할 문의 없음",
  AMBIGUOUS_THREAD: "어느 문의의 답인지 불명확",
  UNKNOWN_SENDER: "등록되지 않은 발신자",
  AMBIGUOUS_SENDER: "발신자 확인 필요",
  SENDER_INACTIVE: "비활성 거래처 · 연락처 · 주소",
  SENDER_UNVERIFIED: "확인되지 않은 주소",
  SENDER_NOT_APPROVED: "업무 관계 미승인 주소",
  OTHER_COUNTERPARTY: "다른 거래처 소속 주소",
  DIFFERENT_CONTACT: "다른 담당자 회신(문의한 주소가 아님)",
  SIMULATION_MISMATCH: "가상 · 실제 채널 불일치",
};
const REJECT_LABEL = { MISSING: "Date 헤더 없음", UNPARSEABLE: "Date 헤더 해석 불가", AFTER_CHANNEL_RECEIVED: "Date 가 채널 수신보다 미래" } as const;
const time = (iso: string | null) => (iso ? iso.slice(0, 19).replace("T", " ") : "—");
const POLL_MS = 3_000;

function InboundCard({ item, compact = false }: { item: InboundItem; compact?: boolean }) {
  const who = item.sender_label ? `${item.sender_label.counterparty_name} · ${item.sender_label.contact_name}` : "등록부에 없는 주소";
  return (
    <div className="msg in" data-testid="inbound-item" data-inbound-status={item.status} style={{ display: "grid", gap: 3 }}>
      <div className="msg-meta" style={{ flexWrap: "wrap", gap: 6 }}>
        <span className={`badge ${item.status === "NORMAL" ? "b-green" : "b-amber"}`}>{item.status === "NORMAL" ? "회신 · 문의에 연결됨" : "보류"}</span>
        <span className="mono" data-testid="inbound-from">{item.from_address}</span>
        <span className="muted">({who})</span>
        {item.is_simulated && <span className="badge b-sim">MOCK 채널</span>}
      </div>
      {item.status === "HOLD" && (
        <div style={{ fontSize: 12 }} data-testid="hold-reasons">
          보류 사유: {item.hold_reasons.map((r) => HOLD_LABEL[r]).join(" · ") || "—"}
        </div>
      )}
      {item.subject && <div style={{ fontWeight: 600, fontSize: 12.5 }}>{item.subject}</div>}
      {!compact && (
        <div style={{ fontSize: 12.5, whiteSpace: "pre-wrap" }} data-testid="inbound-preview">
          {item.content_available ? item.preview : "(원문을 찾을 수 없음)"}
        </div>
      )}
      {item.extraction && !compact && <ExtractionView extraction={item.extraction} />}
      <div className="muted" style={{ fontSize: 11 }}>
        받은 시각 {time(item.channel_received_at)} · 근거 시각 {time(item.evidence_time)} (
        {item.evidence_basis === "DATE_HEADER" ? "Date 헤더" : `채널 수신 시각${item.date_header_reject_reason ? ` — ${REJECT_LABEL[item.date_header_reject_reason]}` : ""}`})
        {item.thread_counterparty_name ? ` · 문의 상대 ${item.thread_counterparty_name}` : ""}
      </div>
    </div>
  );
}

/**
 * 이 문의의 받은 회신(T-091). 내용은 해석하지 않는다 — 원문 미리보기만. 회신을 기다리는 동안(발송 완료) 화면이 다시 읽는다.
 * 수량 · 시각 같은 값 추출과 사실 반영은 다음 단계(AI 추출 — 후보일 뿐)다.
 */
export function RepliesPanel({ draft, onChanged }: { draft: Draft; onChanged: (d: Draft) => void }) {
  const waiting = draft.message.status === "SENT" || draft.message.status === "REPLIED";
  const count = draft.replies.length;
  // 회신 수 · 상태 · AI 추출 진행이 바뀌면 다시 그린다(추출은 Worker 가 뒤에서 한다)
  const signature = JSON.stringify(draft.replies.map((r) => [r.raw_input_id, r.extraction?.state, r.extraction?.candidates.length, r.extraction?.failed_attempts]));
  useEffect(() => {
    if (!waiting) return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      getDraft(draft.message.message_id, controller.signal).then(
        (res) => {
          const next = JSON.stringify(res.data.replies.map((r) => [r.raw_input_id, r.extraction?.state, r.extraction?.candidates.length, r.extraction?.failed_attempts]));
          if (next !== signature || res.data.message.status !== draft.message.status) onChanged(res.data);
        },
        () => undefined,
      );
    }, POLL_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [waiting, signature, draft.message.message_id, draft.message.status, onChanged]);

  if (!waiting && count === 0) return null;
  return (
    <section data-testid="replies-panel" style={{ display: "grid", gap: 6, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <b style={{ fontSize: 12.5 }}>받은 회신</b>
        <span className="muted" style={{ fontSize: 11.5 }}>
          {count === 0 ? "아직 회신 없음 — 회신이 오면 여기에 나타납니다" : `${count}통 · AI 가 값 후보를 제안하고 Backend 가 검증합니다(확정 아님)`}
        </span>
      </div>
      {draft.replies.map((r) => (
        <InboundCard key={r.raw_input_id} item={r} />
      ))}
    </section>
  );
}

/** 수신 기록 · 보류함(T-091) — 보류된 메일도 버리지 않고 사유와 함께 보여 준다(FR-INB-06). 사람이 문의에 연결하는 기능은 다음 단계. */
export function InboundLog() {
  const inbox = useAsyncAction((signal) => listInbound(undefined, signal));
  const { run } = inbox;
  useEffect(() => {
    run();
    const timer = setInterval(run, 5_000);
    return () => clearInterval(timer);
  }, [run]);
  const items = inbox.state.status === "SUCCESS" ? inbox.state.data.items.slice(0, 8) : [];
  const held = items.filter((i) => i.status === "HOLD").length;
  return (
    <div data-testid="inbound-log">
      <div className="muted" style={{ fontSize: 11.5, marginBottom: 4, display: "flex", gap: 8, alignItems: "center" }}>
        수신 기록 · 보류함 (Backend){held > 0 && <span className="badge b-amber">보류 {held}</span>}
        <AsyncStatus state={inbox.state} onRetry={run} loadingLabel="" />
      </div>
      {inbox.state.status === "SUCCESS" && items.length === 0 && <div className="empty">아직 받은 메일이 없습니다.</div>}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
        {items.map((i) => (
          <li key={i.raw_input_id} data-testid="inbound-log-item" data-inbound-status={i.status} style={{ fontSize: 12 }}>
            {i.status === "NORMAL"
              ? `${i.thread_counterparty_name ?? i.sender_label?.counterparty_name ?? "상대"}에서 회신 도착`
              : `보류 — ${i.hold_reasons.map((r) => HOLD_LABEL[r]).join(" · ")}`}
            <span className="muted"> · {i.from_address} · {time(i.channel_received_at)}</span>
          </li>
        ))}
      </ul>
      {held > 0 && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ fontSize: 12, cursor: "pointer" }}>보류된 메일 보기</summary>
          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
            {items
              .filter((i) => i.status === "HOLD")
              .map((i) => (
                <InboundCard key={i.raw_input_id} item={i} />
              ))}
          </div>
        </details>
      )}
    </div>
  );
}

export { InboundCard };
