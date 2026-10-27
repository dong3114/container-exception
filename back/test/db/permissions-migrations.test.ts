import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrate.js';
import { appPool, expectSqlState, ownerPool, TEST_OWNER_DATABASE_URL } from './support.js';

/** Phase B — 역할 분리(C층) · migration 이력 · 반복 적용 안전성(docs/24 12.2 · 20절). */
let app: pg.Pool;
let owner: pg.Pool;

beforeAll(() => {
  app = appPool();
  owner = ownerPool();
});

afterAll(async () => {
  await app.end();
  await owner.end();
});

describe('migration history (fresh M01 → M25)', () => {
  const files = readdirSync('drizzle/migrations').filter((f) => f.endsWith('.sql')).sort();

  it('twenty-five reviewed migrations M01..M25 are committed in order', () => {
    expect(files).toEqual([
      '0000_m01_foundation.sql',
      '0001_m02_registry.sql',
      '0002_m03_planning.sql',
      '0003_m04_communication.sql',
      '0004_m05_inbound_event.sql',
      '0005_m06_derived.sql',
      '0006_m07_append_only_guards.sql',
      '0007_m08_communication_guards.sql',
      '0008_m09_event_guards.sql',
      '0009_m10_permissions.sql',
      '0010_m11_registry_guards.sql',
      '0011_m12_approval_guards.sql',
      '0012_m13_message_lifecycle_guards.sql',
      '0013_m14_public_data.sql',
      '0014_m15_public_data_guards.sql',
      '0015_m16_agent_runs.sql',
      '0016_m17_agent_guards.sql',
      '0017_m18_agent_runtime.sql',
      '0018_m19_agent_runtime_guards.sql',
      '0019_m20_fact_guards.sql',
      '0020_m21_withdrawal_guard.sql',
      '0021_m22_recovery_plan.sql',
      '0022_m23_recovery_plan_guards.sql',
      '0023_m24_auth.sql',
      '0024_m25_auth_guards.sql',
    ]);
  });

  it('history has exactly one row per migration with the file hash, even after repeated apply', async () => {
    await applyMigrations(TEST_OWNER_DATABASE_URL); // 세 번째 적용 — 아무것도 바뀌지 않아야 한다
    const { rows } = await owner.query<{ hash: string }>('SELECT hash FROM cera_meta.drizzle_migrations ORDER BY id');
    const expected = files.map((f) => createHash('sha256').update(readFileSync(`drizzle/migrations/${f}`, 'utf8')).digest('hex'));
    expect(rows.map((r) => r.hash)).toEqual(expected);
  });

  it('owner owns every product object; 32 functions (31 trigger + plan-run lock); no function calls now()', async () => {
    const tables = await owner.query<{ owner: string }>("SELECT tableowner AS owner FROM pg_tables WHERE schemaname = 'cera'");
    expect(new Set(tables.rows.map((r) => r.owner))).toEqual(new Set(['cera_owner']));
    const fns = await owner.query<{ src: string }>(
      "SELECT prosrc AS src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'cera'",
    );
    expect(fns.rowCount).toBe(32);
    expect(fns.rows.filter((r) => /\bnow\s*\(|current_timestamp|clock_timestamp/i.test(r.src))).toEqual([]);
  });
});

describe('runtime role cera_app (C layer)', () => {
  it('cannot run DDL, drop, truncate, disable triggers or read the migration history', async () => {
    await expectSqlState(app.query('CREATE TABLE cera.sneaky (id int)'), '42501');
    await expectSqlState(app.query('ALTER TABLE cera.event ADD COLUMN sneaky int'), '42501');
    await expectSqlState(app.query('DROP TABLE cera.audit_log'), '42501');
    await expectSqlState(app.query('TRUNCATE cera.canonical_fact'), '42501');
    await expectSqlState(app.query('ALTER TABLE cera.send_attempt DISABLE TRIGGER ALL'), '42501');
    await expectSqlState(app.query('DROP TRIGGER tg_event__append_only ON cera.event'), '42501');
    await expectSqlState(app.query('SELECT * FROM cera_meta.drizzle_migrations'), '42501');
    await expectSqlState(app.query('CREATE SCHEMA sneaky'), '42501');
  });

  it('has table-level privileges by group (append-only: no UPDATE/DELETE; masters: no DELETE; rebuildable: DELETE)', async () => {
    const { rows } = await owner.query<{ table: string; privs: string }>(`
      SELECT table_name AS table, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
        FROM information_schema.role_table_grants
       WHERE grantee = 'cera_app' AND table_schema = 'cera'
       GROUP BY table_name`);
    const privs = Object.fromEntries(rows.map((r) => [r.table, r.privs]));
    expect(Object.keys(privs)).toHaveLength(44);
    expect(privs.user_account).toBe('INSERT,SELECT,UPDATE');
    expect(privs.user_session).toBe('INSERT,SELECT,UPDATE');
    expect(privs.recovery_plan).toBe('INSERT,SELECT,UPDATE');
    expect(privs.recovery_plan_item).toBe('INSERT,SELECT');
    expect(privs.agent_tool_call).toBe('INSERT,SELECT,UPDATE');
    expect(privs.agent_step).toBe('INSERT,SELECT');
    expect(privs.agent_checkpoint).toBe('INSERT,SELECT');
    expect(privs.agent_checkpoint_write).toBe('INSERT,SELECT,UPDATE');
    expect(privs.public_data_fetch).toBe('INSERT,SELECT');
    expect(privs.container).toBe('INSERT,SELECT,UPDATE');
    expect(privs.event).toBe('INSERT,SELECT');
    expect(privs.audit_log).toBe('INSERT,SELECT');
    expect(privs.send_attempt).toBe('INSERT,SELECT,UPDATE');
    expect(privs.counterparty).toBe('INSERT,SELECT,UPDATE');
    expect(privs.canonical_fact).toBe('DELETE,INSERT,SELECT,UPDATE');
    expect(Object.values(privs).some((p) => /TRUNCATE|TRIGGER|REFERENCES/.test(p))).toBe(false);
  });

  it('role attributes: not superuser, no createdb/createrole/bypassrls, not a member of cera_owner', async () => {
    const { rows } = await owner.query<{ super: boolean; createdb: boolean; createrole: boolean; bypass: boolean; member: boolean }>(`
      SELECT rolsuper AS super, rolcreatedb AS createdb, rolcreaterole AS createrole, rolbypassrls AS bypass,
             pg_has_role('cera_app', 'cera_owner', 'MEMBER') AS member
        FROM pg_roles WHERE rolname = 'cera_app'`);
    expect(rows[0]).toEqual({ super: false, createdb: false, createrole: false, bypass: false, member: false });
  });
});
