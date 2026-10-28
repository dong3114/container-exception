import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { RequirePermission } from '../auth/auth.decorators.js';
import { PLAN_ACTOR_HEADER } from './recovery-plan.service.js';
import { type ImportReport, PlanningInputService } from './planning-input.service.js';

const ERROR_SCHEMA = { $ref: '#/components/schemas/ErrorResponse' };
const ACTOR = { name: 'X-CERA-Actor-Id', required: true, description: 'Operator (active HUMAN actor). In session mode the backend sets it from the session', schema: { type: 'string' as const, format: 'uuid' } };
const RUN_ID = { name: 'runId', required: true, schema: { type: 'string' as const, format: 'uuid' } };
const OBJ = { type: 'object' as const, additionalProperties: true };

export class CreateLiveRunRequestDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Idempotency: the same command id returns the same run' })
  command_id!: string;

  @ApiPropertyOptional({ type: String, maxLength: 200 })
  note?: string;
}

export class LiveRunDto {
  @ApiProperty({ type: String, format: 'uuid' })
  recovery_run_id!: string;

  @ApiProperty({ type: String, example: '2026-10-27', description: 'Plan day = the Asia/Seoul date of the run time' })
  plan_day!: string;

  @ApiProperty({ type: Boolean })
  created!: boolean;

  @ApiProperty({ enum: ['LIVE'] })
  mode!: 'LIVE';
}

export class PlanningInputImportRequestDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Idempotency: the same command id + the same content returns the same batch; different content → 409' })
  command_id!: string;

  @ApiPropertyOptional({ type: Boolean, description: 'Validate only — report valid / invalid rows and what would change; nothing is stored' })
  dry_run?: boolean;

  @ApiPropertyOptional({ type: String, description: 'CSV text, first line = column names (at most 512 KB · 2000 rows). Give csv or rows' })
  csv?: string;

  @ApiPropertyOptional({ type: 'array', items: OBJ, description: 'Rows as objects with the same column names as the CSV' })
  rows?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: String, maxLength: 100, description: 'Operator label (e.g. "TMS export 10/27"). A file name is never trusted or stored' })
  source_label?: string;
}

export class RowErrorDto {
  @ApiProperty({ type: Number, description: 'CSV line (header = 1) or row index; 0 = the whole input' })
  row!: number;

  @ApiProperty({ type: String, nullable: true })
  column!: string | null;

  @ApiProperty({ type: String, example: 'INVALID_CONTAINER_NO' })
  code!: string;

  @ApiProperty({ type: String })
  message!: string;
}

export class ImportChangesDto {
  @ApiProperty({ type: Number })
  new!: number;

  @ApiProperty({ type: Number, description: 'A new version supersedes the current one (nothing is deleted)' })
  changed!: number;

  @ApiProperty({ type: Number })
  unchanged!: number;
}

export class PlanningInputImportReportDto {
  @ApiProperty({ enum: ['CONTAINERS', 'RATES', 'FACILITY_PROFILES'] })
  kind!: ImportReport['kind'];

  @ApiProperty({ type: Boolean })
  dry_run!: boolean;

  @ApiProperty({ type: Boolean, description: 'false for a dry run or when any row is invalid (one batch is stored all-or-nothing)' })
  stored!: boolean;

  @ApiProperty({ type: Boolean })
  replayed!: boolean;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  batch_id!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  recovery_run_id!: string | null;

  @ApiProperty({ type: String })
  content_hash!: string;

  @ApiProperty({ type: Number })
  row_count!: number;

  @ApiProperty({ type: Number })
  valid_rows!: number;

  @ApiProperty({ type: Number })
  invalid_rows!: number;

  @ApiProperty({ type: ImportChangesDto })
  changes!: ImportChangesDto;

  @ApiProperty({ type: [RowErrorDto] })
  errors!: RowErrorDto[];

  @ApiProperty({ type: String })
  note!: string;
}

const IMPORT_ERRORS = [
  ApiBadRequestResponse({ description: 'INVALID_IMPORT_REQUEST · ACTOR_REQUIRED · INVALID_ID', schema: ERROR_SCHEMA }),
  ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED · PERMISSION_DENIED', schema: ERROR_SCHEMA }),
  ApiConflictResponse({ description: 'COMMAND_ID_REUSED · NOT_A_LIVE_RUN', schema: ERROR_SCHEMA }),
  ApiUnprocessableEntityResponse({ description: 'INVALID_PLANNING_INPUT — details = the report with row errors; nothing stored', schema: ERROR_SCHEMA }),
];
const apply = (...ds: MethodDecorator[]): MethodDecorator => (t, k, d) => {
  for (const x of ds) x(t, k, d);
};

/**
 * 실제 계획 입력(T-123) — 공공데이터로 얻을 수 없는 기업 내부 운영 정보를 사람이 넣는 길. 화면 없이 API 만으로 끝까지 된다:
 * 실제 실행 만들기 → 시설 계획 정보 · 요율 · 컨테이너 입력(검증만 또는 저장) → 그날 수용량 · 트럭 가용은 Truth 직접 입력
 * → `GET /planning/runs/:runId/input-readiness` → `POST /planning/runs/:runId/plans`(같은 Cost Engine · Solver).
 * 시간에 따라 바뀌는 값은 여기서 받지 않는다(Truth 사실). 값을 추정 · 기본값으로 채우지 않는다.
 */
@ApiTags('planning')
@Controller('planning')
export class PlanningInputController {
  constructor(@Inject(PlanningInputService) private readonly inputs: PlanningInputService) {}

