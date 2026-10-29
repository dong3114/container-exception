import { describe, expect, it } from 'vitest';
import type { ExtractionResponse } from '../../src/ai/ai-client.js';
import { validateAnswers } from '../../src/communication/extraction-rules.js';
import { type VesselCandidate, buildVesselAsk, identifierBacked, mentions, selectVesselCandidates, vesselAskId, vesselCallIdOfAsk } from '../../src/communication/vessel-claim-rules.js';
import { evaluateVesselClaim } from '../../src/truth/promotion-rules.js';

/** T-137 — 업체 회신 속 선박 입항 일시 주장: 질문 · 식별자 대조 · 시각 해석은 결정론. AI 는 후보만 낸다 */
const V1 = '01a0fb92-9b66-7544-aeb3-000000000001';
const V2 = '01a0fb92-9b66-7544-aeb3-000000000002';
const cand = (id: string, name: string | null, sign: string, linkedToRun = false): VesselCandidate => ({ vesselCallId: id, vesselName: name, callSign: sign, linkedToRun });

describe('T-137 which vessels the backend asks about', () => {
  it('only vessels the reply names by call sign or name — a run-linked vessel the reply never mentions is not asked', () => {
    const c = [cand(V1, 'HMM TEST', 'D7AB', true), cand(V2, 'SEA STAR', 'D7XY')];
    expect(selectVesselCandidates(c, '차량은 15시 이후 2대 가능합니다.')).toEqual([]);
    expect(selectVesselCandidates(c, 'D7AB 선박은 오늘 14시에 입항했습니다.').map((x) => x.vesselCallId)).toEqual([V1]);
    expect(selectVesselCandidates(c, 'sea star 는 내일 입항합니다').map((x) => x.vesselCallId)).toEqual([V2]);
  });

  it('identifiers are whole tokens — D7AB inside XD7ABC is not a mention', () => {
    expect(mentions('호출부호 XD7ABC', 'D7AB')).toBe(false);
    expect(mentions('호출부호 D7AB 입항', 'D7AB')).toBe(true);
  });

  it('one call sign with two vessel calls (two voyages) is not guessed: the run-linked one wins, otherwise nobody is asked', () => {
    const twoVoyages = [cand(V1, 'HMM TEST', 'D7AB'), cand(V2, 'HMM TEST', 'D7AB')];
    expect(selectVesselCandidates(twoVoyages, 'D7AB 오늘 14시 입항')).toEqual([]);
    expect(selectVesselCandidates([cand(V1, 'HMM TEST', 'D7AB'), cand(V2, 'HMM TEST', 'D7AB', true)], 'D7AB 오늘 14시 입항').map((x) => x.vesselCallId)).toEqual([V2]);
  });

  it('the ask carries the vessel call id the backend chose (the AI cannot invent another vessel) and asks for date + time only', () => {
    const ask = buildVesselAsk(cand(V1, 'HMM TEST', 'D7AB'));
    expect(ask).toMatchObject({ ask_id: vesselAskId(V1), answer_shape: 'ARRIVAL_DATETIME', window: null });
    expect(ask.ask_id.length).toBeLessThanOrEqual(40);
    expect(ask.fields.map((f) => f.name)).toEqual(['arrival_date', 'arrival_time']);
    expect(vesselCallIdOfAsk(ask.ask_id)).toBe(V1);
    expect(vesselCallIdOfAsk('Q1')).toBeNull();
  });

  it('identifier check: the sentence names the vessel, or the reply names only that vessel', () => {
    const a = cand(V1, 'HMM TEST', 'D7AB');
    const b = cand(V2, 'SEA STAR', 'D7XY');
    expect(identifierBacked('D7AB 는 오늘 14시 입항', 'D7AB 는 오늘 14시 입항', a, [a])).toBe(true);
    expect(identifierBacked('오늘 14시 입항했습니다', 'HMM TEST 건입니다. 오늘 14시 입항했습니다', a, [a])).toBe(true);
    expect(identifierBacked('오늘 14시 입항했습니다', 'HMM TEST 와 SEA STAR 건입니다. 오늘 14시 입항했습니다', a, [a, b])).toBe(false); // 어느 배인지 모른다
  });
});

