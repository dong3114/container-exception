import { Instant } from '../shared/time/instant.js';

/**
 * 수신 판정 — 순수 함수(T-091 U6 · docs/22 11.2e Q-44 · docs/19 FR-INB · 10.1 · 15.5 · T-069 4.3 · 11.6).
 * "받았다 · 누가 보냈다 · 어느 문의의 답이다"까지만 정한다. 내용은 해석하지 않는다(LLM 없음 — 추출은 U7).
 * DB · 네트워크 · LLM 을 import 하지 않고, 현재 시각을 읽지 않는다.
 */

// ── Q-44 근거 시각(docs/22 11.2e) ───────────────────────────────────────────

export type DateRejectReason = 'MISSING' | 'UNPARSEABLE' | 'AFTER_CHANNEL_RECEIVED';

export interface EvidenceTime {
  /** `raw_input.source_recorded_at` 에 들어가는 값. 채널 수신 시각보다 늦을 수 없다(I-28). */
  sourceRecordedAt: Instant;
  basis: 'DATE_HEADER' | 'CHANNEL_RECEIVED';
  dateHeaderRaw: string | null;
  dateHeaderParsed: Instant | null;
  channelReceivedAt: Instant;
  rejected: boolean;
  rejectReason: DateRejectReason | null;
}

/** RFC 5322 `Date`(요일 생략 가능 · 숫자 오프셋 또는 GMT/UT/Z). 오프셋이 없는 값은 받지 않는다 — 시각대를 추측하지 않는다. */
const RFC5322 =
  /^\s*(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*)?(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+([+-]\d{4}|GMT|UT|UTC|Z)\s*(?:\(.*\))?\s*$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function parseDateHeader(raw: string): Instant | null {
  const m = RFC5322.exec(raw);
  if (!m) return null;
  const [, d, mon, y, hh, mi, ss, zone] = m as unknown as [string, string, string, string, string, string, string | undefined, string];
  const month = MONTHS.indexOf(mon);
  const offsetMin = /^[+-]\d{4}$/.test(zone) ? (zone.startsWith('-') ? -1 : 1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(3, 5))) : 0;
  const utc = Date.UTC(Number(y), month, Number(d), Number(hh), Number(mi), Number(ss ?? '0')) - offsetMin * 60_000;
  const check = new Date(Date.UTC(Number(y), month, Number(d)));
  if (Number.isNaN(utc) || check.getUTCDate() !== Number(d) || Number(hh) > 23 || Number(mi) > 59 || Number(ss ?? '0') > 59) return null;
  return Instant.ofEpochMs(utc);
}

/**
 * `Date` 가 있고 · 파싱되고 · 채널 수신 시각보다 미래가 아니면 `Date`, 아니면 채널 수신 시각 + 거부 사유.
 * 허용 오차는 두지 않는다(MVP — 11.2e). 아주 오래된 `Date` 는 거부하지 않는다(주장이 약해지는 안전한 방향).
 */
export function evidenceTime(dateHeaderRaw: string | null, channelReceivedAt: Instant): EvidenceTime {
  const base = { dateHeaderRaw, channelReceivedAt };
  if (dateHeaderRaw === null || dateHeaderRaw.trim() === '') {
    return { ...base, sourceRecordedAt: channelReceivedAt, basis: 'CHANNEL_RECEIVED', dateHeaderParsed: null, rejected: true, rejectReason: 'MISSING' };
  }
  const parsed = parseDateHeader(dateHeaderRaw);
  if (!parsed) {
    return { ...base, sourceRecordedAt: channelReceivedAt, basis: 'CHANNEL_RECEIVED', dateHeaderParsed: null, rejected: true, rejectReason: 'UNPARSEABLE' };
  }
  if (parsed.isAfter(channelReceivedAt)) {
    return { ...base, sourceRecordedAt: channelReceivedAt, basis: 'CHANNEL_RECEIVED', dateHeaderParsed: parsed, rejected: true, rejectReason: 'AFTER_CHANNEL_RECEIVED' };
  }
  return { ...base, sourceRecordedAt: parsed, basis: 'DATE_HEADER', dateHeaderParsed: parsed, rejected: false, rejectReason: null };
}

// ── 스레드 연결 · 발신자 판정 ──────────────────────────────────────────────

/** 보류 사유(docs/19 10.1 · 15.5 실패표의 최소 코드). 보류 = 원문은 남기고 스레드에 붙이지 않는다 — 버리지 않는다(FR-INB-06). */
export const HOLD_REASONS = [
  'NO_MATCHING_THREAD', // 연결할 문의 없음
  'AMBIGUOUS_THREAD', // 연결 근거가 서로 다른 스레드를 가리킴
  'UNKNOWN_SENDER', // 등록 안 된 보낸 사람
  'AMBIGUOUS_SENDER', // 발신자 확인 필요(여러 등록과 맞음)
  'SENDER_INACTIVE', // 거래처 · 연락처 · 주소 비활성
  'SENDER_UNVERIFIED', // 확인되지 않은 주소
  'SENDER_NOT_APPROVED', // 업무 관계 미승인
  'OTHER_COUNTERPARTY', // 등록됐지만 다른 거래처 소속
  'DIFFERENT_CONTACT', // 같은 거래처의 다른 주소에서 답이 옴(다른 담당자 회신)
  'SIMULATION_MISMATCH', // 가상 / 실제가 섞임(J.3)
] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];

