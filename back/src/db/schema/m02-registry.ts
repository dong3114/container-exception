import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, primaryKey, text, time, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { cera, ckIn, n, tstz } from './_common.js';
import {
  CHANNEL_TYPE,
  COMMUNICATION_STATUS,
  COUNTERPARTY_ROLE,
  EMAIL_VERIFICATION_STATUS,
  FACILITY_TYPE,
  POOL_OWNERSHIP,
  RELATIONSHIP_STATUS,
} from './codes.js';
import { actor } from './m01-foundation.js';

/** M02 등록부 — docs/24 22.5 ~ 22.9. 마스터는 지우지 않는다(비활성화). */

export const counterparty = cera.table(
  'counterparty',
  {
    counterpartyId: uuid('counterparty_id').notNull(),
    displayName: varchar('display_name', { length: 100 }).notNull(),
    sourceRole: text('source_role').notNull(),
    orgCode: varchar('org_code', { length: 30 }),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [
    primaryKey({ name: n('pk_counterparty'), columns: [t.counterpartyId] }),
    ckIn('counterparty', t.sourceRole, COUNTERPARTY_ROLE),
  ],
);

export const counterpartyContact = cera.table(
  'counterparty_contact',
  {
    contactId: uuid('contact_id').notNull(),
    counterpartyId: uuid('counterparty_id').notNull(),
    personName: varchar('person_name', { length: 60 }).notNull(),
    team: varchar('team', { length: 60 }),
    note: varchar('note', { length: 200 }),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [
    primaryKey({ name: n('pk_counterparty_contact'), columns: [t.contactId] }),
    foreignKey({
      name: n('fk_counterparty_contact__counterparty_id'),
      columns: [t.counterpartyId],
      foreignColumns: [counterparty.counterpartyId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_counterparty_contact__contact_id__counterparty_id')).on(t.contactId, t.counterpartyId),
    index(n('ix_counterparty_contact__counterparty_id')).on(t.counterpartyId),
  ],
);

export const contactChannelAddress = cera.table(
  'contact_channel_address',
  {
    addressId: uuid('address_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    channelType: text('channel_type').notNull(),
    normalizedAddress: varchar('normalized_address', { length: 200 }).notNull(),
    emailVerificationStatus: text('email_verification_status').notNull(),
    relationshipStatus: text('relationship_status').notNull(),
    communicationStatus: text('communication_status').notNull(),
    verifiedAt: tstz('verified_at'),
    approvedByActorId: uuid('approved_by_actor_id'),
    approvedAt: tstz('approved_at'),
  },
  (t) => [
    primaryKey({ name: n('pk_contact_channel_address'), columns: [t.addressId] }),
    foreignKey({
      name: n('fk_contact_channel_address__contact_id'),
      columns: [t.contactId],
      foreignColumns: [counterpartyContact.contactId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: n('fk_contact_channel_address__approved_by_actor_id'),
      columns: [t.approvedByActorId],
      foreignColumns: [actor.actorId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    ckIn('contact_channel_address', t.channelType, CHANNEL_TYPE),
    ckIn('contact_channel_address', t.emailVerificationStatus, EMAIL_VERIFICATION_STATUS),
    ckIn('contact_channel_address', t.relationshipStatus, RELATIONSHIP_STATUS),
    ckIn('contact_channel_address', t.communicationStatus, COMMUNICATION_STATUS),
    unique(n('uq_contact_channel_address__channel_type__normalized_address')).on(t.channelType, t.normalizedAddress),
    unique(n('uq_contact_channel_address__address_id__channel_type')).on(t.addressId, t.channelType),
    check(
      n('ck_contact_channel_address__normalized'),
      sql`${t.normalizedAddress} = lower(btrim(${t.normalizedAddress}))`,
    ),
    check(
      n('ck_contact_channel_address__verified_at'),
      sql`${t.emailVerificationStatus} <> 'VERIFIED' OR ${t.verifiedAt} IS NOT NULL`,
    ),
    check(
      n('ck_contact_channel_address__approved_by'),
      sql`${t.relationshipStatus} <> 'APPROVED' OR (${t.approvedByActorId} IS NOT NULL AND ${t.approvedAt} IS NOT NULL)`,
    ),
    index(n('ix_contact_channel_address__contact_id')).on(t.contactId),
  ],
);

export const facility = cera.table(
  'facility',
  {
    facilityId: uuid('facility_id').notNull(),
    facilityType: text('facility_type').notNull(),
    facilityName: varchar('facility_name', { length: 100 }).notNull(),
    area: varchar('area', { length: 100 }),
    defaultOpenTime: time('default_open_time', { precision: 0 }),
    defaultCloseTime: time('default_close_time', { precision: 0 }),
    isActive: boolean('is_active').notNull().default(true),
    /** 이 시설을 운영하는 거래처(M32 · 운영 준비). 수용량 문의 · 반입 요청의 받는 사람은 이 거래처의 연락처뿐 — 없으면 추측하지 않는다 */
    operatorCounterpartyId: uuid('operator_counterparty_id'),
  },
  (t) => [
    primaryKey({ name: n('pk_facility'), columns: [t.facilityId] }),
    foreignKey({ name: n('fk_facility__operator_counterparty_id'), columns: [t.operatorCounterpartyId], foreignColumns: [counterparty.counterpartyId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    ckIn('facility', t.facilityType, FACILITY_TYPE),
  ],
);

export const truckPool = cera.table(
  'truck_pool',
  {
    truckPoolId: uuid('truck_pool_id').notNull(),
    poolName: varchar('pool_name', { length: 100 }).notNull(),
    ownership: text('ownership').notNull(),
    ownerCounterpartyId: uuid('owner_counterparty_id'),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [
    primaryKey({ name: n('pk_truck_pool'), columns: [t.truckPoolId] }),
    foreignKey({
      name: n('fk_truck_pool__owner_counterparty_id'),
      columns: [t.ownerCounterpartyId],
      foreignColumns: [counterparty.counterpartyId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    ckIn('truck_pool', t.ownership, POOL_OWNERSHIP),
    index(n('ix_truck_pool__owner_counterparty_id')).on(t.ownerCounterpartyId),
  ],
);
