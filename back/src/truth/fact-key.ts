import { seoulToUtcIso } from './promotion-rules.js';

/**
 * fact_key 문법 `<영역>.<이름>[(<파라미터>)]`(docs/05 4.3)을 `canonical_fact` 의 이름 · 파라미터 칸으로 푼다.
 * 질문이 정한 키(`inquiry-intents.ts targetFactKey`)만 이 슬라이스에서 나온다: 슬롯 `available.slot(D T from-to)` · 일별 수용량 `capacity.day(D)` · ODCY `capacity.size_type(T).day(D)`.
 * 모르는 모양은 이름만 남기고 파라미터는 비운다(지어내지 않는다).
 */
export interface FactKeyParts {
  factName: string;
  paramDate: string | null;
  paramSlotStart: string | null;
  paramSizeType: string | null;
  /** 질문이 정한 날짜 · 시간창(슬롯만 시간창) */
  asked: { date: string | null; windowFrom: string | null; windowTo: string | null };
}

const SLOT = /^available\.slot\((\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})-(\d{2}:\d{2})\)$/;
const DAY = /^capacity\.day\((\d{4}-\d{2}-\d{2})\)$/;
const SIZE_DAY = /^capacity\.size_type\(([0-9]{2}[A-Z]{2,4})\)\.day\((\d{4}-\d{2}-\d{2})\)$/;

export function parseFactKey(factKey: string): FactKeyParts {
  const none = { date: null, windowFrom: null, windowTo: null };
  let m = SLOT.exec(factKey);
  if (m) {
    return { factName: 'available.slot', paramDate: m[1] as string, paramSlotStart: seoulToUtcIso(m[1] as string, m[2] as string), paramSizeType: null, asked: { date: m[1] as string, windowFrom: m[2] as string, windowTo: m[3] as string } };
  }
  m = DAY.exec(factKey);
  if (m) return { factName: 'capacity.day', paramDate: m[1] as string, paramSlotStart: null, paramSizeType: null, asked: { date: m[1] as string, windowFrom: null, windowTo: null } };
  m = SIZE_DAY.exec(factKey);
  if (m) return { factName: 'capacity.size_type.day', paramDate: m[2] as string, paramSlotStart: null, paramSizeType: m[1] as string, asked: { date: m[2] as string, windowFrom: null, windowTo: null } };
  return { factName: (factKey.split('(')[0] ?? factKey).slice(0, 60), paramDate: null, paramSlotStart: null, paramSizeType: null, asked: none };
}
