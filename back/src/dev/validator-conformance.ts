/**
 * npm run validator-conformance:emit — 회신 추출 검증기(`communication/extraction-rules.ts` validateAnswers)의 **실제 판정**을
 * 공용 정답 파일 `packages/contracts/conformance/extraction-validator.v1.json` 로 쓴다(T-099 · CERA Eval 신뢰성).
 *
 * 왜: 평가 도구(Python `ai/cera_ai/evals/scoring.py backend_checks`)가 Backend 검증기를 따로 구현한다. 둘이 다르면 평가의
 * pipeline 점수가 실제 Backend 동작과 달라진다. 정본은 이 TypeScript 검증기다 — 정답 파일은 그 출력만 담는다.
 *
 * - 이 파일을 만드는 쪽(여기)과 검사하는 쪽이 둘이다: `back/test/unit/validator-conformance.test.ts`(정답 파일이 최신인지 —
 *   검증기를 고치고 파일을 안 고치면 깨짐), `ai/tests/test_validator_conformance.py`(Python 포팅이 같은 판정을 내는지 —
 *   포팅을 안 고치면 깨짐).
 * - 입력 두 갈래: 손으로 고른 표현(`HAND_CASES`)과 평가 데이터셋 141건에서 만든 변형(gold · 한 칸 망가뜨림 · 상충 후보).
 *   데이터셋 항목은 `case_id` 로 ask · 원문을 데이터셋에서 찾는다(파일 크기를 줄이려고 복사하지 않는다).
 * - 순수 도구다: DB · 네트워크 · LLM 없음.
 */
import { REPLY_EXTRACT_SCHEMA } from '../ai/ai-client.js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Ask, ExtractionAnswer, ExtractionResponse } from '../ai/ai-client.js';
import { failedCodes, validateAnswers } from '../communication/extraction-rules.js';

export const CONFORMANCE_PATH = resolve(process.cwd(), '../packages/contracts/conformance/extraction-validator.v1.json');
export const DATASET_PATH = resolve(process.cwd(), '../ai/evals/datasets/cera-reply-eval-v1/cases.jsonl');

/** 평가 데이터셋 T1 질문(`A01`)과 같은 모양 — 손으로 고른 표현의 기본 질문. */
const ASK_T1: Ask = {
  ask_id: 'Q1',
  question: '10월 13일(화) 15:00~17:00 트럭 2대 추가 배차 가능 여부',
  answer_shape: 'QUANTITY_IN_TIME_WINDOW',
  fields: [
    { name: 'quantity', kind: 'QUANTITY', unit: 'TRUCK' },
    { name: 'available_from', kind: 'TIME', unit: null },
    { name: 'available_until', kind: 'TIME', unit: null },
    { name: 'answer_date', kind: 'DATE', unit: null },
  ],
  window: { date: '2026-10-13', from: '15:00', to: '17:00' },
};

interface CompactAnswer {
  ask_id: string;
  field: string;
  value: string;
  unit: string | null;
  quote: string;
}
interface HandCase {
  name: string;
  source: string;
  answers: CompactAnswer[];
}

const q = (field: string, value: string, unit: string | null, quote: string, askId = 'Q1'): CompactAnswer => ({ ask_id: askId, field, value, unit, quote });
const qty = (value: string, quote: string, unit: string | null = 'TRUCK') => q('quantity', value, unit, quote);
const from = (value: string, quote: string) => q('available_from', value, null, quote);

