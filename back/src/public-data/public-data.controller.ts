import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
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
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { z } from 'zod';
import { ValidationError } from '../shared/errors/cera-error.js';
import {
  FetchLedgerDto,
  FetchVesselCallsRequestDto,
  ManifestFetchResultDto,
  PublicDataStatusDto,
  VesselCallDetailDto,
  VesselCallFetchResultDto,
  VesselCallListDto,
} from './dto.js';
import { PublicDataService } from './public-data.service.js';

const ERROR_SCHEMA = { $ref: '#/components/schemas/ErrorResponse' };
const ACTOR = {
  name: 'X-CERA-Actor-Id',
  required: true,
  description: 'Operator who triggers the public API call (active HUMAN actor). Development stand-in until authentication exists.',
  schema: { type: 'string' as const, format: 'uuid' },
};
const VESSEL_CALL_ID = { name: 'vesselCallId', required: true, schema: { type: 'string' as const, format: 'uuid' } };
const LIMIT = { name: 'limit', required: false, schema: { type: 'integer' as const, minimum: 1, maximum: 200, default: 50 } };

const fetchBody = z.object({ from: z.string(), to: z.string(), call_sign: z.string().max(10).nullish() }).strict();
const uuid = z.string().uuid();

function parseLimit(value: string | undefined): number {
  if (value === undefined) return 50;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 200) throw new ValidationError('INVALID_LIMIT', 'limit must be an integer between 1 and 200', ['limit']);
  return n;
}

function parseId(value: string, field: string): string {
  if (!uuid.safeParse(value).success) throw new ValidationError('INVALID_ID', `${field} must be a UUID`, [field]);
  return value;
}

/**
 * 공공데이터 개발 API(T-102). 부산 입항 건(DS-03) · 적하목록 컨테이너(DS-02).
 * 호출은 Backend 어댑터만 한다 — Agent · 브라우저 · AI Server 는 data.go.kr 을 직접 부르지 않는다(ADR-036).
 * 돌려주는 값은 공공 API 의 최신 관측이고 CERA 현재 사실이 아니다. 모든 값에 provenance 가 붙는다.
 */
@ApiTags('public-data')
@Controller('public-data')
export class PublicDataController {
  constructor(@Inject(PublicDataService) private readonly publicData: PublicDataService) {}

  @Get('status')
  @ApiOperation({ summary: 'Public data mode (OFF · REPLAY · LIVE) and which datasets are callable now — never shows keys' })
  @ApiOkResponse({ type: PublicDataStatusDto })
  status(): PublicDataStatusDto {
    return this.publicData.status();
  }

  @Post('vessel-calls/fetch')
  @HttpCode(200)
  @ApiOperation({ summary: 'DS-03: fetch Busan vessel calls for a date range (arrival basis), keep the raw response, register vessel calls and record PUBLIC_API events' })
  @ApiHeader(ACTOR)
  @ApiBody({ type: FetchVesselCallsRequestDto })
  @ApiOkResponse({ type: VesselCallFetchResultDto })
  @ApiBadRequestResponse({ description: 'INVALID_DATE · INVALID_DATE_RANGE · INVALID_CALL_SIGN · ACTOR_REQUIRED · INVALID_REQUEST', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED', schema: ERROR_SCHEMA })
  @ApiConflictResponse({ description: 'PUBLIC_DATA_DISABLED · PUBLIC_DATA_KEY_MISSING · PUBLIC_DATA_REPLAY_UNAVAILABLE', schema: ERROR_SCHEMA })
  @ApiUnprocessableEntityResponse({ description: 'REPLAY_FIXTURE_NOT_FOUND', schema: ERROR_SCHEMA })
  fetchVesselCalls(@Body() body: unknown, @Headers('x-cera-actor-id') actor: string | undefined): Promise<VesselCallFetchResultDto> {
    const parsed = fetchBody.safeParse(body);
    if (!parsed.success) throw new ValidationError('INVALID_REQUEST', 'Body must be { from, to, call_sign? }', parsed.error.issues.map((i) => i.path.join('.')));
    return this.publicData.fetchVesselCalls({ from: parsed.data.from, to: parsed.data.to, callSign: parsed.data.call_sign ?? null }, actor);
  }

  @Post('vessel-calls/:vesselCallId/manifest/fetch')
  @HttpCode(200)
  @ApiOperation({ summary: 'DS-02: fetch the import container manifest of one registered vessel call (B/L ↔ container · ISO size type)' })
  @ApiParam(VESSEL_CALL_ID)
  @ApiHeader(ACTOR)
  @ApiOkResponse({ type: ManifestFetchResultDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'VESSEL_CALL_NOT_FOUND', schema: ERROR_SCHEMA })
  @ApiConflictResponse({ description: 'PUBLIC_DATA_DISABLED · PUBLIC_DATA_KEY_MISSING · PUBLIC_DATA_REPLAY_UNAVAILABLE · PUBLIC_DATA_SIMULATION_MISMATCH', schema: ERROR_SCHEMA })
  @ApiUnprocessableEntityResponse({ description: 'REPLAY_FIXTURE_NOT_FOUND', schema: ERROR_SCHEMA })
  fetchManifest(@Param('vesselCallId') vesselCallId: string, @Headers('x-cera-actor-id') actor: string | undefined): Promise<ManifestFetchResultDto> {
    return this.publicData.fetchContainerManifest(parseId(vesselCallId, 'vesselCallId'), actor);
  }

  @Get('vessel-calls')
  @ApiOperation({ summary: 'Registered vessel calls with their latest public observations (not reconciled current facts)' })
  @ApiQuery(LIMIT)
  @ApiOkResponse({ type: VesselCallListDto })
  @ApiBadRequestResponse({ description: 'INVALID_LIMIT', schema: ERROR_SCHEMA })
  async listVesselCalls(@Query('limit') limit: string | undefined): Promise<VesselCallListDto> {
    return { vessel_calls: await this.publicData.listVesselCalls(parseLimit(limit)) };
  }

  @Get('vessel-calls/:vesselCallId')
  @ApiOperation({ summary: 'One vessel call and its manifest containers, each with provenance' })
  @ApiParam(VESSEL_CALL_ID)
  @ApiOkResponse({ type: VesselCallDetailDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'VESSEL_CALL_NOT_FOUND', schema: ERROR_SCHEMA })
  vesselCall(@Param('vesselCallId') vesselCallId: string): Promise<VesselCallDetailDto> {
    return this.publicData.vesselCallDetail(parseId(vesselCallId, 'vesselCallId'));
  }

  @Get('fetches')
  @ApiOperation({ summary: 'Public API call ledger — what was asked, when, and what came back (including failures). No keys.' })
  @ApiQuery(LIMIT)
  @ApiOkResponse({ type: FetchLedgerDto })
  @ApiBadRequestResponse({ description: 'INVALID_LIMIT', schema: ERROR_SCHEMA })
  async fetches(@Query('limit') limit: string | undefined): Promise<FetchLedgerDto> {
    return { fetches: (await this.publicData.fetchLedger(parseLimit(limit))) as FetchLedgerDto['fetches'] };
  }
}
