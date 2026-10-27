import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TemplateDraftProse, koreanDate } from '../../src/communication/draft-prose.js';
import { type StructuredValue, targetFactKey, validateIntentValues } from '../../src/communication/inquiry-intents.js';
import { checkDraftNumbers } from '../../src/communication/number-check.js';

const v = (key: string, value: number | string, unit: string | null = null, sourcePath: string | null = null): StructuredValue => ({
  key,
  valueNumber: typeof value === 'number' ? value : null,
  valueText: typeof value === 'string' ? value : null,
  unit,
  sourcePath,
});

const truckValues = [v('quantity', 2, 'TRUCK', 'resource_gaps[0].needed'), v('date', '2026-10-13'), v('window_from', '15:00'), v('window_to', '17:00'), v('leg', '터미널 T1 → ODCY B')];
const ctx = { intent: 'TRUCK_SLOT' as const, askId: 'Q1', counterpartyName: 'K운송 (가상)', contactName: '배차팀', targetName: 'K운송 트럭', values: truckValues };

describe('template draft — prose comes from structured values (FR-COM-04 · FR-COM-06)', () => {
  it('renders every business number and date from the structured values, with no AI', () => {
    const draft = new TemplateDraftProse().compose(ctx);
    expect(draft.subject).toBe('[문의 Q1] 10월 13일(화) 15:00~17:00 트럭 2대 추가 배차 가능 여부');
    expect(draft.body).toContain('10월 13일(화) 15:00~17:00에 터미널 T1 → ODCY B 구간 셔틀 트럭 2대를');
    expect(new TemplateDraftProse().draftedBy).toBe('TEMPLATE');
  });

  it('changing a structured value changes the prose — nothing is hard-coded', () => {
    const draft = new TemplateDraftProse().compose({ ...ctx, values: truckValues.map((x) => (x.key === 'quantity' ? { ...x, valueNumber: 7 } : x)) });
    expect(draft.subject).toContain('트럭 7대');
    expect(draft.body).toContain('셔틀 트럭 7대를');
  });

  it('capacity inquiry for a facility', () => {
    const draft = new TemplateDraftProse().compose({
      intent: 'FACILITY_CAPACITY',
      askId: 'Q1',
      counterpartyName: 'ODCY A (가상)',
      contactName: '영업팀',
      targetName: 'ODCY A',
      values: [v('quantity', 5, 'CONTAINER'), v('date', '2026-10-14'), v('size_type', '40DRY')],
    });
    expect(draft.body).toContain('10월 14일(수)에 ODCY A에서 40DRY 컨테이너 5대를 받을 수 있는지');
  });

  it('koreanDate computes the weekday from the value, not from the clock', () => {
    expect(koreanDate('2026-10-13')).toBe('10월 13일(화)');
    expect(koreanDate('2026-10-07')).toBe('10월 7일(수)');
  });
});

describe('number check (docs/18 D.2 · FR-COM-07)', () => {
  const check = (texts: string[], values = truckValues) =>
    checkDraftNumbers({ texts, fields: values, literals: ['K운송 (가상)', '배차팀', 'K운송 트럭', '[문의 Q1]', '터미널 T1 → ODCY B'] });

  it('the template draft passes: every token matches a structured value', () => {
    const draft = new TemplateDraftProse().compose(ctx);
    const result = check([draft.subject, draft.body]);
    expect(result).toMatchObject({ passed: true, status: 'PASSED', unmatched: [], notMentioned: [] });
    expect(result.tokens.map((t) => [t.kind, t.matchedField])).toEqual(
      expect.arrayContaining([
        ['DATE', 'date'],
        ['TIME', 'window_from'],
        ['TIME', 'window_to'],
        ['QUANTITY', 'quantity'],
      ]),
    );
  });

  it('a quantity that is not in the structured values blocks the draft', () => {
    const result = check(['10월 13일 15:00~17:00에 트럭 8대를 추가로 배차할 수 있을까요?']);
    expect(result.status).toBe('BLOCKED_NUMBER_CHECK');
    expect(result.unmatched).toEqual([{ text: '8', kind: 'QUANTITY', matchedField: null }]);
    expect(result.notMentioned).toEqual(['quantity']);
  });

  it('a wrong date blocks the draft (Korean and ISO forms)', () => {
    expect(check(['10월 14일 15:00~17:00 트럭 2대']).unmatched).toEqual([{ text: '10월 14일', kind: 'DATE', matchedField: null }]);
    expect(check(['2026-10-15 15:00~17:00 트럭 2대']).unmatched.map((t) => t.kind)).toEqual(['DATE']);
  });

  it('a wrong time blocks the draft', () => {
    expect(check(['10월 13일 16:00~17:00 트럭 2대']).unmatched).toEqual([{ text: '16:00', kind: 'TIME', matchedField: null }]);
  });

  it('a money amount must match a KRW value', () => {
    const fields = [v('quantity', 2, 'TRUCK'), v('rate', 120000, 'KRW')];
    expect(checkDraftNumbers({ texts: ['트럭 2대 · 대당 120,000원'], fields, literals: [] }).passed).toBe(true);
    expect(checkDraftNumbers({ texts: ['트럭 2대 · 대당 150,000원'], fields, literals: [] }).unmatched.map((t) => t.kind)).toEqual(['MONEY']);
  });

  it('digits inside names and the question tag are not business numbers', () => {
    expect(check(['[문의 Q1] 터미널 T1 → ODCY B 구간 트럭 2대']).passed).toBe(true);
    expect(check(['T1 터미널 트럭 2대']).passed).toBe(false); // 고정 문구 밖의 "1"은 검사한다
  });

  it('is a pure module — no imports at all', () => {
    expect(readFileSync('src/communication/number-check.ts', 'utf8').match(/^\s*import\s/gm) ?? []).toEqual([]);
  });
});

