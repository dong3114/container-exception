/**
 * docs/24 18절 `[TO VERIFY]` — Drizzle + node-postgres 실행 동작(앱 역할).
 * 소유 역할이 시험용 스키마 `cera_spike_rt` 를 만들고 끝나면 지운다.
 */
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { bigint, numeric, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type Database, createDatabase } from '../../src/db/database.js';
import { assertOutsideTransaction, ExternalCallInTransactionError, isInTransaction, TransactionRunner } from '../../src/db/transaction.js';
import { UuidV7Generator } from '../../src/shared/id/uuid.js';
import { Instant } from '../../src/shared/time/instant.js';
import { Krw } from '../../src/shared/money/krw.js';
import { appPool, ownerPool } from './support.js';

const rt = pgSchema('cera_spike_rt');
const item = rt.table('item', {
  id: uuid('id').primaryKey(),
  label: text('label').notNull(),
  amountKrw: bigint('amount_krw', { mode: 'bigint' }),
  valueNumber: numeric('value_number', { precision: 18, scale: 4 }),
  at: timestamp('at', { withTimezone: true, precision: 3, mode: 'string' }),
  ids: uuid('ids').array(),
});

const ids = new UuidV7Generator();

describe('Drizzle + node-postgres runtime behaviour', () => {
  let owner: pg.Pool;
  let pool: pg.Pool;
  let db: Database;
  let runner: TransactionRunner;

  beforeAll(async () => {
    owner = ownerPool();
    await owner.query(`
      DROP SCHEMA IF EXISTS cera_spike_rt CASCADE;
      CREATE SCHEMA cera_spike_rt;
      CREATE TABLE cera_spike_rt.item (
        id uuid PRIMARY KEY, label text NOT NULL, amount_krw bigint, value_number numeric(18,4),
        at timestamp(3) with time zone, ids uuid[]);
      GRANT USAGE ON SCHEMA cera_spike_rt TO cera_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON cera_spike_rt.item TO cera_app;`);
    pool = appPool();
    db = createDatabase(pool);
    runner = new TransactionRunner(db);
  });

  beforeEach(async () => {
    await db.delete(item);
  });

  afterAll(async () => {
    await pool.end();
    await owner.query('DROP SCHEMA IF EXISTS cera_spike_rt CASCADE');
    await owner.end();
  });

  it('session TimeZone is UTC on every pooled connection', async () => {
    const { rows } = await pool.query('SHOW TimeZone');
    expect(rows[0].TimeZone).toBe('UTC');
  });

  it('bigint mode "bigint" round-trips beyond 2^53 exactly', async () => {
    const big = 9_223_372_036_854_775_807n; // bigint max
    const id = ids.newId();
    await db.insert(item).values({ id, label: 'big', amountKrw: big });
    const [row] = await db.select().from(item).where(eq(item.id, id));
    expect(typeof row!.amountKrw).toBe('bigint');
    expect(row!.amountKrw).toBe(big);
    expect(Krw.fromDb(row!.amountKrw!).toApi()).toBe('9223372036854775807');
  });

  it('numeric comes back as a string with the column scale (no float)', async () => {
    const id = ids.newId();
    await db.insert(item).values({ id, label: 'num', valueNumber: '12.34' });
    const [row] = await db.select().from(item).where(eq(item.id, id));
    expect(row!.valueNumber).toBe('12.3400');
  });

  it('timestamptz(3) in string mode: returns the UTC wire string, keeps ms, rounds sub-ms', async () => {
    const id = ids.newId();
    await db.insert(item).values({ id, label: 'ts', at: '2026-09-22T18:04:14.246+09:00' });
    const [row] = await db.select().from(item).where(eq(item.id, id));
    expect(typeof row!.at).toBe('string');
    expect(row!.at).toBe('2026-09-22 09:04:14.246+00');
    expect(Instant.fromDb(row!.at!).toSeoulIso()).toBe('2026-09-22T18:04:14.246+09:00');

    const id2 = ids.newId();
    await db.insert(item).values({ id: id2, label: 'us', at: '2026-09-22T00:00:00.1236Z' });
    const [row2] = await db.select().from(item).where(eq(item.id, id2));
    expect(row2!.at).toBe('2026-09-22 00:00:00.124+00'); // PostgreSQL 은 자르지 않고 반올림한다
  });

  it('uuid and uuid[] map to lowercase strings / string[]', async () => {
    const id = ids.newId();
    const members = [ids.newId(), ids.newId()];
    await db.insert(item).values({ id, label: 'uuid', ids: members });
    const [row] = await db.select().from(item).where(eq(item.id, id));
    expect(row!.id).toBe(id);
    expect(row!.ids).toEqual(members);
  });

  it('sql`` template parameterises values (no injection) and raw SQL escape works', async () => {
    const nasty = "x'); DROP SCHEMA cera_spike_rt CASCADE; --";
    const result = await db.execute<{ v: string }>(sql`select ${nasty}::text as v`);
    expect(result.rows[0]!.v).toBe(nasty);
    const id = ids.newId();
    await db.execute(sql`insert into ${item} (id, label) values (${id}, ${nasty})`);
    const [row] = await db.select().from(item).where(eq(item.id, id));
    expect(row!.label).toBe(nasty);
  });

  it('INSERT … ON CONFLICT DO NOTHING RETURNING returns nothing on a duplicate', async () => {
    const id = ids.newId();
    const first = await db.insert(item).values({ id, label: 'a' }).onConflictDoNothing().returning({ id: item.id });
    const second = await db.insert(item).values({ id, label: 'b' }).onConflictDoNothing().returning({ id: item.id });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it('TransactionRunner commits, rolls back on error, and runs READ COMMITTED explicitly', async () => {
    const id = ids.newId();
    const level = await runner.run(async (tx) => {
      await tx.insert(item).values({ id, label: 'committed' });
      const r = await tx.execute<{ l: string }>(sql`select current_setting('transaction_isolation') as l`);
      return r.rows[0]!.l;
    });
    expect(level).toBe('read committed');

    const lost = ids.newId();
    await expect(
      runner.run(async (tx) => {
        await tx.insert(item).values({ id: lost, label: 'rolled back' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const rows = await db.select().from(item);
    expect(rows.map((r) => r.id)).toEqual([id]);
  });

  it('external I/O guard: assertOutsideTransaction throws inside run(), passes outside; nested run() is refused', async () => {
    expect(isInTransaction()).toBe(false);
    expect(() => assertOutsideTransaction('channel.send')).not.toThrow();
    await expect(
      runner.run(async () => {
        assertOutsideTransaction('channel.send');
      }),
    ).rejects.toBeInstanceOf(ExternalCallInTransactionError);
    await expect(runner.run(async () => runner.run(async () => 1))).rejects.toThrow(/Nested transactions/);
    expect(isInTransaction()).toBe(false);
  });

  it('SELECT … FOR UPDATE SKIP LOCKED via the query builder skips a row locked by another transaction', async () => {
    const id = ids.newId();
    await db.insert(item).values({ id, label: 'queued' });
    const second = createDatabase(pool);

    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const lockTaken = new Promise<void>((r) => (locked = r));

    const holder = db.transaction(async (tx) => {
      await tx.select().from(item).where(eq(item.id, id)).for('update');
      locked();
      await held;
    });
    await lockTaken;
    const seen = await second.transaction((tx) =>
      tx.select().from(item).where(eq(item.id, id)).for('update', { skipLocked: true }),
    );
    release();
    await holder;
    expect(seen).toHaveLength(0);
  });
});
