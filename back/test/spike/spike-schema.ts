/**
 * U0 검증 전용 스키마(docs/24 18절 `[TO VERIFY]`). **제품 스키마가 아니다** — 스키마 이름 `cera_spike_kit`,
 * migration 은 gitignore 된 `.spike/` 에만 생기고 시험이 끝나면 스키마를 지운다.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  numeric,
  pgSchema,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const spike = pgSchema('cera_spike_kit');

export const spikeParent = spike.table(
  'spike_parent',
  {
    id: uuid('id').primaryKey(),
    channel: text('channel').notNull(),
  },
  (t) => [unique('uq_spike_parent__id_channel').on(t.id, t.channel)],
);

export const spikeChild = spike.table(
  'spike_child',
  {
    id: uuid('id').primaryKey(),
    parentId: uuid('parent_id').notNull(),
    channel: text('channel').notNull(),
    role: text('role').notNull(),
    result: text('result'),
    amountKrw: bigint('amount_krw', { mode: 'bigint' }),
    valueNumber: numeric('value_number', { precision: 18, scale: 4 }),
    at: timestamp('at', { withTimezone: true, precision: 3, mode: 'string' }).notNull(),
    eventIds: uuid('event_ids').array(),
  },
  (t) => [
    // 복합 FK → 비 PK 유일 제약(docs/24 11.2 방식)
    foreignKey({
      name: 'fk_spike_child__parent_channel',
      columns: [t.parentId, t.channel],
      foreignColumns: [spikeParent.id, spikeParent.channel],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    check('ck_spike_child__role', sql`${t.role} IN ('SUBJECT', 'CONTEXT')`),
    check('ck_spike_child__amount_nonneg', sql`${t.amountKrw} IS NULL OR ${t.amountKrw} >= 0`),
    // partial unique index(docs/24 13절 U-1 · U-6 방식)
    uniqueIndex('uq_spike_child__one_subject').on(t.parentId).where(sql`${t.role} = 'SUBJECT'`),
    uniqueIndex('uq_spike_child__one_open').on(t.parentId).where(sql`${t.result} IS NULL OR ${t.result} = 'UNKNOWN'`),
  ],
);