/** 손으로 고른 표현. 일부는 "Backend 가 거르는 알려진 한계"도 그대로 적는다(예: `오후 세 시`) — 판정을 바꾸려면 검증기를 고치고 파일을 다시 만든다. */
export const HAND_CASES: HandCase[] = [
  { name: 'digit 4대', source: '차량 4대까지 가능합니다', answers: [qty('4', '차량 4대까지 가능합니다')] },
  // reply-extract/2 날짜 칸 — 검증기는 형식 · 단위만 본다(날짜의 의미는 승격 단계가 인용에서 다시 푼다)
  { name: 'v2 answer_date valid', source: '13일 오후 3시 이후 4대', answers: [{ ask_id: 'Q1', field: 'answer_date', value: '2026-10-13', unit: null, quote: '13일' }] },
  { name: 'v2 answer_date not normalized', source: '10월 13일 가능', answers: [{ ask_id: 'Q1', field: 'answer_date', value: '10월 13일', unit: null, quote: '10월 13일' }] },
  { name: 'v2 answer_date with a unit', source: '내일 가능', answers: [{ ask_id: 'Q1', field: 'answer_date', value: '2026-10-14', unit: 'DAY', quote: '내일' }] },
  { name: 'korean 네 대', source: '네 대 가능합니다', answers: [qty('4', '네 대')] },
  { name: 'korean 네대 (붙임)', source: '네대 가능합니다', answers: [qty('4', '네대')] },
  { name: 'korean 두 대', source: '두 대 가능', answers: [qty('2', '두 대')] },
  { name: 'korean 세 대 vs value 2', source: '세 대 가능', answers: [qty('2', '세 대')] },
  { name: 'korean 열 대', source: '열 대 가능', answers: [qty('10', '열 대')] },
  { name: 'korean count word without unit', source: '두 분이 오십니다', answers: [qty('2', '두 분')] },
  { name: 'quantity 1,000 comma', source: '1,000대 가능', answers: [qty('1000', '1,000대')] },
  { name: 'quantity inside longer number', source: '14대 가능', answers: [qty('4', '14대')] },
  { name: 'quantity decimal 2.5', source: '2.5대 가능', answers: [qty('2', '2.5대')] },
  { name: 'quantity leading zero value', source: '4대', answers: [qty('04', '4대')] },
  { name: 'quantity date-like 13일', source: '13일 오후 3시', answers: [qty('13', '13일 오후 3시')] },
  { name: 'time 15시', source: '15시부터 가능', answers: [from('15:00', '15시부터')] },
  { name: 'time 오후 3시', source: '오후 3시부터 가능', answers: [from('15:00', '오후 3시부터')] },
  { name: 'time 오후 세 시 (한글 수 시각은 거름)', source: '오후 세 시부터 가능', answers: [from('15:00', '오후 세 시부터')] },
  { name: 'time 15:00', source: '15:00부터 가능', answers: [from('15:00', '15:00부터')] },
  { name: 'time 15:00 inside 115:001', source: '115:001', answers: [from('15:00', '115:001')] },
  { name: 'time 3시 (오전/오후 없음)', source: '3시부터', answers: [from('15:00', '3시부터')] },
  { name: 'time 15시 30분', source: '15시 30분부터', answers: [from('15:30', '15시 30분부터')] },
  { name: 'time 3시 반', source: '3시 반부터', answers: [from('15:30', '3시 반부터')] },
  { name: 'time 오후 3시 반', source: '오후 3시 반부터', answers: [from('15:30', '오후 3시 반부터')] },
  { name: 'time 오전 12시 = 00:00', source: '오전 12시부터', answers: [from('00:00', '오전 12시부터')] },
  { name: 'time 오후 12시 = 12:00', source: '오후 12시부터', answers: [from('12:00', '오후 12시부터')] },
  { name: 'time 24시 (형식 위반)', source: '24시부터', answers: [from('24:00', '24시부터')] },
  { name: 'time range quote 15~17시', source: '15~17시 가능', answers: [from('15:00', '15~17시'), q('available_until', '17:00', null, '15~17시')] },
  { name: 'time 3pm english', source: 'after 3 PM', answers: [from('15:00', 'after 3 PM')] },
  { name: 'time value 3pm (형식 위반)', source: '오후 3시', answers: [from('3pm', '오후 3시')] },
  { name: 'time value 9:00 (한 자리 시)', source: '9:00부터', answers: [from('9:00', '9:00부터')] },
  { name: 'date expression as time value', source: '13일 가능', answers: [from('2026-10-13', '13일')] },
  { name: 'field outside the question', source: '대당 35만원', answers: [q('rate', '350000', 'KRW', '대당 35만원')] },
  { name: 'unit mismatch KRW', source: '대당 35만원', answers: [qty('350000', '대당 35만원', 'KRW')] },
  { name: 'unit missing on quantity', source: '4대', answers: [qty('4', '4대', null)] },
  { name: 'unit empty string', source: '4대', answers: [qty('4', '4대', '')] },
  { name: 'unit on time field', source: '15시부터', answers: [q('available_from', '15:00', 'TRUCK', '15시부터')] },
  { name: 'unknown ask_id', source: '4대', answers: [q('quantity', '4', 'TRUCK', '4대', 'Q9')] },
  { name: 'quote not in source', source: '차량 4대 가능', answers: [qty('4', '트럭 4대')] },
  { name: 'quote with extra space', source: '차량 4대 가능', answers: [qty('4', '차량  4대')] },
  { name: 'empty quote', source: '4대', answers: [qty('4', '')] },
  { name: 'conflicting candidates', source: '2대 또는 3대', answers: [qty('2', '2대'), qty('3', '3대')] },
  { name: 'same value twice is consistent', source: '2대, 두 대', answers: [qty('2', '2대'), qty('2', '두 대')] },
  { name: 'conflict ignores an already-failed candidate', source: '2대 또는 3대', answers: [qty('2', '2대'), qty('3', '4대')] },
  { name: 'conflict per field is independent', source: '2대 15시', answers: [qty('2', '2대'), from('15:00', '15시'), from('16:00', '15시')] },
  { name: 'invalid value letters', source: '4대', answers: [qty('four', '4대')] },
  { name: 'invalid value too long', source: '1234567대', answers: [qty('1234567', '1234567대')] },
  { name: 'invalid value negative', source: '-4대', answers: [qty('-4', '-4대')] },
  // 비ASCII 숫자 · 공백 — JavaScript 와 Python 정규식이 갈리기 쉬운 곳
  { name: 'value arabic-indic digit', source: '٤대', answers: [qty('٤', '٤대')] },
  { name: 'value fullwidth digit', source: '４대', answers: [qty('４', '４대')] },
  { name: 'quote fullwidth digit vs ascii value', source: '４대', answers: [qty('4', '４대')] },
  { name: 'value trailing newline', source: '4대', answers: [qty('4\n', '4대')] },
  { name: 'time value trailing newline', source: '15:00부터', answers: [from('15:00\n', '15:00부터')] },
  { name: 'nbsp between hour and 시', source: '3 시부터', answers: [from('03:00', '3 시부터')] },
  { name: 'nbsp between 두 and 대', source: '두 대', answers: [qty('2', '두 대')] },
  { name: 'nbsp between 오후 and 3시', source: '오후 3시', answers: [from('15:00', '오후 3시')] },
  { name: 'ideographic space between 오후 and 3시', source: '오후　3시', answers: [from('15:00', '오후　3시')] },
  { name: 'no answers', source: '확인 후 연락드리겠습니다', answers: [] },
];

