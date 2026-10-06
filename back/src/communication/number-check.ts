/**
 * 숫자 검사 — 초안 제목 · 본문에 나타난 **모든 수량 · 날짜 · 시각 · 금액**이 구조화 값 집합에 있어야 한다
 * (docs/18 D.2 · docs/19 FR-COM-07 · docs/01 3절). 하나라도 없으면 초안은 `BLOCKED_NUMBER_CHECK` 이고
 * 승인 화면에 올라가지 못한다. 문장을 누가 썼든(템플릿 · 사람 수정 · 나중의 AI) 같은 검사를 받는다.
 *
 * 순수 함수다: DB · 네트워크 · LLM 을 import 하지 않고, 현재 시각을 읽지 않는다.
 */

export type TokenKind = 'DATE' | 'TIME' | 'MONEY' | 'QUANTITY';

export interface CheckField {
  key: string;
  valueNumber: number | null;
  valueText: string | null;
  unit: string | null;
}

export interface NumberToken {
  text: string;
  kind: TokenKind;
  /** 맞은 구조화 값의 key. 없으면 null(= 실패 사유). */
  matchedField: string | null;
}

export interface NumberCheckResult {
  passed: boolean;
  /** `BLOCKED_NUMBER_CHECK` 일 때만 채워진다. */
  status: 'PASSED' | 'BLOCKED_NUMBER_CHECK';
  tokens: NumberToken[];
  unmatched: NumberToken[];
  /** 본문에 한 번도 나오지 않은 수량 · 날짜 · 시각 값(실패는 아니다 — 운영자에게 알릴 정보). */
  notMentioned: string[];
}

const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const KO_DATE = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/g;
const SLASH_DATE = /\b(\d{1,2})\/(\d{1,2})\b/g;
const TIME = /\b(\d{1,2}):(\d{2})\b/g;
const MONEY = /(\d[\d,]*)\s*원/g;
const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

const DATE_VALUE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_VALUE = /^(\d{2}):(\d{2})$/;

export function checkDraftNumbers(input: { texts: readonly string[]; fields: readonly CheckField[]; literals: readonly string[] }): NumberCheckResult {
  const dates = input.fields.flatMap((f) => {
    const m = f.valueText ? DATE_VALUE.exec(f.valueText) : null;
    return m ? [{ key: f.key, y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }] : [];
  });
  const times = input.fields.flatMap((f) => {
    const m = f.valueText ? TIME_VALUE.exec(f.valueText) : null;
    return m ? [{ key: f.key, h: Number(m[1]), mi: Number(m[2]) }] : [];
  });
  const money = input.fields.filter((f) => f.unit === 'KRW' && f.valueNumber !== null);
  const quantities = input.fields.filter((f) => f.unit !== 'KRW' && f.valueNumber !== null);

  const tokens: NumberToken[] = [];
  for (const raw of input.texts) {
    let text = raw;
    // 고정 문구(이름 · 질문 표식 · 구조화 문자 값 표기) 안의 숫자는 업무 숫자가 아니다 — 긴 것부터 지운다.
    for (const literal of [...input.literals].filter((l) => l.length > 0).sort((a, b) => b.length - a.length)) {
      text = text.split(literal).join(' ');
    }
    const take = (re: RegExp, kind: TokenKind, match: (m: RegExpExecArray) => string | null) => {
      text = text.replace(re, (...args) => {
        const m = args.slice(0, -2) as unknown as RegExpExecArray;
        tokens.push({ text: m[0], kind, matchedField: match(m) });
        return ' ';
      });
    };
    take(ISO_DATE, 'DATE', (m) => dates.find((d) => d.y === Number(m[1]) && d.m === Number(m[2]) && d.d === Number(m[3]))?.key ?? null);
    take(KO_DATE, 'DATE', (m) => dates.find((d) => d.m === Number(m[1]) && d.d === Number(m[2]))?.key ?? null);
    take(SLASH_DATE, 'DATE', (m) => dates.find((d) => d.m === Number(m[1]) && d.d === Number(m[2]))?.key ?? null);
    take(TIME, 'TIME', (m) => times.find((t) => t.h === Number(m[1]) && t.mi === Number(m[2]))?.key ?? null);
    take(MONEY, 'MONEY', (m) => money.find((f) => f.valueNumber === toNumber(m[1]))?.key ?? null);
    take(NUMBER, 'QUANTITY', (m) => quantities.find((f) => f.valueNumber === toNumber(m[0]))?.key ?? null);
  }

  const unmatched = tokens.filter((t) => t.matchedField === null);
  const mentioned = new Set(tokens.map((t) => t.matchedField).filter((k): k is string => k !== null));
  const checkable = [...dates.map((d) => d.key), ...times.map((t) => t.key), ...money.map((f) => f.key), ...quantities.map((f) => f.key)];
  return {
    passed: unmatched.length === 0,
    status: unmatched.length === 0 ? 'PASSED' : 'BLOCKED_NUMBER_CHECK',
    tokens,
    unmatched,
    notMentioned: checkable.filter((k) => !mentioned.has(k)),
  };
}

function toNumber(text: string | undefined): number {
  return Number((text ?? '').replace(/,/g, ''));
}