export interface ThreadCandidate {
  threadId: string;
  counterpartyId: string;
  isSimulated: boolean;
  /** 이 회신이 답하는 보낸 메시지(In-Reply-To 로 찾았을 때) 또는 스레드의 마지막 보낸 메시지. */
  outboundMessageId: string | null;
  /** 그 보낸 메시지의 받는 주소 — 답은 이 주소에서 와야 한다. */
  outboundToAddressId: string | null;
}

export interface SenderCandidate {
  addressId: string;
  contactId: string;
  counterpartyId: string;
  counterpartyIsActive: boolean;
  contactIsActive: boolean;
  communicationStatus: string;
  emailVerificationStatus: string;
  relationshipStatus: string;
}

export interface InboundFacts {
  /** 외부 스레드 id 로 찾은 스레드(0~1). */
  byExternalThread: readonly ThreadCandidate[];
  /** In-Reply-To · References 로 찾은 스레드(보낸 시도의 외부 id → 메시지 → 스레드). */
  byReplyHeaders: readonly ThreadCandidate[];
  /** 보낸 주소와 맞는 등록 주소(같은 채널). */
  senders: readonly SenderCandidate[];
  /** 어댑터가 고정한 가상 여부. */
  adapterSimulated: boolean;
}

export interface InboundDecision {
  status: 'NORMAL' | 'HOLD';
  reasons: HoldReason[];
  thread: ThreadCandidate | null;
  sender: SenderCandidate | null;
}

/**
 * 연결 우선순위: 회신 헤더(In-Reply-To/References — CERA 가 보낸 그 메일의 외부 id) → 외부 스레드 id. 두 근거가 **서로 다른 스레드**를
 * 가리키면 추측하지 않고 보류한다. 한 스레드로만 모일 때 그 스레드에 붙인다.
 * 발신자는 등록부로만 판정한다(LLM 금지): 같은 채널의 정규화 주소 → 주소 → 연락처 → 거래처. 활성 · 확인 · 관계 승인 · 스레드 상대와 일치.
 */
export function classifyInbound(f: InboundFacts): InboundDecision {
  const reasons: HoldReason[] = [];
  const byId = new Map<string, ThreadCandidate>();
  // 회신 헤더 근거를 먼저 넣는다(보낸 메시지까지 알려 준다)
  for (const t of [...f.byReplyHeaders, ...f.byExternalThread]) if (!byId.has(t.threadId)) byId.set(t.threadId, t);
  const threads = [...byId.values()];
  let thread: ThreadCandidate | null = null;
  if (threads.length === 0) reasons.push('NO_MATCHING_THREAD');
  else if (threads.length > 1) reasons.push('AMBIGUOUS_THREAD');
  else thread = threads[0] ?? null;

  let sender: SenderCandidate | null = null;
  if (f.senders.length === 0) reasons.push('UNKNOWN_SENDER');
  else if (f.senders.length > 1) reasons.push('AMBIGUOUS_SENDER');
  else {
    sender = f.senders[0] ?? null;
    if (sender) {
      if (!sender.counterpartyIsActive || !sender.contactIsActive || sender.communicationStatus !== 'ACTIVE') reasons.push('SENDER_INACTIVE');
      if (sender.emailVerificationStatus !== 'VERIFIED') reasons.push('SENDER_UNVERIFIED');
      if (sender.relationshipStatus !== 'APPROVED') reasons.push('SENDER_NOT_APPROVED');
      if (thread) {
        if (sender.counterpartyId !== thread.counterpartyId) reasons.push('OTHER_COUNTERPARTY');
        else if (thread.outboundToAddressId && sender.addressId !== thread.outboundToAddressId) reasons.push('DIFFERENT_CONTACT');
      }
    }
  }
  if (thread && thread.isSimulated !== f.adapterSimulated) reasons.push('SIMULATION_MISMATCH');
  return { status: reasons.length === 0 ? 'NORMAL' : 'HOLD', reasons, thread, sender };
}

/** 보낸 주소 정규화 — 등록부의 `normalized_address` 규칙(소문자 · 앞뒤 공백 제거)과 같다. `이름 <주소>` 형식이면 주소만. */
export function normalizeAddress(from: string): string {
  const angle = /<([^>]+)>/.exec(from);
  return (angle?.[1] ?? from).trim().toLowerCase();
}
