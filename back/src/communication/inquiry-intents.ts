/**
 * 문의 종류(intent) — 무엇을 묻는가를 Backend 가 결정론으로 정한다(T-069 11.3 · docs/22 question_item).
 * 질문의 대상(개체 · 사실 키 · 적용 범위)은 **질문을 만들 때 여기서 확정**한다 — 회신이 오면 `ask_id` 한 줄 조회로
 * 어디에 붙일지 정해진다. AI 는 대상 · 범위 · 숫자를 정하지 않는다(docs/22 L-1 · ADR-029).
 *
 * 순수 모듈이다: DB · 네트워크 · LLM 을 import 하지 않는다.
 */

export type InquiryIntent = 'TRUCK_SLOT' | 'FACILITY_CAPACITY';
export const INQUIRY_INTENTS: readonly InquiryIntent[] = ['TRUCK_SLOT', 'FACILITY_CAPACITY'];

/** 구조화 값 하나. 문장이 아니라 이것이 정본이다(docs/18 D.2). */
export interface StructuredValue {
  key: string;
  valueNumber: number | null;
  valueText: string | null;
  unit: string | null;
  /** 계획 실행에서 온 값이면 그 경로(예: `resource_gaps[0].needed`). 출처 실행은 메시지 단위로 하나다. */
  sourcePath: string | null;
}

export interface IntentSpec {
  purpose: 'SLOT_REQUEST' | 'CAPACITY_CHECK';
  questionType: 'SLOT' | 'CAPACITY';
  targetEntityType: 'TRUCK_POOL' | 'FACILITY';
  expectedUnit: string;
  /** 필요한 값과 형식. */
  fields: { key: string; kind: 'QUANTITY' | 'DATE' | 'TIME' | 'TEXT'; unit?: string; required: boolean }[];
}

export const INTENTS: Record<InquiryIntent, IntentSpec> = {
  // 슬롯별 차량 가용 `available.slot(S)` — 주체 TRUCK_POOL (T-069 5.4)
  TRUCK_SLOT: {
    purpose: 'SLOT_REQUEST',
    questionType: 'SLOT',
    targetEntityType: 'TRUCK_POOL',
    expectedUnit: 'TRUCK',
    fields: [
      { key: 'quantity', kind: 'QUANTITY', unit: 'TRUCK', required: true },
      { key: 'date', kind: 'DATE', required: true },
      { key: 'window_from', kind: 'TIME', required: true },
      { key: 'window_to', kind: 'TIME', required: true },
      { key: 'leg', kind: 'TEXT', required: false },
      // T-128: 이미 보낸 요청의 정정(CORRECTION · 이전 수량) · 취소(CANCELLATION) — 승인된 계획이 바뀌었을 때만(계획 후속)
      { key: 'notice', kind: 'TEXT', required: false },
      { key: 'previous_quantity', kind: 'QUANTITY', unit: 'TRUCK', required: false },
    ],
  },
  // 일별 수용량 `capacity.day(D)`(창고) · `capacity.size_type(T).day(D)`(ODCY) — 주체 FACILITY (T-069 5.4)
  FACILITY_CAPACITY: {
    purpose: 'CAPACITY_CHECK',
    questionType: 'CAPACITY',
    targetEntityType: 'FACILITY',
    expectedUnit: 'CONTAINER',
    fields: [
      { key: 'quantity', kind: 'QUANTITY', unit: 'CONTAINER', required: true },
      { key: 'date', kind: 'DATE', required: true },
      { key: 'size_type', kind: 'TEXT', required: false },
      { key: 'notice', kind: 'TEXT', required: false },
      { key: 'previous_quantity', kind: 'QUANTITY', unit: 'CONTAINER', required: false },
    ],
  },
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const SIZE_TYPE = /^[0-9]{2}[A-Z]{2,4}$/;

export interface IntentIssue {
  field: string;
  problem: 'MISSING' | 'UNKNOWN_FIELD' | 'BAD_FORMAT' | 'BAD_UNIT' | 'NOT_POSITIVE' | 'WINDOW_ORDER';
}

/** 값이 문의 종류의 요구와 맞는지 본다(형식만 — 값이 계획과 같은지는 출처가 말한다). */
export function validateIntentValues(intent: InquiryIntent, values: readonly StructuredValue[]): IntentIssue[] {
  const spec = INTENTS[intent];
  const issues: IntentIssue[] = [];
  const byKey = new Map(values.map((v) => [v.key, v]));
  for (const v of values) if (!spec.fields.some((f) => f.key === v.key)) issues.push({ field: v.key, problem: 'UNKNOWN_FIELD' });
  for (const f of spec.fields) {
    const v = byKey.get(f.key);
    if (!v) {
      if (f.required) issues.push({ field: f.key, problem: 'MISSING' });
      continue;
    }
    if (f.kind === 'QUANTITY') {
      if (v.valueNumber === null || !Number.isInteger(v.valueNumber)) issues.push({ field: f.key, problem: 'BAD_FORMAT' });
      else if (v.valueNumber <= 0) issues.push({ field: f.key, problem: 'NOT_POSITIVE' });
      if (v.unit !== f.unit) issues.push({ field: f.key, problem: 'BAD_UNIT' });
    } else if (f.kind === 'DATE') {
      if (!v.valueText || !DATE.test(v.valueText) || Number.isNaN(Date.parse(`${v.valueText}T00:00:00Z`))) issues.push({ field: f.key, problem: 'BAD_FORMAT' });
    } else if (f.kind === 'TIME') {
      if (!v.valueText || !TIME.test(v.valueText)) issues.push({ field: f.key, problem: 'BAD_FORMAT' });
    } else if (!v.valueText || (f.key === 'size_type' && !SIZE_TYPE.test(v.valueText))) {
      issues.push({ field: f.key, problem: 'BAD_FORMAT' });
    }
  }
  const from = byKey.get('window_from')?.valueText;
  const to = byKey.get('window_to')?.valueText;
  if (from && to && TIME.test(from) && TIME.test(to) && from >= to) issues.push({ field: 'window_to', problem: 'WINDOW_ORDER' });
  return issues;
}

/** 질문 대상의 사실 키 — 회신이 붙을 곳(docs/22 question_item.target_fact_key). */
export function targetFactKey(intent: InquiryIntent, values: readonly StructuredValue[], facilityType?: string): string {
  const get = (k: string) => values.find((v) => v.key === k)?.valueText ?? '';
  if (intent === 'TRUCK_SLOT') return `available.slot(${get('date')}T${get('window_from')}-${get('window_to')})`;
  const size = get('size_type');
  if (facilityType === 'ODCY' && size) return `capacity.size_type(${size}).day(${get('date')})`;
  return `capacity.day(${get('date')})`;
}
