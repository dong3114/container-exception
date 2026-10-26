import { describe, expect, it } from 'vitest';
import { wakeReason } from '../../src/agent-tools/wake-rules.js';
import { parseFactKey } from '../../src/truth/fact-key.js';
import { dateMentions, sentenceAround } from '../../src/truth/date-scope.js';
import { evaluatePromotion, senderAuthority, type PromotionInput } from '../../src/truth/promotion-rules.js';
import { DEFAULT_TRUTH_POLICY } from '../../src/truth/truth-policy.js';
import { type FactEvent, type VerificationEvent, factState, reconcile, verificationStates } from '../../src/truth/reconcile-rules.js';

/** T-093 순수 규칙 — 모델이 틀리는 것은 정상이고, 사실 상태는 규칙(출처 강도 · 사람 확인 · 시각 · 충돌)만 정한다. */
const AS_OF = '2026-12-01T00:00:00.000Z';
let n = 0;
const ev = (o: Partial<FactEvent> & { at: string; value: number | null }): FactEvent => ({
  eventId: `00000000-0000-7000-8000-${String(++n).padStart(12, '0')}`,
  eventClass: 'OBSERVATION',
  supersedesEventId: null,
  unit: 'TRUCK',
  factKind: 'OFFER',
  validFrom: '2026-12-01T06:00:00.000Z',
  validUntil: '2026-12-01T08:00:00.000Z',
  sourceType: 'EMAIL',
  authority: 'A',
  confidence: 'MEDIUM',
  evidenceTime: o.at,
  evidenceTimeQuality: 'RECORDED_TIME',
  receivedAt: o.at,
  ...o,
});
const verify = (action: VerificationEvent['action'], target: string, at: string): VerificationEvent => ({ eventId: `v-${++n}`, action, targetEventIds: [target], receivedAt: at });
const run = (events: FactEvent[], verifications: VerificationEvent[] = [], asOf = AS_OF, policy = DEFAULT_TRUTH_POLICY) => reconcile(events, verifications, asOf, policy);

const T = (hhmm: string) => `2026-11-20T${hhmm}:00.000Z`;

