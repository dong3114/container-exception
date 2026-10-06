import { readFileSync } from 'node:fs';

/**
 * docs/24 22절(표별 물리 명세)을 읽어 기대값을 만든다 — 시험이 문서 정본과 실제 DB 를 직접 대조한다.
 * 컬럼 표: | # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
 */
export interface SpecColumn {
  table: string;
  position: number;
  name: string;
  pgType: string;
  notNull: boolean;
  defaultValue: string | null;
  memo: string;
}

export const PHYSICAL_SPEC_PATH = '../docs/24_cera-physical-data-model.md';

const STRIP = (cell: string) => cell.trim().replace(/^`|`$/g, '');

export function readPhysicalSpec(path = PHYSICAL_SPEC_PATH): SpecColumn[] {
  const text = readFileSync(path, 'utf8');
  const start = text.indexOf('\n## 22.');
  const end = text.indexOf('\n## 23.');
  if (start < 0 || end < 0) throw new Error('docs/24 section 22 not found');
  const section = text.slice(start, end);

  const columns: SpecColumn[] = [];
  let table: string | null = null;
  for (const line of section.split('\n')) {
    const heading = /^### 22\.\d+ `([a-z_]+)`/.exec(line);
    if (heading) {
      table = heading[1] ?? null;
      continue;
    }
    if (!table || !/^\| \d+ \| `/.test(line)) continue;
    const cells = line.split('|').slice(1, -1);
    if (cells.length !== 8) throw new Error(`unexpected column row in ${table}: ${line}`);
    const [pos, name, , pgType, nullability, defaultValue, , memo] = cells.map((c) => c.trim());
    columns.push({
      table,
      position: Number(pos),
      name: STRIP(name ?? ''),
      pgType: STRIP(pgType ?? ''),
      notNull: nullability === 'NOT NULL',
      defaultValue: defaultValue === '—' ? null : STRIP(defaultValue ?? ''),
      memo: memo ?? '',
    });
  }
  return columns;
}

/** docs/24 의 짧은 타입 표기 → PostgreSQL `format_type()` 표기. */
export function normalizeSpecType(t: string): string {
  return t
    .replace(/^varchar\((\d+)\)$/, 'character varying($1)')
    .replace(/^timestamptz\((\d)\)$/, 'timestamp($1) with time zone')
    .replace(/^time\((\d)\)$/, 'time($1) without time zone')
    .replace(/^numeric\((\d+),(\d+)\)$/, 'numeric($1,$2)');
}

/** `pg_get_expr` 기본값(`'PENDING'::text`) → 문서 표기(`'PENDING'`). */
export function normalizeDbDefault(d: string | null): string | null {
  if (d === null) return null;
  return d.replace(/::[a-z ]+(\(\d+\))?$/, '');
}

/** 메모의 `IN (A, B, …)` → CLOSED 값 목록. */
export function closedValues(memo: string): string[] | null {
  const m = /IN \(([A-Z0-9_, ]+)\)/.exec(memo);
  return m?.[1] ? m[1].split(',').map((v) => v.trim()) : null;
}
