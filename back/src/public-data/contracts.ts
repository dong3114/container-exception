/**
 * Public Data capability 계약(T-102). 이 모양을 T-103 이 Agent Tool(`get_vessel_calls` · `get_container_manifest`)로 감싼다.
 * Agent · AI Server 는 data.go.kr 을 직접 부르지 않는다 — Tool → 이 서비스 → 어댑터 순서다(ADR-036 결정 3).
 *
 * 여기 값은 **공공 API 의 최신 관측**이지 CERA 의 현재 사실이 아니다(규칙 2). 현재 사실은 사건을 Reconciliation(T-093)해서 만든다.
 * 모든 결과에 provenance 가 붙는다: 어느 호출의 어느 원문에서 왔는가, 실제 호출인가 녹화 재생인가.
 */

export const BUSAN_PORT_AUTHORITY_CODE = '020';

export type PublicDataMode = 'LIVE' | 'REPLAY';
export type PublicDataDataset = 'MOF_VESSEL_CALL' | 'MOF_CONTAINER_MANIFEST';
export type FetchOutcome = 'SUCCESS' | 'NO_DATA' | 'UPSTREAM_ERROR' | 'TRANSPORT_ERROR' | 'PARSE_ERROR';

/** 입항 건 조회 조건. 날짜는 Asia/Seoul 달력 날짜(YYYY-MM-DD) — DS-03 `sde` · `ede`. */
export interface VesselCallSearch {
  from: string;
  to: string;
  /** 호출부호(선박 하나만) */
  callSign?: string | null;
}

/** 원문 하나의 출처. 값마다 어느 호출 · 어느 원문에서 왔는지 되짚을 수 있어야 한다. */
export interface Provenance {
  source_type: 'PUBLIC_API';
  provider: 'DATA_GO_KR';
  dataset: PublicDataDataset;
  mode: PublicDataMode;
  /** REPLAY = 마스킹 · 합성 fixture(시뮬레이션). LIVE = 실제 공공 API 응답 */
  is_simulated: boolean;
  result_kind: 'PUBLIC_DATA' | 'SCENARIO_RESULT';
  fetch_id: string;
  raw_input_id: string;
  payload_hash: string;
  requested_at: string;
  received_at: string;
}

export interface FetchPage {
  fetch_id: string;
  page_no: number;
  outcome: FetchOutcome;
  http_status: number | null;
  result_code: string | null;
  item_count: number | null;
  raw_input_id: string | null;
}

export interface NormalizationIssue {
  /** 페이지 안 item 순번(0부터), 원문 전체 문제면 null */
  item_index: number | null;
  code: string;
}

export interface FetchSummary {
  dataset: PublicDataDataset;
  mode: PublicDataMode;
  outcome: FetchOutcome;
  total_count: number | null;
  pages: FetchPage[];
  /** 상한(CERA_PUBLIC_DATA_MAX_PAGES) 때문에 다 받지 못했으면 true */
  truncated: boolean;
  issues: NormalizationIssue[];
}

export interface PublicObservation<T> {
  value: T;
  event_id: string;
  provenance: Provenance;
}

export interface VesselCallView {
  vessel_call_id: string;
  port_authority_code: string;
  call_year: number;
  /** 입항횟수 — 원천 표기(0 채움 3자리) */
  call_seq: string;
  call_sign: string;
  vessel_name: string | null;
  is_simulated: boolean;
  /** 입항 **신고** 일시(최신 관측) — 실제 접안 · 하역 완료가 아니다. 신청구분 · 받은 시각 기준 지난/앞 */
  declared_arrival: PublicObservation<{ at: string; request_kind: string | null; relative_to_received: 'PAST' | 'FUTURE' }> | null;
  /** 코드가 비표준이면 code = null, 이름만(원래 코드는 사건 payload) */
  latest_berth: PublicObservation<{ code: string | null; name: string | null }> | null;
  manifest_no: string | null;
  container_count: number;
  registered_from: Provenance;
}

export interface ManifestContainerView {
  container_id: string;
  container_no: string;
  /** CERA 장비 분류(20DRY · 40DRY · 40HC · 20RF · 40RF · OTHER) */
  size_type: string | null;
  /** 원천 ISO 6346 규격 코드(예: 22G1) — 최신 관측 */
  iso_size_type: string | null;
  bl_no: string | null;
  bl_type: 'MASTER' | 'HOUSE' | 'UNKNOWN' | null;
  msn: string | null;
  check_digit_valid: boolean;
  is_simulated: boolean;
  registered_from: Provenance;
}

export interface VesselCallFetchResult {
  summary: FetchSummary;
  vessel_calls: VesselCallView[];
}

export interface ManifestFetchResult {
  summary: FetchSummary;
  vessel_call: VesselCallView;
  containers: ManifestContainerView[];
}