describe('reconcile — truth states', () => {
  it('no eligible event → UNKNOWN (unusable, no winner)', () => {
    const r = run([]);
    expect(r).toMatchObject({ status: 'UNKNOWN', winner: null, usability: 'UNUSABLE' });
    expect(factState(r)).toBe('UNKNOWN');
  });

  it('one validated email reply → PROVISIONAL (strength 1, usable with a warning) — never CONFIRMED', () => {
    const a = ev({ at: T('01:00'), value: 4 });
    const r = run([a]);
    expect(r).toMatchObject({ status: 'PROVISIONAL', verificationBasis: null, usability: 'USABLE_WITH_WARNING', conflictStatus: 'NONE', holdStatus: 'NONE' });
    expect(r.winner?.strength).toBe(1);
    expect(factState(r)).toBe('PROVISIONAL');
  });

  it('a wrong-sender (W) or low-confidence email is ineligible: it cannot become a value at all', () => {
    expect(run([ev({ at: T('01:00'), value: 4, authority: 'W' })]).status).toBe('UNKNOWN');
    expect(run([ev({ at: T('01:00'), value: 4, confidence: 'LOW' })]).roles.size).toBe(1);
    expect(run([ev({ at: T('01:00'), value: 4, confidence: 'LOW' })]).status).toBe('UNKNOWN');
  });

  it('a human CONFIRM makes it CONFIRMED (HUMAN_VERIFICATION, strength 2); a human REJECT removes it; REVOKE undoes the last decision', () => {
    const a = ev({ at: T('01:00'), value: 4 });
    const confirmed = run([a], [verify('CONFIRM', a.eventId, T('02:00'))]);
    expect(confirmed).toMatchObject({ status: 'CONFIRMED', verificationBasis: 'HUMAN_VERIFICATION', usability: 'USABLE' });
    expect(confirmed.winner?.strength).toBe(2);
    expect(run([a], [verify('REJECT', a.eventId, T('02:00'))]).status).toBe('UNKNOWN');
    expect(run([a], [verify('CONFIRM', a.eventId, T('02:00')), verify('REVOKE', a.eventId, T('03:00'))]).status).toBe('PROVISIONAL');
    expect(run([a], [verify('REJECT', a.eventId, T('02:00')), verify('REVOKE', a.eventId, T('03:00'))]).status).toBe('PROVISIONAL');
    expect([...verificationStates([verify('CONFIRM', a.eventId, T('02:00')), verify('REJECT', a.eventId, T('03:00'))])]).toEqual([[a.eventId, 'REJECTED']]);
  });

  it('a human-entered value (HUMAN_UI, operator = S) is CONFIRMED at once; a correction supersedes the AI value but keeps it on record', () => {
    const ai = ev({ at: T('01:00'), value: 4 });
    const human = ev({ at: T('01:00'), value: 3, eventClass: 'CORRECTION', supersedesEventId: ai.eventId, sourceType: 'HUMAN_UI', authority: 'S', confidence: 'HIGH', receivedAt: T('05:00') });
    const r = run([ai, human]);
    expect(r).toMatchObject({ status: 'CONFIRMED', verificationBasis: 'HUMAN_VERIFICATION' });
    expect(r.winner?.eventId).toBe(human.eventId);
    expect(r.roles.get(ai.eventId)).toBe('SUPERSEDED');
    // 값 없는 정정은 철회: 대상도 정정 자신도 후보가 아니다
    const withdrawn = ev({ at: T('01:00'), value: null, eventClass: 'CORRECTION', supersedesEventId: ai.eventId, sourceType: 'HUMAN_UI', authority: 'S', confidence: 'HIGH' });
    expect(run([ai, withdrawn]).status).toBe('UNKNOWN');
  });

  it('a public-API value (strength 2, no human) is OBSERVED, not CONFIRMED; an authoritative partner system value is CONFIRMED', () => {
    expect(run([ev({ at: T('01:00'), value: 4, sourceType: 'PUBLIC_API', authority: 'A', confidence: 'HIGH' })]).status).toBe('OBSERVED');
    const partner = run([ev({ at: T('01:00'), value: 4, sourceType: 'PARTNER_SYSTEM', authority: 'A', confidence: 'HIGH' })]);
    expect(partner).toMatchObject({ status: 'CONFIRMED', verificationBasis: 'AUTHORITATIVE_SYSTEM' });
  });
});

