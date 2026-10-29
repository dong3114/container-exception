import { describe, expect, it } from 'vitest';
import { slotCovers, truckWindowOf } from '../../src/agent-tools/context.service.js';
import { planStatus } from '../../src/agent-tools/handlers.js';
import { repliesWakeReason } from '../../src/agent-tools/wake-rules.js';
import { buildCostTable } from '../../src/planning/engine/cost-engine.js';
import { solveRecovery, solverInputHash } from '../../src/planning/engine/solver.js';
import { computeBaseline } from '../../src/planning/engine/baseline.js';
import { Instant } from '../../src/shared/time/instant.js';
import type { CoordinateData, EventRow } from '../../src/truth/truth.repository.js';
import { toFactEvent } from '../../src/truth/truth.repository.js';
import { knownAsOf } from '../../src/truth/truth.service.js';
import { reconcile } from '../../src/truth/reconcile-rules.js';
import { container, fact, miniInput, withFact } from './planning-fixture.js';

/** T-136 Phase 1 — 실행 결함 재현 · 회귀(순수 규칙). DB 경로는 test/db 의 해당 시험이 본다. */

function row(id: string, value: number, receivedAt: string, over: Partial<EventRow> = {}): EventRow {
  return {
    eventId: id,
    schemaVersion: 'ev-1',
    rawInputId: null,
    eventClass: 'OBSERVATION',
    eventType: 'WAREHOUSE_CAPACITY_CHANGED',
    factKind: 'STATE',
    factKey: 'capacity.day(2026-10-13)',
    valueText: null,
    valueNumber: String(value),
    valueTimestamp: null,
    valueCode: null,
    valueUnit: 'CONTAINER',
    validFrom: null,
    validUntil: null,
    applicabilityScopeType: 'GLOBAL',
    applicabilityScopeRef: '',
    sourceEventTime: null,
    sourceRecordedAt: null,
    receivedAt,
    recordedAt: receivedAt,
    sourceType: 'HUMAN_UI',
    sourceRoleAtIngestion: 'OPERATOR',
    extractionMethod: 'DIRECT',
    inputQuality: 'STRUCTURED',
    inputConfidenceLevel: 'HIGH',
    isSimulated: false,
    scenarioId: null,
    payload: {},
    ...over,
  } as EventRow;
}

function data(rows: EventRow[], isSimulated = false): CoordinateData {
  return {
    coordinate: { entityType: 'FACILITY', entityId: 'W', factKey: 'capacity.day(2026-10-13)', scopeType: 'GLOBAL', scopeRef: '', isSimulated },
    rows,
    events: rows.map(toFactEvent),
    verifications: [],
    scenarioId: null,
  };
}

const value = (d: CoordinateData, asOf: string) => reconcile(d.events, d.verifications, asOf).winner?.value ?? null;

describe('1-3 Truth as_of — a past snapshot does not see events recorded after it (Scenario G)', () => {
  const t1 = '2026-10-13T01:00:00.000Z';
  const t2 = '2026-10-13T03:00:00.000Z';
  const d = data([row('e1', 8, t1), row('e2', 6, t2)]);
  it('before t1: nothing known · at t1: 8 · between t1 and t2: still 8 · at/after t2: 6', () => {
    const at = (iso: string) => value(knownAsOf(d, Instant.parseIso(iso)), iso);
    expect(at('2026-10-13T00:30:00.000Z')).toBeNull();
    expect(at(t1)).toBe(8);
    expect(at('2026-10-13T02:00:00.000Z')).toBe(8);
    expect(at(t2)).toBe(6);
  });
  it('an event dated in the past but recorded later was not known at that past time (LIVE uses received_at)', () => {
    const late = data([row('e1', 8, t1), row('e2', 6, t2, { sourceEventTime: '2026-10-13T00:00:00.000Z' })]);
    expect(value(knownAsOf(late, Instant.parseIso('2026-10-13T02:00:00.000Z')), '2026-10-13T02:00:00.000Z')).toBe(8);
  });
  it('simulated scenario time: events without a scenario time are known at the scenario as_of; events with a later scenario time are not', () => {
    const sim = data([row('s1', 20, t2, { isSimulated: true, sourceEventTime: '2026-10-13T01:30:00.000Z' }), row('s2', 8, t2, { isSimulated: true })], true);
    expect(knownAsOf(sim, Instant.parseIso('2026-10-13T01:40:00.000Z')).rows.map((r) => r.eventId)).toEqual(['s1', 's2']);
    expect(knownAsOf(sim, Instant.parseIso('2026-10-13T01:00:00.000Z')).rows.map((r) => r.eventId)).toEqual(['s2']);
  });
});

