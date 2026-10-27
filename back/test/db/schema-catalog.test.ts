import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closedValues, normalizeDbDefault, normalizeSpecType, readPhysicalSpec, type SpecColumn } from './physical-spec.js';
import { ownerPool } from './support.js';

/**
 * Phase A 커버리지 — 빈 DB 에 M01 → M23 을 적용한 결과(global-setup)를 PostgreSQL 카탈로그로 읽어
 * docs/24 22절 명세와 컬럼 하나씩 대조한다(이름 · 순서 · 타입 · NULL · 기본값 · CLOSED/CATALOG/해시/내용참조 CHECK).
 */
let owner: pg.Pool;
const spec: SpecColumn[] = readPhysicalSpec();

interface DbColumn {
  table: string;
  position: number;
  name: string;
  type: string;
  not_null: boolean;
  default_value: string | null;
}

let dbColumns: DbColumn[] = [];
const checkDefs = new Map<string, string>();

beforeAll(async () => {
  owner = ownerPool();
  const cols = await owner.query<DbColumn>(`
    SELECT c.relname AS table,
           row_number() OVER (PARTITION BY c.relname ORDER BY a.attnum)::int AS position,
           a.attname AS name,
           format_type(a.atttypid, a.atttypmod) AS type,
           a.attnotnull AS not_null,
           pg_get_expr(d.adbin, d.adrelid) AS default_value
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE n.nspname = 'cera' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped`);
  dbColumns = cols.rows;
  const checks = await owner.query<{ name: string; def: string }>(`
    SELECT con.conname AS name, pg_get_constraintdef(con.oid) AS def
      FROM pg_constraint con JOIN pg_namespace n ON n.oid = con.connamespace
     WHERE n.nspname = 'cera' AND con.contype = 'c'`);
  for (const r of checks.rows) checkDefs.set(r.name, r.def);
});

afterAll(async () => {
  await owner.end();
});

