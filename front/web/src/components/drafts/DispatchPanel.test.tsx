import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Draft } from "@/api/drafts";
import { DispatchPanel } from "./DispatchPanel";

const OPERATOR = "01a11040-0000-7000-8000-0000000000aa";
const APPROVAL = "01a11040-0000-7000-8000-0000000000b1";

const draft = (over: { status?: Draft["message"]["status"]; approval?: Draft["approval"]["state"]; dispatch?: Partial<Draft["dispatch"]> } = {}): Draft =>
  ({
    message: { message_id: "01a11040-0000-7000-8000-000000000001", content_hash: `sha256:${"a".repeat(64)}`, status: over.status ?? "APPROVED" },
    approval: {
      state: over.approval ?? "ACTIVE",
      current: { approval_id: APPROVAL, approver_name: "운영자 (가상)", decided_at: "2026-10-07T10:15:00.000+09:00" },
    },
    dispatch: {
      state: "NOT_REQUESTED",
      can_request_send: true,
      blocked_reasons: [],
      queued_at: null,
      sent_at: null,
      approval_id_used: null,
      next_attempt_at: null,
      dequeued_reason: null,
      sending_paused: false,
      attempts: [],
      ...over.dispatch,
    },
  }) as unknown as Draft;

const render = (d: Draft, approverId: string | null = OPERATOR) => renderToStaticMarkup(<DispatchPanel draft={d} approverId={approverId} onChanged={() => undefined} />);

describe("DispatchPanel — the screen shows what the backend and worker decided", () => {
  it("no send button before approval; an approved draft can request sending", () => {
    expect(render(draft({ status: "PENDING_APPROVAL", approval: "NONE", dispatch: { can_request_send: false } }))).not.toContain('data-testid="btn-send"');
    const ready = render(draft());
    expect(ready).toContain("발송 요청 전");
    expect(ready).toMatch(/data-testid="btn-send">발송 요청</);
    expect(render(draft(), null)).toMatch(/data-testid="btn-send" disabled=""/);
  });

  it("an approved draft that cannot be sent says why and keeps the button off", () => {
    const html = render(draft({ dispatch: { can_request_send: false, blocked_reasons: ["RECIPIENT_NOT_ELIGIBLE", "PLAN_SUPERSEDED"] } }));
    expect(html).toContain("지금 발송할 수 없는 이유");
    expect(html).toContain("받는 사람이 지금 발송 자격이 없음(Contact Gate)");
    expect(html).toContain("근거 계획이 새 실행으로 바뀜");
    expect(html).toMatch(/data-testid="btn-send" disabled=""/);
  });

  it("QUEUED waits for the worker; SENDING has an open attempt", () => {
    const queued = render(draft({ status: "QUEUED", dispatch: { state: "QUEUED", can_request_send: false, queued_at: "2026-10-07T10:20:00.000+09:00" } }));
    expect(queued).toContain('data-dispatch-state="QUEUED"');
    expect(queued).toContain("발송 대기");
    expect(queued).toContain("발송 Worker 가 처리하기를 기다리는 중");
    expect(queued).toContain("2026-10-07 10:20:00");
    expect(queued).not.toContain('data-testid="btn-send"');
    const sending = render(
      draft({ status: "QUEUED", dispatch: { state: "SENDING", attempts: [{ attempt_no: 1, started_at: "2026-10-07T10:20:05.000+09:00", finished_at: null, result: null, error_code: null, reconciled: false }] } }),
    );
    expect(sending).toContain("발송 중");
    expect(sending).toContain("발송 시도 1회");
    expect(sending).toContain("진행 중");
  });

  it("SENT shows when and with which approval; FAILED and RETRY_WAIT are told apart", () => {
    const sent = render(
      draft({
        status: "SENT",
        dispatch: {
          state: "SENT",
          sent_at: "2026-10-07T10:20:06.000+09:00",
          approval_id_used: APPROVAL,
          attempts: [{ attempt_no: 1, started_at: "2026-10-07T10:20:05.000+09:00", finished_at: "2026-10-07T10:20:06.000+09:00", result: "SUCCESS", error_code: null, reconciled: false }],
        },
      }),
    );
    expect(sent).toContain("발송 완료");
    expect(sent).toContain('data-testid="sent-at">2026-10-07 10:20:06<');
    expect(sent).toContain("운영자 (가상) · 2026-10-07 10:15:00 승인");
    expect(sent).not.toContain('data-testid="btn-send"');

    const retry = render(
      draft({
        status: "QUEUED",
        dispatch: {
          state: "RETRY_WAIT",
          next_attempt_at: "2026-10-07T10:21:00.000+09:00",
          attempts: [{ attempt_no: 1, started_at: "x", finished_at: "x", result: "RETRYABLE_FAILURE", error_code: "MOCK_TEMPORARY_FAILURE", reconciled: false }],
        },
      }),
    );
    expect(retry).toContain("일시 실패 — 다시 시도 대기");
    expect(retry).toContain("다음 시도");
    expect(retry).toContain("MOCK_TEMPORARY_FAILURE");

    const failed = render(draft({ status: "DELIVERY_FAILED", dispatch: { state: "FAILED", attempts: [{ attempt_no: 1, started_at: "x", finished_at: "x", result: "PERMANENT_FAILURE", error_code: "MOCK_RECIPIENT_REJECTED", reconciled: false }] } }));
    expect(failed).toContain("발송 실패");
    expect(failed).toContain("영구 실패");
  });

  it("a worker-side refusal and the kill switch are visible", () => {
    const dequeued = render(draft({ dispatch: { dequeued_reason: "send blocked: APPROVAL_REVOKED", can_request_send: false, blocked_reasons: ["APPROVAL_REVOKED"] } }));
    expect(dequeued).toContain("발송 직전 검사에서 막혀 대기열에서 빠졌습니다");
    expect(dequeued).toContain("승인이 취소됨");
    const paused = render(draft({ status: "QUEUED", dispatch: { state: "QUEUED", sending_paused: true } }));
    expect(paused).toContain("발송 일시 중지됨(kill switch)");
  });
});
