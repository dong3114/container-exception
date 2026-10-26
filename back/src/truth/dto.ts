import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MANUAL_ENTRY_INTENT, REJECT_REASONS, REVOKE_REASONS } from './fact-actions.service.js';

/**
 * 사실 계약(T-093 — OpenAPI 정본). JSON 은 snake_case, 시각은 +09:00. 모든 속성에 type 을 명시한다(tsx 는 decorator metadata 를 만들지 않는다).
 *
 * `fact_state` 는 사람이 보는 한 단계다: PROVISIONAL(검증된 임시 사실 — 사람 확인 전) · CONFIRMED(사람 확인 완료) ·
 * OBSERVED(공식 기록, 사람 확인은 아님) · NEEDS_REVIEW(충돌 · 보류 — 사람 판단 필요) · STALE(오래돼 지금 결정에 쓰기 어려움 · 만료 — 틀린 것은 아님) ·
 * REVOKED(사람이 철회해 지금 값 없음) · UNKNOWN(자격 있는 값 없음). 보증 수준(`value_status`)과 신선도(`freshness_status`)는 따로 준다.
 * AI 후보(PENDING)는 사실이 아니라서 여기 나오지 않는다 — 회신 화면의 후보 목록에 있다.
 */
export const FACT_STATES = ['PROVISIONAL', 'CONFIRMED', 'OBSERVED', 'NEEDS_REVIEW', 'STALE', 'REVOKED', 'UNKNOWN'] as const;
export const CANDIDATE_ROLES = ['WINNER', 'CORROBORATING', 'OUTDATED', 'DISSENTING', 'CONTESTING', 'HELD_CANDIDATE', 'INELIGIBLE', 'REJECTED', 'SUPERSEDED', 'REVOKED'] as const;

export class FactCandidateDto {
  @ApiProperty({ type: String, format: 'uuid' })
  event_id!: string;

  @ApiProperty({ enum: ['OBSERVATION', 'CORRECTION'] })
  event_class!: 'OBSERVATION' | 'CORRECTION';

  @ApiProperty({ enum: CANDIDATE_ROLES, description: 'What this event is in the current judgement. WINNER = the current value' })
  role!: (typeof CANDIDATE_ROLES)[number];

  @ApiProperty({ type: Number, nullable: true })
  value!: number | null;

  @ApiProperty({ type: String, nullable: true })
  unit!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'The value applies from here (Asia/Seoul) — the asked date / time window' })
  valid_from!: string | null;

  @ApiProperty({ type: String, nullable: true })
  valid_until!: string | null;

  @ApiProperty({ type: String, description: 'EMAIL · HUMAN_UI · …' })
  source_type!: string;

  @ApiProperty({ type: String, nullable: true })
  source_role!: string | null;

  @ApiProperty({ type: Number, description: 'Evidence strength 0..3 (docs/05 3.3)' })
  evidence_strength!: number;

  @ApiProperty({ enum: ['UNVERIFIED', 'CONFIRMED', 'REJECTED'] })
  verification!: 'UNVERIFIED' | 'CONFIRMED' | 'REJECTED';

  @ApiProperty({ type: Boolean, description: 'Entered by a human or confirmed by one' })
  verified_by_human!: boolean;

  @ApiProperty({ type: String })
  received_at!: string;

  @ApiProperty({ type: String, description: 'Evidence time used for ordering (Q-44 sent time, else received time)' })
  evidence_time!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  supersedes_event_id!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'The AI extraction this event came from' })
  extraction_id!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Verbatim quote from the reply (null when none or the stored quote is gone)' })
  evidence_quote!: string | null;

  @ApiProperty({ enum: ['LLM', 'RECORDED_REPLAY', 'HUMAN', 'SYSTEM'], description: 'RECORDED_REPLAY = recorded response, no LLM was run' })
  generated_by!: 'LLM' | 'RECORDED_REPLAY' | 'HUMAN' | 'SYSTEM';

  @ApiProperty({ type: String, nullable: true })
  model_version!: string | null;

  @ApiProperty({ type: String, nullable: true })
  prompt_version!: string | null;
}

export class FactCurrentDto {
  @ApiProperty({ type: String, format: 'uuid' })
  event_id!: string;

  @ApiProperty({ type: Number, nullable: true })
  value!: number | null;

  @ApiProperty({ type: String, nullable: true })
  unit!: string | null;

  @ApiProperty({ type: String, nullable: true })
  valid_from!: string | null;

  @ApiProperty({ type: String, nullable: true })
  valid_until!: string | null;

  @ApiProperty({ type: Number })
  evidence_strength!: number;

  @ApiProperty({ type: Boolean })
  verified_by_human!: boolean;

  @ApiProperty({ type: String, nullable: true, enum: ['HUMAN_VERIFICATION', 'AUTHORITATIVE_SYSTEM'] })
  verification_basis!: string | null;
}

export class ApplicabilityScopeDto {
  @ApiProperty({ type: String })
  type!: string;

  @ApiProperty({ type: String })
  ref!: string;
}

export class FactCoordinateDto {
  @ApiProperty({ type: String })
  entity_type!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  entity_id!: string;

  @ApiProperty({ type: String, nullable: true })
  entity_name!: string | null;

  @ApiProperty({ type: String, description: 'e.g. available.slot(2026-10-13T15:00-17:00) · capacity.day(2026-10-13)' })
  fact_key!: string;

  @ApiProperty({ type: ApplicabilityScopeDto })
  applicability_scope!: ApplicabilityScopeDto;

