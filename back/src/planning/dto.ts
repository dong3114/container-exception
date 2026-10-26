import { ApiProperty } from '@nestjs/swagger';

/**
 * 복구 계획 응답(T-114). 금액은 모두 결정론 엔진이 계산한 원(KRW) 정수다(ADR-006 · ADR-029). 시뮬레이션 입력이면 contains_simulated.
 * 중첩 세부(비용 항목 · 대안 · 제약)는 엔진 출력 그대로의 객체다.
 */
const OBJ = { type: 'object', additionalProperties: true } as const;

export class PlanItemDto {
  @ApiProperty({ type: String, description: 'Container reference (synthetic scenario id until containers are stored)' })
  container_id!: string;

  @ApiProperty({ type: String, enum: ['KEEP_CURRENT_PLAN', 'MOVE_TO_WAREHOUSE', 'MOVE_TO_ODCY', 'WAIT_AT_TERMINAL'] })
  action!: string;

  @ApiProperty({ type: String, description: 'Where the container goes today (warehouse · ODCY · terminal when waiting)' })
  target_id!: string;

  @ApiProperty({ type: String })
  target_name!: string;

  @ApiProperty({ type: String })
  destination_id!: string;

  @ApiProperty({ type: String, format: 'date' })
  delivery_day!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Departure time today (+09:00); null when waiting' })
  scheduled_time!: string | null;

  @ApiProperty({ type: String, nullable: true })
  truck_id!: string | null;

  @ApiProperty({ type: Number })
  base_cost_krw!: number;

  @ApiProperty({ type: Number })
  risk_penalty_krw!: number;

  @ApiProperty({ type: Number })
  total_krw!: number;

  @ApiProperty({ type: Number, nullable: true, description: 'Baseline cost of this container (same engine) — for the per-container comparison' })
  baseline_total_krw!: number | null;

  @ApiProperty({ type: [String] })
  reason_codes!: string[];

  @ApiProperty({ ...OBJ, description: 'Engine output: cost lines (amount · qty · unit · source · assumption), alternatives with why they were not chosen, evidence and warning refs' })
  detail!: Record<string, unknown>;
}

export class PlanDto {
  @ApiProperty({ type: String, format: 'uuid' })
  plan_id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  case_run_id!: string;

  @ApiProperty({ type: Number })
  version!: number;

  @ApiProperty({ type: String, enum: ['PROPOSED', 'APPROVED', 'SUPERSEDED', 'OUTDATED', 'INFEASIBLE'] })
  plan_status!: string;

