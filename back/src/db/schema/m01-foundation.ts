import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, integer, primaryKey, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { cera, ckCatalog, ckIn, ckS2, n, tstz } from './_common.js';
import { ACTOR_TYPE, AUDIT_RESULT, ERROR_BOUNDARY } from './codes.js';

/** M01 기반·운영 기록 — docs/24 22.1 ~ 22.4. 스키마 `cera` 도 여기서 내보내 M01 이 `CREATE SCHEMA` 를 포함한다. */
export { cera } from './_common.js';

export const scenario = cera.table(
  'scenario',
  {
    scenarioId: uuid('scenario_id').notNull(),
    scenarioName: varchar('scenario_name', { length: 100 }).notNull(),
    description: varchar('description', { length: 300 }),
    dataPackRef: varchar('data_pack_ref', { length: 300 }),
    asOfBase: tstz('as_of_base').notNull(),
    createdAt: tstz('created_at').notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [primaryKey({ name: n('pk_scenario'), columns: [t.scenarioId] })],
);

export const actor = cera.table(
  'actor',
  {
    actorId: uuid('actor_id').notNull(),
    actorType: text('actor_type').notNull(),
    displayName: varchar('display_name', { length: 60 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [primaryKey({ name: n('pk_actor'), columns: [t.actorId] }), ckIn('actor', t.actorType, ACTOR_TYPE)],
);

export const auditLog = cera.table(
  'audit_log',
  {
    auditId: uuid('audit_id').notNull(),
    occurredAt: tstz('occurred_at').notNull(),
    actorId: uuid('actor_id').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: varchar('target_id', { length: 40 }).notNull(),
    beforeRef: varchar('before_ref', { length: 300 }),
    afterRef: varchar('after_ref', { length: 300 }),
    requestContext: varchar('request_context', { length: 300 }),
    result: text('result').notNull(),
    isSimulated: boolean('is_simulated').notNull(),
  },
  (t) => [
    primaryKey({ name: n('pk_audit_log'), columns: [t.auditId] }),
    foreignKey({ name: n('fk_audit_log__actor_id'), columns: [t.actorId], foreignColumns: [actor.actorId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    ckCatalog('audit_log', t.action),
    ckCatalog('audit_log', t.targetType),
    ckIn('audit_log', t.result, AUDIT_RESULT),
    index(n('ix_audit_log__content_purged'))
      .on(t.targetType, t.targetId)
      .where(sql`${t.action} = 'CONTENT_PURGED' AND ${t.result} = 'SUCCESS'`),
    index(n('ix_audit_log__target_type__target_id__occurred_at')).on(t.targetType, t.targetId, t.occurredAt),
    index(n('ix_audit_log__occurred_at')).on(t.occurredAt),
  ],
);

export const systemError = cera.table(
  'system_error',
  {
    errorId: uuid('error_id').notNull(),
    occurredAt: tstz('occurred_at').notNull(),
    serviceName: varchar('service_name', { length: 60 }).notNull(),
    componentName: varchar('component_name', { length: 100 }).notNull(),
    operationName: varchar('operation_name', { length: 100 }).notNull(),
    errorBoundary: text('error_boundary').notNull(),
    errorCategory: text('error_category').notNull(),
    errorCode: varchar('error_code', { length: 60 }).notNull(),
    safeErrorMessage: varchar('safe_error_message', { length: 500 }).notNull(),
    exceptionType: varchar('exception_type', { length: 200 }),
    requestId: varchar('request_id', { length: 64 }),
    traceId: varchar('trace_id', { length: 64 }),
    targetSystem: text('target_system'),
    httpStatus: integer('http_status'),
    retryable: boolean('retryable').notNull(),
    relatedEntityType: text('related_entity_type'),
    relatedEntityId: varchar('related_entity_id', { length: 40 }),
    rawLogRef: varchar('raw_log_ref', { length: 300 }),
    isSimulated: boolean('is_simulated').notNull(),
    scenarioId: uuid('scenario_id'),
  },
  (t) => [
    primaryKey({ name: n('pk_system_error'), columns: [t.errorId] }),
    foreignKey({ name: n('fk_system_error__scenario_id'), columns: [t.scenarioId], foreignColumns: [scenario.scenarioId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    ckIn('system_error', t.errorBoundary, ERROR_BOUNDARY),
    ckCatalog('system_error', t.errorCategory),
    ckCatalog('system_error', t.targetSystem),
    ckCatalog('system_error', t.relatedEntityType),
    ckS2('system_error', t.isSimulated, t.scenarioId),
    check(n('ck_system_error__related_entity_pair'), sql`(${t.relatedEntityType} IS NULL) = (${t.relatedEntityId} IS NULL)`),
    check(n('ck_system_error__http_status'), sql`${t.httpStatus} BETWEEN 100 AND 599`),
    index(n('ix_system_error__trace_id')).on(t.traceId).where(sql`${t.traceId} IS NOT NULL`),
    index(n('ix_system_error__occurred_at')).on(t.occurredAt),
    index(n('ix_system_error__error_code__occurred_at')).on(t.errorCode, t.occurredAt),
    index(n('ix_system_error__related_entity')).on(t.relatedEntityType, t.relatedEntityId),
  ],
);
