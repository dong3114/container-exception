import { z } from 'zod';
import type { FetchSummary, ManifestContainerView, Provenance, VesselCallView } from '../public-data/contracts.js';

/**
 * Agent Tool 입력 · 출력 스키마 — 정본 하나(ADR-033 결정 7). Backend 는 이것으로 검증하고, 같은 스키마를 JSON Schema 로
 * 내보내 `packages/contracts/agent-tools/agent-tools.v1.json` 이 된다. Python 은 그 파일을 읽는다(DTO 를 손으로 두 번 쓰지 않는다).
 * 출력은 Agent 가 판단에 쓰는 모양이지 DB 표 모양이 아니다.
 */

const uuid = z.uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD (Asia/Seoul calendar date)');
const timestamp = z.string().describe('ISO 8601 with +09:00');

// ── 공공데이터(T-102 계약 재사용 — 아래 타입 검사가 T-102 의 TS 계약과 같은지 컴파일 때 확인한다) ──
export const provenanceSchema = z
  .object({
    source_type: z.literal('PUBLIC_API'),
    provider: z.literal('DATA_GO_KR'),
    dataset: z.enum(['MOF_VESSEL_CALL', 'MOF_CONTAINER_MANIFEST']),
    mode: z.enum(['LIVE', 'REPLAY']),
    is_simulated: z.boolean(),
    result_kind: z.enum(['PUBLIC_DATA', 'SCENARIO_RESULT']),
    fetch_id: uuid,
    raw_input_id: uuid,
    payload_hash: z.string(),
    requested_at: timestamp,
    received_at: timestamp,
  })
  .strict();

const observation = <T extends z.ZodTypeAny>(value: T) => z.object({ value, event_id: uuid, provenance: provenanceSchema }).strict();

export const vesselCallSchema = z
  .object({
    vessel_call_id: uuid,
    port_authority_code: z.string(),
    call_year: z.number().int(),
    call_seq: z.string(),
    call_sign: z.string(),
    vessel_name: z.string().nullable(),
    is_simulated: z.boolean(),
    declared_arrival: observation(z.object({ at: timestamp, request_kind: z.string().nullable(), relative_to_received: z.enum(['PAST', 'FUTURE']) }).strict())
      .nullable()
      .describe('Declared arrival time (port entry declaration) — not a confirmed berthing'),
    latest_berth: observation(z.object({ code: z.string().nullable(), name: z.string().nullable() }).strict()).nullable(),
    manifest_no: z.string().nullable(),
    container_count: z.number().int(),
    registered_from: provenanceSchema,
  })
  .strict();

export const manifestContainerSchema = z
  .object({
    container_id: uuid,
    container_no: z.string(),
    size_type: z.string().nullable(),
    iso_size_type: z.string().nullable(),
    bl_no: z.string().nullable(),
    bl_type: z.enum(['MASTER', 'HOUSE', 'UNKNOWN']).nullable(),
    msn: z.string().nullable(),
    check_digit_valid: z.boolean(),
    is_simulated: z.boolean(),
    registered_from: provenanceSchema,
  })
  .strict();

export const fetchSummarySchema = z
  .object({
    dataset: z.enum(['MOF_VESSEL_CALL', 'MOF_CONTAINER_MANIFEST']),
    mode: z.enum(['LIVE', 'REPLAY']),
    outcome: z.enum(['SUCCESS', 'NO_DATA', 'UPSTREAM_ERROR', 'TRANSPORT_ERROR', 'PARSE_ERROR']),
    total_count: z.number().int().nullable(),
    pages: z.array(
      z
        .object({
          fetch_id: uuid,
          page_no: z.number().int(),
          outcome: z.enum(['SUCCESS', 'NO_DATA', 'UPSTREAM_ERROR', 'TRANSPORT_ERROR', 'PARSE_ERROR']),
          http_status: z.number().int().nullable(),
          result_code: z.string().nullable(),
          item_count: z.number().int().nullable(),
          raw_input_id: uuid.nullable(),
        })
        .strict(),
    ),
    truncated: z.boolean(),
    issues: z.array(z.object({ item_index: z.number().int().nullable(), code: z.string() }).strict()),
  })
  .strict();

// T-102 계약과 같은 모양인지(양방향) — 다르면 컴파일이 깨진다
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const sameContracts: [
  Same<z.infer<typeof provenanceSchema>, Provenance>,
  Same<z.infer<typeof vesselCallSchema>, VesselCallView>,
  Same<z.infer<typeof manifestContainerSchema>, ManifestContainerView>,
  Same<z.infer<typeof fetchSummarySchema>, FetchSummary>,
] = [true, true, true, true];
void sameContracts;