describe('1-2 truck gap time window (Scenario H)', () => {
  it('a 09:00~12:00 slot does not cover a 15:00~18:00 inquiry; a covering window does; another day never does', () => {
    const w = { from: '15:00', to: '18:00' };
    expect(slotCovers('available.slot(2026-10-13T09:00-12:00)', '2026-10-13', w)).toBe(false);
    expect(slotCovers('available.slot(2026-10-13T15:00-18:00)', '2026-10-13', w)).toBe(true);
    expect(slotCovers('available.slot(2026-10-13T14:00-19:00)', '2026-10-13', w)).toBe(true);
    expect(slotCovers('available.slot(2026-10-13T15:00-17:00)', '2026-10-13', w)).toBe(false);
    expect(slotCovers('available.slot(2026-10-14T15:00-18:00)', '2026-10-13', w)).toBe(false);
    expect(slotCovers('available.slot(2026-10-13)', '2026-10-13', w)).toBe(false);
  });
  it('the window comes from the person who started the agent; otherwise the graph default 09:00~18:00', () => {
    expect(truckWindowOf({ inquiry: { quantity: 2, window_from: '15:00', window_to: '18:00' } })).toEqual({ from: '15:00', to: '18:00' });
    expect(truckWindowOf({ inquiry: { quantity: 2 } })).toEqual({ from: '09:00', to: '18:00' });
    expect(truckWindowOf(null)).toEqual({ from: '09:00', to: '18:00' });
  });
});

describe('1-1 reply wait wakes without a person', () => {
  it('waits while any asked gap still awaits a reply; wakes once every reply is settled or handed to a person', () => {
    expect(repliesWakeReason([{ candidateState: 'NONE' }])).toBeNull();
    expect(repliesWakeReason([{ candidateState: 'REPLY_RECEIVED' }])).toBeNull();
    expect(repliesWakeReason([{ candidateState: 'NO_VALID_CANDIDATE' }, { candidateState: 'NONE' }])).toBeNull();
    expect(repliesWakeReason([{ candidateState: 'NO_VALID_CANDIDATE' }])).toBe('REPLIES_SETTLED');
    expect(repliesWakeReason([{ candidateState: 'CANDIDATE_RECEIVED' }])).toBe('REPLIES_SETTLED');
    expect(repliesWakeReason([])).toBe('REPLIES_SETTLED'); // nothing asked any more (value arrived)
  });
});

describe('1-4 null capacity is never unlimited (Scenario I)', () => {
  it('a usable capacity fact without a value makes the options that need it infeasible (FACT_MISSING), and the solver never places them', async () => {
    const input = withFact(miniInput(), 'W', 'capacity.day(2026-10-13)', { value: null });
    const table = buildCostTable(input);
    const keep = table.options.find((o) => o.container_id === 'C1' && o.action === 'KEEP_CURRENT_PLAN')!;
    expect(keep.feasible).toBe(false);
    expect(keep.infeasible_reasons.map((r) => r.code)).toContain('FACT_MISSING');
    const result = await solveRecovery(input, table, computeBaseline(input, table));
    expect(result.assignments.find((a) => a.container_id === 'C1')?.action).not.toBe('KEEP_CURRENT_PLAN');
  });
});

describe('1-7 plan input hash = business input, not the clock', () => {
  it('two calculations a few minutes apart in the same hour with the same facts give the same hash', () => {
    const a = miniInput({ as_of: '2026-10-13T11:05:00+09:00' });
    const b = miniInput({ as_of: '2026-10-13T11:40:00+09:00' });
    expect(solverInputHash(a, buildCostTable(a))).toBe(solverInputHash(b, buildCostTable(b)));
  });
  it('a change that alters the decision (a later hour closes departures · a fact value) changes the hash', () => {
    const a = miniInput({ as_of: '2026-10-13T11:05:00+09:00' });
    const later = miniInput({ as_of: '2026-10-13T15:05:00+09:00' });
    const fact = withFact(a, 'W', 'capacity.day(2026-10-13)', { value: 9 });
    expect(solverInputHash(a, buildCostTable(a))).not.toBe(solverInputHash(later, buildCostTable(later)));
    expect(solverInputHash(a, buildCostTable(a))).not.toBe(solverInputHash(fact, buildCostTable(fact)));
  });
});

describe('1-5 an outdated approval is not a current approval', () => {
  const base = { planId: 'p', caseRunId: 'r', version: 1, solverStatus: 'OPTIMAL', inputHash: 'h', objectiveKrw: '1', baselineTotalKrw: '2', savingKrw: '1', outdatedReasons: null, supersededByPlanId: null };
  it('APPROVED → approved/executable; OUTDATED after approval → previously_approved only', () => {
    expect(planStatus({ ...base, planStatus: 'APPROVED', approvedByActorId: 'h1' } as never, false)).toMatchObject({ approved: true, previously_approved: true, executable: true });
    expect(planStatus({ ...base, planStatus: 'OUTDATED', approvedByActorId: 'h1' } as never, false)).toMatchObject({ approved: false, previously_approved: true, executable: false });
    expect(planStatus({ ...base, planStatus: 'PROPOSED', approvedByActorId: null } as never, false)).toMatchObject({ approved: false, previously_approved: false, executable: false });
  });
});

