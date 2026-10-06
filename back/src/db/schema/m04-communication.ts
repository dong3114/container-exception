import { sql } from 'drizzle-orm';
import type { PgTableExtraConfigValue } from 'drizzle-orm/pg-core';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
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
  ckKrwInteger,
  ckS2,
  contentRef,
  hash,
  n,
  tstz,
} from './_common.js';
import {
  APPROVAL_DECISION,
  CHANNEL_TYPE,
  DRAFTED_BY,
  ENTITY_TYPE,
  EXPECTED_VALUE_TYPE,
  INVALIDATION_CAUSE,
  MESSAGE_DIRECTION,
  MESSAGE_KIND,
  MESSAGE_STATUS,
  QUESTION_STATUS,
  QUESTION_TYPE,
  SEND_RESULT,
  THREAD_PURPOSE,
  THREAD_STATUS,
} from './codes.js';
import { actor, scenario } from './m01-foundation.js';
import { contactChannelAddress, counterparty, counterpartyContact } from './m02-registry.js';
import { recoveryRun } from './m03-planning.js';

/**
 * M04 통신 — docs/24 22.12 ~ 22.20.
 * 순환 ①: comm_message.current_approval_id ↔ message_approval — drizzle-kit 은 FK 를 모든 CREATE TABLE 뒤의
 * ALTER TABLE 로 내보내므로 같은 migration 안에서 "NULL 먼저, FK 나중"이 된다(docs/24 19절).
 */

