import { type SQL, sql } from 'drizzle-orm';
import { check, type PgColumn, pgSchema, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * 스키마 공통 도구(docs/24 2 · 3 · 8 · 16절).
 * - 모든 표는 PostgreSQL 스키마 `cera` 에 둔다
 * - 제약·인덱스 이름은 docs/24 2절 규칙(`pk_` · `fk_` · `uq_` · `ck_` · `ix_`)으로 고정한다 — custom SQL 이 같은 이름을 가리킨다
 * - CHECK 식에 들어가는 값은 **코드 상수만** 쓴다(사용자 입력이 아니다). 값 목록은 codes.ts 한 곳
 */
export const cera = pgSchema('cera');

/** PostgreSQL 식별자 상한(63바이트)을 넘으면 조용히 잘린다 → 스키마 로드 시점에 막는다. */
export function n(name: string): string {
  if (name.length > 63) throw new Error(`identifier too long (${name.length} > 63): ${name}`);
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error(`invalid identifier: ${name}`);
  return name;
}

/** `timestamptz(3)` — 시점. DB 는 시각을 만들지 않는다(기본값 없음, docs/24 5절). */
export const tstz = (name: string) => timestamp(name, { withTimezone: true, precision: 3, mode: 'string' });

/** HASH — `sha256:` + 64 hex(varchar(71), docs/24 8.1). */
export const hash = (name: string) => varchar(name, { length: 71 });

/** 내용 참조 `*_ref` — varchar(300) + 범주별 형식 CHECK(docs/24 16.3). */
export const contentRef = (name: string) => varchar(name, { length: 300 });

const HASH_RE = '^sha256:[0-9a-f]{64}$';
const CATALOG_RE = '^[A-Z0-9][A-Z0-9_]*$';
const RULE_ID_RE = '^R[0-9]{1,2}(-[a-z])?$';
const UUIDV7_RE = '[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

export const CONTENT_CATEGORIES = [
  'RAW_INPUT_PAYLOAD',
  'COMM_MESSAGE_CONTENT',
  'MESSAGE_APPROVAL_CONTENT',
  'EXTRACTION_SOURCE_QUOTE',
] as const;
export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];
export const CONTENT_REF_PATTERN = (category: ContentCategory) => `^cref:v1:${category}:${UUIDV7_RE}$`;

/** SQL 문자열 리터럴. 코드 상수 전용 — 작은따옴표를 이스케이프하고, 허용 문자 밖이면 거부한다. */
function lit(value: string): SQL {
  if (!/^[A-Za-z0-9_:^$\-[\]{}().*+?|\\, ]*$/.test(value)) throw new Error(`unexpected literal: ${value}`);
  return sql.raw(`'${value.replaceAll("'", "''")}'`);
}

export function inList(column: PgColumn, values: readonly string[]): SQL {
  return sql`${column} IN (${sql.join(
    values.map((v) => lit(v)),
    sql`, `,
  )})`;
}

/** CLOSED 코드: `text` + `CHECK IN (…)`. NULL 은 CHECK 를 통과한다(NULL 허용 여부는 컬럼 정의가 정한다). */
export const ckIn = (table: string, column: PgColumn, values: readonly string[]) =>
  check(n(`ck_${table}__${column.name}`), inList(column, values));

/** CATALOG 코드: 형식 CHECK + 앱 카탈로그(docs/24 3절). */
export const ckCatalog = (table: string, column: PgColumn) =>
  check(n(`ck_${table}__${column.name}`), sql`${column} ~ ${lit(CATALOG_RE)}`);

export const ckRuleId = (table: string, column: PgColumn) =>
  check(n(`ck_${table}__${column.name}`), sql`${column} ~ ${lit(RULE_ID_RE)}`);

export const ckHash = (table: string, column: PgColumn) =>
  check(n(`ck_${table}__${column.name}`), sql`${column} ~ ${lit(HASH_RE)}`);

export const ckContentRef = (table: string, column: PgColumn, category: ContentCategory) =>
  check(n(`ck_${table}__${column.name}`), sql`${column} ~ ${lit(CONTENT_REF_PATTERN(category))}`);

/** S-2: `is_simulated = (scenario_id IS NOT NULL)`(docs/22 20절). */
export const ckS2 = (table: string, isSimulated: PgColumn, scenarioId: PgColumn) =>
  check(n(`ck_${table}__s2_simulated_scenario`), sql`${isSimulated} = (${scenarioId} IS NOT NULL)`);

/** 적용 범위: `GLOBAL` ⇔ 빈 문자열. */
export const ckScope = (table: string, scopeType: PgColumn, scopeRef: PgColumn) =>
  check(n(`ck_${table}__scope_global_empty`), sql`(${scopeType} = 'GLOBAL') = (${scopeRef} = '')`);

/** jsonb 모양(값이 있을 때). */
export const ckJsonType = (table: string, column: PgColumn, kind: 'object' | 'array') =>
  check(n(`ck_${table}__${column.name}_${kind}`), sql`jsonb_typeof(${column}) = ${lit(kind)}`);

/** 단위가 KRW 이면 정수(docs/24 6절). */
export const ckKrwInteger = (table: string, unit: PgColumn, value: PgColumn) =>
  check(n(`ck_${table}__krw_integer`), sql`${unit} <> 'KRW' OR ${value} = trunc(${value})`);
