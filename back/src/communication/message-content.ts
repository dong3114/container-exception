import canonicalize from 'canonicalize';
import { type Sha256Hash, canonicalHash } from '../shared/hash/hash.js';

/**
 * 메시지 내용 문서 · 지문(docs/24 8.2 · 16절).
 *
 * - **내용 저장소 문서** = JCS `{subject, body_text}` — 제목 · 본문만. 메시지(`COMM_MESSAGE_CONTENT`)와 승인 사본
 *   (`MESSAGE_APPROVAL_CONTENT`)이 같은 모양이다.
 * - **기록의 지문** `msg-content/1` = 받는 주소 + 제목 + 본문 + 구조화 값(`field_key` 정렬, 값 · 단위). 그래서 본문 ·
 *   받는 사람 · 숫자 어느 하나만 바뀌어도 지문이 바뀐다 — 승인은 이 지문에 대한 승인이다(FR-APV-02 · 04 · 05).
 *   출처(`source_run_id` · `source_path`)는 재료가 아니다 — 계획 교체는 `PLAN_SUPERSEDED` 가 따로 막는다.
 *
 * 순수 모듈이다: DB · 네트워크 · LLM 을 import 하지 않고, 현재 시각을 읽지 않는다.
 */
export interface MessageText {
  subject: string;
  bodyText: string;
}

export interface ContentField {
  fieldKey: string;
  valueText: string | null;
  /** 10진 문자열(DB numeric 그대로 와도 된다 — 뒤쪽 0 은 정규화한다) 또는 숫자. */
  valueNumber: string | number | null;
  unit: string | null;
}

/** 내용 저장소에 넣는 바이트. */
export function messageTextBytes(text: MessageText): Uint8Array {
  const json = canonicalize({ subject: text.subject, body_text: text.bodyText });
  if (json === undefined) throw new TypeError('message text could not be canonicalized');
  return new TextEncoder().encode(json);
}

/**
 * 내용 저장소에서 꺼낸 바이트 → 제목 · 본문. 모양이 다르면 null(내용 부재와 같게 다룬다).
 * T-088 이 저장한 옛 문서 `{subject, body}` 도 읽는다 — 보여주기만 한다. 그 메시지의 지문은 옛 방식이라 다시 계산한
 * `msg-content/1` 과 맞지 않고, 그래서 승인할 수 없다(CONTENT_HASH_MISMATCH).
 */
export function parseMessageText(bytes: Uint8Array): MessageText | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { subject?: unknown; body_text?: unknown; body?: unknown };
    const body = typeof parsed.body_text === 'string' ? parsed.body_text : parsed.body;
    return typeof parsed.subject === 'string' && typeof body === 'string' ? { subject: parsed.subject, bodyText: body } : null;
  } catch {
    return null;
  }
}

/** `msg-content/1` — 메시지 `content_hash` 와 승인 `approved_content_hash` 가 같은 함수를 쓴다. */
export function messageContentHash(input: { toAddressId: string; text: MessageText; fields: readonly ContentField[] }): Sha256Hash {
  const fields = [...input.fields]
    .sort((a, b) => (a.fieldKey < b.fieldKey ? -1 : a.fieldKey > b.fieldKey ? 1 : 0))
    .map((f) => ({
      field_key: f.fieldKey,
      value_text: f.valueText,
      value_number: f.valueNumber === null ? null : canonicalDecimal(f.valueNumber),
      unit: f.unit,
    }));
  return canonicalHash({
    k: 'msg-content',
    v: 1,
    to_address_id: input.toAddressId,
    subject: input.text.subject,
    body_text: input.text.bodyText,
    fields,
  });
}

/** `2` · `2.0000` · `'2.50'` → `'2'` · `'2'` · `'2.5'`. 지수 표기는 받지 않는다(구조화 값은 numeric(18,4)). */
export function canonicalDecimal(value: string | number): string {
  const text = typeof value === 'number' ? String(value) : value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new TypeError(`not a plain decimal: ${text}`);
  const [intPart, frac = ''] = text.split('.') as [string, string?];
  const trimmed = frac.replace(/0+$/, '');
  const sign = intPart.startsWith('-') ? '-' : '';
  const digits = intPart.replace('-', '').replace(/^0+(?=\d)/, '');
  const out = trimmed ? `${digits}.${trimmed}` : digits;
  return out === '0' ? '0' : `${sign}${out}`;
}
