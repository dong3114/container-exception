import type { Instant } from '../../shared/time/instant.js';
import type { NormalizationIssue } from '../contracts.js';
import { children, field, type XmlRecord } from '../parsing/xml-envelope.js';
import { parsePublicTime } from './public-time.js';

/**
 * DS-03 선박운항정보(`VsslEtrynd5/Info5`) item → 정규화 입항 건. 순수 함수 — DB · 네트워크 · 시계 없음(받은 시각은 인자).
 * 필드 정본: 2026-10-06 포털 가이드(FILE_000000007708406) · field-dictionary 4.2.
 *
 * CERA 가 쓰는 것만 꺼낸다: 입항 건 키(항만 · 연도 · 횟수 · 호출부호) · 선명 · 선종(분류용) · 입항 신고 일시 · 출항 일시 ·
 * 계선 시설(선석) · 수입 적하목록관리번호. 선원 수 · 신고업체 · 톤수 · 출항지 같은 나머지는 원문에만 남는다.
 */
export interface NormalizedVesselCall {
  itemIndex: number;
  portAuthorityCode: string;
  callYear: number;
  /** 원천 표기(0 채움 3자리) */
  callSeq: string;
  callSign: string;
  vesselName: string | null;
  vesselKind: string | null;
  /**
   * 입항 상세의 **입항 신고 일시**(입출항 신고 — 실제 접안 · 하역 완료가 아니다). 신청구분(최초 · 변경 · 최종)과
   * 받은 시각 기준 지난/앞(PAST · FUTURE)을 함께 둔다 — 실제 응답에 받은 시각보다 뒤인 신고가 있다(2026-10-22 live)
   */
  arrival: { at: Instant; tzAssumed: boolean; relativeToReceived: 'PAST' | 'FUTURE'; detailIndex: number; requestKind: string | null } | null;
  departureAt: Instant | null;
  /** `code` 는 CERA 코드 모양(`<시설>_<서브>`)일 때만. 실제 응답에는 `*` 로 시작하는 비표준 시설 코드가 있다(2026-10-22 live) — 그때는 코드 null + 원래 코드 */
  berth: { code: string | null; rawCode: string; name: string | null; detailIndex: number } | null;
  /** 수입(입항) 적하목록관리번호 */
  importManifestNo: string | null;
}

const KEY = /^[0-9]{3}$/;
const YEAR = /^[0-9]{4}$/;
const SEQ = /^[0-9]{1,3}$/;
const CALL_SIGN = /^[A-Z0-9]{1,10}$/;
const MANIFEST = /^[A-Z0-9]{1,20}$/;

export function normalizeVesselCall(item: XmlRecord, itemIndex: number, receivedAt: Instant): { value: NormalizedVesselCall | null; issues: NormalizationIssue[] } {
  const issues: NormalizationIssue[] = [];
  const issue = (code: string) => issues.push({ item_index: itemIndex, code });
  const port = field(item, 'prtAgCd');
  const year = field(item, 'etryptYear');
  const seq = field(item, 'etryptCo');
  const callSign = field(item, 'clsgn')?.toUpperCase() ?? null;
  if (!port || !KEY.test(port) || !year || !YEAR.test(year) || !seq || !SEQ.test(seq) || !callSign || !CALL_SIGN.test(callSign)) {
    issue('VESSEL_CALL_KEY_INVALID');
    return { value: null, issues };
  }

  const details = children(item, 'details', 'detail');
  // 입항 상세: 입항 일시가 있는 것. 여러 건이면 신청구분 "최종"을, 없으면 마지막 것을 쓴다
  const arrivals = details.map((d, i) => ({ d, i })).filter(({ d }) => field(d, 'etryptDt') !== null);
  const chosen = arrivals.find(({ d }) => field(d, 'reqstSeNm') === '최종') ?? arrivals.at(-1) ?? null;
  let arrival: NormalizedVesselCall['arrival'] = null;
  let berth: NormalizedVesselCall['berth'] = null;
  let importManifestNo: string | null = null;
  if (chosen) {
    const parsed = parsePublicTime(field(chosen.d, 'etryptDt'));
    if (parsed) {
      arrival = {
        at: parsed.instant,
        tzAssumed: parsed.tzAssumed,
        relativeToReceived: parsed.instant.isAfter(receivedAt) ? 'FUTURE' : 'PAST',
        detailIndex: chosen.i,
        requestKind: field(chosen.d, 'reqstSeNm'),
      };
    } else issue('ARRIVAL_TIME_UNPARSEABLE');
    const facility = field(chosen.d, 'laidupFcltyCd');
    const sub = field(chosen.d, 'laidupFcltySubCd');
    if (facility) {
      const code = [facility, sub].filter(Boolean).join('_').toUpperCase();
      const name = field(chosen.d, 'laidupFcltyNm');
      const standard = /^[A-Z0-9][A-Z0-9_]*$/.test(code);
      // 비표준 코드(예: `*` 시작 — 조선소 · 묘박지 등)는 코드를 지어내지 않고 이름으로만 남긴다
      if (standard || name) berth = { code: standard ? code : null, rawCode: code.slice(0, 20), name, detailIndex: chosen.i };
      if (!standard) issue('BERTH_CODE_NONSTANDARD');
    }
    const mr = field(chosen.d, 'mrNum')?.toUpperCase() ?? null;
    if (mr && MANIFEST.test(mr)) importManifestNo = mr;
  }
  const departureText = details.map((d) => field(d, 'tkoffDt')).find((v) => v !== null) ?? null;
  const departureAt = parsePublicTime(departureText)?.instant ?? null;

  return {
    value: {
      itemIndex,
      portAuthorityCode: port,
      callYear: Number(year),
      callSeq: seq.padStart(3, '0'),
      callSign,
      vesselName: field(item, 'vsslNm')?.slice(0, 40) ?? null,
      vesselKind: field(item, 'vsslKndNm'),
      arrival,
      departureAt,
      berth,
      importManifestNo,
    },
    issues,
  };
}
