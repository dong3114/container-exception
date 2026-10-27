import { describe, expect, it } from 'vitest';
import type { PlanningFact } from '../../src/planning/engine/types.js';
import { assessRealPlanningInput, missingSummary } from '../../src/planning/real-input.js';

const D = '2026-10-27';
const fact = (subject: string, key: string, value: number | null, extra: Partial<PlanningFact> = {}): PlanningFact => ({
  fact_ref: `event:${subject}`, subject_id: subject, fact_key: key, value, fact_state: 'CONFIRMED', freshness: 'FRESH', source: 'TRUTH', is_simulated: false, evidence_time: null, ...extra,
});
const base = {
  planDay: D,
  facilities: [
    { id: 'wa', type: 'WAREHOUSE', name: '창고 A', openTime: '08:00:00', closeTime: '17:00:00' },
    { id: 'oa', type: 'ODCY', name: 'ODCY A', openTime: null, closeTime: null },
  ],
  pools: [{ id: 'own', name: '자사', ownership: 'OWN' }, { id: 'k', name: 'K운송', ownership: 'PARTNER' }],
  containers: [] as { id: string; containerNo: string; sizeType: string | null; carrier: string | null }[],
  scopedVesselCalls: 0,
  truthFacts: [] as PlanningFact[],
};

describe('real planning input readiness (T-115)', () => {
  it('nothing bound → container scope, rates, capacities and own roster are missing; partner slots are optional', () => {
    const r = assessRealPlanningInput(base);
    expect(r.ready).toBe(false);
    expect(r.missing_inputs.map((m) => [m.code, m.severity])).toEqual([
      ['CONTAINER_SCOPE_EMPTY', 'BLOCKING'],
      ['RATE_TABLE', 'BLOCKING'],
      ['FACILITY_CAPACITY', 'BLOCKING'],
      ['OWN_TRUCK_ROSTER', 'BLOCKING'],
      ['PARTNER_TRUCK_SLOTS', 'OPTIONAL'],
    ]);
    expect(missingSummary(r)).toBe('CONTAINER_SCOPE_EMPTY, RATE_TABLE, FACILITY_CAPACITY(2), OWN_TRUCK_ROSTER(1)');
  });

  it('Truth facts (operator entry / replies) close capacity and truck gaps; revoked · expired · valueless facts do not', () => {
    const r = assessRealPlanningInput({
      ...base,
      truthFacts: [
        fact('wa', `capacity.day(${D})`, 8),
        fact('oa', `capacity.size_type(20GP).day(${D})`, 2),
        fact('own', `available.slot(${D}T09:00-18:00)`, 5),
        fact('k', `available.slot(${D}T15:00-18:00)`, null, { fact_state: 'REVOKED' }),
      ],
    });
    expect(r.missing_inputs.map((m) => m.code)).toEqual(['CONTAINER_SCOPE_EMPTY', 'RATE_TABLE', 'PARTNER_TRUCK_SLOTS']);
    expect(r.available).toMatchObject({ facilities_with_capacity: 2, partner_pools_with_slots: 0, truth_facts: 3 });
    const expired = assessRealPlanningInput({ ...base, truthFacts: [fact('wa', `capacity.day(${D})`, 8, { freshness: 'EXPIRED' })] });
    expect(expired.available.facilities_with_capacity).toBe(0);
  });

  it('public-data containers give numbers and sizes only — destination, original plan and LFD stay missing per container', () => {
    const r = assessRealPlanningInput({ ...base, scopedVesselCalls: 1, containers: [{ id: 'c1', containerNo: 'ABCU1234567', sizeType: '40HC', carrier: null }] });
    const byCode = Object.fromEntries(r.missing_inputs.map((m) => [m.code, m]));
    expect(byCode.CONTAINER_SCOPE_EMPTY).toBeUndefined();
    for (const code of ['CONTAINER_DESTINATION', 'CONTAINER_ORIGINAL_PLAN', 'CONTAINER_LFD', 'CONTAINER_CARRIER']) expect(byCode[code]).toMatchObject({ count: 1, examples: ['ABCU1234567'], severity: 'BLOCKING' });
  });
});