export const commThread = cera.table(
  'comm_thread',
  {
    threadId: uuid('thread_id').notNull(),
    channelType: text('channel_type').notNull(),
    externalThreadId: varchar('external_thread_id', { length: 200 }),
    counterpartyId: uuid('counterparty_id').notNull(),
    contactId: uuid('contact_id'),
    purpose: text('purpose').notNull(),
    relatedRunId: uuid('related_run_id'),
    threadStatus: text('thread_status').notNull(),
    openedAt: tstz('opened_at').notNull(),
    lastActivityAt: tstz('last_activity_at').notNull(),
    isSimulated: boolean('is_simulated').notNull(),
    scenarioId: uuid('scenario_id'),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_comm_thread'), columns: [t.threadId] }),
    foreignKey({
      name: n('fk_comm_thread__counterparty_id'),
      columns: [t.counterpartyId],
      foreignColumns: [counterparty.counterpartyId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: n('fk_comm_thread__contact_id__counterparty_id'),
      columns: [t.contactId, t.counterpartyId],
      foreignColumns: [counterpartyContact.contactId, counterpartyContact.counterpartyId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_comm_thread__related_run_id'), columns: [t.relatedRunId], foreignColumns: [recoveryRun.runId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_comm_thread__scenario_id'), columns: [t.scenarioId], foreignColumns: [scenario.scenarioId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_comm_thread__channel_type__external_thread_id')).on(t.channelType, t.externalThreadId),
    unique(n('uq_comm_thread__thread_id__channel_type__is_simulated')).on(t.threadId, t.channelType, t.isSimulated),
    ckIn('comm_thread', t.channelType, CHANNEL_TYPE),
    ckIn('comm_thread', t.purpose, THREAD_PURPOSE),
    ckIn('comm_thread', t.threadStatus, THREAD_STATUS),
    ckS2('comm_thread', t.isSimulated, t.scenarioId),
    check(n('ck_comm_thread__simulated_mock_only'), sql`NOT ${t.isSimulated} OR ${t.channelType} = 'MOCK'`),
    check(n('ck_comm_thread__last_activity_after_open'), sql`${t.lastActivityAt} >= ${t.openedAt}`),
    index(n('ix_comm_thread__counterparty_id')).on(t.counterpartyId),
    index(n('ix_comm_thread__related_run_id')).on(t.relatedRunId),
  ],
);

export const questionItem = cera.table(
  'question_item',
  {
    questionItemId: uuid('question_item_id').notNull(),
    threadId: uuid('thread_id').notNull(),
    askId: varchar('ask_id', { length: 40 }).notNull(),
    questionType: text('question_type').notNull(),
    questionText: text('question_text').notNull(),
    targetEntityType: text('target_entity_type'),
    targetEntityId: uuid('target_entity_id'),
    targetFactKey: varchar('target_fact_key', { length: 120 }),
    targetApplicabilityScopeType: text('target_applicability_scope_type'),
    targetApplicabilityScopeRef: varchar('target_applicability_scope_ref', { length: 60 }),
    expectedValueType: text('expected_value_type').notNull(),
    expectedUnit: text('expected_unit'),
    verificationRequestKey: hash('verification_request_key'),
    questionStatus: text('question_status').notNull(),
    isSimulated: boolean('is_simulated').notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_question_item'), columns: [t.questionItemId] }),
    foreignKey({ name: n('fk_question_item__thread_id'), columns: [t.threadId], foreignColumns: [commThread.threadId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_question_item__thread_id__ask_id')).on(t.threadId, t.askId),
    ckIn('question_item', t.questionType, QUESTION_TYPE),
    ckIn('question_item', t.targetEntityType, ENTITY_TYPE),
    ckCatalog('question_item', t.targetApplicabilityScopeType),
    ckIn('question_item', t.expectedValueType, EXPECTED_VALUE_TYPE),
    ckCatalog('question_item', t.expectedUnit),
    ckHash('question_item', t.verificationRequestKey),
    ckIn('question_item', t.questionStatus, QUESTION_STATUS),
    check(
      n('ck_question_item__target_all_or_none'),
      sql`num_nonnulls(${t.targetEntityType}, ${t.targetEntityId}, ${t.targetFactKey}, ${t.targetApplicabilityScopeType}, ${t.targetApplicabilityScopeRef}) IN (0, 5)`,
    ),
    check(
      n('ck_question_item__target_scope_global_empty'),
      sql`${t.targetApplicabilityScopeType} IS NULL OR (${t.targetApplicabilityScopeType} = 'GLOBAL') = (${t.targetApplicabilityScopeRef} = '')`,
    ),
    index(n('ix_question_item__verification_request_key'))
      .on(t.verificationRequestKey)
      .where(sql`${t.verificationRequestKey} IS NOT NULL`),
  ],
);

export const commMessage = cera.table(
  'comm_message',
  {
    messageId: uuid('message_id').notNull(),
    threadId: uuid('thread_id').notNull(),
    direction: text('direction').notNull(),
    messageKind: text('message_kind').notNull(),
    contactVerificationId: uuid('contact_verification_id'),
    channelType: text('channel_type').notNull(),
    externalMessageId: varchar('external_message_id', { length: 200 }),
    fromAddress: varchar('from_address', { length: 200 }),
    toAddressId: uuid('to_address_id'),
    messageContentRef: contentRef('message_content_ref'),
    contentHash: hash('content_hash').notNull(),
    currentStatus: text('current_status'),
    currentApprovalId: uuid('current_approval_id'),
    draftedBy: text('drafted_by'),
    createdAt: tstz('created_at').notNull(),
    sentAt: tstz('sent_at'),
    receivedAt: tstz('received_at'),
    isSimulated: boolean('is_simulated').notNull(),
    scenarioId: uuid('scenario_id'),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_comm_message'), columns: [t.messageId] }),
    foreignKey({
      name: n('fk_comm_message__thread_id__channel_type__is_simulated'),
      columns: [t.threadId, t.channelType, t.isSimulated],
      foreignColumns: [commThread.threadId, commThread.channelType, commThread.isSimulated],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: n('fk_comm_message__to_address_id__channel_type'),
      columns: [t.toAddressId, t.channelType],
      foreignColumns: [contactChannelAddress.addressId, contactChannelAddress.channelType],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    // 순환 ① — message_approval 이 아래에서 정의된다(콜백은 나중에 평가된다).
    foreignKey({
      name: n('fk_comm_message__current_approval_id__message_id'),
      columns: [t.currentApprovalId, t.messageId],
      foreignColumns: [messageApproval.approvalId, messageApproval.messageId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_comm_message__scenario_id'), columns: [t.scenarioId], foreignColumns: [scenario.scenarioId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_comm_message__channel_type__external_message_id')).on(t.channelType, t.externalMessageId),
    unique(n('uq_comm_message__message_id__is_simulated')).on(t.messageId, t.isSimulated),
    unique(n('uq_comm_message__message_id__to_address_id')).on(t.messageId, t.toAddressId),
    ckIn('comm_message', t.direction, MESSAGE_DIRECTION),
    ckIn('comm_message', t.messageKind, MESSAGE_KIND),
    ckIn('comm_message', t.channelType, CHANNEL_TYPE),
    ckContentRef('comm_message', t.messageContentRef, 'COMM_MESSAGE_CONTENT'),
    ckHash('comm_message', t.contentHash),
    ckIn('comm_message', t.currentStatus, MESSAGE_STATUS),
    ckIn('comm_message', t.draftedBy, DRAFTED_BY),
    ckS2('comm_message', t.isSimulated, t.scenarioId),
    check(
      n('ck_comm_message__cv_requires_verification'),
      sql`${t.messageKind} <> 'CONTACT_VERIFICATION' OR ${t.contactVerificationId} IS NOT NULL`,
    ),
    // P0 임시 — P1 migration 이 contact_verification FK 를 붙이고 지운다(docs/24 11.3).
    check(n('ck_comm_message__p0_no_contact_verification'), sql`${t.contactVerificationId} IS NULL`),
    check(
      n('ck_comm_message__outbound_recipient_content'),
      sql`${t.direction} <> 'OUTBOUND' OR (${t.toAddressId} IS NOT NULL AND ${t.messageContentRef} IS NOT NULL)`,
    ),
    check(n('ck_comm_message__inbound_received_at'), sql`${t.direction} <> 'INBOUND' OR ${t.receivedAt} IS NOT NULL`),
    // rev.2.5 — INBOUND 의 NULL 은 "상태 모름"이 아니라 "보내는 메시지 생애주기 미적용".
    check(n('ck_comm_message__outbound_drafted_by'), sql`(${t.direction} = 'OUTBOUND') = (${t.draftedBy} IS NOT NULL)`),
    check(
      n('ck_comm_message__outbound_current_status'),
      sql`(${t.direction} = 'OUTBOUND') = (${t.currentStatus} IS NOT NULL)`,
    ),
    index(n('ix_comm_message__queued')).on(t.createdAt).where(sql`${t.currentStatus} = 'QUEUED'`),
    index(n('ix_comm_message__thread_id__created_at')).on(t.threadId, t.createdAt),
    index(n('ix_comm_message__to_address_id')).on(t.toAddressId),
  ],
);

export const commMessageStructuredField = cera.table(
  'comm_message_structured_field',
  {
    messageId: uuid('message_id').notNull(),
    fieldKey: varchar('field_key', { length: 60 }).notNull(),
    valueText: text('value_text'),
    valueNumber: numeric('value_number', { precision: 18, scale: 4 }),
    unit: text('unit'),
    sourceRunId: uuid('source_run_id'),
    sourceQuestionItemId: uuid('source_question_item_id'),
    sourcePath: varchar('source_path', { length: 120 }),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_comm_message_structured_field'), columns: [t.messageId, t.fieldKey] }),
    foreignKey({
      name: n('fk_comm_message_structured_field__message_id'),
      columns: [t.messageId],
      foreignColumns: [commMessage.messageId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: n('fk_comm_message_structured_field__source_run_id'),
      columns: [t.sourceRunId],
      foreignColumns: [recoveryRun.runId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: n('fk_comm_message_structured_field__source_question_item_id'),
      columns: [t.sourceQuestionItemId],
      foreignColumns: [questionItem.questionItemId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    check(n('ck_comm_message_structured_field__field_key'), sql`${t.fieldKey} ~ '^[a-z][a-z0-9_]*$'`),
    ckCatalog('comm_message_structured_field', t.unit),
    check(n('ck_comm_message_structured_field__value_present'), sql`num_nonnulls(${t.valueText}, ${t.valueNumber}) >= 1`),
    ckKrwInteger('comm_message_structured_field', t.unit, t.valueNumber),
    index(n('ix_comm_message_structured_field__source_run_id')).on(t.sourceRunId),
    index(n('ix_comm_message_structured_field__source_question_item_id')).on(t.sourceQuestionItemId),
  ],
);

export const commMessageQuestion = cera.table(
  'comm_message_question',
  {
    messageId: uuid('message_id').notNull(),
    questionItemId: uuid('question_item_id').notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_comm_message_question'), columns: [t.messageId, t.questionItemId] }),
    foreignKey({ name: n('fk_comm_message_question__message_id'), columns: [t.messageId], foreignColumns: [commMessage.messageId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: n('fk_comm_message_question__question_item_id'),
      columns: [t.questionItemId],
      foreignColumns: [questionItem.questionItemId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index(n('ix_comm_message_question__question_item_id')).on(t.questionItemId),
  ],
);

export const messageApproval = cera.table(
  'message_approval',
  {
    approvalId: uuid('approval_id').notNull(),
    messageId: uuid('message_id').notNull(),
    decision: text('decision').notNull(),
    invalidatesApprovalId: uuid('invalidates_approval_id'),
    invalidationCause: text('invalidation_cause'),
    actorId: uuid('actor_id').notNull(),
    decidedAt: tstz('decided_at').notNull(),
    expiresAt: tstz('expires_at'),
    approvedContentRef: contentRef('approved_content_ref'),
    approvedPlanRunId: uuid('approved_plan_run_id'),
    approvedContentHash: hash('approved_content_hash'),
    approvedToAddressId: uuid('approved_to_address_id'),
    reason: varchar('reason', { length: 500 }),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_message_approval'), columns: [t.approvalId] }),
    foreignKey({ name: n('fk_message_approval__message_id'), columns: [t.messageId], foreignColumns: [commMessage.messageId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: n('fk_message_approval__invalidates_approval_id__message_id'),
      columns: [t.invalidatesApprovalId, t.messageId],
      foreignColumns: [t.approvalId, t.messageId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_message_approval__actor_id'), columns: [t.actorId], foreignColumns: [actor.actorId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: n('fk_message_approval__approved_plan_run_id'),
      columns: [t.approvedPlanRunId],
      foreignColumns: [recoveryRun.runId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: n('fk_message_approval__message_id__approved_to_address_id'),
      columns: [t.messageId, t.approvedToAddressId],
      foreignColumns: [commMessage.messageId, commMessage.toAddressId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_message_approval__invalidates_approval_id')).on(t.invalidatesApprovalId),
    unique(n('uq_message_approval__approval_id__message_id')).on(t.approvalId, t.messageId),
    ckIn('message_approval', t.decision, APPROVAL_DECISION),
    ckIn('message_approval', t.invalidationCause, INVALIDATION_CAUSE),
    ckContentRef('message_approval', t.approvedContentRef, 'MESSAGE_APPROVAL_CONTENT'),
    ckHash('message_approval', t.approvedContentHash),
    check(
      n('ck_message_approval__invalidates_pair'),
      sql`(${t.decision} IN ('REVOKED', 'INVALIDATED')) = (${t.invalidatesApprovalId} IS NOT NULL)`,
    ),
    check(
      n('ck_message_approval__cause_pair'),
      sql`(${t.decision} IN ('REVOKED', 'INVALIDATED')) = (${t.invalidationCause} IS NOT NULL)`,
    ),
    check(
      n('ck_message_approval__cause_by_decision'),
      sql`(${t.decision} <> 'REVOKED' OR ${t.invalidationCause} = 'USER_REVOKED') AND (${t.decision} <> 'INVALIDATED' OR ${t.invalidationCause} IN ('PLAN_SUPERSEDED', 'CONTENT_CHANGED'))`,
    ),
    check(
      n('ck_message_approval__approved_copy'),
      sql`${t.decision} <> 'APPROVED' OR (${t.approvedContentHash} IS NOT NULL AND ${t.approvedToAddressId} IS NOT NULL)`,
    ),
    check(
      n('ck_message_approval__reason_required'),
      sql`${t.decision} NOT IN ('REJECTED', 'REVISION_REQUESTED') OR ${t.reason} IS NOT NULL`,
    ),
    check(n('ck_message_approval__expires_after_decided'), sql`${t.expiresAt} IS NULL OR ${t.expiresAt} > ${t.decidedAt}`),
    index(n('ix_message_approval__message_id__decided_at')).on(t.messageId, t.decidedAt),
    index(n('ix_message_approval__approved')).on(t.messageId).where(sql`${t.decision} = 'APPROVED'`),
  ],
);

export const messageApprovalStructuredField = cera.table(
  'message_approval_structured_field',
  {
    approvalId: uuid('approval_id').notNull(),
    fieldKey: varchar('field_key', { length: 60 }).notNull(),
    approvedValueText: text('approved_value_text'),
    approvedValueNumber: numeric('approved_value_number', { precision: 18, scale: 4 }),
    approvedUnit: text('approved_unit'),
    approvedSourceRunId: uuid('approved_source_run_id'),
    approvedSourceQuestionItemId: uuid('approved_source_question_item_id'),
    approvedSourcePath: varchar('approved_source_path', { length: 120 }),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_message_approval_structured_field'), columns: [t.approvalId, t.fieldKey] }),
    foreignKey({
      name: n('fk_message_approval_structured_field__approval_id'),
      columns: [t.approvalId],
      foreignColumns: [messageApproval.approvalId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: n('fk_message_approval_structured_field__approved_source_run_id'),
      columns: [t.approvedSourceRunId],
      foreignColumns: [recoveryRun.runId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    // 이름 63자 제한 — 컬럼 부분을 줄였다(approved_source_question_item_id → approved_src_question).
    foreignKey({
      name: n('fk_message_approval_structured_field__approved_src_question'),
      columns: [t.approvedSourceQuestionItemId],
      foreignColumns: [questionItem.questionItemId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    ckCatalog('message_approval_structured_field', t.approvedUnit),
    check(
      n('ck_message_approval_structured_field__value_present'),
      sql`num_nonnulls(${t.approvedValueText}, ${t.approvedValueNumber}) >= 1`,
    ),
    ckKrwInteger('message_approval_structured_field', t.approvedUnit, t.approvedValueNumber),
  ],
);

export const sendAttempt = cera.table(
  'send_attempt',
  {
    sendAttemptId: uuid('send_attempt_id').notNull(),
    messageId: uuid('message_id').notNull(),
    approvalId: uuid('approval_id'),
    attemptNo: integer('attempt_no').notNull(),
    idempotencyKey: hash('idempotency_key').notNull(),
    channelConnectionId: uuid('channel_connection_id'),
    sentContentHash: hash('sent_content_hash').notNull(),
    startedAt: tstz('started_at').notNull(),
    finishedAt: tstz('finished_at'),
    result: text('result'),
    errorCode: text('error_code'),
    errorMessage: varchar('error_message', { length: 500 }),
    providerMessageId: varchar('provider_message_id', { length: 200 }),
    isSimulated: boolean('is_simulated').notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_send_attempt'), columns: [t.sendAttemptId] }),
    foreignKey({
      name: n('fk_send_attempt__message_id__is_simulated'),
      columns: [t.messageId, t.isSimulated],
      foreignColumns: [commMessage.messageId, commMessage.isSimulated],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: n('fk_send_attempt__approval_id__message_id'),
      columns: [t.approvalId, t.messageId],
      foreignColumns: [messageApproval.approvalId, messageApproval.messageId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_send_attempt__message_id__attempt_no')).on(t.messageId, t.attemptNo),
    unique(n('uq_send_attempt__idempotency_key')).on(t.idempotencyKey),
    unique(n('uq_send_attempt__send_attempt_id__message_id')).on(t.sendAttemptId, t.messageId),
    // U-6 메시지당 성공 1건 · U-7 메시지당 미확정 1건(docs/24 13절)
    uniqueIndex(n('uq_send_attempt__message_id__success')).on(t.messageId).where(sql`${t.result} = 'SUCCESS'`),
    uniqueIndex(n('uq_send_attempt__message_id__unresolved'))
      .on(t.messageId)
      .where(sql`${t.result} IS NULL OR ${t.result} = 'UNKNOWN'`),
    ckHash('send_attempt', t.idempotencyKey),
    ckHash('send_attempt', t.sentContentHash),
    ckIn('send_attempt', t.result, SEND_RESULT),
    ckCatalog('send_attempt', t.errorCode),
    check(n('ck_send_attempt__attempt_no'), sql`${t.attemptNo} >= 1`),
    check(n('ck_send_attempt__result_finished_pair'), sql`(${t.result} IS NULL) = (${t.finishedAt} IS NULL)`),
    check(n('ck_send_attempt__success_no_error'), sql`${t.result} <> 'SUCCESS' OR ${t.errorCode} IS NULL`),
    check(n('ck_send_attempt__success_provider_id'), sql`${t.result} <> 'SUCCESS' OR ${t.providerMessageId} IS NOT NULL`),
    check(n('ck_send_attempt__finished_after_started'), sql`${t.finishedAt} IS NULL OR ${t.finishedAt} >= ${t.startedAt}`),
    // P0 임시 — P1 migration 이 channel_connection FK 를 붙이고 지운다(docs/24 11.3).
    check(n('ck_send_attempt__p0_no_channel_connection'), sql`${t.channelConnectionId} IS NULL`),
    index(n('ix_send_attempt__pending')).on(t.startedAt).where(sql`${t.result} IS NULL`),
    index(n('ix_send_attempt__provider_message_id'))
      .on(t.providerMessageId)
      .where(sql`${t.providerMessageId} IS NOT NULL`),
    index(n('ix_send_attempt__message_id')).on(t.messageId),
  ],
);

export const messageStatusTransition = cera.table(
  'message_status_transition',
  {
    transitionId: uuid('transition_id').notNull(),
    messageId: uuid('message_id').notNull(),
    status: text('status').notNull(),
    occurredAt: tstz('occurred_at').notNull(),
    actorId: uuid('actor_id'),
    sendAttemptId: uuid('send_attempt_id'),
    note: varchar('note', { length: 300 }),
    isSimulated: boolean('is_simulated').notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_message_status_transition'), columns: [t.transitionId] }),
    foreignKey({
      name: n('fk_message_status_transition__message_id__is_simulated'),
      columns: [t.messageId, t.isSimulated],
      foreignColumns: [commMessage.messageId, commMessage.isSimulated],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_message_status_transition__actor_id'), columns: [t.actorId], foreignColumns: [actor.actorId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: n('fk_message_status_transition__send_attempt_id__message_id'),
      columns: [t.sendAttemptId, t.messageId],
      foreignColumns: [sendAttempt.sendAttemptId, sendAttempt.messageId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    ckIn('message_status_transition', t.status, MESSAGE_STATUS),
    index(n('ix_message_status_transition__message_id__occurred_at')).on(t.messageId, t.occurredAt),
  ],
);
