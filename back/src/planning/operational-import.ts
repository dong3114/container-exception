import { CONTAINER_PRIORITY, CONTAINER_SIZE_TYPE, TARIFF_RATE_TYPE } from '../db/schema/codes.js';
import { type MaterialValue, canonicalHash } from '../shared/hash/hash.js';

/**
 * 실제 계획 입력 일괄 검증(T-123) — 순수 함수. 내부 시스템에서 내보낸 CSV(또는 같은 열 이름의 JSON 행)를 행마다 검사해
 * 정규화한 행 · 행별 오류를 돌려준다. **값을 채워 넣거나 추정하지 않는다** — 빈 칸은 빈 값이고, 필수 칸이 비면 오류다.
 * (LFD 는 비워 둘 수 있다: 저장은 되지만 계획 준비도가 `CONTAINER_LFD` 로 막는다 — 없는 값을 지어내지 않는다.)
 *
 * 보안: 크기 · 행 수 상한, 알 수 없는 열 거부, 수식처럼 시작하는 칸(`= + @` · 탭 · CR, 숫자가 아닌 칸의 `-`) 거부 —
 * 나중에 스프레드시트로 내보낼 때 수식으로 실행되지 않게 한다. 파일 이름은 받지도 믿지도 않는다(보관도 하지 않는다).
 */
export const IMPORT_LIMITS = { maxBytes: 512 * 1024, maxRows: 2000 } as const; // [ASSUMPTION] 수십~수백 행 운영 파일 기준
export const IMPORT_KINDS = ['CONTAINERS', 'RATES', 'FACILITY_PROFILES'] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export interface RowError {
  row: number;
  column: string | null;
  code: string;
  message: string;
}

export interface FacilityRef {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
}

export interface ImportContext {
  planDay: string | null;
  facilities: FacilityRef[];
  /** 범위 안 공공데이터 컨테이너(번호 → id · 규격) — 있으면 규격을 대조하고 연결한다 */
  publicContainers: Map<string, { id: string; sizeType: string | null }>;
}

export interface ContainerRow {
  row_no: number;
  container_no: string;
  container_id: string | null;
  size_type: string;
  carrier_code: string;
  priority: (typeof CONTAINER_PRIORITY)[number];
  lfd: string | null;
  pickup_ready: boolean;
  current_terminal: string;
  destination_facility_id: string;
  planned_day: string;
  planned_depart_hour: number | null;
  alternate_destination_allowed: boolean;
  record_status: 'ACTIVE' | 'WITHDRAWN';
}

export interface RateRow {
  row_no: number;
  rate_type: (typeof TARIFF_RATE_TYPE)[number];
  carrier_code: string | null;
  from_ref: string | null;
  to_ref: string | null;
  size_type: string | null;
  amount: number;
  unit: 'KRW' | 'DAY';
  effective_from: string;
  effective_until: string | null;
  source_note: string;
  record_status: 'ACTIVE' | 'WITHDRAWN';
}

export interface ProfileRow {
  row_no: number;
  facility_id: string;
  accepts: string[];
  open_from_hour: number;
  last_departure_hour: number;
  trip_hours: number;
  max_storage_days: number | null;
  record_status: 'ACTIVE' | 'WITHDRAWN';
}

export type ImportRow = ContainerRow | RateRow | ProfileRow;
export interface ValidatedImport<R extends ImportRow> {
  rows: (R & { identity: string; content_hash: string })[];
  errors: RowError[];
  content_hash: string;
}

const COLUMNS: Record<ImportKind, { required: string[]; optional: string[] }> = {
  CONTAINERS: {
    required: ['container_no', 'size_type', 'carrier', 'pickup_ready', 'terminal', 'destination', 'planned_day'],
    optional: ['priority', 'lfd', 'planned_depart_hour', 'alternate_destination_allowed', 'status'],
  },
  RATES: { required: ['rate_type', 'amount', 'effective_from', 'source_note'], optional: ['carrier', 'from', 'to', 'size_type', 'unit', 'currency', 'effective_until', 'status'] },
  FACILITY_PROFILES: { required: ['facility', 'accepts', 'open_from_hour', 'last_departure_hour', 'trip_hours'], optional: ['max_storage_days', 'status'] },
};
const NUMERIC = new Set(['amount', 'planned_depart_hour', 'open_from_hour', 'last_departure_hour', 'trip_hours', 'max_storage_days']);
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CODE = /^[A-Z0-9][A-Z0-9_]{1,19}$/;
const TERMINAL = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;
/** LFD · 계획일 상식 범위: 계획일 ± 365일 [ASSUMPTION] — 연도 오타(2062 등)를 잡는다 */
const SANE_DAYS = 365;

