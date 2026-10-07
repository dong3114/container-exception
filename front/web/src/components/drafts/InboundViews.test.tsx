import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Draft, InboundItem } from "@/api/drafts";
import { InboundCard, RepliesPanel } from "./InboundViews";

const item = (over: Partial<InboundItem> = {}): InboundItem => ({
  raw_input_id: "01a11040-0000-7000-8000-0000000000d1",
  message_id: "01a11040-0000-7000-8000-0000000000d2",
  status: "NORMAL",
  hold_reasons: [],
  from_address: "dispatch@k-trucking.example.invalid",
  sender_label: { counterparty_name: "K운송 (가상)", contact_name: "배차팀" },
  subject: "Re: [문의 Q1] 트럭 2대",
  preview: "15:00~17:00 2대 가능합니다.",
  channel_received_at: "2026-10-07T15:10:00.000+09:00",
  received_at: "2026-10-07T15:10:02.000+09:00",
  evidence_time: "2026-10-07T15:09:58.000+09:00",
  evidence_basis: "DATE_HEADER",
  date_header_reject_reason: null,
  thread_id: "01a11040-0000-7000-8000-000000000002",
  thread_counterparty_name: "K운송 (가상)",
  is_simulated: true,
  content_available: true,
  ...over,
});

const draft = (status: Draft["message"]["status"], replies: InboundItem[]) =>
  ({ message: { message_id: "01a11040-0000-7000-8000-000000000001", status }, replies }) as unknown as Draft;

describe("received mail — shown as received, not interpreted", () => {
  it("a normal reply shows sender, who it is, received and evidence time, and a preview", () => {
    const html = renderToStaticMarkup(<InboundCard item={item()} />);
    expect(html).toContain('data-inbound-status="NORMAL"');
    expect(html).toContain("회신 · 문의에 연결됨");
    expect(html).toContain("dispatch@k-trucking.example.invalid");
    expect(html).toContain("K운송 (가상) · 배차팀");
    expect(html).toContain("받은 시각 2026-10-07 15:10:00");
    expect(html).toContain("근거 시각 2026-10-07 15:09:58 (Date 헤더)");
    expect(html).toContain("15:00~17:00 2대 가능합니다.");
  });

  it("a held mail says why and is still shown (never discarded)", () => {
    const html = renderToStaticMarkup(
      <InboundCard
        item={item({
          status: "HOLD",
          message_id: null,
          hold_reasons: ["UNKNOWN_SENDER"],
          from_address: "stranger@example.invalid",
          sender_label: null,
          thread_id: null,
          thread_counterparty_name: null,
          evidence_basis: "CHANNEL_RECEIVED",
          date_header_reject_reason: "AFTER_CHANNEL_RECEIVED",
        })}
      />,
    );
    expect(html).toContain('data-inbound-status="HOLD"');
    expect(html).toContain("보류 사유: 등록되지 않은 발신자");
    expect(html).toContain("등록부에 없는 주소");
    expect(html).toContain("채널 수신 시각 — Date 가 채널 수신보다 미래");
  });

  it("the replies panel waits after sending and lists replies; nothing before sending", () => {
    expect(renderToStaticMarkup(<RepliesPanel draft={draft("APPROVED", [])} onChanged={() => undefined} />)).toBe("");
    expect(renderToStaticMarkup(<RepliesPanel draft={draft("SENT", [])} onChanged={() => undefined} />)).toContain("아직 회신 없음");
    const replied = renderToStaticMarkup(<RepliesPanel draft={draft("REPLIED", [item()])} onChanged={() => undefined} />);
    expect(replied).toContain("1통 · 내용 해석(값 추출)은 다음 단계");
    expect(replied).toContain("15:00~17:00 2대 가능합니다.");
  });
});
