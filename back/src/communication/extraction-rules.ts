import type { Ask, ExtractionAnswer, ExtractionResponse } from '../ai/ai-client.js';
import { sentenceAround } from '../truth/date-scope.js';
import { type VesselCandidate, identifierBacked, vesselCallIdOfAsk } from './vessel-claim-rules.js';

/**
 * 회신 추출의 결정론 규칙(T-092 U7 · docs/18 D.3 · docs/05 4.6 · docs/22 15.9.2).
 *
 * - **질문 만들기**: CERA 가 이미 물은 것(질문 행 · 보낸 메시지의 구조화 값)으로 AI 에 줄 질문을 정한다 — "중요한 것을 다 찾아라"가 아니다
 * - **검증**: AI 의 답을 믿지 않는다. 답마다 검사하고 결과를 `validator_result`(`[{check, passed, detail_code}]`)로 남긴다
 * - AI 의 자기 점수(`confidence`)는 판정에 쓰지 않는다(docs/05 4.6)
 *
 * 순수 모듈이다: DB · 네트워크 · LLM 을 import 하지 않고, 현재 시각을 읽지 않는다(기준일은 질문의 날짜).
 */

export interface QuestionContext {
  askId: string;
  questionType: string; // SLOT · CAPACITY
  questionText: string;
  expectedUnit: string | null;
  /** 보낸 메시지의 구조화 값(질문을 정한 값) — date · window_from · window_to · size_type. */
  values: Record<string, string | null>;
}

/** 질문 행 → AI 에 줄 질문 하나. 모르는 질문 종류면 null(추출하지 않는다). */
export function buildAsk(q: QuestionContext): Ask | null {
  if (q.questionType === 'SLOT' && q.expectedUnit) {
    const date = q.values.date;
    const from = q.values.window_from;
    const to = q.values.window_to;
    return {
      ask_id: q.askId,
      question: q.questionText,
      answer_shape: 'QUANTITY_IN_TIME_WINDOW',
      fields: [
        { name: 'quantity', kind: 'QUANTITY', unit: q.expectedUnit },
        { name: 'available_from', kind: 'TIME', unit: null },
        { name: 'available_until', kind: 'TIME', unit: null },
        // v2(T-111): 답이 말한 날짜. 질문 날짜와 다르거나 인용에서 결정론으로 같은 날짜가 나오지 않으면 승격하지 않는다(promotion-rules)
        { name: 'answer_date', kind: 'DATE', unit: null },
      ],
      window: date && from && to ? { date, from, to } : null,
    };
  }
  if (q.questionType === 'CAPACITY' && q.expectedUnit) {
    return {
      ask_id: q.askId,
      question: q.questionText,
      answer_shape: 'QUANTITY_ON_DATE',
      fields: [
        { name: 'quantity', kind: 'QUANTITY', unit: q.expectedUnit },
        { name: 'answer_date', kind: 'DATE', unit: null },
      ],
      window: null,
    };
  }
  return null;
}

export interface Check {
  check: string;
  passed: boolean;
  detail_code: string | null;
}

export interface ValidatedAnswer {
  answer: ExtractionAnswer;
  /** 첫 검사 `FIELD` 의 값 — 질문의 어느 칸에 대한 답인지(행에 칸 열이 없어 검사 결과에 남긴다). */
  field: string;
  checks: Check[];
  passed: boolean;
  /** 원문 안 인용 위치(`chars:<시작>-<끝>`) — 없으면 null. */
  quoteLocation: string | null;
}

const KOREAN_NUMBERS: Record<string, number> = { 한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };

/** 수량 값이 인용 안에 숫자(또는 한글 수)로 실제로 있는가. */
function quantityInQuote(value: string, quote: string): boolean {
  const n = Number(value);
  if (new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(quote.replace(/,/g, ''))) return true;
  return Object.entries(KOREAN_NUMBERS).some(([word, num]) => num === n && new RegExp(`${word}\\s*(대|개|명|칸|TEU|teu)`).test(quote));
}

/** 시각 값(HH:MM)이 인용 안에 있는가 — `15:00` · `15시` · `오후 3시` · `3시 30분`. */
function timeInQuote(value: string, quote: string): boolean {
  const [h, m] = value.split(':').map(Number) as [number, number];
  if (quote.includes(value)) return true;
  const minuteOk = (text: string) => m === 0 || new RegExp(`${m}\\s*분`).test(text) || (m === 30 && /반/.test(text));
  // 앞에 0 이 붙은 시각("06시" · "오전 09시")도 같은 시각이다(T-144 실제 회신) — 0 하나만. 다른 숫자에 붙은 시각("16시"의 6)은 여전히 아니다
  if (new RegExp(`(^|[^0-9])0?${h}\\s*시`).test(quote) && minuteOk(quote)) return true;
  const h12 = h > 12 ? h - 12 : h;
  const meridiem = h >= 12 ? '오후' : '오전';
  return new RegExp(`${meridiem}\\s*0?${h12}\\s*시`).test(quote) && minuteOk(quote);
}