/** RFC 4180 CSV(따옴표 · 쉼표 · 줄바꿈 CRLF/LF). 첫 줄 = 열 이름. 빈 줄은 건너뛴다. */
export function parseCsv(text: string): { header: string[]; rows: { row: number; cells: Record<string, string> }[] } | { error: RowError } {
  const records: string[][] = [];
  let field = '';
  let rec: string[] = [];
  let quoted = false;
  let i = 0;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // BOM
  while (i < src.length) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === ',') {
      rec.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      rec.push(field);
      records.push(rec);
      rec = [];
      field = '';
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
    } else field += ch;
    i += 1;
  }
  if (quoted) return { error: { row: records.length + 1, column: null, code: 'CSV_UNTERMINATED_QUOTE', message: 'a quoted field is not closed' } };
  if (field !== '' || rec.length > 0) {
    rec.push(field);
    records.push(rec);
  }
  const nonEmpty = records.map((r, idx) => ({ r, line: idx + 1 })).filter((x) => x.r.some((c) => c.trim() !== ''));
  if (nonEmpty.length === 0) return { error: { row: 0, column: null, code: 'CSV_EMPTY', message: 'no header row' } };
  const header = nonEmpty[0]!.r.map((h) => h.trim().toLowerCase());
  const rows: { row: number; cells: Record<string, string> }[] = [];
  for (const { r, line } of nonEmpty.slice(1)) {
    if (r.length !== header.length) return { error: { row: line, column: null, code: 'CSV_COLUMN_COUNT', message: `expected ${header.length} cells, got ${r.length}` } };
    rows.push({ row: line, cells: Object.fromEntries(header.map((h, k) => [h, r[k]!])) });
  }
  return { header, rows };
}

/** 원문(CSV 텍스트 또는 행 객체) → 열 이름 · 행. 크기 · 행 수 · 알 수 없는 열 · 빠진 열 · 수식 칸을 여기서 막는다. */
export function readTable(kind: ImportKind, source: { csv?: string; rows?: Record<string, unknown>[] }): { rows: { row: number; cells: Record<string, string> }[] } | { errors: RowError[] } {
  let header: string[];
  let rows: { row: number; cells: Record<string, string> }[];
  if (typeof source.csv === 'string') {
    if (Buffer.byteLength(source.csv, 'utf8') > IMPORT_LIMITS.maxBytes) return { errors: [{ row: 0, column: null, code: 'INPUT_TOO_LARGE', message: `at most ${IMPORT_LIMITS.maxBytes} bytes` }] };
    const parsed = parseCsv(source.csv);
    if ('error' in parsed) return { errors: [parsed.error] };
    ({ header, rows } = parsed);
  } else if (Array.isArray(source.rows)) {
    rows = source.rows.map((r, k) => ({ row: k + 1, cells: Object.fromEntries(Object.entries(r ?? {}).map(([key, v]) => [key.trim().toLowerCase(), v === null || v === undefined ? '' : String(v)])) }));
    header = [...new Set(rows.flatMap((r) => Object.keys(r.cells)))];
  } else return { errors: [{ row: 0, column: null, code: 'INPUT_REQUIRED', message: 'give csv (text) or rows (array)' }] };
  if (rows.length > IMPORT_LIMITS.maxRows) return { errors: [{ row: 0, column: null, code: 'TOO_MANY_ROWS', message: `at most ${IMPORT_LIMITS.maxRows} rows` }] };
  const spec = COLUMNS[kind];
  const known = new Set([...spec.required, ...spec.optional]);
  const errors: RowError[] = [];
  for (const h of header) if (!known.has(h)) errors.push({ row: 0, column: h, code: 'UNKNOWN_COLUMN', message: `unknown column ${h.slice(0, 40)}` });
  for (const h of spec.required) if (!header.includes(h)) errors.push({ row: 0, column: h, code: 'MISSING_COLUMN', message: `required column ${h}` });
  for (const r of rows) {
    for (const [col, raw] of Object.entries(r.cells)) {
      const v = raw.trim();
      if (/^[=+@\t\r]/.test(raw) || (v.startsWith('-') && !NUMERIC.has(col))) errors.push({ row: r.row, column: col, code: 'FORMULA_LIKE_CELL', message: 'a cell may not start with = + - @ (spreadsheet formula)' });
      if (v.length > 200) errors.push({ row: r.row, column: col, code: 'CELL_TOO_LONG', message: 'at most 200 characters' });
    }
  }
  return errors.length ? { errors } : { rows };
}

