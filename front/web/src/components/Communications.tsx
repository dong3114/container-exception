import type { CommunicationThread } from "@/contracts/cera";
import { hm } from "./format";

const STATE: Record<CommunicationThread["state"], [string, string]> = {
  DRAFT: ["b-outline", "초안 · 승인 대기"],
  AWAITING_REPLY: ["b-blue", "발송(가상) · 회신 대기"],
  REPLIED: ["b-green", "회신 받음"],
};

export function Communications({ threads }: { threads: CommunicationThread[] }) {
  return (
    <section className="card" data-testid="communications">
      <div className="card-head">
        <span className="card-title">외부 채널 커뮤니케이션</span>
        <span className="badge b-sim">가상 메일함 · 실제 발송 없음</span>
        <span className="card-meta">{threads.length}개 스레드</span>
      </div>
      <div className="card-body">
        {threads.length === 0 && <div className="empty">진행 중인 연락 초안이 없습니다.</div>}
        {threads.map((th) => {
          const [tone, label] = STATE[th.state];
          return (
            <div className="thread" key={th.thread_id} data-testid={`thread-${th.thread_id}`}>
              <div className="thread-head">
                <span className="thread-name">{th.counterparty}</span>
                <span className="muted" style={{ fontSize: 12 }}>{th.purpose}</span>
                <span className={`badge ${tone}`} style={{ marginLeft: "auto" }}>
                  {label}
                </span>
              </div>
              {th.messages.map((m) => (
                <div key={m.message_id} className={`msg ${m.direction === "OUT" ? "out" : "in"}`}>
                  <div className="msg-meta">
                    <b>{m.direction === "OUT" ? "발신" : "회신"}</b>
                    {m.at && <span className="num">{hm(m.at)}</span>}
                    {m.direction === "OUT" && m.status === "DRAFT" && <span className="badge b-outline">초안 (사람 승인 전 발송 불가)</span>}
                    {m.subject && <span style={{ fontWeight: 600, color: "var(--text)" }}>{m.subject}</span>}
                  </div>
                  <div style={{ fontSize: 12.5, whiteSpace: "pre-wrap" }}>{m.body}</div>
                  {m.extraction && (
                    <div className="extract">
                      <span className="badge b-amber b-dashed">추출 · {m.extraction.value_status === "PROVISIONAL" ? "잠정" : m.extraction.value_status}</span>
                      {m.extraction.fields.map((f) => (
                        <span key={f.field} className="badge b-outline" title={`근거: "${f.evidence}"`}>
                          {f.field} = <b>{String(f.value)}</b>
                        </span>
                      ))}
                      <span className="muted" style={{ fontSize: 11, marginLeft: "auto" }}>
                        {m.extraction.method}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
