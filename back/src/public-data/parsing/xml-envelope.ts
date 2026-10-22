import { XMLParser } from 'fast-xml-parser';

/**
 * 공공데이터포털 XML 응답 봉투 판정(field-dictionary 8절 규칙 1 · 2 · 3). 순수 함수 — I/O 없음.
 *
 * - 정상 봉투: `response > header{resultCode, resultMsg} + body{items > item ×n, numOfRows, pageNo, totalCount}`
 * - 게이트웨이 오류 봉투: `OpenAPI_ServiceResponse > cmmMsgHeader{errMsg, returnAuthMsg, returnReasonCode}` — HTTP 상태만 보고 판단하지 않는다
 * - 값은 **문자열 그대로** 둔다(입항횟수 `003` 의 앞자리 0 을 지키기 위해 숫자 변환을 하지 않는다). 빈 태그는 null
 */

export type Envelope =
  | { kind: 'NORMAL'; resultCode: string; resultMsg: string | null; totalCount: number | null; pageNo: number | null; numOfRows: number | null; items: XmlRecord[] }
  | { kind: 'GATEWAY_ERROR'; reasonCode: string | null; errMsg: string | null }
  | { kind: 'UNPARSEABLE'; reason: string };

/** item 하나. 값은 문자열, 반복 요소(details > detail)는 배열. */
export type XmlRecord = { [key: string]: string | null | XmlRecord | XmlRecord[] };

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  // 한 건만 와도 배열로(item · detail)
  isArray: (name) => name === 'item' || name === 'detail',
  processEntities: true,
});

/**
 * 정상 결과 코드 00. 데이터 없음은 **`00` + 0건**으로 온다(2026-10-22 live 관측). 포털 공통표의 `03`(NODATA)은 실제로
 * 관측되지 않아 데이터 없음 규칙으로 쓰지 않는다 — 오면 알 수 없는 결과 코드(UPSTREAM_ERROR)로 남겨 확인한다.
 */
export const RESULT_OK = '00';

export function parseEnvelope(bytes: Uint8Array): Envelope {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^﻿/, '');
  if (!text.trimStart().startsWith('<')) return { kind: 'UNPARSEABLE', reason: 'NOT_XML' };
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(text) as Record<string, unknown>;
  } catch {
    return { kind: 'UNPARSEABLE', reason: 'XML_SYNTAX' };
  }
  const gateway = record(doc['OpenAPI_ServiceResponse']);
  if (gateway) {
    const header = record(gateway['cmmMsgHeader']);
    return { kind: 'GATEWAY_ERROR', reasonCode: str(header?.['returnReasonCode']), errMsg: str(header?.['errMsg']) };
  }
  const response = record(doc['response']);
  if (!response) return { kind: 'UNPARSEABLE', reason: 'UNKNOWN_ROOT' };
  const header = record(response['header']);
  const body = record(response['body']);
  const resultCode = str(header?.['resultCode']);
  if (!resultCode) return { kind: 'UNPARSEABLE', reason: 'NO_RESULT_CODE' };
  const itemsNode = body ? body['items'] : undefined;
  const items = (record(itemsNode)?.['item'] as unknown[] | undefined) ?? [];
  return {
    kind: 'NORMAL',
    resultCode,
    resultMsg: str(header?.['resultMsg']),
    totalCount: int(body?.['totalCount']),
    pageNo: int(body?.['pageNo']),
    numOfRows: int(body?.['numOfRows']),
    items: items.map((i) => normalizeRecord(i)).filter((i): i is XmlRecord => i !== null),
  };
}

function normalizeRecord(node: unknown): XmlRecord | null {
  const r = record(node);
  if (!r) return null;
  const out: XmlRecord = {};
  for (const [k, v] of Object.entries(r)) {
    if (Array.isArray(v)) out[k] = v.map((x) => normalizeRecord(x)).filter((x): x is XmlRecord => x !== null);
    else if (v !== null && typeof v === 'object') out[k] = normalizeRecord(v) ?? null;
    else out[k] = str(v);
  }
  return out;
}

function record(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** 빈 태그 · 공백은 null(규칙 3). */
export function str(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'object') return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function int(v: unknown): number | null {
  const s = str(v);
  if (s === null || !/^[0-9]{1,9}$/.test(s)) return null;
  return Number(s);
}

/** item 안의 문자열 필드. 반복 요소면 null. */
export function field(item: XmlRecord, name: string): string | null {
  const v = item[name];
  return typeof v === 'string' ? v : null;
}

/** item 안의 반복 요소(details > detail). */
export function children(item: XmlRecord, container: string, child: string): XmlRecord[] {
  const node = item[container];
  if (!node || typeof node !== 'object' || Array.isArray(node)) return [];
  const list = (node as XmlRecord)[child];
  return Array.isArray(list) ? list : [];
}