/** ISO 6346 컨테이너 번호(소유자 3 + 장비 구분 1 + 일련 6 + 검사 숫자 1). */
export function validContainerNo(no: string): boolean {
  if (!/^[A-Z]{3}[UJZ][0-9]{7}$/.test(no)) return false;
  const value = (ch: string) => {
    if (/[0-9]/.test(ch)) return Number(ch);
    let v = ch.charCodeAt(0) - 55; // A = 10
    v += Math.floor((v - 1) / 10); // 11 · 22 · 33 은 쓰지 않는다
    return v;
  };
  let sum = 0;
  for (let k = 0; k < 10; k++) sum += value(no[k]!) * 2 ** k;
  return (sum % 11) % 10 === Number(no[10]);
}

export function validDate(s: string): boolean {
  const m = DATE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}
const dayDistance = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

class Row {
  readonly errors: RowError[] = [];
  constructor(
    readonly row: number,
    private readonly cells: Record<string, string>,
  ) {}
  err(column: string | null, code: string, message: string): void {
    this.errors.push({ row: this.row, column, code, message });
  }
  text(col: string): string {
    return (this.cells[col] ?? '').trim();
  }
  required(col: string): string {
    const v = this.text(col);
    if (!v) this.err(col, 'REQUIRED', `${col} is required`);
    return v;
  }
  int(col: string, min: number, max: number, optional = false): number | null {
    const v = this.text(col);
    if (!v) {
      if (!optional) this.err(col, 'REQUIRED', `${col} is required`);
      return null;
    }
    if (!/^-?[0-9]+$/.test(v)) {
      this.err(col, 'NOT_AN_INTEGER', `${col} must be an integer (no separators or decimals)`);
      return null;
    }
    const n = Number(v);
    if (!Number.isSafeInteger(n) || n < min || n > max) {
      this.err(col, n < 0 && min >= 0 ? 'NEGATIVE_VALUE' : 'OUT_OF_RANGE', `${col} must be between ${min} and ${max}`);
      return null;
    }
    return n;
  }
  bool(col: string, fallback: boolean | null): boolean {
    const v = this.text(col).toLowerCase();
    if (!v) {
      if (fallback === null) this.err(col, 'REQUIRED', `${col} is required`);
      return fallback ?? false;
    }
    if (['true', 'yes', 'y', '1'].includes(v)) return true;
    if (['false', 'no', 'n', '0'].includes(v)) return false;
    this.err(col, 'NOT_A_BOOLEAN', `${col} must be true or false`);
    return false;
  }
  date(col: string, optional = false): string | null {
    const v = this.text(col);
    if (!v) {
      if (!optional) this.err(col, 'REQUIRED', `${col} is required`);
      return null;
    }
    if (!validDate(v)) {
      this.err(col, 'INVALID_DATE', `${col} must be a calendar date YYYY-MM-DD`);
      return null;
    }
    return v;
  }
  size(col: string, optional = false): string | null {
    const v = this.text(col).toUpperCase();
    if (!v) {
      if (!optional) this.err(col, 'REQUIRED', `${col} is required`);
      return null;
    }
    if (!(CONTAINER_SIZE_TYPE as readonly string[]).includes(v)) {
      this.err(col, 'INVALID_CONTAINER_TYPE', `${col} must be one of ${CONTAINER_SIZE_TYPE.join(', ')}`);
      return null;
    }
    return v;
  }
  status(): 'ACTIVE' | 'WITHDRAWN' {
    const v = this.text('status').toUpperCase() || 'ACTIVE';
    if (v !== 'ACTIVE' && v !== 'WITHDRAWN') this.err('status', 'INVALID_STATUS', 'status must be ACTIVE or WITHDRAWN');
    return v === 'WITHDRAWN' ? 'WITHDRAWN' : 'ACTIVE';
  }
  /** 시설: id(UUID) 또는 등록부 이름(정확히 하나). 종류 · 활성도 본다. */
  facility(col: string, ctx: ImportContext, types: string[], optional = false): FacilityRef | null {
    const v = this.text(col);
    if (!v) {
      if (!optional) this.err(col, 'REQUIRED', `${col} is required`);
      return null;
    }
    const matches = ctx.facilities.filter((f) => f.id === v.toLowerCase() || f.name === v);
    if (matches.length !== 1) {
      this.err(col, matches.length === 0 ? 'UNKNOWN_FACILITY' : 'AMBIGUOUS_FACILITY', `${col}: no single registered facility "${v.slice(0, 60)}"`);
      return null;
    }
    const f = matches[0]!;
    if (!f.isActive) this.err(col, 'FACILITY_INACTIVE', `${col}: ${f.name} is not active`);
    if (!types.includes(f.type)) this.err(col, 'FACILITY_TYPE_NOT_ALLOWED', `${col}: ${f.name} is ${f.type}, expected ${types.join(' or ')}`);
    return f;
  }
}

