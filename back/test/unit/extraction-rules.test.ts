import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type ExtractionRequest, type ExtractionResponse, HttpAiClient, extractionResponseSchema } from '../../src/ai/ai-client.js';
import { buildAsk, failedCodes, validateAnswers } from '../../src/communication/extraction-rules.js';

const SAMPLE_REQUEST = JSON.parse(readFileSync('../packages/contracts/ai/reply-extract.v2.request.sample.json', 'utf8')) as ExtractionRequest;
const SAMPLE_RESPONSE = JSON.parse(readFileSync('../packages/contracts/ai/reply-extract.v2.response.sample.json', 'utf8')) as unknown;
// 하위 호환(T-111): 날짜 칸 없는 v1 AI Server 의 응답도 받는다
const V1_RESPONSE = JSON.parse(readFileSync('../packages/contracts/ai/reply-extract.v1.response.sample.json', 'utf8')) as unknown;

const ask = buildAsk({
  askId: 'Q1',
  questionType: 'SLOT',
  questionText: '10월 13일(화) 15:00~17:00 트럭 2대 추가 배차 가능 여부',
  expectedUnit: 'TRUCK',
  values: { date: '2026-10-13', window_from: '15:00', window_to: '17:00', quantity: '2' },
});
if (!ask) throw new Error('ask');

const answer = (field: string, value: string, unit: string | null, quote: string) => ({
  ask_id: 'Q1',
  field,
  raw_value: value,
  value,
  unit,
  evidence: { quote },
  confidence: 0.9,
});
const response = (answers: ExtractionResponse['answers'], flags: string[] = []): ExtractionResponse => ({
  schema_version: 'reply-extract/2',
  outcome: 'VALUES',
  answers,
  unmapped_statements: [],
  ambiguity_flags: flags,
  meta: { provider: 'replay', model_version: 'replay:test', prompt_version: 'reply-extract-v1', latency_ms: 1, usage: null },
});

describe('shared contract (packages/contracts/ai) — the same samples are checked by the Python tests', () => {
  it('the backend builds exactly the sample request shape and accepts the sample response', () => {
    expect(ask).toEqual(SAMPLE_REQUEST.asks[0]);
    expect(Object.keys(SAMPLE_REQUEST).sort()).toEqual(['asks', 'counterparty_name', 'inbound_message_id', 'message_text', 'reference_date', 'reply_date', 'schema_version', 'timezone']);
    expect(extractionResponseSchema.safeParse(SAMPLE_RESPONSE).success).toBe(true);
    expect(extractionResponseSchema.safeParse(V1_RESPONSE).success).toBe(true);
  });

  it('the response schema has no place for identity, fact keys or strength — unknown keys are rejected', () => {
    const extra = { ...(SAMPLE_RESPONSE as object), fact_key: 'available.slot' };
    expect(extractionResponseSchema.safeParse(extra).success).toBe(false);
    const sneaky = JSON.parse(JSON.stringify(SAMPLE_RESPONSE));
    sneaky.answers[0].entity_id = 'x';
    expect(extractionResponseSchema.safeParse(sneaky).success).toBe(false);
  });
});