interface DatasetCase {
  case_id: string;
  ask: Ask;
  source_text: string;
  gold: { extraction: { ask_id: string; field: string; value: string; unit: string | null; evidence: string[]; optional: boolean }[] };
}

export function loadDataset(): DatasetCase[] {
  return readFileSync(DATASET_PATH, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as DatasetCase);
}

function bump(answer: CompactAnswer): string {
  if (/^\d+$/.test(answer.value) && !answer.value.includes(':')) return String(Number(answer.value) + 1);
  const m = /^(\d\d):(\d\d)$/.exec(answer.value);
  return m ? `${String((Number(m[1]) + 1) % 24).padStart(2, '0')}:${m[2]}` : `${answer.value}x`;
}

/** 한 칸을 망가뜨리는 방식 다섯 가지 — 케이스 순서대로 돌아가며 쓴다. */
const BREAKERS: ((a: CompactAnswer) => CompactAnswer)[] = [
  (a) => ({ ...a, value: bump(a) }),
  (a) => ({ ...a, quote: '존재하지 않는 인용문' }),
  (a) => ({ ...a, field: 'bogus_field' }),
  (a) => ({ ...a, unit: a.unit === 'PALLET' ? null : 'PALLET' }),
  (a) => ({ ...a, ask_id: 'Q9' }),
];

