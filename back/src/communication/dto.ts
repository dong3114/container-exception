import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CHANNEL_TYPE, DRAFTED_BY, MESSAGE_STATUS, THREAD_PURPOSE, THREAD_STATUS } from '../db/schema/codes.js';
import { GateReasonDto } from '../registry/dto.js';
import { APPROVAL_BLOCK_REASONS } from './approval-rules.js';
import { HOLD_REASONS } from './inbound-rules.js';
import { SEND_BLOCK_REASONS } from './send-rules.js';
import { INQUIRY_INTENTS } from './inquiry-intents.js';
import { EXTRACTION_STATES, FAILURE_KINDS, RETRY_BLOCKS } from './extraction-status.js';

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

export class ReviseValueInputDto {
  @ApiProperty({ type: String, pattern: '^[a-z][a-z0-9_]*$', example: 'quantity' })
  key!: string;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 3 })
  value_number?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  value_text?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'TRUCK' })
  unit?: string | null;
}

export class ReviseDraftRequestDto {
  @ApiProperty({ type: String, maxLength: 200 })
  subject!: string;

  @ApiProperty({ type: String, maxLength: 4000 })
  body!: string;

  @ApiPropertyOptional({
    type: [ReviseValueInputDto],
    description:
      'Optional full set of structured values. A value that differs from the previous one loses its plan source (it is no longer a plan number). Values that define the question (date · window · size type) cannot change — create a new inquiry instead.',
  })
  values?: ReviseValueInputDto[];
}

export class ApproveDraftRequestDto {
  @ApiProperty({ type: String, pattern: '^sha256:[0-9a-f]{64}$', description: 'content_hash of the exact content the operator reviewed' })
  content_hash!: string;
}

export class RejectDraftRequestDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 500 })
  reason!: string;

  @ApiProperty({ type: String, pattern: '^sha256:[0-9a-f]{64}$', description: 'content_hash of the content the operator reviewed' })
  content_hash!: string;
}

export class RevokeApprovalRequestDto {
  @ApiPropertyOptional({ type: String, maxLength: 500 })
  reason?: string;
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

export const DRAFT_BLOCK_REASONS = APPROVAL_BLOCK_REASONS;

export const APPROVAL_STATES = ['NONE', 'ACTIVE', 'EXPIRED', 'REVOKED', 'INVALIDATED', 'REJECTED'] as const;
export const APPROVAL_ROW_STATES = ['ACTIVE', 'EXPIRED', 'REVOKED', 'INVALIDATED'] as const;
export const APPROVAL_DECISIONS = ['APPROVED', 'REJECTED', 'REVISION_REQUESTED', 'REVOKED', 'INVALIDATED'] as const;
export const INVALIDATION_CAUSES = ['USER_REVOKED', 'PLAN_SUPERSEDED', 'CONTENT_CHANGED'] as const;

export class ApprovalSnapshotDto {
  @ApiProperty({ type: String, format: 'uuid' })
  approval_id!: string;

  @ApiProperty({ enum: APPROVAL_ROW_STATES })
  state!: (typeof APPROVAL_ROW_STATES)[number];

  @ApiProperty({ type: String, format: 'uuid' })
  approver_actor_id!: string;

  @ApiProperty({ type: String })
  approver_name!: string;

  @ApiProperty({ type: String, example: '2026-10-07T10:00:00.000+09:00' })
  decided_at!: string;

  @ApiProperty({ type: String, nullable: true })
  expires_at!: string | null;

  @ApiProperty({ type: String, pattern: '^sha256:[0-9a-f]{64}$', description: 'msg-content/1 of recipient + subject + body + structured values at approval time' })
  approved_content_hash!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  approved_to_address_id!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Recovery run the approval was based on (plan-based inquiry)' })
  approved_plan_run_id!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Frozen subject (approval copy); null when the copy is missing' })
  subject!: string | null;

  @ApiProperty({ type: String, nullable: true })
  body!: string | null;

  @ApiProperty({ type: [StructuredValueDto], description: 'Frozen structured values (approval copy)' })
  structured_values!: StructuredValueDto[];

  @ApiProperty({ type: Boolean, description: 'The frozen copy re-hashes to approved_content_hash (the approval copy is intact)' })
  copy_verified!: boolean;
}

export class ApprovalDecisionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  approval_id!: string;

  @ApiProperty({ enum: APPROVAL_DECISIONS })
  decision!: (typeof APPROVAL_DECISIONS)[number];

