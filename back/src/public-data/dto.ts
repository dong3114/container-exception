import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PUBLIC_DATA_DATASET, PUBLIC_DATA_MODE, PUBLIC_DATA_OUTCOME } from '../db/schema/codes.js';

/**
 * 공공데이터 개발 API 계약(T-102 — OpenAPI 정본, ADR-028). JSON 은 snake_case, 시각은 +09:00.
 * 값은 **공공 API 의 최신 관측**이고 CERA 현재 사실이 아니다. 모든 값에 provenance 가 붙는다.
 * 모든 속성에 type 을 명시한다(tsx 는 decorator metadata 를 만들지 않는다 — docs/24 18.3 U2-3).
 */

export class FetchVesselCallsRequestDto {
  @ApiProperty({ type: String, format: 'date', description: 'Search start (Asia/Seoul calendar date, arrival basis)', example: '2026-10-20' })
  from!: string;

  @ApiProperty({ type: String, format: 'date', description: 'Search end (inclusive, at most 31 days after from)', example: '2026-10-21' })
  to!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Call sign — one vessel only', example: 'D7AB1' })
  call_sign?: string | null;
}

export class ProvenanceDto {
  @ApiProperty({ type: String, enum: ['PUBLIC_API'] })
  source_type!: 'PUBLIC_API';

  @ApiProperty({ type: String, enum: ['DATA_GO_KR'] })
  provider!: 'DATA_GO_KR';

  @ApiProperty({ type: String, enum: PUBLIC_DATA_DATASET })
  dataset!: (typeof PUBLIC_DATA_DATASET)[number];

  @ApiProperty({ type: String, enum: PUBLIC_DATA_MODE, description: 'LIVE = real public API response · REPLAY = synthetic / masked fixture' })
  mode!: (typeof PUBLIC_DATA_MODE)[number];

  @ApiProperty({ type: Boolean })
  is_simulated!: boolean;

  @ApiProperty({ type: String, enum: ['PUBLIC_DATA', 'SCENARIO_RESULT'] })
  result_kind!: 'PUBLIC_DATA' | 'SCENARIO_RESULT';

  @ApiProperty({ type: String, format: 'uuid' })
  fetch_id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  raw_input_id!: string;

  @ApiProperty({ type: String, pattern: '^sha256:[0-9a-f]{64}$' })
  payload_hash!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  requested_at!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  received_at!: string;
}

export class ArrivalValueDto {
  @ApiProperty({ type: String, format: 'date-time', description: 'Declared arrival time (port entry declaration) — not a confirmed berthing or discharge' })
  at!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Declaration stage as the source writes it (e.g. 최초 · 변경 · 최종)' })
  request_kind!: string | null;

  @ApiProperty({ type: String, enum: ['PAST', 'FUTURE'], description: 'Whether the declared time was before or after the moment CERA received it' })
  relative_to_received!: 'PAST' | 'FUTURE';
}

export class ArrivalObservationDto {
  @ApiProperty({ type: ArrivalValueDto })
  value!: ArrivalValueDto;

  @ApiProperty({ type: String, format: 'uuid' })
  event_id!: string;

  @ApiProperty({ type: ProvenanceDto })
  provenance!: ProvenanceDto;
}

export class BerthValueDto {
  @ApiProperty({ type: String, nullable: true, example: 'MBR_E2', description: 'Null when the source facility code is non-standard (e.g. starts with *) — the name is kept' })
  code!: string | null;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;
}

export class BerthObservationDto {
  @ApiProperty({ type: BerthValueDto })
  value!: BerthValueDto;

  @ApiProperty({ type: String, format: 'uuid' })
  event_id!: string;

  @ApiProperty({ type: ProvenanceDto })
  provenance!: ProvenanceDto;
}

export class VesselCallDto {
  @ApiProperty({ type: String, format: 'uuid' })
  vessel_call_id!: string;

  @ApiProperty({ type: String, example: '020' })
  port_authority_code!: string;

  @ApiProperty({ type: Number })
  call_year!: number;

  @ApiProperty({ type: String, example: '003', description: 'Call sequence as the source writes it (zero padded)' })
  call_seq!: string;

  @ApiProperty({ type: String })
  call_sign!: string;

  @ApiProperty({ type: String, nullable: true })
  vessel_name!: string | null;

  @ApiProperty({ type: Boolean })
  is_simulated!: boolean;

  @ApiProperty({ type: ArrivalObservationDto, nullable: true })
  declared_arrival!: ArrivalObservationDto | null;

  @ApiProperty({ type: BerthObservationDto, nullable: true })
  latest_berth!: BerthObservationDto | null;

  @ApiProperty({ type: String, nullable: true, description: 'Import manifest number (MOF)' })
  manifest_no!: string | null;

  @ApiProperty({ type: Number })
  container_count!: number;

  @ApiProperty({ type: ProvenanceDto })
  registered_from!: ProvenanceDto;
}

export class ManifestContainerDto {
  @ApiProperty({ type: String, format: 'uuid' })
  container_id!: string;

  @ApiProperty({ type: String, example: 'ZZZU0000017' })
  container_no!: string;