  @ApiProperty({ type: String, enum: ['OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'TIME_LIMIT', 'ERROR'] })
  solver_status!: string;

  @ApiProperty({ type: String })
  solver_version!: string;

  @ApiProperty({ type: String, enum: ['ENGINE_RESULT'], description: 'Numbers come from the deterministic cost engine and solver (not scenario values, not an LLM). Inputs may be simulated — see contains_simulated' })
  result_kind!: string;

  @ApiProperty({ type: String })
  input_hash!: string;

  @ApiProperty({ type: String, description: 'Fingerprint of this plan — the approval must quote it' })
  plan_hash!: string;

  @ApiProperty({ type: String, description: 'Facts were judged at this time (+09:00)' })
  as_of!: string;

  @ApiProperty({ type: Number, nullable: true, description: 'Total expected loss = base cost + risk penalty (solver objective)' })
  objective_krw!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  base_cost_krw!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  risk_penalty_krw!: number | null;

  @ApiProperty({ type: Number })
  baseline_total_krw!: number;

  @ApiProperty({ type: Number })
  baseline_base_cost_krw!: number;

  @ApiProperty({ type: Number, nullable: true, description: 'Baseline total − plan total (simulation basis — not a realised saving)' })
  saving_krw!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  base_saving_krw!: number | null;

  @ApiProperty({ type: Number })
  candidate_count!: number;

  @ApiProperty({ type: Number, description: 'Containers whose plan changes (action other than keeping the current plan)' })
  changed_count!: number;

  @ApiProperty({ ...OBJ, description: 'Problem: per warehouse and day, planned containers vs usable capacity' })
  problem!: Record<string, unknown>;

  @ApiProperty({ ...OBJ, description: 'Baseline (rule, same engine), binding constraints, resource and truck usage, unplanned containers with reasons, warnings, assumptions, timings' })
  result!: Record<string, unknown>;

  @ApiProperty({ type: 'array', items: OBJ, description: 'Facts the plan used or excluded (fact ref · state · freshness · source TRUTH/SCENARIO · usage)' })
  facts!: Record<string, unknown>[];

  @ApiProperty({ type: 'array', items: OBJ, nullable: true })
  outdated_reasons!: Record<string, unknown>[] | null;

  @ApiProperty({ type: String, nullable: true })
  outdated_at!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  superseded_by_plan_id!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  approved_by_actor_id!: string | null;

  @ApiProperty({ type: String, nullable: true })
  approved_at!: string | null;

  @ApiProperty({ type: String, format: 'uuid' })
  created_by_actor_id!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  agent_run_id!: string | null;

  @ApiProperty({ type: Boolean })
  contains_simulated!: boolean;

  @ApiProperty({ type: String })
  created_at!: string;

  @ApiProperty({ type: Number })
  cost_ms!: number;

  @ApiProperty({ type: Number })
  solve_ms!: number;

  @ApiProperty({ type: [PlanItemDto] })
  items!: PlanItemDto[];
}

export class PlanSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  plan_id!: string;

  @ApiProperty({ type: Number })
  version!: number;

  @ApiProperty({ type: String })
  plan_status!: string;

  @ApiProperty({ type: String })
  solver_status!: string;

  @ApiProperty({ type: Number, nullable: true })
  objective_krw!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  base_cost_krw!: number | null;

  @ApiProperty({ type: Number })
  baseline_total_krw!: number;

  @ApiProperty({ type: Number, nullable: true })
  saving_krw!: number | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  agent_run_id!: string | null;

  @ApiProperty({ type: String })
  created_at!: string;

  @ApiProperty({ type: Number, nullable: true, description: 'Number of facts whose change made this plan OUTDATED' })
  outdated_reason_count!: number | null;
}

export class PlanListDto {
  @ApiProperty({ type: String, format: 'uuid' })
  case_run_id!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Newest plan that is not superseded' })
  current_plan_id!: string | null;

  @ApiProperty({ type: [PlanSummaryDto] })
  plans!: PlanSummaryDto[];
}

export class CostPreviewDto {
  @ApiProperty({ type: String, format: 'uuid' })
  case_run_id!: string;

  @ApiProperty({ type: String })
  as_of!: string;

  @ApiProperty({ type: String })
  policy_version!: string;

  @ApiProperty({ type: String })
  rate_version!: string;

  @ApiProperty({ type: [String] })
  candidates!: string[];

  @ApiProperty({ type: Number })
  option_count!: number;

  @ApiProperty({ type: Number })
  feasible_option_count!: number;

  @ApiProperty({ type: 'array', items: OBJ, description: 'Every container × action option: feasible + reasons + cost breakdown (engine output)' })
  options!: Record<string, unknown>[];

  @ApiProperty({ type: 'array', items: OBJ })
  resources!: Record<string, unknown>[];

  @ApiProperty({ type: 'array', items: OBJ })
  facts!: Record<string, unknown>[];

  @ApiProperty({ ...OBJ })
  baseline!: Record<string, unknown>;

  @ApiProperty({ type: [String] })
  warnings!: string[];

  @ApiProperty({ type: Number })
  cost_ms!: number;
}

export class ApprovePlanRequestDto {
  @ApiProperty({ type: String, description: 'plan_hash of the plan you reviewed' })
  plan_hash!: string;

  @ApiProperty({ type: String, required: false, maxLength: 200 })
  note?: string;
}