  @ApiProperty({ enum: INVALIDATION_CAUSES, nullable: true })
  invalidation_cause!: (typeof INVALIDATION_CAUSES)[number] | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  invalidates_approval_id!: string | null;

  @ApiProperty({ type: String })
  actor_name!: string;

  @ApiProperty({ type: String, description: 'HUMAN · SYSTEM' })
  actor_type!: string;

  @ApiProperty({ type: String })
  decided_at!: string;

  @ApiProperty({ type: String, nullable: true })
  reason!: string | null;
}

export class DraftApprovalDto {
  @ApiProperty({
    enum: APPROVAL_STATES,
    description:
      'NONE · ACTIVE (live approval) · EXPIRED · REVOKED (operator withdrew) · INVALIDATED (content or plan changed) · REJECTED. Decided by the backend from the approval rows.',
  })
  state!: (typeof APPROVAL_STATES)[number];

  @ApiProperty({ type: Boolean, description: 'The six conditions of a valid approval hold now (docs/22 15.5.1) — the only thing a send may rely on' })
  usable_for_send!: boolean;

  @ApiProperty({ type: ApprovalSnapshotDto, nullable: true, description: 'Latest APPROVED decision with its frozen copy' })
  current!: ApprovalSnapshotDto | null;

  @ApiProperty({ type: ApprovalDecisionDto, nullable: true, description: 'The REVOKED / INVALIDATED row that ended the current approval' })
  ended_by!: ApprovalDecisionDto | null;

  @ApiProperty({ type: ApprovalDecisionDto, nullable: true })
  rejection!: ApprovalDecisionDto | null;

  @ApiProperty({ type: [ApprovalDecisionDto], description: 'Every decision on this message, oldest first (append-only)' })
  history!: ApprovalDecisionDto[];
}

export class DraftRevisionDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  previous_message_id!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Set when this message was replaced by a newer revision' })
  next_message_id!: string | null;

  @ApiProperty({
    enum: INVALIDATION_CAUSES,
    nullable: true,
    description: 'CONTENT_CHANGED when the previous revision had an approval that this edit invalidated — the new text needs approval again',
  })
  previous_approval_invalidated!: (typeof INVALIDATION_CAUSES)[number] | null;
}

export const DISPATCH_STATES = ['NOT_REQUESTED', 'QUEUED', 'SENDING', 'RETRY_WAIT', 'SENT', 'FAILED'] as const;
export const SEND_RESULTS = ['SUCCESS', 'RETRYABLE_FAILURE', 'PERMANENT_FAILURE', 'UNKNOWN'] as const;

export class SendDraftRequestDto {
  @ApiProperty({ type: String, pattern: '^sha256:[0-9a-f]{64}$', description: 'content_hash of the approved content the operator asks to send' })
  content_hash!: string;
}

export class SendAttemptSummaryDto {
  @ApiProperty({ type: Number, example: 1 })
  attempt_no!: number;

  @ApiProperty({ type: String })
  started_at!: string;

  @ApiProperty({ type: String, nullable: true })
  finished_at!: string | null;

  @ApiProperty({ enum: SEND_RESULTS, nullable: true, description: 'null = in progress (no result recorded yet)' })
  result!: (typeof SEND_RESULTS)[number] | null;

  @ApiProperty({ type: String, nullable: true, description: 'Failure reason code (no secrets, no raw content)' })
  error_code!: string | null;

  @ApiProperty({ type: Boolean, description: 'The result was settled by reconciliation (looked up in the channel) rather than by the send call' })
  reconciled!: boolean;
}

export class DraftDispatchDto {
  @ApiProperty({
    enum: DISPATCH_STATES,
    description:
      'NOT_REQUESTED · QUEUED (waiting for the worker) · SENDING (an attempt has no settled result) · RETRY_WAIT (temporary failure, will retry) · SENT · FAILED',
  })
  state!: (typeof DISPATCH_STATES)[number];

  @ApiProperty({ type: Boolean, description: 'A send can be requested now (approved, every send check passes, not yet queued)' })
  can_request_send!: boolean;

  @ApiProperty({ type: [String], enum: SEND_BLOCK_REASONS, description: 'Why it cannot be sent now (re-checked on every read, by the worker before every attempt)' })
  blocked_reasons!: (typeof SEND_BLOCK_REASONS)[number][];

  @ApiProperty({ type: String, nullable: true })
  queued_at!: string | null;