const FORMAT: Record<string, RegExp> = { QUANTITY: /^\d{1,6}$/, TIME: /^([01]\d|2[0-3]):[0-5]\d$/, MONEY: /^\d{1,12}$/, DATE: /^\d{4}-\d{2}-\d{2}$/ };

/**
 * 답마다 검사(docs/05 4.6 의 일곱 검사 안에서): 질문 범위 · 인용이 원문에 그대로 있음 · 값 형식 · 단위 · 값이 인용에 있음 · 상충.
 * 모델 거절 · 호출 실패 · 스키마 위반은 여기 오기 전에 기술 실패로 끝난다(system_error).
 */
export function validateAnswers(asks: readonly Ask[], sourceText: string, response: ExtractionResponse, vessels: readonly VesselCandidate[] = []): ValidatedAnswer[] {
  const out: ValidatedAnswer[] = response.answers.map((answer) => {
    const checks: Check[] = [{ check: 'FIELD', passed: true, detail_code: answer.field }];
    const ask = asks.find((a) => a.ask_id === answer.ask_id);
    const field = ask?.fields.find((f) => f.name === answer.field);
    checks.push({
      check: 'QUESTION_SCOPE',
      passed: Boolean(ask && field),
      detail_code: !ask ? 'UNKNOWN_ASK' : !field ? 'FIELD_NOT_ASKED' : null,
    });
    const at = sourceText.indexOf(answer.evidence.quote);
    checks.push({ check: 'QUOTE_IN_SOURCE', passed: at >= 0, detail_code: at >= 0 ? null : 'QUOTE_NOT_IN_SOURCE' });
    if (field) {
      const formatOk = FORMAT[field.kind]?.test(answer.value) ?? false;
      checks.push({ check: 'VALUE_FORMAT', passed: formatOk, detail_code: formatOk ? null : `BAD_${field.kind}` });
      const unitOk = (answer.unit ?? null) === (field.unit ?? null);
      checks.push({ check: 'UNIT', passed: unitOk, detail_code: unitOk ? null : `UNIT_MISMATCH:${answer.unit ?? 'NONE'}` });
      // 날짜(v2)는 인용의 날짜 표현을 회신 날짜 기준으로 다시 풀어야 맞는지 안다 — 그 판정은 승격 단계(date-scope)가 한다. 여기서는 형식만
      const inQuote = formatOk && (field.kind === 'DATE' ? true : field.kind === 'TIME' ? timeInQuote(answer.value, answer.evidence.quote) : quantityInQuote(answer.value, answer.evidence.quote));
      checks.push({ check: 'VALUE_IN_QUOTE', passed: inQuote, detail_code: inQuote ? null : 'VALUE_NOT_IN_QUOTE' });
    }
    // T-137: 선박 입항 질문의 답은 그 배를 말한 것이어야 한다 — 이름 · 호출부호가 인용 문장에 있거나 회신이 그 배 하나만 말한다(결정론 대조, 유사도 없음)
    const vesselId = vesselCallIdOfAsk(answer.ask_id);
    if (vesselId !== null) {
      const vessel = vessels.find((v) => v.vesselCallId === vesselId);
      const backed = Boolean(vessel && at >= 0 && identifierBacked(sentenceAround(sourceText, answer.evidence.quote), sourceText, vessel, vessels));
      checks.push({ check: 'IDENTIFIER_IN_SOURCE', passed: backed, detail_code: backed ? null : 'VESSEL_NOT_IDENTIFIED' });
    }
    if (response.ambiguity_flags.length > 0) {
      // 모호 표현은 여기서 탈락시키지 않는다 — 사건이 될 때 입력 신뢰도를 낮추는 재료(U8)
      checks.push({ check: 'AMBIGUITY', passed: true, detail_code: response.ambiguity_flags.slice(0, 3).join('|').slice(0, 60) });
    }
    return {
      answer,
      field: answer.field,
      checks,
      passed: checks.every((c) => c.passed),
      quoteLocation: at >= 0 ? `chars:${at}-${at + answer.evidence.quote.length}` : null,
    };
  });

  // 상충: 같은 질문 · 같은 칸에 서로 다른 값이 (다른 검사를 통과한 채) 둘 이상이면 모두 탈락
  const groups = new Map<string, ValidatedAnswer[]>();
  for (const v of out.filter((x) => x.passed)) {
    const key = `${v.answer.ask_id}\u0000${v.field}`;
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  for (const group of groups.values()) {
    const conflicting = new Set(group.map((g) => g.answer.value)).size > 1;
    for (const v of group) {
      v.checks.push({ check: 'CONSISTENCY', passed: !conflicting, detail_code: conflicting ? 'CONFLICTING_CANDIDATES' : null });
      v.passed = v.passed && !conflicting;
    }
  }
  return out;
}

/** 실패한 검사의 사유 코드(화면 표시). */
export function failedCodes(checks: readonly Check[]): string[] {
  return checks.filter((c) => !c.passed).map((c) => c.detail_code ?? c.check);
}