function finish<R extends ImportRow>(kind: ImportKind, scope: string | null, rows: (R & { identity: string })[], errors: RowError[]): ValidatedImport<R> {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const prev = seen.get(r.identity);
    if (prev !== undefined) errors.push({ row: r.row_no, column: null, code: 'DUPLICATE_ROW', message: `same key as row ${prev} (${r.identity})` });
    else seen.set(r.identity, r.row_no);
  }
  const hashed = rows.map((r) => {
    const { row_no: _, identity, ...content } = r as R & { identity: string };
    return { ...r, identity, content_hash: canonicalHash({ k: 'planning-input-row', v: 1, kind, content: content as unknown as MaterialValue }) };
  });
  const content_hash = canonicalHash({ k: 'planning-input-batch', v: 1, kind, scope, rows: hashed.map((r) => r.content_hash).sort() });
  return { rows: hashed, errors: errors.sort((a, b) => a.row - b.row), content_hash };
}

export function validateContainers(table: { row: number; cells: Record<string, string> }[], ctx: ImportContext, runId: string): ValidatedImport<ContainerRow> {
  const out: (ContainerRow & { identity: string })[] = [];
  const errors: RowError[] = [];
  for (const t of table) {
    const r = new Row(t.row, t.cells);
    const no = r.required('container_no').toUpperCase();
    if (no && !validContainerNo(no)) r.err('container_no', 'INVALID_CONTAINER_NO', 'container_no must be ISO 6346 (4 letters + 7 digits, valid check digit)');
    const size = r.size('size_type');
    const carrier = r.required('carrier').toUpperCase();
    if (carrier && !CODE.test(carrier)) r.err('carrier', 'INVALID_CODE', 'carrier must be a code (A-Z 0-9 _, 2-20)');
    const priority = (r.text('priority').toUpperCase() || 'NORMAL') as ContainerRow['priority'];
    if (!(CONTAINER_PRIORITY as readonly string[]).includes(priority)) r.err('priority', 'INVALID_PRIORITY', `priority must be ${CONTAINER_PRIORITY.join(', ')}`);
    const lfd = r.date('lfd', true);
    const plannedDay = r.date('planned_day');
    for (const [col, d] of [['lfd', lfd], ['planned_day', plannedDay]] as const) {
      if (d && ctx.planDay && dayDistance(d, ctx.planDay) > SANE_DAYS) r.err(col, 'DATE_OUT_OF_RANGE', `${col} is more than ${SANE_DAYS} days from the plan day ${ctx.planDay}`);
    }
    const terminal = r.required('terminal').toUpperCase();
    if (terminal && !TERMINAL.test(terminal)) r.err('terminal', 'INVALID_CODE', 'terminal must be a code (A-Z 0-9 _ -)');
    const dest = r.facility('destination', ctx, ['WAREHOUSE']);
    const hour = r.int('planned_depart_hour', 0, 23, true);
    const pub = no ? ctx.publicContainers.get(no) : undefined;
    if (pub?.sizeType && size && pub.sizeType !== size) r.err('size_type', 'CONFLICTS_WITH_PUBLIC_DATA', `public manifest says ${pub.sizeType}`);
    const row: ContainerRow = {
      row_no: t.row,
      container_no: no,
      container_id: pub?.id ?? null,
      size_type: size ?? '',
      carrier_code: carrier,
      priority,
      lfd,
      pickup_ready: r.bool('pickup_ready', null),
      current_terminal: terminal,
      destination_facility_id: dest?.id ?? '',
      planned_day: plannedDay ?? '',
      planned_depart_hour: hour,
      alternate_destination_allowed: r.bool('alternate_destination_allowed', false),
      record_status: r.status(),
    };
    errors.push(...r.errors);
    if (r.errors.length === 0) out.push({ ...row, identity: no });
  }
  return finish('CONTAINERS', runId, out, errors);
}