describe('reconcile — conflicts are never overwritten silently', () => {
  it('R10: a weaker source cutting the current value by ≥ 30% is held (current stays); a smaller cut or a rise is adopted', () => {
    const a = ev({ at: T('01:00'), value: 4 });
    const cut = ev({ at: T('01:30'), value: 2 });
    const held = run([a, cut]);
    expect(held).toMatchObject({ appliedRule: 'R10', holdStatus: 'HELD', usability: 'APPROVAL_BLOCKED', heldEventId: cut.eventId });
    expect(held.winner?.value).toBe(4);
    expect(factState(held)).toBe('NEEDS_REVIEW');
    expect(held.roles.get(cut.eventId)).toBe('HELD_CANDIDATE');
    expect(run([a, ev({ at: T('01:30'), value: 3 })]).winner?.value).toBe(3); // 25% 감소 — 보류 아님
    expect(run([a, ev({ at: T('01:30'), value: 5 })])).toMatchObject({ appliedRule: 'R4-a', holdStatus: 'NONE' });
  });

  it('R4-b: a newer, weaker value that disagrees with a stronger (human-confirmed) one opens a conflict; the stronger stays', () => {
    const a = ev({ at: T('01:00'), value: 4 });
    const confirm = verify('CONFIRM', a.eventId, T('01:10'));
    const b = ev({ at: T('03:00'), value: 5 });
    const r = run([a, b], [confirm]);
    expect(r).toMatchObject({ appliedRule: 'R4-b', conflictStatus: 'OPEN', conflictType: 'CHALLENGED_BY_WEAKER', usability: 'APPROVAL_BLOCKED' });
    expect(r.winner?.eventId).toBe(a.eventId);
    expect(r.conflictEventIds).toEqual([a.eventId, b.eventId]);
    expect(r.roles.get(b.eventId)).toBe('CONTESTING');
    // 사람이 새 값을 확인하면 같은 강도 · 더 최근 → 새 값이 이긴다, 충돌은 사라진다
    const resolved = run([a, b], [confirm, verify('CONFIRM', b.eventId, T('03:30'))]);
    expect(resolved).toMatchObject({ conflictStatus: 'NONE', status: 'CONFIRMED' });
    expect(resolved.winner?.value).toBe(5);
    // 사람이 새 값을 거절하면 현직이 충돌 없이 남는다
    expect(run([a, b], [confirm, verify('REJECT', b.eventId, T('03:30'))])).toMatchObject({ conflictStatus: 'NONE', status: 'CONFIRMED' });
  });

  it('R6: equally strong, different values within τ (5 min) → OPEN conflict, the earlier-received value stays', () => {
    const a = ev({ at: T('01:00'), value: 4 });
    const b = ev({ at: T('01:03'), value: 3 });
    const r = run([a, b]);
    expect(r).toMatchObject({ appliedRule: 'R6', conflictStatus: 'OPEN', conflictType: 'SIMULTANEOUS' });
    expect(r.winner?.eventId).toBe(a.eventId);
    // τ 밖이면 시간 순서(R4-a)로 푼다
    expect(run([a, ev({ at: T('01:06'), value: 5 })]).conflictStatus).toBe('NONE');
  });

  it('R4-a dissent: an older weaker different value inside τ is recorded as DISSENT without blocking', () => {
    const weak = ev({ at: T('01:00'), value: 2 });
    const strong = ev({ at: T('01:02'), value: 4, sourceType: 'HUMAN_UI', authority: 'S', confidence: 'HIGH' });
    const r = run([weak, strong]);
    expect(r).toMatchObject({ conflictStatus: 'DISSENT', usability: 'USABLE_WITH_WARNING', status: 'CONFIRMED' }); // 반대 의견이 기록된 사실은 주의와 함께 쓴다(R11)
    expect(r.roles.get(weak.eventId)).toBe('DISSENTING');
  });

  it('R4-d: an offer whose time window has passed (relative to the plan snapshot) is unusable', () => {
    const a = ev({ at: T('01:00'), value: 4, validUntil: '2026-11-30T08:00:00.000Z' });
    expect(run([a], [], AS_OF)).toMatchObject({ freshness: 'EXPIRED', usability: 'UNUSABLE' });
    expect(run([a], [], '2026-11-29T00:00:00.000Z').usability).toBe('USABLE_WITH_WARNING');
    // 상태(STATE) 사실은 시간창이 지나도 만료하지 않는다
    expect(run([ev({ at: T('01:00'), value: 4, factKind: 'STATE', validUntil: '2026-11-30T08:00:00.000Z' })], [], AS_OF).freshness).toBe('UNKNOWN');
  });

  it('is deterministic: the order the events arrive in does not change the answer', () => {
    const events = [ev({ at: T('01:00'), value: 4 }), ev({ at: T('01:30'), value: 2 }), ev({ at: T('02:00'), value: 5 }), ev({ at: T('02:01'), value: 5 })];
    const ref = run(events);
    for (const order of [[3, 2, 1, 0], [1, 3, 0, 2], [2, 0, 3, 1]]) {
      const r = run(order.map((i) => events[i] as FactEvent));
      expect(r.winner?.eventId).toBe(ref.winner?.eventId);
      expect([...r.roles].sort()).toEqual([...ref.roles].sort());
      expect([r.status, r.conflictStatus, r.holdStatus, r.appliedRule]).toEqual([ref.status, ref.conflictStatus, ref.holdStatus, ref.appliedRule]);
    }
  });
});

