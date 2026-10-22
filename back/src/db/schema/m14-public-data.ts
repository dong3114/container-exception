import { sql } from 'drizzle-orm';
import type { PgColumn, PgTableExtraConfigValue } from 'drizzle-orm/pg-core';
import { boolean, check, foreignKey, index, integer, jsonb, primaryKey, text, unique, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { cera, ckIn, ckJsonType, n, tstz } from './_common.js';
import {
  BL_TYPE,
  CONTAINER_BL_ROLE,
  CONTAINER_SIZE_TYPE,
  EXTERNAL_ID_OWNER_TYPE,
  EXTERNAL_ID_TYPE,
  ISSUING_SYSTEM,
  PUBLIC_DATA_DATASET,
  PUBLIC_DATA_MODE,
  PUBLIC_DATA_OUTCOME,
  PUBLIC_DATA_PROVIDER,
} from './codes.js';
import { actor } from './m01-foundation.js';
import { counterparty } from './m02-registry.js';
import { event, rawInput } from './m05-inbound-event.js';

/**
 * M14 공공데이터(T-102) — docs/24 22.30 ~ 22.35 · docs/22 rev.2.6.
 * 개체 표(vessel_call · bl · container · container_bl · external_identifier)는 **식별 정보만** 둔다 — 도착 시각 · 선석 · 규격 같은
 * 사실은 `event`(PUBLIC_API)에 있다(안티패턴 1). 각 개체는 처음 알게 된 원문(`first_raw_input_id`)을 가리킨다.
 * `public_data_fetch` 는 호출 원장이다: 무엇을 언제 어떤 조건으로 물었고 무엇이 왔는가(실패 포함). 인증키는 어디에도 두지 않는다.
 * 트리거 · 권한은 M15(custom).
 */

/** 원문 참조는 (id, is_simulated) 복합 FK — 시뮬레이션 원문을 실제 기록이 가리키지 못하게(docs/24 20절 S-1). */
const rawInputFk = (table: string, column: string, id: PgColumn, simulated: PgColumn) =>
  foreignKey({
    name: n(`fk_${table}__${column}__is_simulated`),
    columns: [id, simulated],
    foreignColumns: [rawInput.rawInputId, rawInput.isSimulated],
  })
    .onDelete('restrict')
    .onUpdate('restrict');

export const vesselCall = cera.table(
  'vessel_call',
  {
    vesselCallId: uuid('vessel_call_id').notNull(),
    portAuthorityCode: varchar('port_authority_code', { length: 3 }).notNull(),
    callYear: integer('call_year').notNull(),
    callSeq: integer('call_seq').notNull(),
    callSign: varchar('call_sign', { length: 10 }).notNull(),
    vesselName: varchar('vessel_name', { length: 40 }),
    firstRawInputId: uuid('first_raw_input_id').notNull(),
    isSimulated: boolean('is_simulated').notNull(),
    registeredAt: tstz('registered_at').notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_vessel_call'), columns: [t.vesselCallId] }),
    rawInputFk('vessel_call', 'first_raw_input_id', t.firstRawInputId, t.isSimulated),
    unique(n('uq_vessel_call__port_year_seq_call_sign')).on(t.portAuthorityCode, t.callYear, t.callSeq, t.callSign),
    check(n('ck_vessel_call__port_authority_code'), sql`${t.portAuthorityCode} ~ '^[0-9]{3}$'`),
    check(n('ck_vessel_call__call_year'), sql`${t.callYear} BETWEEN 1990 AND 2999`),
    check(n('ck_vessel_call__call_seq'), sql`${t.callSeq} BETWEEN 0 AND 999`),
    check(n('ck_vessel_call__call_sign'), sql`${t.callSign} ~ '^[A-Z0-9]{1,10}$'`),
  ],
);

export const bl = cera.table(
  'bl',
  {
    blId: uuid('bl_id').notNull(),
    blNo: varchar('bl_no', { length: 40 }).notNull(),
    blType: text('bl_type').notNull(),
    parentBlId: uuid('parent_bl_id'),
    blYear: integer('bl_year'),
    carrierCounterpartyId: uuid('carrier_counterparty_id'),
    firstRawInputId: uuid('first_raw_input_id').notNull(),
    isSimulated: boolean('is_simulated').notNull(),
    registeredAt: tstz('registered_at').notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_bl'), columns: [t.blId] }),
    foreignKey({ name: n('fk_bl__parent_bl_id'), columns: [t.parentBlId], foreignColumns: [t.blId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_bl__carrier_counterparty_id'), columns: [t.carrierCounterpartyId], foreignColumns: [counterparty.counterpartyId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    rawInputFk('bl', 'first_raw_input_id', t.firstRawInputId, t.isSimulated),
    // 같은 종류 · 번호 · 연도 = 한 행(연도를 모르면 NULL 끼리도 같다). L-16 의 물리 잠정안 — docs/22 rev.2.6 8.2
    unique(n('uq_bl__bl_type__bl_no__bl_year')).on(t.blType, t.blNo, t.blYear).nullsNotDistinct(),
    ckIn('bl', t.blType, BL_TYPE),
    check(n('ck_bl__parent_only_for_house'), sql`${t.blType} = 'HOUSE' OR ${t.parentBlId} IS NULL`),
    check(n('ck_bl__parent_not_self'), sql`${t.parentBlId} <> ${t.blId}`),
    check(n('ck_bl__bl_no'), sql`${t.blNo} ~ '^[A-Z0-9-]{1,40}$'`),
  ],
);

export const container = cera.table(
  'container',
  {
    containerId: uuid('container_id').notNull(),
    containerNo: varchar('container_no', { length: 11 }).notNull(),
    sizeType: text('size_type'),
    vesselCallId: uuid('vessel_call_id'),
    firstRawInputId: uuid('first_raw_input_id').notNull(),
    isSimulated: boolean('is_simulated').notNull(),
    registeredAt: tstz('registered_at').notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_container'), columns: [t.containerId] }),
    foreignKey({ name: n('fk_container__vessel_call_id'), columns: [t.vesselCallId], foreignColumns: [vesselCall.vesselCallId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    rawInputFk('container', 'first_raw_input_id', t.firstRawInputId, t.isSimulated),
    unique(n('uq_container__container_no')).on(t.containerNo),
    // ISO 6346 모양(소유자 3 + 범주 1 + 일련 6 + 체크 1). 체크 숫자 불일치는 거부하지 않고 사건 신뢰도에 남긴다
    check(n('ck_container__container_no'), sql`${t.containerNo} ~ '^[A-Z]{3}[UJZ][0-9]{7}$'`),
    ckIn('container', t.sizeType, CONTAINER_SIZE_TYPE),
    index(n('ix_container__vessel_call_id')).on(t.vesselCallId).where(sql`${t.vesselCallId} IS NOT NULL`),
  ],
);

export const containerBl = cera.table(
  'container_bl',
  {
    containerId: uuid('container_id').notNull(),
    blId: uuid('bl_id').notNull(),
    linkRole: text('link_role').notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_container_bl'), columns: [t.containerId, t.blId] }),
    foreignKey({ name: n('fk_container_bl__container_id'), columns: [t.containerId], foreignColumns: [container.containerId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_container_bl__bl_id'), columns: [t.blId], foreignColumns: [bl.blId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    ckIn('container_bl', t.linkRole, CONTAINER_BL_ROLE),
    // MVP: 컨테이너당 PRIMARY 는 1건까지(docs/22 8.3)
    uniqueIndex(n('uq_container_bl__container_id__primary'))
      .on(t.containerId)
      .where(sql`${t.linkRole} = 'PRIMARY'`),
    index(n('ix_container_bl__bl_id')).on(t.blId),
  ],
);

export const externalIdentifier = cera.table(
  'external_identifier',
  {
    externalIdentifierId: uuid('external_identifier_id').notNull(),
    ownerType: text('owner_type').notNull(),
    ownerId: uuid('owner_id').notNull(),
    issuingSystem: text('issuing_system').notNull(),
    idType: text('id_type').notNull(),
    idValue: varchar('id_value', { length: 40 }).notNull(),
    sourceEventId: uuid('source_event_id'),
    sourceRawInputId: uuid('source_raw_input_id').notNull(),
    isSimulated: boolean('is_simulated').notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_external_identifier'), columns: [t.externalIdentifierId] }),
    foreignKey({ name: n('fk_external_identifier__source_event_id'), columns: [t.sourceEventId], foreignColumns: [event.eventId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    rawInputFk('external_identifier', 'source_raw_input_id', t.sourceRawInputId, t.isSimulated),
    unique(n('uq_external_identifier__system_type_value')).on(t.issuingSystem, t.idType, t.idValue),
    ckIn('external_identifier', t.ownerType, EXTERNAL_ID_OWNER_TYPE),
    ckIn('external_identifier', t.issuingSystem, ISSUING_SYSTEM),
    ckIn('external_identifier', t.idType, EXTERNAL_ID_TYPE),
    index(n('ix_external_identifier__owner')).on(t.ownerType, t.ownerId),
  ],
);

export const publicDataFetch = cera.table(
  'public_data_fetch',
  {
    fetchId: uuid('fetch_id').notNull(),
    provider: text('provider').notNull(),
    dataset: text('dataset').notNull(),
    operation: varchar('operation', { length: 100 }).notNull(),
    requestParams: jsonb('request_params').$type<Record<string, string>>().notNull(),
    pageNo: integer('page_no').notNull(),
    mode: text('mode').notNull(),
    requestedAt: tstz('requested_at').notNull(),
    receivedAt: tstz('received_at'),
    httpStatus: integer('http_status'),
    resultCode: varchar('result_code', { length: 20 }),
    outcome: text('outcome').notNull(),
    totalCount: integer('total_count'),
    itemCount: integer('item_count'),
    rawInputId: uuid('raw_input_id'),
    requestedByActorId: uuid('requested_by_actor_id').notNull(),
    traceId: varchar('trace_id', { length: 64 }),
    isSimulated: boolean('is_simulated').notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: n('pk_public_data_fetch'), columns: [t.fetchId] }),
    rawInputFk('public_data_fetch', 'raw_input_id', t.rawInputId, t.isSimulated),
    foreignKey({ name: n('fk_public_data_fetch__requested_by_actor_id'), columns: [t.requestedByActorId], foreignColumns: [actor.actorId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_public_data_fetch__raw_input_id')).on(t.rawInputId),
    ckIn('public_data_fetch', t.provider, PUBLIC_DATA_PROVIDER),
    ckIn('public_data_fetch', t.dataset, PUBLIC_DATA_DATASET),
    ckIn('public_data_fetch', t.mode, PUBLIC_DATA_MODE),
    ckIn('public_data_fetch', t.outcome, PUBLIC_DATA_OUTCOME),
    ckJsonType('public_data_fetch', t.requestParams, 'object'),
    // 녹화 재생(마스킹 · 합성 fixture)은 시뮬레이션이다 — 실제 호출과 섞지 않는다(규칙 9)
    check(n('ck_public_data_fetch__replay_is_simulated'), sql`(${t.mode} = 'REPLAY') = ${t.isSimulated}`),
    // 응답 본문이 왔으면 원문이 있다. 전송 실패만 원문 · 수신 시각이 없다
    check(
      n('ck_public_data_fetch__transport_error_shape'),
      sql`(${t.outcome} = 'TRANSPORT_ERROR') = (${t.rawInputId} IS NULL AND ${t.receivedAt} IS NULL)`,
    ),
    check(n('ck_public_data_fetch__received_after_requested'), sql`${t.receivedAt} IS NULL OR ${t.receivedAt} >= ${t.requestedAt}`),
    check(n('ck_public_data_fetch__page_no'), sql`${t.pageNo} >= 1`),
    index(n('ix_public_data_fetch__requested_at')).on(t.requestedAt),
  ],
);
