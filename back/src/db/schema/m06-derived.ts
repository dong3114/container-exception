import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  primaryKey,
  text,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { cera, ckCatalog, ckHash, ckIn, ckKrwInteger, ckRuleId, ckS2, ckScope, hash, n, tstz } from './_common.js';
import {
  CONFLICT_STATUS,
  DECISION_USABILITY,
  ENTITY_TYPE,
  EVIDENCE_STRENGTH,
  EVIDENCE_TIME_QUALITY,
  FRESHNESS_STATUS,
  HANDLING_TYPE,
  HOLD_STATUS,
  CONFIDENCE_LEVEL,
  VALUE_STATUS,
  VERIFICATION_BASIS,
} from './codes.js';
import { actor, scenario } from './m01-foundation.js';
import { questionItem } from './m04-communication.js';
import { event } from './m05-inbound-event.js';

/** M06 파생·사람 처리 — docs/24 22.26 ~ 22.29. 앞의 셋은 REBUILDABLE. */

export const canonicalFact = cera.table(
  'canonical_fact',
  {
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    factKey: varchar('fact_key', { length: 120 }).notNull(),
    applicabilityScopeType: text('applicability_scope_type').notNull().default('GLOBAL'),
    applicabilityScopeRef: varchar('applicability_scope_ref', { length: 60 }).notNull().default(''),
    factName: varchar('fact_name', { length: 60 }).notNull(),
    paramDate: date('param_date', { mode: 'string' }),
    paramSlotStart: tstz('param_slot_start'),
    paramSizeType: text('param_size_type'),
    valueText: text('value_text'),
    valueNumber: numeric('value_number', { precision: 18, scale: 4 }),
    valueTimestamp: tstz('value_timestamp'),
    valueCode: text('value_code'),
    valueUnit: text('value_unit'),
    validFrom: tstz('valid_from'),
    validUntil: tstz('valid_until'),
    winningEventId: uuid('winning_event_id').notNull(),
    appliedRule: text('applied_rule').notNull(),
    ruleVersion: varchar('rule_version', { length: 20 }).notNull(),
    valueStatus: text('value_status').notNull(),
    verificationBasis: text('verification_basis'),
    evidenceStrength: text('evidence_strength').notNull(),
    evidencePolicyVersion: varchar('evidence_policy_version', { length: 20 }).notNull(),
    evidenceTime: tstz('evidence_time'),
    evidenceTimeQuality: text('evidence_time_quality').notNull(),
    temporalConfidence: text('temporal_confidence').notNull(),
    freshnessStatus: text('freshness_status').notNull(),
    conflictStatus: text('conflict_status').notNull(),
    holdStatus: text('hold_status').notNull(),
    decisionUsability: text('decision_usability').notNull(),
    contributingEventCount: integer('contributing_event_count').notNull(),
    isSimulated: boolean('is_simulated').notNull(),
    scenarioId: uuid('scenario_id'),
    computedAsOf: tstz('computed_as_of').notNull(),
    computedAt: tstz('computed_at').notNull(),
  },
  (t) => [
    primaryKey({
      name: n('pk_canonical_fact'),
      columns: [t.entityType, t.entityId, t.factKey, t.applicabilityScopeType, t.applicabilityScopeRef, t.isSimulated],
    }),
    foreignKey({
      name: n('fk_canonical_fact__winning_event_id'),
      columns: [t.winningEventId],
      foreignColumns: [event.eventId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_canonical_fact__scenario_id'), columns: [t.scenarioId], foreignColumns: [scenario.scenarioId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    ckIn('canonical_fact', t.entityType, ENTITY_TYPE),
    ckCatalog('canonical_fact', t.applicabilityScopeType),
    ckCatalog('canonical_fact', t.paramSizeType),
    ckCatalog('canonical_fact', t.valueCode),
    ckCatalog('canonical_fact', t.valueUnit),
    ckRuleId('canonical_fact', t.appliedRule),
    ckIn('canonical_fact', t.valueStatus, VALUE_STATUS),
    ckIn('canonical_fact', t.verificationBasis, VERIFICATION_BASIS),
    ckIn('canonical_fact', t.evidenceStrength, EVIDENCE_STRENGTH),
    ckIn('canonical_fact', t.evidenceTimeQuality, EVIDENCE_TIME_QUALITY),
    ckIn('canonical_fact', t.temporalConfidence, CONFIDENCE_LEVEL),
    ckIn('canonical_fact', t.freshnessStatus, FRESHNESS_STATUS),
    ckIn('canonical_fact', t.conflictStatus, CONFLICT_STATUS),
    ckIn('canonical_fact', t.holdStatus, HOLD_STATUS),
    ckIn('canonical_fact', t.decisionUsability, DECISION_USABILITY),
    ckS2('canonical_fact', t.isSimulated, t.scenarioId),
    ckScope('canonical_fact', t.applicabilityScopeType, t.applicabilityScopeRef),
    check(
      n('ck_canonical_fact__confirmed_basis'),
      sql`(${t.valueStatus} = 'CONFIRMED') = (${t.verificationBasis} IS NOT NULL)`,
    ),
    check(n('ck_canonical_fact__contributing_event_count'), sql`${t.contributingEventCount} >= 1`),
    ckKrwInteger('canonical_fact', t.valueUnit, t.valueNumber),
    check(
      n('ck_canonical_fact__valid_range'),
      sql`${t.validFrom} IS NULL OR ${t.validUntil} IS NULL OR ${t.validFrom} < ${t.validUntil}`,
    ),
    index(n('ix_canonical_fact__fact_name__param_date')).on(t.factName, t.paramDate),
    index(n('ix_canonical_fact__winning_event_id')).on(t.winningEventId),
    index(n('ix_canonical_fact__not_usable'))
      .on(t.decisionUsability)
      .where(sql`${t.decisionUsability} <> 'USABLE'`),
  ],
);

export const conflict = cera.table(
  'conflict',
  {
    conflictId: uuid('conflict_id').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    factKey: varchar('fact_key', { length: 120 }).notNull(),
    applicabilityScopeType: text('applicability_scope_type').notNull(),
    applicabilityScopeRef: varchar('applicability_scope_ref', { length: 60 }).notNull().default(''),
    conflictType: text('conflict_type').notNull(),
    eventIds: uuid('event_ids').array().notNull(),
    severity: text('severity').notNull(),
    detectedRule: text('detected_rule').notNull(),
    ruleVersion: varchar('rule_version', { length: 20 }).notNull(),
    blocksAutomation: boolean('blocks_automation').notNull(),
    computedAsOf: tstz('computed_as_of').notNull(),
    isSimulated: boolean('is_simulated').notNull(),
    scenarioId: uuid('scenario_id'),
  },
  (t) => [
    primaryKey({ name: n('pk_conflict'), columns: [t.conflictId] }),
    foreignKey({ name: n('fk_conflict__scenario_id'), columns: [t.scenarioId], foreignColumns: [scenario.scenarioId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    ckIn('conflict', t.entityType, ENTITY_TYPE),
    ckCatalog('conflict', t.applicabilityScopeType),
    ckCatalog('conflict', t.conflictType),
    ckCatalog('conflict', t.severity),
    ckRuleId('conflict', t.detectedRule),
    ckS2('conflict', t.isSimulated, t.scenarioId),
    ckScope('conflict', t.applicabilityScopeType, t.applicabilityScopeRef),
    check(n('ck_conflict__event_ids_cardinality'), sql`cardinality(${t.eventIds}) >= 2`),
    index(n('ix_conflict__coordinate')).on(
      t.entityType,
      t.entityId,
      t.factKey,
      t.applicabilityScopeType,
      t.applicabilityScopeRef,
      t.isSimulated,
    ),
  ],
);

export const verificationRequest = cera.table(
  'verification_request',
  {
    verificationRequestId: uuid('verification_request_id').notNull(),
    requestKey: hash('request_key').notNull(),
    triggerRule: text('trigger_rule').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    factKey: varchar('fact_key', { length: 120 }).notNull(),
    applicabilityScopeType: text('applicability_scope_type').notNull(),
    applicabilityScopeRef: varchar('applicability_scope_ref', { length: 60 }).notNull().default(''),
    conflictId: uuid('conflict_id'),
    priority: text('priority').notNull(),
    blocksAutomation: boolean('blocks_automation').notNull(),
    computedAsOf: tstz('computed_as_of').notNull(),
    computedAt: tstz('computed_at').notNull(),
    currentStatus: text('current_status').notNull(),
    isSimulated: boolean('is_simulated').notNull(),
    scenarioId: uuid('scenario_id'),
  },
  (t) => [
    primaryKey({ name: n('pk_verification_request'), columns: [t.verificationRequestId] }),
    // docs/24 11.1 — 유일한 SET NULL(둘 다 재생성 대상, 화면용 참조)
    foreignKey({
      name: n('fk_verification_request__conflict_id'),
      columns: [t.conflictId],
      foreignColumns: [conflict.conflictId],
    })
      .onDelete('set null')
      .onUpdate('restrict'),
    foreignKey({
      name: n('fk_verification_request__scenario_id'),
      columns: [t.scenarioId],
      foreignColumns: [scenario.scenarioId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_verification_request__request_key')).on(t.requestKey),
    ckHash('verification_request', t.requestKey),
    ckCatalog('verification_request', t.triggerRule),
    ckIn('verification_request', t.entityType, ENTITY_TYPE),
    ckCatalog('verification_request', t.applicabilityScopeType),
    ckCatalog('verification_request', t.priority),
    ckCatalog('verification_request', t.currentStatus),
    ckS2('verification_request', t.isSimulated, t.scenarioId),
    ckScope('verification_request', t.applicabilityScopeType, t.applicabilityScopeRef),
    index(n('ix_verification_request__coordinate')).on(
      t.entityType,
      t.entityId,
      t.factKey,
      t.applicabilityScopeType,
      t.applicabilityScopeRef,
    ),
    index(n('ix_verification_request__current_status')).on(t.currentStatus),
  ],
);

export const verificationRequestHandling = cera.table(
  'verification_request_handling',
  {
    handlingId: uuid('handling_id').notNull(),
    requestKey: hash('request_key').notNull(),
    handlingType: text('handling_type').notNull(),
    actorId: uuid('actor_id').notNull(),
    handledAt: tstz('handled_at').notNull(),
    note: varchar('note', { length: 500 }),
    questionItemId: uuid('question_item_id'),
    resolvingEventId: uuid('resolving_event_id'),
    isSimulated: boolean('is_simulated').notNull(),
  },
  (t) => [
    primaryKey({ name: n('pk_verification_request_handling'), columns: [t.handlingId] }),
    foreignKey({ name: n('fk_verification_request_handling__actor_id'), columns: [t.actorId], foreignColumns: [actor.actorId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: n('fk_verification_request_handling__question_item_id'),
      columns: [t.questionItemId],
      foreignColumns: [questionItem.questionItemId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: n('fk_verification_request_handling__resolving_event_id'),
      columns: [t.resolvingEventId],
      foreignColumns: [event.eventId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    ckHash('verification_request_handling', t.requestKey),
    ckIn('verification_request_handling', t.handlingType, HANDLING_TYPE),
    index(n('ix_verification_request_handling__request_key__handled_at')).on(t.requestKey, t.handledAt),
  ],
);