/** 요율 종류별로 필요한 칸 — Cost Engine 이 실제로 찾는 키만(`RateTable`). */
const RATE_SHAPE: Record<RateRow['rate_type'], { carrier: boolean; from: 'TERMINAL_OR_FACILITY' | 'NONE'; to: string[] | null; size: boolean; unit: 'KRW' | 'DAY' }> = {
  DEMURRAGE_PER_DAY: { carrier: true, from: 'NONE', to: null, size: true, unit: 'KRW' },
  TERMINAL_STORAGE_PER_DAY: { carrier: false, from: 'NONE', to: null, size: true, unit: 'KRW' },
  DETENTION_FREE_DAYS: { carrier: false, from: 'NONE', to: null, size: false, unit: 'DAY' },
  TRANSPORT: { carrier: false, from: 'TERMINAL_OR_FACILITY', to: ['WAREHOUSE', 'ODCY'], size: true, unit: 'KRW' },
  ODCY_HANDLING_IN_OUT: { carrier: false, from: 'NONE', to: ['ODCY'], size: true, unit: 'KRW' },
  ODCY_STORAGE_PER_DAY: { carrier: false, from: 'NONE', to: ['ODCY'], size: true, unit: 'KRW' },
};

export function validateRates(table: { row: number; cells: Record<string, string> }[], ctx: ImportContext): ValidatedImport<RateRow> {
  const out: (RateRow & { identity: string })[] = [];
  const errors: RowError[] = [];
  for (const t of table) {
    const r = new Row(t.row, t.cells);
    const type = r.required('rate_type').toUpperCase() as RateRow['rate_type'];
    const shape = RATE_SHAPE[type];
    if (!shape) {
      if (type) r.err('rate_type', 'INVALID_RATE_TYPE', `rate_type must be ${TARIFF_RATE_TYPE.join(', ')}`);
      errors.push(...r.errors);
      continue;
    }
    const currency = r.text('currency').toUpperCase();
    if (currency && currency !== 'KRW') r.err('currency', 'UNSUPPORTED_CURRENCY', 'only KRW (integer won) is supported');
    const unit = r.text('unit').toUpperCase() || shape.unit;
    if (unit !== shape.unit) r.err('unit', 'UNSUPPORTED_UNIT', `${type} is in ${shape.unit}`);
    const carrier = r.text('carrier').toUpperCase() || null;
    if (shape.carrier && !carrier) r.err('carrier', 'REQUIRED', `${type} needs carrier`);
    if (!shape.carrier && carrier) r.err('carrier', 'NOT_APPLICABLE', `${type} has no carrier`);
    if (carrier && !CODE.test(carrier)) r.err('carrier', 'INVALID_CODE', 'carrier must be a code (A-Z 0-9 _, 2-20)');
    let from: string | null = null;
    if (shape.from === 'TERMINAL_OR_FACILITY') {
      const raw = r.required('from');
      const fac = raw ? ctx.facilities.find((f) => f.id === raw.toLowerCase() || f.name === raw) : undefined;
      if (fac) from = fac.id;
      else if (raw && TERMINAL.test(raw.toUpperCase())) from = raw.toUpperCase();
      else if (raw) r.err('from', 'UNKNOWN_FACILITY', 'from must be a terminal code or a registered facility');
    } else if (r.text('from')) r.err('from', 'NOT_APPLICABLE', `${type} has no from`);
    let to: string | null = null;
    if (shape.to) to = r.facility('to', ctx, shape.to)?.id ?? null;
    else if (r.text('to')) r.err('to', 'NOT_APPLICABLE', `${type} has no to`);
    const size = shape.size ? r.size('size_type') : null;
    if (!shape.size && r.text('size_type')) r.err('size_type', 'NOT_APPLICABLE', `${type} has no size_type`);
    const amount = r.int('amount', 0, shape.unit === 'DAY' ? 365 : 100_000_000);
    const from_ = r.date('effective_from');
    const until = r.date('effective_until', true);
    if (from_ && until && until < from_) r.err('effective_until', 'INVALID_PERIOD', 'effective_until is before effective_from');
    const note = r.required('source_note');
    const row: RateRow = { row_no: t.row, rate_type: type, carrier_code: carrier, from_ref: from, to_ref: to, size_type: size, amount: amount ?? 0, unit: shape.unit, effective_from: from_ ?? '', effective_until: until, source_note: note, record_status: r.status() };
    errors.push(...r.errors);
    if (r.errors.length === 0) out.push({ ...row, identity: rateIdentity(row) });
  }
  return finish('RATES', null, out, errors);
}

