import type { FetchOutcome } from '../contracts.js';
import type { TransportResult } from '../adapters/transport.js';
import { type Envelope, parseEnvelope, RESULT_OK, type XmlRecord } from './xml-envelope.js';

/**
 * 전송 결과 + 봉투 → 호출 결과 하나. 순수 함수.
 * HTTP 200 이어도 봉투가 오류면 UPSTREAM_ERROR, 본문이 XML 이 아니면 PARSE_ERROR(포털 오류가 평문으로 올 때도 있다).
 */
export interface ClassifiedFetch {
  outcome: FetchOutcome;
  /** 정상 봉투 resultCode 또는 게이트웨이 returnReasonCode(`GW_` 접두) */
  resultCode: string | null;
  totalCount: number | null;
  items: XmlRecord[];
  /** UPSTREAM · PARSE 오류의 안전한 설명(원문 · 키 없음) */
  reason: string | null;
}

export function classifyFetch(result: Extract<TransportResult, { ok: true }>): ClassifiedFetch {
  const envelope: Envelope = parseEnvelope(result.bytes);
  if (envelope.kind === 'GATEWAY_ERROR') {
    return { outcome: 'UPSTREAM_ERROR', resultCode: envelope.reasonCode ? `GW_${envelope.reasonCode}`.slice(0, 20) : 'GW', totalCount: null, items: [], reason: safe(envelope.errMsg) };
  }
  if (envelope.kind === 'UNPARSEABLE') {
    const httpFailed = result.httpStatus < 200 || result.httpStatus >= 300;
    return { outcome: httpFailed ? 'UPSTREAM_ERROR' : 'PARSE_ERROR', resultCode: null, totalCount: null, items: [], reason: envelope.reason };
  }
  if (envelope.resultCode === RESULT_OK && (envelope.totalCount === 0 || envelope.items.length === 0)) {
    return { outcome: 'NO_DATA', resultCode: envelope.resultCode, totalCount: envelope.totalCount ?? 0, items: [], reason: null };
  }
  if (envelope.resultCode !== RESULT_OK) {
    return { outcome: 'UPSTREAM_ERROR', resultCode: envelope.resultCode.slice(0, 20), totalCount: null, items: [], reason: safe(envelope.resultMsg) };
  }
  return { outcome: 'SUCCESS', resultCode: envelope.resultCode, totalCount: envelope.totalCount, items: envelope.items, reason: null };
}

/** 포털 오류 메시지는 고정 영문 코드명(예: SERVICE_KEY_IS_NOT_REGISTERED_ERROR)이다 — 그 모양만 남긴다. */
function safe(message: string | null): string | null {
  if (!message) return null;
  const m = message.trim().slice(0, 80);
  return /^[A-Za-z0-9_ .-]+$/.test(m) ? m : 'UPSTREAM_MESSAGE';
}
