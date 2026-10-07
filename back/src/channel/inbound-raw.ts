import type { MockInboundRecord } from './mock-channel-adapter.js';

/**
 * 보존한 원문(`raw_input.payload_ref` 의 바이트)에서 화면에 필요한 겉정보를 다시 읽는다 — 원문이 정본이고 이것은 읽기일 뿐이다.
 * 출처(채널)마다 원문 형식이 다르다: MOCK = JSON 봉투, GMAIL(Slice 2) = RFC822. 해석(값 추출)은 하지 않는다.
 */
export interface InboundSurface {
  from: string;
  subject: string;
  bodyText: string;
  dateHeader: string | null;
  channelReceivedAt: string;
  externalThreadId: string | null;
}

export function readInboundSurface(sourceName: string, bytes: Uint8Array): InboundSurface | null {
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