  @RequirePermission('planning.input')
  @Post('runs')
  @HttpCode(200)
  @ApiOperation({ summary: 'Open a live (non-simulated) recovery run: run time = now, plan day = its Asia/Seoul date. Its inputs come only from operational records and Truth — never from a scenario pack' })
  @ApiHeader(ACTOR)
  @ApiBody({ type: CreateLiveRunRequestDto })
  @ApiOkResponse({ type: LiveRunDto })
  @ApiBadRequestResponse({ description: 'INVALID_RUN_REQUEST · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED · PERMISSION_DENIED', schema: ERROR_SCHEMA })
  createRun(@Headers(PLAN_ACTOR_HEADER) actor: string | undefined, @Body() body: unknown) {
    return this.inputs.createLiveRun(actor, body);
  }

  @RequirePermission('planning.input')
  @Post('inputs/containers')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Operational baseline containers (T-132) — the planned inbound that belongs to no recovery run yet. Same columns and versioning as run containers. The exception detector compares it with warehouse capacity facts and opens recovery runs itself',
  })
  @ApiHeader(ACTOR)
  @ApiBody({ type: PlanningInputImportRequestDto })
  @ApiOkResponse({ type: PlanningInputImportReportDto })
  @apply(...IMPORT_ERRORS)
  importBaselineContainers(@Headers(PLAN_ACTOR_HEADER) actor: string | undefined, @Body() body: unknown) {
    return this.inputs.importBaselineContainers(actor, body);
  }

  @Get('inputs/containers')
  @ApiOperation({ summary: 'Operational baseline containers — current versions (T-132)' })
  baselineContainers() {
    return this.inputs.baselineContainers();
  }

  @RequirePermission('planning.input')
  @Post('runs/:runId/inputs/containers')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Containers of a live run (CSV or rows): container_no · size_type · carrier · pickup_ready · terminal · destination (warehouse id or name) · planned_day · [priority · lfd · planned_depart_hour · alternate_destination_allowed · status]. A changed row is a new version; nothing is deleted',
  })
  @ApiParam(RUN_ID)
  @ApiHeader(ACTOR)
  @ApiBody({ type: PlanningInputImportRequestDto })
  @ApiOkResponse({ type: PlanningInputImportReportDto })
  @ApiNotFoundResponse({ description: 'NOT_FOUND', schema: ERROR_SCHEMA })
  @apply(...IMPORT_ERRORS)
  importContainers(@Param('runId') runId: string, @Headers(PLAN_ACTOR_HEADER) actor: string | undefined, @Body() body: unknown) {
    return this.inputs.importContainers(runId, actor, body);
  }

  @Get('runs/:runId/inputs/containers')
  @ApiOperation({ summary: 'Current container records of a live run (latest version of each, including withdrawn)' })
  @ApiParam(RUN_ID)
  @ApiOkResponse({ schema: OBJ })
  containers(@Param('runId') runId: string) {
    return this.inputs.containers(runId);
  }

  @RequirePermission('planning.input')
  @Post('inputs/rates')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Contract rates (CSV or rows): rate_type (DEMURRAGE_PER_DAY · TERMINAL_STORAGE_PER_DAY · DETENTION_FREE_DAYS · TRANSPORT · ODCY_HANDLING_IN_OUT · ODCY_STORAGE_PER_DAY) · amount (KRW integer, DAY for detention) · effective_from · source_note · [carrier · from · to · size_type · effective_until · status]. A missing rate stays missing — never 0',
  })
  @ApiHeader(ACTOR)
  @ApiBody({ type: PlanningInputImportRequestDto })
  @ApiOkResponse({ type: PlanningInputImportReportDto })
  @apply(...IMPORT_ERRORS)
  importRates(@Headers(PLAN_ACTOR_HEADER) actor: string | undefined, @Body() body: unknown) {
    return this.inputs.importRates(actor, body);
  }

  @Get('inputs/rates')
  @ApiOperation({ summary: 'Current rate records (latest version of each rate and effective period)' })
  @ApiOkResponse({ schema: OBJ })
  rates() {
    return this.inputs.rates();
  }

  @RequirePermission('planning.input')
  @Post('inputs/facility-profiles')
  @HttpCode(200)
  @ApiOperation({ summary: 'Facility planning profiles (CSV or rows): facility · accepts (e.g. 20DRY|40DRY) · open_from_hour · last_departure_hour · trip_hours · [max_storage_days · status]. Daily capacity is a Truth fact, not a profile' })
  @ApiHeader(ACTOR)
  @ApiBody({ type: PlanningInputImportRequestDto })
  @ApiOkResponse({ type: PlanningInputImportReportDto })
  @apply(...IMPORT_ERRORS)
  importProfiles(@Headers(PLAN_ACTOR_HEADER) actor: string | undefined, @Body() body: unknown) {
    return this.inputs.importProfiles(actor, body);
  }

  @Get('inputs/facility-profiles')
  @ApiOperation({ summary: 'Current facility planning profiles' })
  @ApiOkResponse({ schema: OBJ })
  profiles() {
    return this.inputs.profiles();
  }

  @Get('inputs/batches/:batchId')
  @ApiOperation({ summary: 'One input batch: who, when, source, row / accepted / unchanged counts' })
  @ApiParam({ name: 'batchId', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ schema: OBJ })
  @ApiNotFoundResponse({ description: 'NOT_FOUND', schema: ERROR_SCHEMA })
  batch(@Param('batchId') batchId: string) {
    return this.inputs.batch(batchId);
  }
}