interface ExpectedAnswer {
  passed: boolean;
  failed: string[];
}
export interface ConformanceEntry {
  id: string;
  /** 손으로 고른 항목만 — 데이터셋 항목은 case_id 로 데이터셋에서 찾는다. */
  ask?: Ask;
  source_text?: string;
  case_id?: string;
  variant?: 'gold' | 'broken' | 'conflict';
  answers: CompactAnswer[];
  expected: ExpectedAnswer[];
}

function judge(ask: Ask, sourceText: string, answers: CompactAnswer[]): ExpectedAnswer[] {
  const response: ExtractionResponse = {
    schema_version: REPLY_EXTRACT_SCHEMA,
    outcome: answers.length > 0 ? 'VALUES' : 'NO_CHANGE',
    answers: answers.map(
      (a): ExtractionAnswer => ({ ask_id: a.ask_id, field: a.field, raw_value: a.value, value: a.value, unit: a.unit, evidence: { quote: a.quote }, confidence: null }),
    ),
    unmapped_statements: [],
    ambiguity_flags: [],
    meta: { provider: 'conformance', model_version: 'conformance', prompt_version: 'conformance', latency_ms: 0, usage: null },
  };
  return validateAnswers([ask], sourceText, response).map((v) => ({ passed: v.passed, failed: failedCodes(v.checks) }));
}

export function buildConformance(): { schema: string; note: string; entries: ConformanceEntry[] } {
  const entries: ConformanceEntry[] = [];
  for (const h of HAND_CASES) entries.push({ id: `hand/${h.name}`, ask: ASK_T1, source_text: h.source, answers: h.answers, expected: judge(ASK_T1, h.source, h.answers) });

  loadDataset().forEach((c, index) => {
    const gold: CompactAnswer[] = c.gold.extraction.filter((g) => !g.optional && g.evidence[0] !== undefined).map((g) => q(g.field, g.value, g.unit, g.evidence[0] as string, g.ask_id));
    const push = (variant: ConformanceEntry['variant'], answers: CompactAnswer[]) =>
      entries.push({ id: `dataset/${c.case_id}/${variant}`, case_id: c.case_id, variant, answers, expected: judge(c.ask, c.source_text, answers) });
    push('gold', gold);
    const first = gold[0];
    if (!first) return;
    push('broken', [(BREAKERS[index % BREAKERS.length] as (a: CompactAnswer) => CompactAnswer)(first), ...gold.slice(1)]);
    push('conflict', [...gold, { ...first, value: bump(first) }]);
  });
  return {
    schema: 'cera-validator-conformance/1',
    note: 'GENERATED by npm run validator-conformance:emit in back/ — the TypeScript validator (extraction-rules.ts) is the authority. Do not edit by hand.',
    entries,
  };
}

export function renderConformance(): string {
  return `${JSON.stringify(buildConformance(), null, 1)}\n`;
}

if (process.argv[1] && /validator-conformance\.[tj]s$/.test(process.argv[1])) {
  mkdirSync(dirname(CONFORMANCE_PATH), { recursive: true });
  writeFileSync(CONFORMANCE_PATH, renderConformance());
  console.log(`Validator conformance fixture written to ${CONFORMANCE_PATH}`);
}