  @ApiProperty({ type: String, nullable: true })
  sent_at!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'The approval the (last) attempt used' })
  approval_id_used!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'When the next retry may start (RETRY_WAIT)' })
  next_attempt_at!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Why the worker took it off the queue (policy check failed right before sending — not retried)' })
  dequeued_reason!: string | null;

  @ApiProperty({ type: Boolean, description: 'Sending is paused by the kill switch — requests queue but nothing is sent' })
  sending_paused!: boolean;

  @ApiProperty({ type: [SendAttemptSummaryDto] })
  attempts!: SendAttemptSummaryDto[];
}

export const INBOUND_STATUSES = ['NORMAL', 'HOLD'] as const;

export class InboundSenderLabelDto {
  @ApiProperty({ type: String })
  counterparty_name!: string;

  @ApiProperty({ type: String })
  contact_name!: string;
}

export { EXTRACTION_STATES };

export class ExtractionCandidateDto {
  @ApiProperty({ type: String, format: 'uuid' })
  extraction_id!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Which question (ask) the candidate answers' })
  ask_id!: string | null;

  @ApiProperty({ type: String, description: 'The asked field the AI claims to answer (quantity, available_from, ...)' })
  field!: string;

  @ApiProperty({ type: String, description: 'Candidate value as the AI normalized it. A suggestion, not a fact' })
  value!: string;

  @ApiProperty({ type: String, nullable: true })
  unit!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Verbatim quote the AI gave as evidence (null when the stored quote is gone)' })
  evidence_quote!: string | null;

  @ApiProperty({ enum: ['PASSED', 'REJECTED'], description: 'Backend validation result. AI confidence is not used' })
  validation!: 'PASSED' | 'REJECTED';

  @ApiProperty({ type: [String], description: 'Failed checks: QUOTE_NOT_IN_SOURCE, FIELD_NOT_ASKED, UNIT_MISMATCH:x, VALUE_NOT_IN_QUOTE, CONFLICTING_CANDIDATES, ...' })
  failed_reasons!: string[];

  @ApiProperty({ enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED'], description: 'PENDING = passed validation but did not qualify to become a provisional fact (see promotion_blocked_reasons) · ACCEPTED = it became an event (a provisional fact — see fact_event_id) · REJECTED = failed validation' })
  review_status!: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED';

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'The event this candidate became (T-093). A provisional fact until a human confirms it' })
  fact_event_id!: string | null;

  @ApiProperty({ type: [String], description: 'Why a validated candidate was not turned into a provisional fact (SENDER_NOT_AUTHORITY · WINDOW_OUT_OF_SCOPE · DATE_OUT_OF_SCOPE · DATE_UNVERIFIED · AMBIGUOUS_REPLY · PLAN_SUPERSEDED …). A person decides' })
  promotion_blocked_reasons!: string[];

  @ApiProperty({ enum: ['RECORDED_REPLAY', 'LLM'], description: 'RECORDED_REPLAY = recorded response, no LLM was run' })
  generated_by!: 'RECORDED_REPLAY' | 'LLM';
}

export class ExtractionAttemptDto {
  @ApiProperty({ type: Number })
  attempt_no!: number;

  @ApiProperty({ enum: ['AUTO', 'HUMAN_RETRY'], description: 'AUTO = the worker (within CERA_EXTRACTION_MAX_ATTEMPTS) · HUMAN_RETRY = an operator asked for it' })
  trigger!: 'AUTO' | 'HUMAN_RETRY';

  @ApiProperty({ enum: ['FAILED', 'DONE', 'NO_CANDIDATE', 'SKIPPED', 'RUNNING'] })
  result!: 'FAILED' | 'DONE' | 'NO_CANDIDATE' | 'SKIPPED' | 'RUNNING';

  @ApiProperty({ type: String, description: 'When it was recorded (RUNNING: when it was requested)' })
  at!: string;

  @ApiProperty({ type: String, nullable: true })
  error_code!: string | null;

  @ApiProperty({ type: String, nullable: true })
  provider_code!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'NO_CANDIDATE: NO_CHANGE · REFUSAL · UNPARSEABLE · VALUES' })
  outcome!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  retry_request_id!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  requested_by_actor_id!: string | null;
}

export class ExtractionRetryAvailabilityDto {
  @ApiProperty({ type: Boolean, description: 'Whether a person may ask for one more attempt now (the request re-checks thread, gap and supersession)' })
  available!: boolean;

  @ApiProperty({ enum: RETRY_BLOCKS, nullable: true })
  blocked_reason!: (typeof RETRY_BLOCKS)[number] | null;
}