describe('intent values (shape only — the backend fixes the question target)', () => {
  it('accepts a complete truck slot request and names the fact key', () => {
    expect(validateIntentValues('TRUCK_SLOT', truckValues)).toEqual([]);
    expect(targetFactKey('TRUCK_SLOT', truckValues)).toBe('available.slot(2026-10-13T15:00-17:00)');
    expect(targetFactKey('FACILITY_CAPACITY', [v('date', '2026-10-14')], 'WAREHOUSE')).toBe('capacity.day(2026-10-14)');
    expect(targetFactKey('FACILITY_CAPACITY', [v('date', '2026-10-14'), v('size_type', '40DRY')], 'ODCY')).toBe('capacity.size_type(40DRY).day(2026-10-14)');
  });

  it('reports missing, malformed, wrong-unit, non-positive, unknown and reversed-window values', () => {
    const issues = validateIntentValues('TRUCK_SLOT', [
      v('quantity', 0, 'CONTAINER'),
      v('date', '10/13'),
      v('window_from', '17:00'),
      v('window_to', '15:00'),
      v('colour', 'red'),
    ]);
    expect(issues).toEqual(
      expect.arrayContaining([
        { field: 'quantity', problem: 'NOT_POSITIVE' },
        { field: 'quantity', problem: 'BAD_UNIT' },
        { field: 'date', problem: 'BAD_FORMAT' },
        { field: 'window_to', problem: 'WINDOW_ORDER' },
        { field: 'colour', problem: 'UNKNOWN_FIELD' },
      ]),
    );
    expect(validateIntentValues('FACILITY_CAPACITY', [v('date', '2026-10-14')])).toEqual([{ field: 'quantity', problem: 'MISSING' }]);
  });
});

describe('T-128 correction / cancellation drafts — deterministic wording, numbers only from structured values', () => {
  const odcyValues = (extra: StructuredValue[]) => [v('quantity', 2, 'CONTAINER', 'recovery_plan:p2'), v('date', '2026-10-13'), ...extra];
  const odcyCtx = (values: StructuredValue[]) => ({ intent: 'FACILITY_CAPACITY' as const, askId: 'Q1', counterpartyName: 'ODCY A (가상)', contactName: '영업팀', targetName: 'ODCY A', values });
  const literals = ['ODCY A (가상)', '영업팀', 'ODCY A', '[문의 Q1]'];
  it('a correction names the previous and the new quantity and passes the number check', () => {
    const values = odcyValues([v('notice', 'CORRECTION'), v('previous_quantity', 3, 'CONTAINER', 'plan_follow_up:m1')]);
    const d = new TemplateDraftProse().compose(odcyCtx(values));
    expect(d.subject).toBe('[문의 Q1] [정정] 10월 13일(화) ODCY A 컨테이너 반입 3대 → 2대');
    expect(d.body).toContain('3대 요청을 2대로 정정');
    expect(checkDraftNumbers({ texts: [d.subject, d.body], fields: values, literals }).passed).toBe(true);
    expect(validateIntentValues('FACILITY_CAPACITY', values)).toEqual([]);
  });
  it('a cancellation names what was requested and passes the number check', () => {
    const values = odcyValues([v('notice', 'CANCELLATION')]);
    const d = new TemplateDraftProse().compose(odcyCtx(values));
    expect(d.subject).toBe('[문의 Q1] [취소] 10월 13일(화) ODCY A 컨테이너 반입 2대 요청 취소');
    expect(checkDraftNumbers({ texts: [d.subject, d.body], fields: values, literals }).passed).toBe(true);
  });
});
