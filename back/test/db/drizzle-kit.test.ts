/**
 * docs/24 18절 `[TO VERIFY]` — drizzle-kit 생성 SQL 과 custom migration(트리거) 적용 흐름.
 * 시험용 스키마 `cera_spike_kit` · `cera_spike_meta` 만 쓰고 끝나면 지운다. 제품 migration 을 만들지 않는다.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appPool, expectSqlState, ownerPool } from './support.js';

const OUT = '.spike/migrations';
const CONFIG = 'test/spike/drizzle.spike.config.ts';
const P1 = '00000000-0000-7000-8000-000000000001';

function drizzleKit(args: string[]): string {
  const bin = join('node_modules', 'drizzle-kit', 'bin.cjs');
  return execFileSync(process.execPath, [bin, ...args], { encoding: 'utf8', stdio: 'pipe' });
}

describe('drizzle-kit: generated SQL review + custom trigger migration', () => {
  let owner: pg.Pool;
  let app: pg.Pool;
  let initSql = '';

  beforeAll(async () => {
    owner = ownerPool();
    app = appPool();
    await owner.query('DROP SCHEMA IF EXISTS cera_spike_kit CASCADE; DROP SCHEMA IF EXISTS cera_spike_meta CASCADE');
    rmSync('.spike', { recursive: true, force: true });

    drizzleKit(['generate', '--config', CONFIG, '--name', 'spike_init']);
    drizzleKit(['generate', '--config', CONFIG, '--custom', '--name', 'spike_trigger']);
    const files = readdirSync(OUT).filter((f) => f.endsWith('.sql')).sort();
    initSql = readFileSync(join(OUT, files[0]!), 'utf8');
    // custom migration: 사람이 쓴 트리거 SQL(docs/24 12.3 fn_cera_reject_mutation 방식)
    writeFileSync(
      join(OUT, files[1]!),
      [
        `CREATE FUNCTION cera_spike_kit.fn_reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$`,
        `BEGIN RAISE EXCEPTION 'append-only: % on %', TG_OP, TG_TABLE_NAME USING ERRCODE = 'P0001'; END $$;`,
        `--> statement-breakpoint`,
        `CREATE TRIGGER tg_spike_parent__append_only BEFORE UPDATE OR DELETE ON cera_spike_kit.spike_parent`,
        `  FOR EACH ROW EXECUTE FUNCTION cera_spike_kit.fn_reject_mutation();`,
        `--> statement-breakpoint`,
        `GRANT USAGE ON SCHEMA cera_spike_kit TO cera_app;`,
        `--> statement-breakpoint`,
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA cera_spike_kit TO cera_app;`,
      ].join('\n'),
    );
  });

  afterAll(async () => {
    await owner.query('DROP SCHEMA IF EXISTS cera_spike_kit CASCADE; DROP SCHEMA IF EXISTS cera_spike_meta CASCADE');
    await Promise.all([owner.end(), app.end()]);
    rmSync('.spike', { recursive: true, force: true });
  });

  it('generates reviewable SQL: CHECK, partial unique index, composite FK to a non-PK unique, uuid[], bigint, timestamptz(3), numeric', () => {
    expect(initSql).toContain('CONSTRAINT "ck_spike_child__role" CHECK');
    expect(initSql).toMatch(/CREATE UNIQUE INDEX "uq_spike_child__one_subject" .* WHERE .*"role" = 'SUBJECT'/);
    expect(initSql).toMatch(/CREATE UNIQUE INDEX "uq_spike_child__one_open" .* WHERE .*"result" IS NULL OR .*"result" = 'UNKNOWN'/);
    expect(initSql).toMatch(/FOREIGN KEY \("parent_id","channel"\) REFERENCES "cera_spike_kit"\."spike_parent"\("id","channel"\) ON DELETE restrict ON UPDATE restrict/);
    expect(initSql).toContain('CONSTRAINT "uq_spike_parent__id_channel" UNIQUE("id","channel")');
    expect(initSql).toContain('"event_ids" uuid[]');
    expect(initSql).toContain('"amount_krw" bigint');
    expect(initSql).toContain('"at" timestamp(3) with time zone NOT NULL');
    expect(initSql).toContain('"value_number" numeric(18, 4)');
  });

  it('applies generated + custom migrations with the owner role (explicit migrate, no push)', async () => {
    await migrate(drizzle({ client: owner }), {
      migrationsFolder: OUT,
      migrationsSchema: 'cera_spike_meta',
      migrationsTable: 'drizzle_migrations',
    });
    const { rows } = await owner.query('SELECT count(*)::int AS n FROM cera_spike_meta.drizzle_migrations');
    expect(rows[0].n).toBe(2);
  });

  it('enforces the partial unique index and CHECK at runtime', async () => {
    await app.query(`INSERT INTO cera_spike_kit.spike_parent VALUES ($1, 'MOCK')`, [P1]);
    const child = (id: string, role: string, result: string | null) =>
      app.query(
        `INSERT INTO cera_spike_kit.spike_child (id, parent_id, channel, role, result, at) VALUES ($1, $2, 'MOCK', $3, $4, now())`,
        [id, P1, role, result],
      );
    await child('00000000-0000-7000-8000-00000000000a', 'SUBJECT', 'SUCCESS');
    await expectSqlState(child('00000000-0000-7000-8000-00000000000b', 'SUBJECT', 'SUCCESS'), '23505');
    await child('00000000-0000-7000-8000-00000000000c', 'CONTEXT', null);
    await expectSqlState(child('00000000-0000-7000-8000-00000000000d', 'CONTEXT', 'UNKNOWN'), '23505');
    await expectSqlState(child('00000000-0000-7000-8000-00000000000e', 'OTHER', 'SUCCESS'), '23514');
    // 복합 FK: 부모와 다른 채널은 거부
    await expectSqlState(
      app.query(
        `INSERT INTO cera_spike_kit.spike_child (id, parent_id, channel, role, result, at) VALUES ('00000000-0000-7000-8000-00000000000f', $1, 'GMAIL', 'CONTEXT', 'FAILED', now())`,
        [P1],
      ),
      '23503',
    );
  });

  it('runs the custom-migration trigger: UPDATE/DELETE on an append-only table are rejected even for the app role', async () => {
    await expectSqlState(app.query(`UPDATE cera_spike_kit.spike_parent SET channel = 'X' WHERE id = $1`, [P1]), 'P0001');
    await expectSqlState(app.query(`DELETE FROM cera_spike_kit.spike_parent WHERE id = $1`, [P1]), 'P0001');
  });

  it('app role cannot disable triggers, run DDL or TRUNCATE (owner ≠ app — docs/24 12.2)', async () => {
    await expectSqlState(app.query('ALTER TABLE cera_spike_kit.spike_parent DISABLE TRIGGER ALL'), '42501');
    await expectSqlState(app.query('CREATE TABLE cera_spike_kit.sneaky (id int)'), '42501');
    await expectSqlState(app.query('CREATE TABLE public.sneaky (id int)'), '42501');
    await expectSqlState(app.query('TRUNCATE cera_spike_kit.spike_child'), '42501');
  });

  it('product drizzle.config.ts loads and has no push script', () => {
    // drizzle-kit 은 처음 실행할 때 빈 journal 을 만든다 — 제품 migration 은 U1 몫이라 시험이 만든 것은 지운다
    const hadMigrations = existsSync('drizzle');
    try {
      const out = drizzleKit(['check', '--config', 'drizzle.config.ts']);
      expect(out).toContain('drizzle.config.ts');
    } finally {
      if (!hadMigrations) rmSync('drizzle', { recursive: true, force: true });
    }
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(Object.values(pkg.scripts).some((s) => /drizzle-kit\s+push/.test(s))).toBe(false);
  });
});