  @ApiProperty({ type: Boolean })
  is_simulated!: boolean;

  @ApiProperty({ enum: FACT_STATES })
  fact_state!: (typeof FACT_STATES)[number];

  @ApiProperty({ type: String, enum: ['UNKNOWN', 'PROVISIONAL', 'OBSERVED', 'CONFIRMED'] })
  value_status!: string;

  @ApiProperty({ type: String, enum: ['NONE', 'DISSENT', 'OPEN'] })
  conflict_status!: string;

  @ApiProperty({ type: String, enum: ['NONE', 'HELD'] })
  hold_status!: string;

  @ApiProperty({ type: String, enum: ['USABLE', 'USABLE_WITH_WARNING', 'APPROVAL_BLOCKED', 'UNUSABLE'] })
  decision_usability!: string;

  @ApiProperty({ type: String, enum: ['FRESH', 'AGING', 'STALE', 'EXPIRED', 'UNKNOWN'], description: 'Freshness at evaluated_as_of: an explicit valid_until wins (EXPIRED after it); otherwise the per-family policy [ASSUMPTION]. UNKNOWN = no policy for this fact family' })
  freshness_status!: string;

  @ApiProperty({ type: String, description: 'The reference time this judgement used (+09:00) — the plan scenario time for simulated runs, now for real ones, or the as_of the caller gave' })
  evaluated_as_of!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'The withdrawal (revoke) event that left this fact without a current value' })
  revoked_by_event_id!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Reconciliation rule that picked the current value (R4-a · R4-b · R6 · R10)' })
  applied_rule!: string | null;

  @ApiProperty({ type: String })
  rule_version!: string;

  @ApiProperty({ type: FactCurrentDto, nullable: true, description: 'The current value — null when no eligible value exists' })
  current!: FactCurrentDto | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'A weaker, adverse change held for human review (the current value stays)' })
  held_event_id!: string | null;

  @ApiProperty({ type: [FactCandidateDto], description: 'Every event for this fact, newest first, with its role in the judgement' })
  candidates!: FactCandidateDto[];
}

export class FactListDto {
  @ApiProperty({ type: String })
  evaluated_at!: string;

  @ApiProperty({ type: String })
  rule_version!: string;

  @ApiProperty({ type: [String], description: 'What this judgement does not cover yet' })
  limitations!: string[];

  @ApiProperty({ type: [FactCoordinateDto] })
  facts!: FactCoordinateDto[];
}

export class ConfirmFactRequestDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Retry key — the same command id never creates a second event' })
  command_id?: string;

  @ApiPropertyOptional({ type: String, maxLength: 200 })
  note?: string;
}

export class RejectFactRequestDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  command_id?: string;

  @ApiProperty({ enum: REJECT_REASONS })
  reason_code!: (typeof REJECT_REASONS)[number];

  @ApiPropertyOptional({ type: String, maxLength: 200 })
  note?: string;
}

export class CorrectFactRequestDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  command_id?: string;

  @ApiProperty({ type: Number, minimum: 0, maximum: 999999, description: 'The value the operator reads from the reply (whole number, same unit as the current value)' })
  value!: number;

  @ApiProperty({ enum: REJECT_REASONS })
  reason_code!: (typeof REJECT_REASONS)[number];

  @ApiPropertyOptional({ type: String, maxLength: 200 })
  note?: string;
}

export class RevokeFactRequestDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Retry key — the same command id never creates a second event' })
  command_id?: string;

  @ApiProperty({ enum: REVOKE_REASONS, description: 'SOURCE_WITHDREW (the partner took it back) · OPERATOR_INVALIDATED · OUTDATED_OPERATIONAL_STATE (no longer true, no new value yet)' })
  reason_code!: (typeof REVOKE_REASONS)[number];

  @ApiPropertyOptional({ type: String, maxLength: 200 })
  note?: string;
}

export class ManualFactRequestDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  command_id?: string;

  @ApiProperty({ enum: [MANUAL_ENTRY_INTENT], description: 'Explicit intent — keeps operator entry apart from the AI / agent flow' })
  intent!: typeof MANUAL_ENTRY_INTENT;

  @ApiProperty({ enum: ['TRUCK_SLOT', 'FACILITY_CAPACITY'] })
  kind!: 'TRUCK_SLOT' | 'FACILITY_CAPACITY';

  @ApiProperty({ type: String, format: 'uuid', description: 'Truck pool (TRUCK_SLOT) or warehouse / ODCY (FACILITY_CAPACITY)' })
  target_id!: string;

  @ApiProperty({ type: String, example: '2026-10-27', description: 'Date in Asia/Seoul' })
  date!: string;

  @ApiPropertyOptional({ type: String, example: '15:00', description: 'TRUCK_SLOT: window start (Asia/Seoul)' })
  window_from?: string;

  @ApiPropertyOptional({ type: String, example: '18:00' })
  window_to?: string;

  @ApiPropertyOptional({ type: String, example: '40DRY', description: 'ODCY capacity per size type' })
  size_type?: string;

  @ApiProperty({ type: Number, minimum: 0, maximum: 999999 })
  value!: number;

  @ApiProperty({ type: String, minLength: 1, maxLength: 200, description: 'Where the operator confirmed it (phone, visit …) — required provenance' })
  source_note!: string;

  @ApiPropertyOptional({ type: String, description: 'When the partner said it (ISO 8601 with offset, not in the future). Default: now' })
  observed_at?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Scenario for simulated (MOCK) data' })
  scenario_id?: string;
}