export class InboundExtractionDto {
  @ApiProperty({ enum: EXTRACTION_STATES, description: 'WAITING (not run yet), DONE (candidates), NO_CANDIDATE, SKIPPED, RETRYING (technical failure, will retry — or a human-requested attempt is running), FAILED (automatic retry limit, or a human-requested attempt failed)' })
  state!: (typeof EXTRACTION_STATES)[number];

  @ApiProperty({ type: String, nullable: true, description: 'NO_CHANGE, REFUSAL, UNPARSEABLE or VALUES when nothing was extracted' })
  no_candidate_outcome!: string | null;

  @ApiProperty({ type: [ExtractionCandidateDto] })
  candidates!: ExtractionCandidateDto[];

  @ApiProperty({ type: Number, description: 'Technical failures so far (automatic and human-requested attempts)' })
  failed_attempts!: number;

  @ApiProperty({ type: String, nullable: true, description: 'Last technical failure: AI_SERVER_UNAVAILABLE · EXTRACTION_TIMEOUT · EXTRACTION_PROVIDER_FAILED · EXTRACTION_OUTPUT_INVALID · EXTRACTION_REQUEST_REJECTED' })
  last_error_code!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "The AI server's own code for the last technical failure (NO_RECORDING · PROVIDER_NOT_CONFIGURED …)" })
  provider_code!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'RETRYING: when the next automatic attempt may run (the retry spacing grows after each transient failure). A failure that would repeat (retryable = false) is not retried automatically' })
  next_attempt_at!: string | null;

  @ApiProperty({ enum: FAILURE_KINDS, nullable: true, description: 'Why no usable value came out: AI_CALL_FAILED (the AI call itself failed) · NO_ANSWER_FOUND (the model found no answer) · VALIDATOR_REJECTED (answers failed the backend checks) · NOT_EXTRACTABLE (no content / no question)' })
  failure_kind!: (typeof FAILURE_KINDS)[number] | null;

  @ApiProperty({ type: Boolean, description: 'A reply arrived but no validated value came out — a person reviews it: retry the extraction or enter the fact directly' })
  needs_review!: boolean;

  @ApiProperty({
    type: Boolean,
    description:
      'needs_review is about this reply\'s extraction only. review_pending = a person still has business work here: needs_review AND what was asked is not yet confirmed / officially recorded AND no newer reply or inquiry exists. A reply can show needs_review=true with review_pending=false (the information was filled another way)',
  })
  review_pending!: boolean;

  @ApiProperty({ type: [ExtractionAttemptDto], description: 'Every attempt in order. Earlier attempts are never removed' })
  attempts!: ExtractionAttemptDto[];

  @ApiProperty({ type: ExtractionRetryAvailabilityDto })
  retry!: ExtractionRetryAvailabilityDto;
}

export class InboundItemDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'The preserved original (raw_input)' })
  raw_input_id!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'The INBOUND message on the thread — null when held' })
  message_id!: string | null;

  @ApiProperty({ enum: INBOUND_STATUSES, description: 'NORMAL = attached to its inquiry thread · HOLD = kept (never discarded) but not attached' })
  status!: (typeof INBOUND_STATUSES)[number];

  @ApiProperty({ type: [String], enum: HOLD_REASONS, description: 'Why it was held, decided at receipt (registry · thread correlation — no AI)' })
  hold_reasons!: (typeof HOLD_REASONS)[number][];

  @ApiProperty({ type: String, nullable: true, description: 'Sender address as received' })
  from_address!: string | null;

  @ApiProperty({ type: InboundSenderLabelDto, nullable: true, description: 'Who that address belongs to in the registry, if anyone (display only)' })
  sender_label!: InboundSenderLabelDto | null;

  @ApiProperty({ type: String, nullable: true })
  subject!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Plain-text preview (first 300 characters). Not interpreted.' })
  preview!: string | null;

  @ApiProperty({ type: String, description: 'When the channel received it' })
  channel_received_at!: string;

  @ApiProperty({ type: String, description: 'When CERA stored it' })
  received_at!: string;

  @ApiProperty({ type: String, description: 'Evidence time (docs/22 11.2e): the Date header when valid, else the channel time' })
  evidence_time!: string;

  @ApiProperty({ enum: ['DATE_HEADER', 'CHANNEL_RECEIVED'] })
  evidence_basis!: 'DATE_HEADER' | 'CHANNEL_RECEIVED';

  @ApiProperty({ enum: ['MISSING', 'UNPARSEABLE', 'AFTER_CHANNEL_RECEIVED'], nullable: true })
  date_header_reject_reason!: 'MISSING' | 'UNPARSEABLE' | 'AFTER_CHANNEL_RECEIVED' | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  thread_id!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Counterparty of the thread it was attached to' })
  thread_counterparty_name!: string | null;

  @ApiProperty({ type: Boolean })
  is_simulated!: boolean;

  @ApiProperty({ type: Boolean, description: 'The original is still in the content store' })
  content_available!: boolean;

  @ApiProperty({ type: InboundExtractionDto, nullable: true, description: 'AI suggestions for a NORMAL reply, validated by the backend. Null for held mail (never sent to AI)' })
  extraction!: InboundExtractionDto | null;
}