  @ApiProperty({ type: String, nullable: true, enum: ['20DRY', '40DRY', '40HC', '20RF', '40RF', 'OTHER'] })
  size_type!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '22G1' })
  iso_size_type!: string | null;

  @ApiProperty({ type: String, nullable: true })
  bl_no!: string | null;

  @ApiProperty({ type: String, nullable: true, enum: ['MASTER', 'HOUSE', 'UNKNOWN'] })
  bl_type!: 'MASTER' | 'HOUSE' | 'UNKNOWN' | null;

  @ApiProperty({ type: String, nullable: true })
  msn!: string | null;

  @ApiProperty({ type: Boolean, description: 'ISO 6346 check digit' })
  check_digit_valid!: boolean;

  @ApiProperty({ type: Boolean })
  is_simulated!: boolean;

  @ApiProperty({ type: ProvenanceDto })
  registered_from!: ProvenanceDto;
}

export class FetchPageDto {
  @ApiProperty({ type: String, format: 'uuid' })
  fetch_id!: string;

  @ApiProperty({ type: Number })
  page_no!: number;

  @ApiProperty({ type: String, enum: PUBLIC_DATA_OUTCOME })
  outcome!: (typeof PUBLIC_DATA_OUTCOME)[number];

  @ApiProperty({ type: Number, nullable: true })
  http_status!: number | null;

  @ApiProperty({ type: String, nullable: true })
  result_code!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  item_count!: number | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  raw_input_id!: string | null;
}

export class NormalizationIssueDto {
  @ApiProperty({ type: Number, nullable: true })
  item_index!: number | null;

  @ApiProperty({ type: String, example: 'CONTAINER_CHECK_DIGIT_MISMATCH' })
  code!: string;
}

export class FetchSummaryDto {
  @ApiProperty({ type: String, enum: PUBLIC_DATA_DATASET })
  dataset!: (typeof PUBLIC_DATA_DATASET)[number];

  @ApiProperty({ type: String, enum: PUBLIC_DATA_MODE })
  mode!: (typeof PUBLIC_DATA_MODE)[number];

  @ApiProperty({ type: String, enum: PUBLIC_DATA_OUTCOME })
  outcome!: (typeof PUBLIC_DATA_OUTCOME)[number];

  @ApiProperty({ type: Number, nullable: true })
  total_count!: number | null;

  @ApiProperty({ type: [FetchPageDto] })
  pages!: FetchPageDto[];

  @ApiProperty({ type: Boolean, description: 'Stopped at CERA_PUBLIC_DATA_MAX_PAGES before all rows' })
  truncated!: boolean;

  @ApiProperty({ type: [NormalizationIssueDto] })
  issues!: NormalizationIssueDto[];
}

export class VesselCallFetchResultDto {
  @ApiProperty({ type: FetchSummaryDto })
  summary!: FetchSummaryDto;

  @ApiProperty({ type: [VesselCallDto] })
  vessel_calls!: VesselCallDto[];
}

export class ManifestFetchResultDto {
  @ApiProperty({ type: FetchSummaryDto })
  summary!: FetchSummaryDto;

  @ApiProperty({ type: VesselCallDto })
  vessel_call!: VesselCallDto;

  @ApiProperty({ type: [ManifestContainerDto] })
  containers!: ManifestContainerDto[];
}

export class VesselCallListDto {
  @ApiProperty({ type: [VesselCallDto] })
  vessel_calls!: VesselCallDto[];
}

export class VesselCallDetailDto {
  @ApiProperty({ type: VesselCallDto })
  vessel_call!: VesselCallDto;

  @ApiProperty({ type: [ManifestContainerDto] })
  containers!: ManifestContainerDto[];
}

export class FetchLedgerEntryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  fetch_id!: string;

  @ApiProperty({ type: String, enum: PUBLIC_DATA_DATASET })
  dataset!: (typeof PUBLIC_DATA_DATASET)[number];

  @ApiProperty({ type: String })
  operation!: string;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' }, description: 'Safe request parameters (never the service key)' })
  request_params!: Record<string, string>;

  @ApiProperty({ type: Number })
  page_no!: number;

  @ApiProperty({ type: String, enum: PUBLIC_DATA_MODE })
  mode!: (typeof PUBLIC_DATA_MODE)[number];

  @ApiProperty({ type: String, format: 'date-time' })
  requested_at!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  received_at!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  http_status!: number | null;

  @ApiProperty({ type: String, nullable: true })
  result_code!: string | null;

  @ApiProperty({ type: String, enum: PUBLIC_DATA_OUTCOME })
  outcome!: (typeof PUBLIC_DATA_OUTCOME)[number];

  @ApiProperty({ type: Number, nullable: true })
  total_count!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  item_count!: number | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  raw_input_id!: string | null;

  @ApiProperty({ type: Boolean })
  is_simulated!: boolean;
}

export class FetchLedgerDto {
  @ApiProperty({ type: [FetchLedgerEntryDto] })
  fetches!: FetchLedgerEntryDto[];
}

export class PublicDataDatasetStatusDto {
  @ApiProperty({ type: String, enum: PUBLIC_DATA_DATASET })
  dataset!: (typeof PUBLIC_DATA_DATASET)[number];

  @ApiProperty({ type: String })
  operation!: string;

  @ApiProperty({ type: Boolean, description: 'Callable now (key configured for LIVE, fixtures present for REPLAY)' })
  available!: boolean;
}

export class PublicDataStatusDto {
  @ApiProperty({ type: String, enum: ['OFF', 'REPLAY', 'LIVE'] })
  mode!: 'OFF' | 'REPLAY' | 'LIVE';

  @ApiProperty({ type: Number })
  max_pages!: number;

  @ApiProperty({ type: [PublicDataDatasetStatusDto] })
  datasets!: PublicDataDatasetStatusDto[];
}
