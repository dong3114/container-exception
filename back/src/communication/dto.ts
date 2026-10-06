import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CHANNEL_TYPE, DRAFTED_BY, MESSAGE_STATUS, THREAD_PURPOSE, THREAD_STATUS } from '../db/schema/codes.js';
import { GateReasonDto } from '../registry/dto.js';
import { INQUIRY_INTENTS } from './inquiry-intents.js';

/**
 * 문의 초안 계약(T-088 U3 — OpenAPI 정본, ADR-028). JSON 은 snake_case, 시각은 +09:00.
 * 숫자 값(`value_number`)은 10진 문자열로 돌려준다(정밀도 · KRW 규칙과 같은 모양).
 * 모든 속성에 type 을 명시한다 — tsx 로 문서를 만들 때 decorator metadata 가 없다(docs/24 18.3 U2-3).
 */

export class StructuredValueInputDto {
  @ApiProperty({ type: String, pattern: '^[a-z][a-z0-9_]*$', example: 'quantity' })
  key!: string;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 2 })
  value_number?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '2026-10-13' })
  value_text?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'TRUCK' })
  unit?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Path inside the source run (requires source_run_id)', example: 'resource_gaps[0].needed' })
  source_path?: string | null;
}

export class CreateDraftRequestDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Recipient address (decides contact and counterparty)' })
  address_id!: string;

  @ApiProperty({ enum: INQUIRY_INTENTS })
  intent!: (typeof INQUIRY_INTENTS)[number];

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'TRUCK_SLOT → truck pool of that counterparty (omit = its only active pool) · FACILITY_CAPACITY → warehouse / ODCY (required)',
  })
  target_id?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, description: 'Recovery run the values come from (plan-based inquiry)' })
  source_run_id?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, description: 'Scenario for a MOCK-channel draft without a source run' })
  scenario_id?: string | null;

  @ApiProperty({ type: [StructuredValueInputDto] })
  values!: StructuredValueInputDto[];
}

export class ReviseDraftRequestDto {
  @ApiProperty({ type: String, maxLength: 200 })
  subject!: string;

  @ApiProperty({ type: String, maxLength: 4000 })
  body!: string;
}

export class DraftMessageDto {
  @ApiProperty({ type: String, format: 'uuid' })
  message_id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  thread_id!: string;

  @ApiProperty({ enum: MESSAGE_STATUS, description: 'PENDING_APPROVAL = passed the number check; DRAFTED = blocked; CLOSED = superseded' })
  status!: (typeof MESSAGE_STATUS)[number];

  @ApiProperty({ enum: DRAFTED_BY, description: 'TEMPLATE (no AI) · HUMAN (operator revision) · AI_DRAFT (later)' })
  drafted_by!: (typeof DRAFTED_BY)[number];

  @ApiProperty({ enum: CHANNEL_TYPE })
  channel_type!: (typeof CHANNEL_TYPE)[number];

  @ApiProperty({ type: Boolean })
  is_simulated!: boolean;

  @ApiProperty({ type: String, pattern: '^sha256:[0-9a-f]{64}$' })
  content_hash!: string;

  @ApiProperty({ type: String, nullable: true, description: 'null when the content is missing from the content store' })
  subject!: string | null;

  @ApiProperty({ type: String, nullable: true })
  body!: string | null;

  @ApiProperty({ type: String, example: '2026-10-13T11:00:00.000+09:00' })
  created_at!: string;
}

export class DraftThreadDto {
  @ApiProperty({ type: String, format: 'uuid' })
  thread_id!: string;

  @ApiProperty({ enum: THREAD_PURPOSE })
  purpose!: (typeof THREAD_PURPOSE)[number];

  @ApiProperty({ enum: THREAD_STATUS })
  thread_status!: (typeof THREAD_STATUS)[number];

  @ApiProperty({ type: String, format: 'uuid' })
  counterparty_id!: string;

  @ApiProperty({ type: String })
  counterparty_name!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  contact_id!: string | null;

  @ApiProperty({ type: String, nullable: true })
  contact_name!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  address_id!: string | null;

  @ApiProperty({ type: String, nullable: true })
  normalized_address!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Recovery context the inquiry came from' })
  related_run_id!: string | null;

  @ApiProperty({ type: String })
  opened_at!: string;
}

export class DraftQuestionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  question_item_id!: string;

  @ApiProperty({ type: String, description: 'Tag carried in the message so a reply maps back to this question' })
  ask_id!: string;

  @ApiProperty({ type: String })
  question_type!: string;

  @ApiProperty({ type: String })
  question_text!: string;

  @ApiProperty({ type: String, nullable: true })
  target_entity_type!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  target_entity_id!: string | null;

  @ApiProperty({ type: String })
  target_name!: string;

  @ApiProperty({ type: String, nullable: true, example: 'available.slot(2026-10-13T15:00-17:00)' })
  target_fact_key!: string | null;

  @ApiProperty({ type: String })
  expected_value_type!: string;

  @ApiProperty({ type: String, nullable: true })
  expected_unit!: string | null;

  @ApiProperty({ type: String })
  question_status!: string;
}