describe('T-137 validator — the vessel answer must point at the vessel (deterministic identifier check)', () => {
  const a = cand(V1, 'HMM TEST', 'D7AB');
  const asks = [buildVesselAsk(a)];
  const response = (quote: string, value = '14:20'): ExtractionResponse => ({
    schema_version: 'reply-extract/2',
    outcome: 'VALUES',
    answers: [{ ask_id: vesselAskId(V1), field: 'arrival_time', raw_value: value, value, unit: null, evidence: { quote }, confidence: 0.9 }],
    unmapped_statements: [],
    ambiguity_flags: [],
    meta: { provider: 'replay', model_version: 'replay:test', prompt_version: 'reply-extract-v3', latency_ms: 1, usage: null },
  });
  it('passes when the quote sentence names the vessel and holds the time', () => {
    const text = 'D7AB 선박은 오늘 14시 20분에 입항했습니다.';
    const [v] = validateAnswers(asks, text, response('오늘 14시 20분에 입항했습니다'), [a]);
    expect(v!.passed).toBe(true);
    expect(v!.checks).toContainEqual({ check: 'IDENTIFIER_IN_SOURCE', passed: true, detail_code: null });
  });
  it('fails (person reviews) when the reply never names the vessel', () => {
    const text = '선박이 오늘 14시 20분에 입항했습니다.';
    const [v] = validateAnswers(asks, text, response('오늘 14시 20분에 입항했습니다'), [a]);
    expect(v!.passed).toBe(false);
    expect(v!.checks).toContainEqual({ check: 'IDENTIFIER_IN_SOURCE', passed: false, detail_code: 'VESSEL_NOT_IDENTIFIED' });
  });
  it('a time the quote does not contain is rejected (no guessing)', () => {
    const [v] = validateAnswers(asks, 'D7AB 방금 입항했습니다.', response('방금 입항했습니다', '14:20'), [a]);
    expect(v!.passed).toBe(false);
  });
});

describe('T-137 promotion — time is read against the reply date only (existing anchor policy); unclear → human review', () => {
  const base = { time: { extractionId: 't', value: '14:20', validated: true, reviewStatus: 'PENDING', createdEventId: null }, date: null, replyDate: '2026-10-20', ambiguous: false, isSimulated: false, scenarioId: null };
  it('"오늘 14시 20분" = the reply day at 14:20 Asia/Seoul', () => {
    expect(evaluateVesselClaim({ ...base, sentence: 'D7AB 는 오늘 14시 20분에 입항했습니다' })).toEqual({ ok: true, arrivalAtIso: '2026-10-20T05:20:00.000Z', siblingExtractionIds: [] });
  });
  it('"10월 21일 9시" = that day', () => {
    expect(evaluateVesselClaim({ ...base, time: { ...base.time, value: '09:00' }, sentence: 'D7AB 10월 21일 9시 입항 예정' })).toMatchObject({ ok: true, arrivalAtIso: '2026-10-21T00:00:00.000Z' });
  });
  it('no day in the sentence ("오후 3시로 지연") is not guessed → DATE_UNVERIFIED', () => {
    expect(evaluateVesselClaim({ ...base, time: { ...base.time, value: '15:00' }, sentence: 'D7AB 입항이 오후 3시로 지연됐습니다' })).toEqual({ ok: false, reasons: ['DATE_UNVERIFIED'] });
  });
  it('an unresolvable day ("다음 주") or two days → DATE_UNVERIFIED; no time at all → not a comparable value', () => {
    expect(evaluateVesselClaim({ ...base, sentence: 'D7AB 다음 주 14시 20분 입항' })).toMatchObject({ ok: false, reasons: ['DATE_UNVERIFIED'] });
    expect(evaluateVesselClaim({ ...base, sentence: 'D7AB 오늘 또는 내일 14시 20분 입항' })).toMatchObject({ ok: false, reasons: ['DATE_UNVERIFIED'] });
    expect(evaluateVesselClaim({ ...base, time: null, sentence: 'D7AB 아직 입항하지 않았습니다' })).toEqual({ ok: false, reasons: ['FIELD_NOT_A_FACT_VALUE'] });
  });
  it('a model date that disagrees with the quote is not trusted', () => {
    expect(evaluateVesselClaim({ ...base, date: { extractionId: 'd', value: '2026-10-21', validated: true }, sentence: 'D7AB 오늘 14시 20분 입항' })).toMatchObject({ ok: false, reasons: ['DATE_UNVERIFIED'] });
    expect(evaluateVesselClaim({ ...base, date: { extractionId: 'd', value: '2026-10-20', validated: true }, sentence: 'D7AB 오늘 14시 20분 입항' })).toMatchObject({ ok: true, siblingExtractionIds: ['d'] });
  });
});
