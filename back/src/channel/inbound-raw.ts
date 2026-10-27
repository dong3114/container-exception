import { parseMail } from './gmail/gmail-mime.js';
import type { MockInboundRecord } from './mock-channel-adapter.js';

/**
 * 보존한 원문(`raw_input.payload_ref` 의 바이트)에서 화면에 필요한 겉정보를 다시 읽는다 — 원문이 정본이고 이것은 읽기일 뿐이다.
 * 출처(채널)마다 원문 형식이 다르다: MOCK = JSON 봉투, GMAIL = RFC822(T-118). 해석(값 추출)은 하지 않는다.
 * Gmail 의 `channelReceivedAt` · 외부 스레드 id 는 원문 밖(Gmail 메타)에 있다 — 원문만으로는 알 수 없어 `null`/빈 값이고,
 * 그 값은 수신 때 `raw_input.received_at` · `comm_thread.external_thread_id` 로 이미 기록됐다.
 */
export interface InboundSurface {
  from: string;
  subject: string;
  bodyText: string;
  dateHeader: string | null;
  /** 채널 수신 시각(ISO) — 원문 안에 있을 때만(Mock). Gmail 은 null → 호출자가 `raw_input.received_at` 을 쓴다. */
  channelReceivedAt: string | null;
  externalThreadId: string | null;
}

export async function readInboundSurface(sourceName: string, bytes: Uint8Array): Promise<InboundSurface | null> {
  if (sourceName === 'GMAIL') {
    try {
      const m = await parseMail(bytes);
      return { from: m.from, subject: m.subject, bodyText: m.bodyText, dateHeader: m.dateHeader, channelReceivedAt: null, externalThreadId: null };
    } catch {
      return null;
    }
  }
  if (sourceName !== 'MOCK') return null; // 다른 채널의 원문 형식은 그 어댑터가 생길 때
  try {
    const r = JSON.parse(new TextDecoder().decode(bytes)) as MockInboundRecord;
    return {
      from: r.headers.From,
      subject: r.headers.Subject,
      bodyText: r.body_text,
      dateHeader: r.headers.Date ?? null,
      channelReceivedAt: r.channel_received_at,
      externalThreadId: r.external_thread_id,
    };
  } catch {
    return null;
  }
}
