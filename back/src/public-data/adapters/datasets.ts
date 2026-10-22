import type { PublicDataDataset } from '../contracts.js';

/**
 * 데이터셋별 고정 정보(2026-10-22 공식 포털 · 가이드 재확인 — docs/tasks/plans/T-101 7.1 · field-dictionary 3 · 4.2).
 * 페이지당 최대 50행(두 데이터셋 공통). 인증키는 여기 없다(전송 구현만 안다).
 */
export interface DatasetSpec {
  dataset: PublicDataDataset;
  provider: 'DATA_GO_KR';
  baseUrl: string;
  operation: string;
  /** raw_input.source_name — 출처 이름(원문 묶음 키) */
  sourceName: string;
  pageSize: number;
}

export const DS03_VESSEL_CALL: DatasetSpec = {
  dataset: 'MOF_VESSEL_CALL',
  provider: 'DATA_GO_KR',
  baseUrl: 'https://apis.data.go.kr',
  operation: '1192000/VsslEtrynd5/Info5',
  sourceName: 'DATA_GO_KR/MOF_VESSEL_CALL',
  pageSize: 50,
};

export const DS02_CONTAINER_MANIFEST: DatasetSpec = {
  dataset: 'MOF_CONTAINER_MANIFEST',
  provider: 'DATA_GO_KR',
  baseUrl: 'https://apis.data.go.kr',
  operation: '1192000/CargFrghtContnOut/ContnInfo',
  sourceName: 'DATA_GO_KR/MOF_CONTAINER_MANIFEST',
  pageSize: 50,
};

/** DS-03 조회 조건(안전한 표현 — 키 없음). 날짜는 YYYYMMDD. 입항일 기준(deGb=I). */
export function vesselCallParams(input: { portAuthorityCode: string; sde: string; ede: string; callSign: string | null; pageNo: number }): Record<string, string> {
  return {
    prtAgCd: input.portAuthorityCode,
    sde: input.sde,
    ede: input.ede,
    deGb: 'I',
    ...(input.callSign ? { clsgn: input.callSign } : {}),
    numOfRows: String(DS03_VESSEL_CALL.pageSize),
    pageNo: String(input.pageNo),
  };
}

/** DS-02 조회 조건 — 입항 건 키 4개(B/L · 컨테이너 번호로는 조회할 수 없다). */
export function containerManifestParams(input: { portAuthorityCode: string; callYear: number; callSeq: string; callSign: string; pageNo: number }): Record<string, string> {
  return {
    prtAgCd: input.portAuthorityCode,
    etryptYear: String(input.callYear),
    etryptCo: input.callSeq,
    clsgn: input.callSign,
    numOfRows: String(DS02_CONTAINER_MANIFEST.pageSize),
    pageNo: String(input.pageNo),
  };
}

/** raw_input.request_ref — 사람이 읽는 요청 표현(키 없음, 300자 이내). */
export function requestRef(spec: DatasetSpec, params: Readonly<Record<string, string>>): string {
  const q = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return `${spec.operation}?${q}`.slice(0, 300);
}