export const rateIdentity = (r: Pick<RateRow, 'rate_type' | 'carrier_code' | 'from_ref' | 'to_ref' | 'size_type' | 'effective_from'>) =>
  [r.rate_type, r.carrier_code ?? '', r.from_ref ?? '', r.to_ref ?? '', r.size_type ?? '', r.effective_from].join('|');

export function validateProfiles(table: { row: number; cells: Record<string, string> }[], ctx: ImportContext): ValidatedImport<ProfileRow> {
  const out: (ProfileRow & { identity: string })[] = [];
  const errors: RowError[] = [];
  for (const t of table) {
    const r = new Row(t.row, t.cells);
    const fac = r.facility('facility', ctx, ['WAREHOUSE', 'ODCY']);
    const accepts = [...new Set(r.required('accepts').toUpperCase().split(/[|;\s]+/).filter(Boolean))].sort();
    for (const a of accepts) if (!(CONTAINER_SIZE_TYPE as readonly string[]).includes(a)) r.err('accepts', 'INVALID_CONTAINER_TYPE', `accepts: ${a.slice(0, 20)} is not a size type`);
    const open = r.int('open_from_hour', 0, 23);
    const last = r.int('last_departure_hour', 0, 23);
    if (open !== null && last !== null && last < open) r.err('last_departure_hour', 'INVALID_WINDOW', 'last_departure_hour is before open_from_hour');
    const trip = r.int('trip_hours', 1, 24);
    const max = r.int('max_storage_days', 0, 365, true);
    const row: ProfileRow = { row_no: t.row, facility_id: fac?.id ?? '', accepts, open_from_hour: open ?? 0, last_departure_hour: last ?? 0, trip_hours: trip ?? 1, max_storage_days: max, record_status: r.status() };
    errors.push(...r.errors);
    if (r.errors.length === 0) out.push({ ...row, identity: row.facility_id });
  }
  return finish('FACILITY_PROFILES', null, out, errors);
}