describe('T-136 Phase 4 — public evidence reaches Risk and the HiGHS objective (deterministic)', () => {
  const arrival = (iso: string, state: 'OBSERVED' | 'NEEDS_REVIEW' | 'PROVISIONAL') => fact('V1', 'declared_arrival', Instant.parseIso(iso).epochMs, { fact_ref: 'f:V1:arrival', fact_state: state, source: 'TRUTH' });
  const withVessel = (f: ReturnType<typeof arrival>) => miniInput({ containers: [container('C1', { vessel_call_id: 'V1' })], facts: [...miniInput().facts, f] });

  it('a vessel declared to arrive tomorrow: no option may pick the container up today (VESSEL_NOT_ARRIVED)', () => {
    const table = buildCostTable(withVessel(arrival('2026-10-14T08:00:00+09:00', 'OBSERVED')));
    const today = table.options.filter((o) => o.container_id === 'C1' && o.action !== 'WAIT_AT_TERMINAL');
    expect(today.every((o) => !o.feasible && o.infeasible_reasons.some((r) => r.code === 'VESSEL_NOT_ARRIVED'))).toBe(true);
  });

  it('a vessel arriving today at 14:30 moves the earliest departure to 15:00', () => {
    const table = buildCostTable(withVessel(arrival('2026-10-13T14:30:00+09:00', 'OBSERVED')));
    const keep = table.options.find((o) => o.container_id === 'C1' && o.action === 'KEEP_CURRENT_PLAN')!;
    expect(keep.truck_job?.earliest_hour).toBe(15);
  });

  it('a disputed arrival (public vs partner CONFLICT) is not used as a constraint; moving today carries a verification-risk penalty that the solver sees', async () => {
    const disputed = withVessel(arrival('2026-10-14T08:00:00+09:00', 'NEEDS_REVIEW'));
    const clean = miniInput({ containers: [container('C1', { vessel_call_id: 'V1' })] });
    const t1 = buildCostTable(disputed);
    const t0 = buildCostTable(clean);
    const keep1 = t1.options.find((o) => o.container_id === 'C1' && o.action === 'KEEP_CURRENT_PLAN')!;
    const keep0 = t0.options.find((o) => o.container_id === 'C1' && o.action === 'KEEP_CURRENT_PLAN')!;
    expect(keep1.feasible).toBe(true); // 충돌한 값은 제약으로 쓰지 않는다
    expect(keep1.cost.risk_penalty - keep0.cost.risk_penalty).toBe(30_000);
    expect(keep1.warning_refs).toContainEqual({ fact_ref: 'f:V1:arrival', reason: 'CONFLICTED' });
    const r1 = await solveRecovery(disputed, t1, computeBaseline(disputed, t1));
    const r0 = await solveRecovery(clean, t0, computeBaseline(clean, t0));
    expect(r1.objective_value! - r0.objective_value!).toBe(30_000); // HiGHS 목적함수까지 간다
    expect(solverInputHash(disputed, t1)).not.toBe(solverInputHash(clean, t0));
  });
});

describe('T-136 Phase 5 — only affected containers are re-planned; the rest keep their plan but still use capacity and trucks', () => {
  it('unaffected containers have only the original plan; affected ones get every action', () => {
    const input = miniInput({ containers: [container('C1'), container('C2'), container('C3')], affected_container_ids: ['C3'] });
    const table = buildCostTable(input);
    for (const id of ['C1', 'C2']) expect(new Set(table.options.filter((o) => o.container_id === id).map((o) => `${o.action}:${o.scope}`))).toEqual(new Set(['KEEP_CURRENT_PLAN:FIXED']));
    expect(new Set(table.options.filter((o) => o.container_id === 'C3').map((o) => o.action)).size).toBeGreaterThan(1);
    expect(table.affected).toEqual(['C3']);
  });

  it('fixed containers consume warehouse capacity: with room for 2, the affected one cannot also keep its plan', async () => {
    const input = withFact(miniInput({ containers: [container('C1'), container('C2'), container('C3')], affected_container_ids: ['C3'] }), 'W', 'capacity.day(2026-10-13)', { value: 2 });
    const table = buildCostTable(input);
    const r = await solveRecovery(input, table, computeBaseline(input, table));
    const by = new Map(r.assignments.map((a) => [a.container_id, a.action]));
    expect(by.get('C1')).toBe('KEEP_CURRENT_PLAN');
    expect(by.get('C2')).toBe('KEEP_CURRENT_PLAN');
    expect(by.get('C3')).not.toBe('KEEP_CURRENT_PLAN');
  });

  it('no exception (affected = null) → every container is a candidate, as before', () => {
    const table = buildCostTable(miniInput({ containers: [container('C1'), container('C2')] }));
    expect(table.affected).toBeNull();
    expect(table.options.every((o) => o.scope === 'ALL')).toBe(true);
  });
});
