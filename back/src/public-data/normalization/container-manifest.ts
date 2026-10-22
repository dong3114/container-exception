import type { NormalizationIssue } from '../contracts.js';
import { field, type XmlRecord } from '../parsing/xml-envelope.js';

/**
 * DS-02 외항화물컨테이너정보(`CargFrghtContnOut/ContnInfo`) item → 적하목록 한 줄. 순수 함수.
 * 필드 정본: 2026-10-06 포털 가이드(FILE_000000007709092) · field-dictionary 3.3.
 *
 * - 수입(`tkinTkoutSe = II`)만 쓴다(초기 범위 Import FCL — ADR-010). 다른 구분은 건너뛰고 issue 로 센다
 * - `blNo` 가 MBL 인지 HBL 인지 원천이 말하지 않는다 → `UNKNOWN`(지어내지 않는다, Q-04)
 * - 컨테이너 번호는 ISO 6346 모양만 받는다. 체크 숫자가 틀리면 받되 신뢰도를 낮춘다
 * - 이 표는 컨테이너별 반출입 **시각을 주지 않는다**(`etryndDt` 는 선박 입출항 일시) — 컨테이너 사건 시각으로 쓰지 않는다
 */
export interface ManifestLine {
  itemIndex: number;
  /** 같은 입항 건인지 되짚는 키(조회 키와 대조) */
  callSign: string | null;
  callYear: string | null;
  callSeq: string | null;
  manifestNo: string | null;
  blNo: string;
  msn: string | null;
  containerNo: string;
  checkDigitValid: boolean;
  isoSizeType: string | null;
  sizeFt: string | null;
  sizeType: CeraSizeType | null;
}

export type CeraSizeType = '20DRY' | '40DRY' | '40HC' | '20RF' | '40RF' | 'OTHER';

const CONTAINER_NO = /^[A-Z]{3}[UJZ][0-9]{7}$/;
const BL_NO = /^[A-Z0-9-]{1,40}$/;
const ISO_SIZE_TYPE = /^[0-9A-Z]{4}$/;

export function normalizeManifestLine(item: XmlRecord, itemIndex: number): { value: ManifestLine | null; issues: NormalizationIssue[] } {
  const issues: NormalizationIssue[] = [];
  const issue = (code: string) => issues.push({ item_index: itemIndex, code });
  if (field(item, 'tkinTkoutSe') !== 'II') {
    issue('NOT_IMPORT_LINE');
    return { value: null, issues };
  }
  const containerNo = field(item, 'contnNo')?.replace(/\s+/g, '').toUpperCase() ?? null;
  if (!containerNo || !CONTAINER_NO.test(containerNo)) {
    issue('CONTAINER_NO_INVALID');
    return { value: null, issues };
  }
  const blNo = field(item, 'blNo')?.replace(/\s+/g, '').toUpperCase() ?? null;
  if (!blNo || !BL_NO.test(blNo)) {
    issue('BL_NO_INVALID');
    return { value: null, issues };
  }
  const checkDigitValid = iso6346CheckDigitValid(containerNo);
  if (!checkDigitValid) issue('CONTAINER_CHECK_DIGIT_MISMATCH');
  const iso = field(item, 'contnStndrd')?.toUpperCase() ?? null;
  const isoSizeType = iso && ISO_SIZE_TYPE.test(iso) ? iso : null;
  if (iso && !isoSizeType) issue('ISO_SIZE_TYPE_INVALID');
  const msn = field(item, 'msnNo');
  return {
    value: {
      itemIndex,
      callSign: field(item, 'clsgn')?.toUpperCase() ?? null,
      callYear: field(item, 'etryptYear'),
      callSeq: field(item, 'etryptCo')?.padStart(3, '0') ?? null,
      manifestNo: field(item, 'mrNum')?.toUpperCase() ?? null,
      blNo,
      msn: msn && /^[0-9A-Z]{1,8}$/.test(msn) ? msn : null,
      containerNo,
      checkDigitValid,
      isoSizeType,
      sizeFt: field(item, 'contnSize'),
      sizeType: ceraSizeType(isoSizeType),
    },
    issues,
  };
}

/** ISO 6346 체크 숫자(문자 값: A=10 … 11 의 배수 건너뜀, 자리 가중치 2^i, 합 mod 11 mod 10). */
export function iso6346CheckDigitValid(containerNo: string): boolean {
  if (!CONTAINER_NO.test(containerNo)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = containerNo.charAt(i);
    sum += letterOrDigitValue(ch) * 2 ** i;
  }
  return (sum % 11) % 10 === Number(containerNo.charAt(10));
}

function letterOrDigitValue(ch: string): number {
  if (/[0-9]/.test(ch)) return Number(ch);
  let value = 10;
  for (let c = 'A'.charCodeAt(0); c < ch.charCodeAt(0); c++) {
    value += 1;
    if (value % 11 === 0) value += 1;
  }
  return value;
}

/**
 * ISO 6346 규격 코드 → CERA 분류. 첫 글자 = 길이(2 = 20ft, 4 = 40ft), 둘째 = 높이(5 = 9'6" 하이큐브), 셋째 = 종류(G 일반 · R 냉동).
 * 그 밖(45ft · 탱크 · 오픈탑 · 플랫 등)은 OTHER. 코드가 없으면 null(모름).
 */
export function ceraSizeType(iso: string | null): CeraSizeType | null {
  if (!iso) return null;
  const [length, height, group] = [iso.charAt(0), iso.charAt(1), iso.charAt(2)];
  if (group === 'R') return length === '2' ? '20RF' : length === '4' ? '40RF' : 'OTHER';
  if (group === 'G') {
    if (length === '2') return '20DRY';
    if (length === '4') return height === '5' ? '40HC' : '40DRY';
  }
  return 'OTHER';
}
