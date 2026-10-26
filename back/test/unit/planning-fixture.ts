import type { ContainerInput, PlanningFact, PlanningInput } from '../../src/planning/engine/types.js';

/** 작은 합성 계획 입력(단위 시험 전용) — 터미널 T · 창고 W · ODCY O1(40DRY 전용, 왕복 1h) · O2(Dry, 왕복 2h). */
export function container(id: string, over: Partial<ContainerInput> = {}): ContainerInput {
  return {
    container_id: id,
    container_no: `XTSU${id}`,
    size_type: '40DRY',
    carrier: 'CA',
    priority: 'NORMAL',
    lfd: '2026-10-13',
    pickup_ready: true,
    current_location_id: 'T',
    destination_id: 'W',
    planned_day: '2026-10-13',
    planned_depart_hour: 13,
    alternate_destination_allowed: false,
    evidence_refs: [`test:${id}`],
    is_simulated: true,
    ...over,
  };
}

export function fact(subject: string, key: string, value: number | null, over: Partial<PlanningFact> = {}): PlanningFact {
  return { fact_ref: `f:${subject}:${key}`, subject_id: subject, fact_key: key, value, fact_state: 'CONFIRMED', freshness: 'FRESH', source: 'SCENARIO', is_simulated: true, evidence_time: '2026-10-13T09:00:00+09:00', ...over };
}

export function miniInput(over: Partial<PlanningInput> = {}): PlanningInput {
  return {
    scenario_id: 'test',
    contains_simulated: true,
    as_of: '2026-10-13T11:00:00+09:00',
    plan_day: '2026-10-13',
    horizon_days: ['2026-10-13', '2026-10-14', '2026-10-15'],
    terminal_id: 'T',
    containers: [container('C1')],
    facilities: [
      { facility_id: 'W', name: '창고 W', kind: 'WAREHOUSE', accepts: ['20DRY', '40DRY', '40RF'], open_from_hour: 8, last_departure_hour: 16, trip_hours: 1 },
      { facility_id: 'O1', name: 'ODCY 1', kind: 'ODCY', accepts: ['40DRY'], open_from_hour: 0, last_departure_hour: 19, trip_hours: 1 },
      { facility_id: 'O2', name: 'ODCY 2', kind: 'ODCY', accepts: ['20DRY', '40DRY'], open_from_hour: 0, last_departure_hour: 16, trip_hours: 2 },
    ],
    own_trucks: [{ truck_id: 'K1', pool_id: 'OWN', from_hour: 13, to_hour: 18, fact_ref: 'f:roster' }],
    partner_pools: [],
    rates: {
      rate_version: 'test-rates/1',
      source_ref: 'test:rates',
      assumption: null,
      currency: 'KRW',
      demurrage_per_day: { CA: { '20DRY': 100_000, '40DRY': 200_000, '40RF': 300_000 } },
      terminal_storage_per_day: { '20DRY': 20_000, '40DRY': 40_000, '40RF': 60_000 },
      detention_free_days: 7,
      transport: { T__W: { '20DRY': 150_000, '40DRY': 190_000, '40RF': 230_000 }, T__O1: { '40DRY': 80_000 }, O1__W: { '40DRY': 130_000 }, T__O2: { '20DRY': 90_000, '40DRY': 110_000 }, O2__W: { '20DRY': 120_000, '40DRY': 150_000 } },
      odcy: { O1: { handling_in_out: { '40DRY': 50_000 }, storage_per_day: { '40DRY': 30_000 } }, O2: { handling_in_out: { '20DRY': 40_000, '40DRY': 60_000 }, storage_per_day: { '20DRY': 15_000, '40DRY': 25_000 } } },
    },
    facts: [
      fact('W', 'capacity.day(2026-10-13)', 10),
      fact('W', 'capacity.day(2026-10-14)', 10),
      fact('W', 'capacity.day(2026-10-15)', 10),
      fact('O1', 'capacity.size_type(40DRY).day(2026-10-13)', 5),
      fact('O1', 'max_days', 2),
      fact('O2', 'capacity.day(2026-10-13)', 5),
    ],
    ...over,
  };
}

export function withFact(input: PlanningInput, subject: string, key: string, patch: Partial<PlanningFact> | null): PlanningInput {
  const facts = input.facts.filter((f) => !(f.subject_id === subject && f.fact_key === key));
  if (patch === null) return { ...input, facts };
  const old = input.facts.find((f) => f.subject_id === subject && f.fact_key === key);
  return { ...input, facts: [...facts, { ...(old ?? fact(subject, key, null)), ...patch }] };
}