describe('Phase A — P0 schema coverage against docs/24 section 22', () => {
  it('the spec itself has 50 tables (P0 29 + M14 public data 6 + M16 agent records 2 + M18 agent runtime 3 + M22 recovery plan 2 + M24 login 2 + M26 plan follow-up 1 + M28 extraction retry 1 + M30 planning input 4) and 613 logical columns', () => {
    expect(new Set(spec.map((c) => c.table)).size).toBe(50);
    expect(spec.length).toBe(613);
  });

  it('the database has exactly the 50 tables and 613 columns in schema cera', () => {
    expect(new Set(dbColumns.map((c) => c.table))).toEqual(new Set(spec.map((c) => c.table)));
    expect(dbColumns.length).toBe(613);
  });

  it('every column matches the spec: name, order, type, nullability, default', () => {
    const mismatches: string[] = [];
    for (const s of spec) {
      const d = dbColumns.find((c) => c.table === s.table && c.name === s.name);
      if (!d) {
        mismatches.push(`${s.table}.${s.name}: missing`);
        continue;
      }
      if (d.position !== s.position) mismatches.push(`${s.table}.${s.name}: position ${d.position} ≠ ${s.position}`);
      if (d.type !== normalizeSpecType(s.pgType)) mismatches.push(`${s.table}.${s.name}: type ${d.type} ≠ ${s.pgType}`);
      if (d.not_null !== s.notNull) mismatches.push(`${s.table}.${s.name}: not null ${d.not_null} ≠ ${s.notNull}`);
      if (normalizeDbDefault(d.default_value) !== s.defaultValue) {
        mismatches.push(`${s.table}.${s.name}: default ${d.default_value} ≠ ${s.defaultValue}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('every CLOSED code column has a CHECK IN with exactly the spec values (no ENUM types)', () => {
    const closed = spec.filter((s) => closedValues(s.memo));
    expect(closed.length).toBe(83);
    const problems: string[] = [];
    for (const s of closed) {
      const def = checkDefs.get(`ck_${s.table}__${s.name}`);
      if (!def) {
        problems.push(`${s.table}.${s.name}: no CHECK`);
        continue;
      }
      const inDb = [...def.matchAll(/'([A-Z0-9_]+)'::text/g)].map((m) => m[1]).sort();
      const expected = [...(closedValues(s.memo) ?? [])].sort();
      if (JSON.stringify(inDb) !== JSON.stringify(expected)) problems.push(`${s.table}.${s.name}: ${inDb} ≠ ${expected}`);
    }
    expect(problems).toEqual([]);
  });

  it('CATALOG, rule-id, hash and content-ref columns carry their format CHECK', () => {
    const problems: string[] = [];
    for (const s of spec) {
      const def = checkDefs.get(`ck_${s.table}__${s.name}`);
      const need = (fragment: string) => {
        if (!def?.includes(fragment)) problems.push(`${s.table}.${s.name}: missing ${fragment}`);
      };
      if (s.memo.includes('CATALOG 형식')) need('^[A-Z0-9][A-Z0-9_]*$');
      if (s.memo.startsWith('형식 `^R')) need('^R[0-9]{1,2}(-[a-z])?$');
      if (s.memo.includes('해시 형식')) need('^sha256:[0-9a-f]{64}$');
      const ref = /cref:v1:([A-Z_]+):<uuid>/.exec(s.memo);
      if (ref?.[1]) need(`^cref:v1:${ref[1]}:`);
    }
    expect(spec.filter((s) => s.memo.includes('CATALOG 형식')).length).toBe(27);
    expect(problems).toEqual([]);
  });

  it('no PostgreSQL ENUM types and no DB-generated ids or times', async () => {
    const enums = await owner.query(
      "SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'cera' AND t.typtype = 'e'",
    );
    expect(enums.rowCount).toBe(0);
    const generated = dbColumns.filter((c) => c.default_value && /now\(|gen_random_uuid|uuidv7|nextval/.test(c.default_value));
    expect(generated).toEqual([]);
  });
});

describe('Phase A — keys, foreign keys and indexes', () => {
  it('50 primary keys named pk_<table>', async () => {
    const r = await owner.query<{ conname: string; table: string }>(`
      SELECT con.conname, c.relname AS table FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'cera' AND con.contype = 'p'`);
    expect(r.rowCount).toBe(50);
    for (const row of r.rows) expect(row.conname).toBe(`pk_${row.table}`);
  });

  it('106 foreign keys (19 composite): all RESTRICT except verification_request.conflict_id SET NULL, no CASCADE', async () => {
    const r = await owner.query<{ conname: string; cols: number; del: string; upd: string }>(`
      SELECT con.conname, array_length(con.conkey, 1) AS cols, con.confdeltype AS del, con.confupdtype AS upd
        FROM pg_constraint con JOIN pg_namespace n ON n.oid = con.connamespace
       WHERE n.nspname = 'cera' AND con.contype = 'f'`);
    expect(r.rowCount).toBe(106);
    expect(r.rows.filter((x) => x.cols > 1).length).toBe(19);
    const setNull = r.rows.filter((x) => x.del === 'n').map((x) => x.conname);
    expect(setNull).toEqual(['fk_verification_request__conflict_id']);
    expect(r.rows.filter((x) => x.del === 'c' || x.upd === 'c')).toEqual([]);
    expect(r.rows.filter((x) => x.del !== 'r' && x.del !== 'n').map((x) => x.conname)).toEqual([]);
    expect(r.rows.every((x) => x.upd === 'r')).toBe(true);
  });

  it('P1-referencing columns have no FK but a temporary IS NULL CHECK (docs/24 11.3)', () => {
    expect(checkDefs.get('ck_comm_message__p0_no_contact_verification')).toContain('contact_verification_id IS NULL');
    expect(checkDefs.get('ck_send_attempt__p0_no_channel_connection')).toContain('channel_connection_id IS NULL');
  });

  it('partial unique indexes U-1 · U-6 · U-7 exist with their predicates', async () => {
    const r = await owner.query<{ indexname: string; indexdef: string }>(
      "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'cera' AND indexdef LIKE 'CREATE UNIQUE INDEX%'",
    );
    const def = (name: string) => r.rows.find((x) => x.indexname === name)?.indexdef ?? '';
    expect(def('uq_event_entity_link__event_id__subject')).toMatch(/WHERE \(link_role = 'SUBJECT'::text\)/);
    expect(def('uq_send_attempt__message_id__success')).toMatch(/WHERE \(result = 'SUCCESS'::text\)/);
    expect(def('uq_send_attempt__message_id__unresolved')).toMatch(/WHERE \(\(result IS NULL\) OR \(result = 'UNKNOWN'::text\)\)/);
  });

  it('the Outbox is a partial index on comm_message, not a table', async () => {
    const r = await owner.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE schemaname = 'cera' AND indexname = 'ix_comm_message__queued'",
    );
    expect(r.rows[0]?.indexdef).toMatch(/WHERE \(current_status = 'QUEUED'::text\)/);
    const outbox = await owner.query("SELECT 1 FROM pg_tables WHERE schemaname = 'cera' AND tablename LIKE '%outbox%'");
    expect(outbox.rowCount).toBe(0);
  });
});