describe('promotion — who may become a provisional fact', () => {
  const base = (over: Partial<PromotionInput> = {}): PromotionInput => ({
    extraction: { extractionId: 'x1', askId: 'Q1', field: 'quantity', value: '4', unit: 'TRUCK', validated: true, ambiguous: false, reviewStatus: 'PENDING', createdEventId: null },
    siblings: [],
    question: { questionType: 'SLOT', status: 'SENT', expectedUnit: 'TRUCK', target: { entityType: 'TRUCK_POOL', entityId: 'p1', factKey: 'available.slot(2026-12-01T15:00-17:00)', scopeType: 'GLOBAL', scopeRef: '' }, asked: { date: '2026-12-01', windowFrom: '15:00', windowTo: '17:00' } },
    entity: { type: 'TRUCK_POOL', facilityType: null, ownerCounterpartyId: 'c1' },
    sender: { counterpartyId: 'c1', role: 'TRUCKING' },
    planSuperseded: false,
    isSimulated: true,
    scenarioId: 's1',
    replySentence: '차량 4대 가능합니다.',
    replyDate: '2026-11-30',
    ...over,
  });
  const reasons = (i: PromotionInput) => {
    const d = evaluatePromotion(i);
    return d.ok ? [] : d.reasons;
  };

  it('a validated quantity from the owner becomes an offer event with the asked window as its validity (Asia/Seoul → UTC)', () => {
    const d = evaluatePromotion(base());
    expect(d).toMatchObject({ ok: true, plan: { eventType: 'TRUCK_AVAILABILITY_REPORTED', factKind: 'OFFER', value: 4, unit: 'TRUCK', validFrom: '2026-12-01T06:00:00.000Z', validUntil: '2026-12-01T08:00:00.000Z', authority: 'A' } });
  });

  it('warehouse / ODCY capacity is a day-long value', () => {
    const d = evaluatePromotion(base({
      question: { questionType: 'CAPACITY', status: 'SENT', expectedUnit: 'CONTAINER', target: { entityType: 'FACILITY', entityId: 'f1', factKey: 'capacity.day(2026-12-01)', scopeType: 'GLOBAL', scopeRef: '' }, asked: { date: '2026-12-01', windowFrom: null, windowTo: null } },
      entity: { type: 'FACILITY', facilityType: 'WAREHOUSE', ownerCounterpartyId: null },
      sender: { counterpartyId: 'c2', role: 'WAREHOUSE' },
      extraction: { ...base().extraction, unit: 'CONTAINER' },
    }));
    expect(d).toMatchObject({ ok: true, plan: { eventType: 'WAREHOUSE_CAPACITY_CHANGED', factKind: 'STATE', family: 'warehouse_capacity', authority: 'S', validFrom: '2026-11-30T15:00:00.000Z', validUntil: '2026-12-01T15:00:00.000Z' } });
  });

  it('blocks, with the reason, instead of guessing', () => {
    expect(reasons(base({ sender: { counterpartyId: 'c9', role: 'TRUCKING' } }))).toEqual(['SENDER_NOT_AUTHORITY']); // 남의 풀
    expect(reasons(base({ sender: { counterpartyId: 'c1', role: 'WAREHOUSE' } }))).toEqual(['SENDER_NOT_AUTHORITY']); // 역할이 다름
    expect(reasons(base({ planSuperseded: true }))).toEqual(['PLAN_SUPERSEDED']);
    expect(reasons(base({ extraction: { ...base().extraction, ambiguous: true } }))).toEqual(['AMBIGUOUS_REPLY']);
    expect(reasons(base({ extraction: { ...base().extraction, validated: false } }))).toEqual(['VALIDATION_NOT_PASSED']);
    expect(reasons(base({ extraction: { ...base().extraction, reviewStatus: 'ACCEPTED', createdEventId: 'e1' } }))).toEqual(['NOT_PENDING']);
    expect(reasons(base({ extraction: { ...base().extraction, field: 'available_from' } }))).toEqual(['FIELD_NOT_A_FACT_VALUE']);
    expect(reasons(base({ question: { ...base().question, status: 'CANCELLED' } }))).toEqual(['ASK_CANCELLED']);
    expect(reasons(base({ question: { ...base().question, target: null } }))).toEqual(['QUESTION_TARGET_MISSING']);
    expect(reasons(base({ isSimulated: true, scenarioId: null }))).toEqual(['SCENARIO_MISSING']);
    expect(reasons(base({ entity: { type: 'FACILITY', facilityType: 'TERMINAL', ownerCounterpartyId: null }, question: { ...base().question, questionType: 'CAPACITY', target: { ...(base().question.target as object), entityType: 'FACILITY' } as never } }))).toEqual(['UNSUPPORTED_FACT']);
  });

  it('A · B. a reply window inside the asked window narrows the fact; a window outside it (or an unverified time) blocks', () => {
    const sib = (field: string, value: string, validated = true) => ({ extractionId: `x-${field}`, field, value, validated, reviewStatus: validated ? 'PENDING' : 'REJECTED' });
    const ask = (from: string, to: string) => ({ ...base().question, asked: { date: '2026-12-01', windowFrom: from, windowTo: to } });
    // 질문 09–18 · 회신 "15시 이후" → 15–18
    expect(evaluatePromotion(base({ question: ask('09:00', '18:00'), siblings: [sib('available_from', '15:00')] }))).toMatchObject({ ok: true, plan: { validFrom: '2026-12-01T06:00:00.000Z', validUntil: '2026-12-01T09:00:00.000Z', siblingExtractionIds: ['x-available_from'] } });
    expect(evaluatePromotion(base({ siblings: [sib('available_until', '16:00')] }))).toMatchObject({ ok: true, plan: { validFrom: '2026-12-01T06:00:00.000Z', validUntil: '2026-12-01T07:00:00.000Z' } });
    // 질문 창을 넘는 회신(14–18)은 질문 창으로 자른다 — 질문하지 않은 시간의 값은 만들지 않는다
    expect(evaluatePromotion(base({ siblings: [sib('available_from', '14:00'), sib('available_until', '18:00')] }))).toMatchObject({ ok: true, plan: { validFrom: '2026-12-01T06:00:00.000Z', validUntil: '2026-12-01T08:00:00.000Z' } });
    expect(reasons(base({ siblings: [sib('available_from', '17:00')] }))).toEqual(['WINDOW_OUT_OF_SCOPE']); // 질문 15–17 · 회신 17시 이후
    expect(reasons(base({ siblings: [sib('available_until', '14:00')] }))).toEqual(['WINDOW_OUT_OF_SCOPE']);
    expect(reasons(base({ siblings: [sib('available_from', '15:00', false)] }))).toEqual(['WINDOW_UNVERIFIED']);
  });

  it('C. a date the contract cannot carry is never read as the asked date', () => {
    const say = (replySentence: string) => reasons(base({ replySentence }));
    expect(say('내일 차량 4대 가능합니다.')).toEqual([]); // 회신 11-30 의 내일 = 질문 12-01
    expect(say('12월 1일 차량 4대 가능합니다.')).toEqual([]);
    expect(say('1일에 차량 4대 가능합니다.')).toEqual([]);
    expect(say('2일간 차량 4대 가능합니다.')).toEqual([]); // 기간 — 날짜가 아니다
    expect(say('모레 차량 4대 가능합니다.')).toEqual(['DATE_OUT_OF_SCOPE']);
    expect(say('오늘은 차량 4대 가능합니다.')).toEqual(['DATE_OUT_OF_SCOPE']);
    expect(say('12월 3일 차량 4대 가능합니다.')).toEqual(['DATE_OUT_OF_SCOPE']);
    expect(say('다음 주 화요일 차량 4대 가능합니다.')).toEqual(['DATE_UNVERIFIED']);
    expect(say('')).toEqual(['DATE_UNVERIFIED']); // 문장을 모른다
  });

  it('sender authority: A only for the owner; S when the role fits but ownership is unknown; W otherwise', () => {
    expect(senderAuthority('truck_availability', 'TRUCKING', 'c1', 'c1')).toBe('A');
    expect(senderAuthority('truck_availability', 'TRUCKING', 'c1', null)).toBe('S');
    expect(senderAuthority('truck_availability', 'TRUCKING', 'c1', 'c2')).toBe('W');
    expect(senderAuthority('yard_capacity', 'WAREHOUSE', 'c1', null)).toBe('W');
  });
});

