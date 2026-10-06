import { sql } from 'drizzle-orm';
import type { PgTableExtraConfigValue } from 'drizzle-orm/pg-core';
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  cera,
  ckCatalog,
  ckContentRef,
  ckHash,
  ckIn,
  ckJsonType,
  ckKrwInteger,
  ckS2,
  ckScope,
  contentRef,
  hash,
  n,
  tstz,
} from './_common.js';
import {
  CONFIDENCE_LEVEL,
  ENTITY_TYPE,
  EVENT_CLASS,
  EXTRACTION_METHOD,
  FACT_KIND,
  INPUT_QUALITY,
  LINK_ROLE,
  REVIEW_STATUS,
  SOURCE_TYPE,
  TARGET_ROLE,
  VERIFICATION_ACTION,
  VERIFICATION_METHOD,
} from './codes.js';
import { actor, scenario } from './m01-foundation.js';
import { counterparty } from './m02-registry.js';
import { commMessage } from './m04-communication.js';

/**
 * M05 수신·사건 — docs/24 22.21 ~ 22.25.
 * 순환 ②: extraction.created_event_id ↔ event.extraction_id — FK 는 CREATE TABLE 뒤 ALTER 로 붙는다.
 */

export const rawInput = cera.table(
  'raw_input',
  {
    rawInputId: uuid('raw_input_id').notNull(),
    sourceType: text('source_type').notNull(),
    sourceName: varchar('source_name', { length: 60 }).notNull(),
    requestRef: varchar('request_ref', { length: 300 }),
    payloadRef: contentRef('payload_ref'),
    payloadHash: hash('payload_hash').notNull(),
    attachmentManifest: jsonb('attachment_manifest').$type<unknown[]>(),
    sourceRecordKey: varchar('source_record_key', { length: 200 }),
    sourceRecordedAt: tstz('source_recorded_at'),
    receivedAt: tstz('received_at').notNull(),
    collectedByActorId: uuid('collected_by_actor_id'),
    isSimulated: boolean('is_simulated').notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_raw_input'), columns: [t.rawInputId] }),
    foreignKey({
      name: n('fk_raw_input__collected_by_actor_id'),
      columns: [t.collectedByActorId],
      foreignColumns: [actor.actorId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_raw_input__source_name__source_record_key')).on(t.sourceName, t.sourceRecordKey),
    unique(n('uq_raw_input__raw_input_id__is_simulated')).on(t.rawInputId, t.isSimulated),
    ckIn('raw_input', t.sourceType, SOURCE_TYPE),
    ckContentRef('raw_input', t.payloadRef, 'RAW_INPUT_PAYLOAD'),
    ckHash('raw_input', t.payloadHash),
    check(
      n('ck_raw_input__email_recorded_before_received'),
      sql`${t.sourceType} <> 'EMAIL' OR ${t.sourceRecordedAt} IS NULL OR ${t.sourceRecordedAt} <= ${t.receivedAt}`,
    ),
    ckJsonType('raw_input', t.attachmentManifest, 'array'),
    index(n('ix_raw_input__received_at')).on(t.receivedAt),
  ],
);

export const extraction = cera.table(
  'extraction',
  {
    extractionId: uuid('extraction_id').notNull(),
    messageId: uuid('message_id'),
    rawInputId: uuid('raw_input_id').notNull(),
    askId: varchar('ask_id', { length: 40 }),
    candidateValueText: text('candidate_value_text').notNull(),
    candidateUnit: text('candidate_unit'),
    sourceQuoteRef: contentRef('source_quote_ref').notNull(),
    sourceQuoteHash: hash('source_quote_hash').notNull(),
    quoteLocation: varchar('quote_location', { length: 100 }),
    modelVersion: varchar('model_version', { length: 60 }).notNull(),
    promptVersion: varchar('prompt_version', { length: 20 }).notNull(),
    modelConfidence: numeric('model_confidence', { precision: 5, scale: 4 }),
    reviewStatus: text('review_status').notNull().default('PENDING'),
    reviewedByActorId: uuid('reviewed_by_actor_id'),
    reviewedAt: tstz('reviewed_at'),
    createdEventId: uuid('created_event_id'),
    isSimulated: boolean('is_simulated').notNull(),
    schemaVersion: varchar('schema_version', { length: 20 }).notNull(),
    inputHash: hash('input_hash').notNull(),
    validatorResult: jsonb('validator_result').$type<unknown[]>().notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_extraction'), columns: [t.extractionId] }),
    foreignKey({ name: n('fk_extraction__message_id'), columns: [t.messageId], foreignColumns: [commMessage.messageId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: n('fk_extraction__raw_input_id__is_simulated'),
      columns: [t.rawInputId, t.isSimulated],
      foreignColumns: [rawInput.rawInputId, rawInput.isSimulated],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: n('fk_extraction__reviewed_by_actor_id'),
      columns: [t.reviewedByActorId],
      foreignColumns: [actor.actorId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    // 순환 ② — event 가 아래에서 정의된다.
    foreignKey({ name: n('fk_extraction__created_event_id'), columns: [t.createdEventId], foreignColumns: [event.eventId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    ckCatalog('extraction', t.candidateUnit),
    ckContentRef('extraction', t.sourceQuoteRef, 'EXTRACTION_SOURCE_QUOTE'),
    ckHash('extraction', t.sourceQuoteHash),
    ckIn('extraction', t.reviewStatus, REVIEW_STATUS),
    ckHash('extraction', t.inputHash),
    check(
      n('ck_extraction__accepted_has_event'),
      sql`(${t.reviewStatus} = 'ACCEPTED') = (${t.createdEventId} IS NOT NULL)`,
    ),
    check(
      n('ck_extraction__reviewed_at'),
      sql`${t.reviewStatus} NOT IN ('ACCEPTED', 'REJECTED') OR ${t.reviewedAt} IS NOT NULL`,
    ),
    check(
      n('ck_extraction__pending_unreviewed'),
      sql`${t.reviewStatus} <> 'PENDING' OR (${t.reviewedByActorId} IS NULL AND ${t.reviewedAt} IS NULL AND ${t.createdEventId} IS NULL)`,
    ),
    check(n('ck_extraction__model_confidence'), sql`${t.modelConfidence} BETWEEN 0 AND 1`),
    ckJsonType('extraction', t.validatorResult, 'array'),
    index(n('ix_extraction__raw_input_id')).on(t.rawInputId),
    index(n('ix_extraction__message_id')).on(t.messageId),
    index(n('ix_extraction__pending')).on(t.reviewStatus).where(sql`${t.reviewStatus} = 'PENDING'`),
  ],
);

export const event = cera.table(
  'event',
  {
    eventId: uuid('event_id').notNull(),
    schemaVersion: varchar('schema_version', { length: 20 }).notNull(),
    rawInputId: uuid('raw_input_id').notNull(),
    eventClass: text('event_class').notNull(),
    eventType: text('event_type').notNull(),
    factKind: text('fact_kind'),
    factKey: varchar('fact_key', { length: 120 }),
    valueText: text('value_text'),
    valueNumber: numeric('value_number', { precision: 18, scale: 4 }),
    valueTimestamp: tstz('value_timestamp'),
    valueCode: text('value_code'),
    valueUnit: text('value_unit'),
    validFrom: tstz('valid_from'),
    validUntil: tstz('valid_until'),
    applicabilityScopeType: text('applicability_scope_type').notNull().default('GLOBAL'),
    applicabilityScopeRef: varchar('applicability_scope_ref', { length: 60 }).notNull().default(''),
    sourceEventTime: tstz('source_event_time'),
    sourceRecordedAt: tstz('source_recorded_at'),
    receivedAt: tstz('received_at').notNull(),
    sourceType: text('source_type').notNull(),
    sourceRoleAtIngestion: text('source_role_at_ingestion'),
    sourceId: varchar('source_id', { length: 60 }),
    extractionMethod: text('extraction_method').notNull(),
    inputQuality: text('input_quality').notNull(),
    inputConfidenceLevel: text('input_confidence_level').notNull(),
    inputConfidenceReasons: jsonb('input_confidence_reasons').$type<unknown[]>(),
    assertedByCounterpartyId: uuid('asserted_by_counterparty_id'),
    enteredByActorId: uuid('entered_by_actor_id'),
    supersedesEventId: uuid('supersedes_event_id'),
    supersedeReason: varchar('supersede_reason', { length: 200 }),
    verificationAction: text('verification_action'),
    verificationMethod: text('verification_method'),
    extractionId: uuid('extraction_id'),
    correlationId: varchar('correlation_id', { length: 60 }),
    idempotencyKey: hash('idempotency_key').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    recordedAt: tstz('recorded_at').notNull(),
    isSimulated: boolean('is_simulated').notNull(),
    scenarioId: uuid('scenario_id'),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_event'), columns: [t.eventId] }),
    foreignKey({
      name: n('fk_event__raw_input_id__is_simulated'),
      columns: [t.rawInputId, t.isSimulated],
      foreignColumns: [rawInput.rawInputId, rawInput.isSimulated],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: n('fk_event__asserted_by_counterparty_id'),
      columns: [t.assertedByCounterpartyId],
      foreignColumns: [counterparty.counterpartyId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_event__entered_by_actor_id'), columns: [t.enteredByActorId], foreignColumns: [actor.actorId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_event__supersedes_event_id'), columns: [t.supersedesEventId], foreignColumns: [t.eventId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_event__extraction_id'), columns: [t.extractionId], foreignColumns: [extraction.extractionId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_event__scenario_id'), columns: [t.scenarioId], foreignColumns: [scenario.scenarioId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_event__idempotency_key')).on(t.idempotencyKey),
    check(n('ck_event__schema_version'), sql`${t.schemaVersion} ~ '^ev-[1-9][0-9]*$'`),
    ckIn('event', t.eventClass, EVENT_CLASS),
    ckCatalog('event', t.eventType),
    ckIn('event', t.factKind, FACT_KIND),
    ckCatalog('event', t.valueCode),
    ckCatalog('event', t.valueUnit),
    ckCatalog('event', t.applicabilityScopeType),
    ckIn('event', t.sourceType, SOURCE_TYPE),
    ckCatalog('event', t.sourceRoleAtIngestion),
    ckIn('event', t.extractionMethod, EXTRACTION_METHOD),
    ckIn('event', t.inputQuality, INPUT_QUALITY),
    ckIn('event', t.inputConfidenceLevel, CONFIDENCE_LEVEL),
    ckIn('event', t.verificationAction, VERIFICATION_ACTION),
    ckIn('event', t.verificationMethod, VERIFICATION_METHOD),
    ckHash('event', t.idempotencyKey),
    ckS2('event', t.isSimulated, t.scenarioId),
    // docs/22 11.2 규칙 5 — event_class 별 필수 조합(대상 0건/1건 이상은 M09 지연 트리거)
    check(
      n('ck_event__class_observation'),
      sql`${t.eventClass} <> 'OBSERVATION' OR (${t.factKind} IS NOT NULL AND ${t.factKey} IS NOT NULL AND num_nonnulls(${t.valueText}, ${t.valueNumber}, ${t.valueTimestamp}, ${t.valueCode}) >= 1 AND ${t.supersedesEventId} IS NULL AND ${t.verificationAction} IS NULL AND ${t.verificationMethod} IS NULL)`,
    ),
    check(
      n('ck_event__class_correction'),
      sql`${t.eventClass} <> 'CORRECTION' OR (${t.factKind} IS NOT NULL AND ${t.factKey} IS NOT NULL AND ${t.supersedesEventId} IS NOT NULL AND ${t.verificationAction} IS NULL AND ${t.verificationMethod} IS NULL)`,
    ),
    check(
      n('ck_event__class_verification'),
      sql`${t.eventClass} <> 'VERIFICATION' OR (${t.factKind} IS NULL AND ${t.factKey} IS NULL AND num_nonnulls(${t.valueText}, ${t.valueNumber}, ${t.valueTimestamp}, ${t.valueCode}) = 0 AND ${t.supersedesEventId} IS NULL AND ${t.verificationAction} IS NOT NULL AND ${t.verificationMethod} IS NOT NULL)`,
    ),
    check(
      n('ck_event__llm_extraction_pair'),
      sql`(${t.extractionMethod} = 'LLM_EXTRACTED') = (${t.extractionId} IS NOT NULL)`,
    ),
    check(n('ck_event__supersedes_not_self'), sql`${t.supersedesEventId} <> ${t.eventId}`),
    ckScope('event', t.applicabilityScopeType, t.applicabilityScopeRef),
    check(
      n('ck_event__valid_range'),
      sql`${t.validFrom} IS NULL OR ${t.validUntil} IS NULL OR ${t.validFrom} < ${t.validUntil}`,
    ),
    ckKrwInteger('event', t.valueUnit, t.valueNumber),
    ckJsonType('event', t.payload, 'object'),
    ckJsonType('event', t.inputConfidenceReasons, 'array'),
    index(n('ix_event__raw_input_id')).on(t.rawInputId),
    index(n('ix_event__fact_key__scope')).on(t.factKey, t.applicabilityScopeType, t.applicabilityScopeRef),
    index(n('ix_event__supersedes_event_id'))
      .on(t.supersedesEventId)
      .where(sql`${t.supersedesEventId} IS NOT NULL`),
    index(n('ix_event__extraction_id')).on(t.extractionId).where(sql`${t.extractionId} IS NOT NULL`),
    index(n('ix_event__correlation_id')).on(t.correlationId).where(sql`${t.correlationId} IS NOT NULL`),
    index(n('ix_event__received_at')).on(t.receivedAt),
  ],
);

export const eventEntityLink = cera.table(
  'event_entity_link',
  {
    eventId: uuid('event_id').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    linkRole: text('link_role').notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_event_entity_link'), columns: [t.eventId, t.entityType, t.entityId] }),
    foreignKey({ name: n('fk_event_entity_link__event_id'), columns: [t.eventId], foreignColumns: [event.eventId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    ckIn('event_entity_link', t.entityType, ENTITY_TYPE),
    ckIn('event_entity_link', t.linkRole, LINK_ROLE),
    // U-1 사건마다 SUBJECT 최대 1건(I-8 "최소 1"은 M09 지연 트리거)
    uniqueIndex(n('uq_event_entity_link__event_id__subject'))
      .on(t.eventId)
      .where(sql`${t.linkRole} = 'SUBJECT'`),
    index(n('ix_event_entity_link__subject_entity'))
      .on(t.entityType, t.entityId, t.eventId)
      .where(sql`${t.linkRole} = 'SUBJECT'`),
  ],
);

export const eventVerificationTarget = cera.table(
  'event_verification_target',
  {
    verificationEventId: uuid('verification_event_id').notNull(),
    targetEventId: uuid('target_event_id').notNull(),
    targetRole: text('target_role').notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({
      name: n('pk_event_verification_target'),
      columns: [t.verificationEventId, t.targetEventId, t.targetRole],
    }),
    foreignKey({
      name: n('fk_event_verification_target__verification_event_id'),
      columns: [t.verificationEventId],
      foreignColumns: [event.eventId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: n('fk_event_verification_target__target_event_id'),
      columns: [t.targetEventId],
      foreignColumns: [event.eventId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_event_verification_target__verification__target')).on(t.verificationEventId, t.targetEventId),
    ckIn('event_verification_target', t.targetRole, TARGET_ROLE),
    index(n('ix_event_verification_target__target_event_id')).on(t.targetEventId),
  ],
);