export class InboundListDto {
  @ApiProperty({ type: [InboundItemDto] })
  items!: InboundItemDto[];
}

export class ExtractionRetryRequestDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Idempotency: the same command id returns the same request (double click · network retry)' })
  command_id!: string;

  @ApiPropertyOptional({ type: String, maxLength: 200, description: 'Why the operator asks again (e.g. provider changed)' })
  note?: string;
}

export class HeldReprocessResultDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'The held mail (raw_input) — its original is not changed' })
  raw_input_id!: string;

  @ApiProperty({ enum: ['ATTACHED', 'STILL_HELD', 'ALREADY_ATTACHED'], description: 'ATTACHED = judged again against the current registry / threads and attached as a reply (extraction follows as usual) · STILL_HELD = nothing changed · ALREADY_ATTACHED = it was attached before' })
  result!: 'ATTACHED' | 'STILL_HELD' | 'ALREADY_ATTACHED';

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  message_id!: string | null;

  @ApiProperty({ type: [String], description: 'Hold reasons now (STILL_HELD only)' })
  hold_reasons!: string[];
}

export class ExtractionRetryResultDto {
  @ApiProperty({ type: String, format: 'uuid' })
  retry_request_id!: string;

  @ApiProperty({ type: Boolean, description: 'true = this command id was already accepted; nothing new was started' })
  replayed!: boolean;

  @ApiProperty({ type: InboundItemDto, description: 'The reply with its attempts — the new attempt shows as RUNNING until the worker records it' })
  reply!: InboundItemDto;
}

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

  @ApiProperty({ type: Boolean, description: 'Can be approved now — no blocked_reasons (all checks recomputed on read)' })
  approval_ready!: boolean;

  @ApiProperty({ type: [String], enum: DRAFT_BLOCK_REASONS })
  blocked_reasons!: (typeof DRAFT_BLOCK_REASONS)[number][];

  @ApiProperty({ type: DraftApprovalDto })
  approval!: DraftApprovalDto;

  @ApiProperty({ type: DraftRevisionDto })
  revision!: DraftRevisionDto;

  @ApiProperty({ type: DraftDispatchDto })
  dispatch!: DraftDispatchDto;

  @ApiProperty({ type: [InboundItemDto], description: 'Replies received on this thread (NORMAL only — held mail is in GET /communication/inbound)' })
  replies!: InboundItemDto[];
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

  @ApiProperty({ enum: ['MANUAL', 'AUTO_DETECTED', 'SCENARIO'], description: 'T-132: who started the run — the deterministic exception detector, a person, or the synthetic scenario seed' })
  source!: 'MANUAL' | 'AUTO_DETECTED' | 'SCENARIO';

  @ApiProperty({ type: () => RunExceptionDto, nullable: true, description: 'T-132: the operational exception that opened this run' })
  exception!: RunExceptionDto | null;
}

export class RunExceptionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  exception_id!: string;

  @ApiProperty({ enum: ['ACTIVE', 'RESOLVED'] })
  status!: string;

  @ApiProperty({ enum: ['CONFIRMED', 'PROVISIONAL'] })
  basis!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  facility_id!: string;

  @ApiProperty({ type: String })
  facility_name!: string;

  @ApiProperty({ type: String, format: 'date' })
  window_day!: string;

  @ApiProperty({ type: Number })
  scheduled_demand!: number;

  @ApiProperty({ type: Number, nullable: true })
  capacity!: number | null;

  @ApiProperty({ type: Number })
  shortage!: number;
}

export class RunListDto {
  @ApiProperty({ type: [RunSummaryDto] })
  runs!: RunSummaryDto[];
}

export class ApproverDto {
  @ApiProperty({ type: String, format: 'uuid' })
  actor_id!: string;

  @ApiProperty({ type: String })
  display_name!: string;
}

export class ApproverListDto {
  @ApiProperty({ type: [ApproverDto], description: 'Active HUMAN actors who may decide approvals (development stand-in until authentication exists)' })
  approvers!: ApproverDto[];
}