// ── 입력 ──
export const getVesselCallsInput = z
  .object({
    port_code: z.literal('020').default('020').describe('Port authority code. Only Busan (020) is in scope'),
    from_date: isoDate,
    to_date: isoDate,
    call_sign: z.string().regex(/^[A-Za-z0-9]{1,10}$/).nullable().optional(),
  })
  .strict();
export const vesselCallIdInput = z.object({ vessel_call_id: uuid }).strict();
export const recoveryRunInput = z.object({ recovery_run_id: uuid.optional().describe('Defaults to the recovery run this agent run is bound to') }).strict();
export const findCounterpartyInput = z
  .object({
    role: z.enum(['TRUCKING', 'ODCY', 'WAREHOUSE', 'SHIPPING_LINE', 'TERMINAL']).optional(),
    name_contains: z.string().min(1).max(60).optional(),
    eligible_only: z.boolean().default(true),
  })
  .strict();
export const createInquiryDraftInput = z
  .object({
    address_id: uuid.describe('Recipient address from find_counterparty (must be eligible)'),
    intent: z.enum(['TRUCK_SLOT', 'FACILITY_CAPACITY']),
    target_id: uuid.optional().describe('Facility or truck pool the question is about'),
    values: z
      .array(
        z
          .object({
            key: z.string().regex(/^[a-z][a-z0-9_]*$/),
            value_number: z.number().nullable().optional(),
            value_text: z.string().max(200).nullable().optional(),
            unit: z.string().max(20).nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();
export const messageIdInput = z.object({ message_id: uuid }).strict();
export const communicationStatusInput = z.object({ message_id: uuid.optional().describe('One message; omit for every message of this recovery run') }).strict();

// ── 출력 ──
export const vesselCallsOutput = z.object({ summary: fetchSummarySchema, items: z.array(vesselCallSchema) }).strict();
export const vesselCallDetailOutput = z.object({ vessel_call: vesselCallSchema, containers: z.array(manifestContainerSchema) }).strict();
export const manifestOutput = z.object({ summary: fetchSummarySchema, vessel_call: vesselCallSchema, containers: z.array(manifestContainerSchema) }).strict();

const factObservation = z
  .object({
    event_id: uuid,
    subject_type: z.string(),
    subject_id: uuid,
    fact_key: z.string(),
    value_text: z.string().nullable(),
    value_number: z.string().nullable().describe('Decimal as string'),
    value_unit: z.string().nullable(),
    source_type: z.string(),
    received_at: timestamp,
    is_simulated: z.boolean(),
  })
  .strict();

export const messageStatusSchema = z
  .object({
    message_id: uuid,
    thread_id: uuid,
    counterparty_name: z.string(),
    purpose: z.string(),
    status: z.string().describe('DRAFTED · PENDING_APPROVAL · APPROVED · QUEUED · SENT · REPLIED · ...'),
    drafted_by: z.string(),
    approval_ready: z.boolean(),
    blocked_reasons: z.array(z.string()),
    approval_state: z.string(),
    dispatch_state: z.string(),
    reply_count: z.number().int(),
    replies: z.array(
      z
        .object({ raw_input_id: uuid, status: z.string(), received_at: timestamp, has_extraction: z.boolean(), extraction_state: z.string().nullable().describe('WAITING · RETRYING · DONE · NO_CANDIDATE · SKIPPED · FAILED') })
        .strict(),
    ),
    is_simulated: z.boolean(),
  })
  .strict();

export const recoveryContextOutput = z
  .object({
    recovery_run: z
      .object({
        run_id: uuid,
        run_status: z.string(),
        trigger_type: z.string(),
        trigger_ref: z.string().nullable(),
        executed_at: timestamp,
        superseded_by_run_id: uuid.nullable(),
        total_cost_krw: z.string().nullable().describe('KRW integer as string'),
        cost_result_kind: z.enum(['SCENARIO_RESULT', 'ENGINE_RESULT', 'NONE']),
        unmet_constraints: z.array(z.unknown()),
        contains_simulated: z.boolean(),
        scenario_id: uuid.nullable(),
      })
      .strict(),
    snapshot: z.object({ snapshot_id: uuid, as_of: timestamp, plan_date: isoDate, rule_version: z.string(), policy_version: z.string() }).strict(),
    resources: z
      .object({
        facilities: z.array(z.object({ facility_id: uuid, facility_type: z.string(), facility_name: z.string() }).strict()),
        truck_pools: z.array(z.object({ truck_pool_id: uuid, pool_name: z.string(), ownership: z.string(), owner_counterparty_id: uuid.nullable() }).strict()),
      })
      .strict(),
    latest_observations: z.array(factObservation).describe('Latest observed claims per subject and fact — NOT reconciled current facts'),
    communications: z.array(messageStatusSchema),
    limitations: z.array(z.string()),
  })
  .strict();

const gapSchema = z
  .object({
    gap_id: z.string(),
    gap_kind: z.enum(['FACILITY_CAPACITY', 'TRUCK_AVAILABILITY']),
    subject_type: z.enum(['FACILITY', 'TRUCK_POOL']),
    subject_id: uuid,
    subject_name: z.string(),
    required_fact: z.string().describe('Fact key pattern that would close the gap'),
    state: z.enum(['MISSING', 'ASKED']),
    open_question_message_ids: z.array(uuid),
    public_data_can_resolve: z.boolean(),
    suggested_source: z.enum(['PARTNER_INQUIRY', 'HUMAN_VERIFICATION']),
    suggested_intent: z.enum(['TRUCK_SLOT', 'FACILITY_CAPACITY']),
    suggested_counterparty_role: z.enum(['TRUCKING', 'ODCY', 'WAREHOUSE']),
    owner_counterparty_id: uuid.nullable(),
    candidate_state: z
      .enum(['NONE', 'REPLY_RECEIVED', 'CANDIDATE_RECEIVED', 'NO_VALID_CANDIDATE'])
      .describe('Workflow only: whether an asked partner replied and the backend validated an extraction candidate. NOT a fact — the business gap (state) stays open until a confirmed fact exists (T-093)'),
    candidate_extraction_ids: z.array(uuid).describe('Validated (PASSED) extraction candidates still PENDING review — suggestions, not facts'),
  })
  .strict();

export const informationGapsOutput = z
  .object({
    recovery_run_id: uuid,
    plan_date: isoDate,
    rule_version: z.string(),
    gaps: z.array(gapSchema),
    known: z.array(z.object({ subject_type: z.string(), subject_id: uuid, required_fact: z.string(), evidence: factObservation }).strict()),
  })
  .strict();

export const counterpartiesOutput = z
  .object({
    evaluated_at: timestamp,
    counterparties: z.array(
      z
        .object({
          counterparty_id: uuid,
          display_name: z.string(),
          role: z.string(),
          contacts: z.array(
            z
              .object({
                contact_id: uuid,
                person_name: z.string().nullable(),
                addresses: z.array(
                  z.object({ address_id: uuid, channel_type: z.string(), eligible: z.boolean(), blocked_reasons: z.array(z.string()), is_simulated: z.boolean() }).strict(),
                ),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();

export const draftCreatedOutput = z
  .object({
    message: messageStatusSchema,
    number_check_passed: z.boolean(),
    next_step: z.enum(['REQUEST_APPROVAL', 'HUMAN_EDIT_REQUIRED']).describe('REQUEST_APPROVAL when request_approval can move it to the human approval queue'),
  })
  .strict();

export const communicationStatusOutput = z.object({ messages: z.array(messageStatusSchema) }).strict();

export const replyCandidatesOutput = z
  .object({
    message_id: uuid,
    status: z.string(),
    replies: z.array(
      z
        .object({
          inbound_message_id: uuid.nullable(),
          received_at: timestamp,
          extraction_state: z.string().nullable(),
          no_candidate_outcome: z.string().nullable(),
          candidates: z.array(
            z
              .object({
                extraction_id: uuid,
                field: z.string(),
                value: z.string().describe('Candidate value — a suggestion from the reply, not a fact'),
                unit: z.string().nullable(),
                validation: z.enum(['PASSED', 'REJECTED']),
                failed_reasons: z.array(z.string()),
                review_status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED']),
                generated_by: z.enum(['RECORDED_REPLAY', 'LLM']),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    note: z.literal('Candidates are suggestions validated by the backend. None is a fact until confirmed (T-093).'),
  })
  .strict();

export const approvalRequestedOutput = z
  .object({
    message: messageStatusSchema,
    approval_requested: z.boolean(),
    already_pending: z.boolean(),
    note: z.literal('A human must approve. This tool never approves or sends.'),
  })
  .strict();