describe('validateAnswers — the backend decides, not the AI', () => {
  const text = '내일 오후 3시 이후 차량 4대까지 가능합니다.\n단가는 대당 18만원입니다.';

  it('A. a real answer with a verbatim quote passes every check', () => {
    const [q, t] = validateAnswers([ask], text, response([answer('quantity', '4', 'TRUCK', '차량 4대까지 가능합니다'), answer('available_from', '15:00', null, '오후 3시 이후')]));
    expect(q?.passed).toBe(true);
    expect(q?.quoteLocation).toBe(`chars:${text.indexOf('차량')}-${text.indexOf('차량') + '차량 4대까지 가능합니다'.length}`);
    expect(q?.checks.map((c) => c.check)).toEqual(['FIELD', 'QUESTION_SCOPE', 'QUOTE_IN_SOURCE', 'VALUE_FORMAT', 'UNIT', 'VALUE_IN_QUOTE', 'CONSISTENCY']);
    expect(t?.passed).toBe(true);
  });

  it('B. a quote that is not in the reply is rejected (no paraphrase accepted)', () => {
    const [v] = validateAnswers([ask], text, response([answer('quantity', '4', 'TRUCK', '차량 4대 가능합니다')]));
    expect(v?.passed).toBe(false);
    expect(failedCodes(v?.checks ?? [])).toEqual(['QUOTE_NOT_IN_SOURCE']);
  });

  it('C. money returned as a truck quantity is rejected (unit and value-in-quote)', () => {
    const [v] = validateAnswers([ask], '대당 18만원이면 가능합니다.', response([answer('quantity', '180000', 'KRW', '18만원')]));
    expect(failedCodes(v?.checks ?? [])).toEqual(['UNIT_MISMATCH:KRW', 'VALUE_NOT_IN_QUOTE']);
  });

  it('D. a field nobody asked (rate) never becomes a business candidate', () => {
    const [v] = validateAnswers([ask], text, response([answer('rate_per_truck', '180000', 'KRW', '단가는 대당 18만원입니다')]));
    expect(v?.passed).toBe(false);
    expect(failedCodes(v?.checks ?? [])).toEqual(['FIELD_NOT_ASKED']);
    const [unknownAsk] = validateAnswers([ask], text, response([{ ...answer('quantity', '4', 'TRUCK', '차량 4대까지 가능합니다'), ask_id: 'Q9' }]));
    expect(failedCodes(unknownAsk?.checks ?? [])).toContain('UNKNOWN_ASK');
  });

  it('formats, Korean numerals, times and conflicts', () => {
    const korean = validateAnswers([ask], '두 대 가능합니다', response([answer('quantity', '2', 'TRUCK', '두 대 가능합니다')]));
    expect(korean[0]?.passed).toBe(true);
    const wrongNumber = validateAnswers([ask], '차량 3대 가능', response([answer('quantity', '4', 'TRUCK', '차량 3대 가능')]));
    expect(failedCodes(wrongNumber[0]?.checks ?? [])).toEqual(['VALUE_NOT_IN_QUOTE']);
    expect(validateAnswers([ask], '15시부터', response([answer('available_from', '15:00', null, '15시부터')]))[0]?.passed).toBe(true);
    expect(validateAnswers([ask], '3시 반부터', response([answer('available_from', '15:30', null, '3시 반부터')]))[0]?.passed).toBe(false); // 오전/오후 없이 3시는 15시가 아니다
    expect(failedCodes(validateAnswers([ask], '오후 3시', response([answer('available_from', '3pm', null, '오후 3시')]))[0]?.checks ?? [])).toContain('BAD_TIME');
    const conflict = validateAnswers([ask], '4대 또는 5대 가능', response([answer('quantity', '4', 'TRUCK', '4대'), answer('quantity', '5', 'TRUCK', '5대')]));
    expect(conflict.map((c) => failedCodes(c.checks))).toEqual([['CONFLICTING_CANDIDATES'], ['CONFLICTING_CANDIDATES']]);
  });

  it('ambiguity flags are recorded but do not reject (input confidence is decided when an event is made)', () => {
    const [v] = validateAnswers([ask], text, response([answer('quantity', '4', 'TRUCK', '차량 4대까지 가능합니다')], ['HEDGED_LANGUAGE']));
    expect(v?.passed).toBe(true);
    expect(v?.checks.find((c) => c.check === 'AMBIGUITY')?.detail_code).toBe('HEDGED_LANGUAGE');
  });
});

describe('HttpAiClient — technical failures are classified, never parsed as candidates', () => {
  const fake = (status: number, body: unknown): typeof fetch => (async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })) as unknown as typeof fetch;
  const call = (impl: typeof fetch) => new HttpAiClient('http://ai.invalid', 1000, impl).extractReply(SAMPLE_REQUEST, 'req-1');

  it('ok · invalid schema · provider failure · server down · timeout', async () => {
    expect(await call(fake(200, SAMPLE_RESPONSE))).toMatchObject({ ok: true });
    expect(await call(fake(200, { schema_version: 'reply-extract/1', outcome: 'VALUES', answers: 'x' }))).toMatchObject({ ok: false, code: 'EXTRACTION_OUTPUT_INVALID' });
    expect(await call(fake(200, 'not json'))).toMatchObject({ ok: false, code: 'EXTRACTION_OUTPUT_INVALID' });
    expect(await call(fake(502, { code: 'NO_RECORDING', retryable: false }))).toMatchObject({ ok: false, code: 'EXTRACTION_PROVIDER_FAILED', providerCode: 'NO_RECORDING', retryable: false });
    expect(await call(fake(502, { code: 'PROVIDER_OUTPUT_NOT_JSON' }))).toMatchObject({ ok: false, code: 'EXTRACTION_OUTPUT_INVALID' });
    expect(await call(fake(503, { code: 'X' }))).toMatchObject({ ok: false, code: 'AI_SERVER_UNAVAILABLE', retryable: true });
    const refused = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    expect(await call(refused)).toMatchObject({ ok: false, code: 'AI_SERVER_UNAVAILABLE', retryable: true });
    const slow = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('t'), { name: 'TimeoutError' }))))) as unknown as typeof fetch;
    expect(await new HttpAiClient('http://ai.invalid', 50, slow).extractReply(SAMPLE_REQUEST, null)).toMatchObject({ ok: false, code: 'EXTRACTION_TIMEOUT', retryable: true });
  });
});