export class StructuredValueDto {
  @ApiProperty({ type: String })
  key!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Decimal string', example: '2' })
  value_number!: string | null;

  @ApiProperty({ type: String, nullable: true })
  value_text!: string | null;

  @ApiProperty({ type: String, nullable: true })
  unit!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Set when the value came from a recovery run' })
  source_run_id!: string | null;

  @ApiProperty({ type: String, nullable: true })
  source_path!: string | null;
}

export class NumberTokenDto {
  @ApiProperty({ type: String, example: '8' })
  text!: string;

  @ApiProperty({ enum: ['DATE', 'TIME', 'MONEY', 'QUANTITY'] })
  kind!: 'DATE' | 'TIME' | 'MONEY' | 'QUANTITY';

  @ApiProperty({ type: String, nullable: true, description: 'Structured value key it matched; null = not in the structured values' })
  matched_field!: string | null;
}

export class NumberCheckDto {
  @ApiProperty({ enum: ['PASSED', 'BLOCKED_NUMBER_CHECK'] })
  status!: 'PASSED' | 'BLOCKED_NUMBER_CHECK';

  @ApiProperty({ type: Boolean })
  passed!: boolean;

  @ApiProperty({ type: [NumberTokenDto] })
  tokens!: NumberTokenDto[];

  @ApiProperty({ type: [NumberTokenDto], description: 'Numbers / dates / times in the text that are not structured values (why it is blocked)' })
  unmatched!: NumberTokenDto[];

  @ApiProperty({ type: [String], description: 'Structured values the text never mentions (information, not a failure)' })
  not_mentioned!: string[];
}

export class DraftGateDto {
  @ApiProperty({ type: Boolean })
  eligible!: boolean;

  @ApiProperty({ type: [GateReasonDto] })
  reasons!: GateReasonDto[];
}

export class DraftSourceRunDto {
  @ApiProperty({ type: String, format: 'uuid' })
  run_id!: string;

  @ApiProperty({ type: String, nullable: true, example: 'RP-001' })
  trigger_ref!: string | null;

  @ApiProperty({ type: Boolean })
  contains_simulated!: boolean;
}

export const DRAFT_BLOCK_REASONS = ['BLOCKED_NUMBER_CHECK', 'RECIPIENT_NOT_ELIGIBLE', 'CONTENT_MISSING', 'NOT_PENDING_APPROVAL'] as const;

export class DraftDto {
  @ApiProperty({ type: DraftMessageDto })
  message!: DraftMessageDto;

  @ApiProperty({ type: DraftThreadDto })
  thread!: DraftThreadDto;

  @ApiProperty({ type: DraftQuestionDto, nullable: true })
  question!: DraftQuestionDto | null;

  @ApiProperty({ type: [StructuredValueDto] })
  structured_values!: StructuredValueDto[];

  @ApiProperty({ type: Boolean, description: 'true when the values come from a recovery run' })
  plan_based!: boolean;

  @ApiProperty({ type: DraftSourceRunDto, nullable: true })
  source_run!: DraftSourceRunDto | null;

  @ApiProperty({ type: NumberCheckDto, nullable: true, description: 'Recomputed on every read (deterministic); null when the content is missing' })
  number_check!: NumberCheckDto | null;

  @ApiProperty({ type: DraftGateDto, nullable: true, description: 'Contact Gate re-evaluated on read' })
  contact_gate!: DraftGateDto | null;

  @ApiProperty({ type: Boolean, description: 'May go to the approval step (U4) — PENDING_APPROVAL, number check passed, recipient eligible' })
  approval_ready!: boolean;

  @ApiProperty({ type: [String], enum: DRAFT_BLOCK_REASONS })
  blocked_reasons!: (typeof DRAFT_BLOCK_REASONS)[number][];
}

export class DraftListDto {
  @ApiProperty({ type: [DraftDto] })
  drafts!: DraftDto[];
}

export class RunSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  run_id!: string;

  @ApiProperty({ type: String, nullable: true })
  trigger_ref!: string | null;

  @ApiProperty({ type: String })
  executed_at!: string;

  @ApiProperty({ type: Boolean })
  contains_simulated!: boolean;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  scenario_id!: string | null;
}

export class RunListDto {
  @ApiProperty({ type: [RunSummaryDto] })
  runs!: RunSummaryDto[];
}