describe('date scope and policy boundaries', () => {
  it('dateMentions resolves relative and explicit dates from the reply date; flags the unresolvable', () => {
    expect(dateMentions('내일 오후 3시 이후 4대', '2026-10-26', '2026-10-27')).toEqual({ resolved: ['2026-10-27'], unresolved: [] });
    expect(dateMentions('10월 27일 · 28일 둘 다 가능', '2026-10-26', '2026-10-27').resolved).toEqual(['2026-10-27', '2026-10-28']);
    expect(dateMentions('주말에 가능', '2026-10-26', '2026-10-27').unresolved).toEqual(['주말']);
    expect(dateMentions('2월 30일', '2026-10-26', '2026-10-27').unresolved).toEqual(['2월 30일']);
    expect(dateMentions('오후 3시 이후 4대', '2026-10-26', '2026-10-27')).toEqual({ resolved: [], unresolved: [] });
    expect(sentenceAround('안녕하세요. 모레 차량 4대 가능합니다. 감사합니다.', '차량 4대')).toBe(' 모레 차량 4대 가능합니다');
  });

  it('D. the material-change ratio (30%) is a policy value: 29% adopts, 30% holds; another policy moves the boundary', () => {
    const a = ev({ at: T('01:00'), value: 100 });
    expect(run([a, ev({ at: T('01:30'), value: 71 })]).holdStatus).toBe('NONE');
    expect(run([a, ev({ at: T('01:30'), value: 70 })]).holdStatus).toBe('HELD');
    expect(run([a, ev({ at: T('01:30'), value: 70 })], [], AS_OF, { ...DEFAULT_TRUTH_POLICY, materialChangeRatio: 0.5 }).holdStatus).toBe('NONE');
  });

  it('E. the near-time window (5 min) is a policy value: 5:00 apart is simultaneous, 5:01 is not', () => {
    const a = ev({ at: '2026-11-20T01:00:00.000Z', value: 4 });
    expect(run([a, ev({ at: '2026-11-20T01:05:00.000Z', value: 5 })]).conflictStatus).toBe('OPEN');
    expect(run([a, ev({ at: '2026-11-20T01:05:01.000Z', value: 5 })]).conflictStatus).toBe('NONE');
    expect(run([a, ev({ at: '2026-11-20T01:05:01.000Z', value: 5 })], [], AS_OF, { ...DEFAULT_TRUTH_POLICY, nearTimeConflictWindowMs: 10 * 60_000 }).conflictStatus).toBe('OPEN');
  });
});

