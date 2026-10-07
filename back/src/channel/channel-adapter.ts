/**
 * 채널 어댑터 포트(docs/18 J.1 · T-069 8.1 — 계약은 정본 그대로, 새로 정하지 않는다).
 *
 *   capabilities()               -> { threading, attachments, structured_reply, delivery_receipt, inbound_push }
 *   send(OutboundMessage)        -> { external_message_id, external_thread_id }   # X-CERA-Message 헤더 포함
 *   fetch_inbound(watermark)     -> (U6 — 아직 없음)
 *   lookup_sent(cera_message_id) -> external_message_id | None                    # 화해용
 *
 * 구현은 외부 I/O 다 — DB 트랜잭션 안에서 부르지 않는다(`assertOutsideTransaction`, docs/24 15절).
 * 어댑터가 `declaresSimulated` 를 고정한다. 호출자가 바꿀 수 없다(J.3). Gmail 은 Slice 2 에서 같은 포트를 구현한다.
 */
export type ChannelType = 'MOCK' | 'GMAIL' | 'PORTAL';

export interface ChannelCapabilities {
  threading: boolean;
  attachments: boolean;
  structured_reply: boolean;
  delivery_receipt: boolean;
  inbound_push: boolean;
}

/** 보낼 내용 — **승인 사본**에서 만든다(화면 문자열을 다시 조합하지 않는다). */
export interface OutboundMessage {
  /** CERA 메시지 id — `X-CERA-Message` 헤더로 실어 보내고 `lookup_sent` 가 이것으로 찾는다(FR-SND-03). */
  ceraMessageId: string;
  /** 같은 대화로 묶기 위한 CERA 스레드 id(채널에 외부 스레드가 아직 없을 때). */
  ceraThreadId: string;
  externalThreadId: string | null;
  to: string;
  subject: string;
  bodyText: string;
  /** 승인 지문(msg-content/1). 보낸 내용 = 승인한 내용의 증거로 함께 기록한다. */
  contentHash: string;
  isSimulated: boolean;
}

export interface SentReceipt {
  externalMessageId: string;
  externalThreadId: string;
}

/**
 * 발송 실패의 분류(docs/18 H.3). 어댑터가 정한다 — 디스패처는 분류만 보고 재시도 여부를 정한다.
 * - TRANSIENT: 네트워크 · 5xx · 429 → 백오프 재시도
 * - PERMANENT: 받는 사람 형식 · 정책 거부 → 재시도 금지
 * - AUTH: 토큰 만료 등 → 재시도 금지(연동 상태 문제 — Slice 2)
 * - UNKNOWN: 보냈는지 모른다(시간 초과 등) → 재전송 전에 `lookup_sent` 로 화해
 */
export type SendFailureKind = 'TRANSIENT' | 'PERMANENT' | 'AUTH' | 'UNKNOWN';

export class ChannelSendError extends Error {
  constructor(
    readonly kind: SendFailureKind,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ChannelSendError';
  }
}

/**
 * 받은 메일 한 통(T-069 8.1): **원문 그대로의 바이트** + 채널 메타. 해석하지 않는다 — 헤더는 원문에서 읽어 둔 값일 뿐이고
 * 원문이 정본이다. Q-44 의 입력(`Date` 원문 · 채널 수신 시각)을 함께 준다.
 */
export interface InboundRawMessage {
  externalMessageId: string;
  externalThreadId: string | null;
  /** 원문(Gmail 은 RFC822, Mock 은 JSON 봉투). 내용 저장소에 이 바이트를 그대로 넣는다. */
  raw: Uint8Array;
  mediaType: string;
  from: string;
  to: string[];
  subject: string;
  /** `Date` 헤더 원래 문자열 — 없으면 null. 파싱은 CERA 가 한다(Q-44). */
  dateHeader: string | null;
  inReplyTo: string | null;
  references: string[];
  /** 채널이 받은 시각(Gmail `internalDate`) — 발신자가 바꿀 수 없다. ISO 8601. */
  channelReceivedAt: string;
  /** 본문 텍스트(안전한 미리보기 · 나중의 추출 입력). 원문 안에도 있다. */
  bodyText: string;
}

export interface ChannelAdapter {
  readonly channelType: ChannelType;
  /** true = 가상 채널(시나리오 · 시드 메시지를 받을 수 있다). false = 실채널 — 가상 메시지는 보낼 수 없다(J.3 · G-06). 수신 메시지의 `is_simulated` 도 이 값으로 고정된다(G-07). */
  readonly declaresSimulated: boolean;
  capabilities(): ChannelCapabilities;
  send(message: OutboundMessage): Promise<SentReceipt>;
  /** 이 CERA 메시지가 이미 채널에 나갔으면 그 외부 id, 없음이 확인되면 null. 확인할 수 없으면 던진다. */
  lookupSent(ceraMessageId: string): Promise<string | null>;
  /**
   * 워터마크 이후 받은 메일(`fetch_inbound(watermark) -> [InboundRawMessage], next_watermark`). 같은 메일이 다시 나와도 된다 —
   * 중복은 CERA 가 외부 메시지 id UNIQUE 로 막는다(워터마크는 최적화일 뿐 정확성의 근거가 아니다).
   */
  fetchInbound(watermark: string | null): Promise<{ messages: InboundRawMessage[]; nextWatermark: string | null }>;
}

export const CHANNEL_ADAPTERS = Symbol('CERA_CHANNEL_ADAPTERS');