describe('fact keys and wake-up rule', () => {
  it('fact_key → canonical_fact name and parameters', () => {
    expect(parseFactKey('available.slot(2026-12-01T15:00-17:00)')).toMatchObject({ factName: 'available.slot', paramDate: '2026-12-01', paramSlotStart: '2026-12-01T06:00:00.000Z', asked: { date: '2026-12-01', windowFrom: '15:00', windowTo: '17:00' } });
    expect(parseFactKey('capacity.day(2026-12-01)')).toMatchObject({ factName: 'capacity.day', paramDate: '2026-12-01', paramSlotStart: null });
    expect(parseFactKey('capacity.size_type(40DRY).day(2026-12-01)')).toMatchObject({ factName: 'capacity.size_type.day', paramSizeType: '40DRY', paramDate: '2026-12-01' });
    expect(parseFactKey('something.else(x)')).toMatchObject({ factName: 'something.else', paramDate: null });
  });

  it('AWAITING_FACT_VERIFICATION wakes only when no fact is waiting for a person any more (confirmed · rejected · corrected · disputed)', () => {
    const m = (facts: { awaitingConfirmation: boolean }[]) => ({ status: 'REPLIED', approvalState: 'ACTIVE', replies: [], facts });
    expect(wakeReason('AWAITING_FACT_VERIFICATION', m([{ awaitingConfirmation: true }]))).toBeNull();
    expect(wakeReason('AWAITING_FACT_VERIFICATION', m([{ awaitingConfirmation: false }]))).toBe('FACT_STATE_CHANGED');
    expect(wakeReason('AWAITING_FACT_VERIFICATION', m([]))).toBe('FACT_STATE_CHANGED');
    expect(wakeReason('AWAITING_FACT_VERIFICATION', { status: 'REPLIED', approvalState: 'ACTIVE', replies: [] })).toBe('FACT_STATE_CHANGED');
  });
});
