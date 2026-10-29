import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../auth/auth.decorators.js';
import { z } from 'zod';
import { ValidationError } from '../shared/errors/cera-error.js';
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
import { ConfirmFactRequestDto, CorroborationListDto, CorrectFactRequestDto, FactCoordinateDto, FactListDto, ManualFactRequestDto, RejectFactRequestDto, RevokeFactRequestDto } from './dto.js';
import { FACT_ACTOR_HEADER, FactActionService } from './fact-actions.service.js';
import { TruthQueryService } from './truth-query.service.js';
import { CorroborationService } from './corroboration.service.js';

const ERROR_SCHEMA = { $ref: '#/components/schemas/ErrorResponse' };
const AS_OF = { name: 'as_of', required: false, schema: { type: 'string' as const }, description: 'Judge the returned coordinate at this time (ISO 8601 with offset) — pass the list evaluated_at so a replaced row matches the list. Default: now' };
const EVENT_ID = { name: 'eventId', required: true, schema: { type: 'string' as const, format: 'uuid' } };
const ACTOR = {
  name: 'X-CERA-Actor-Id',
  required: true,
  description: 'Deciding operator (active HUMAN actor). Development stand-in until authentication exists — the backend checks it. AI, agents and the system cannot confirm.',
  schema: { type: 'string' as const, format: 'uuid' },
};

/**
 * 사실(T-093): 검증된 임시 사실을 보고, 사람이 확인 · 거절 · 정정한다. 상태 전이는 Backend 만 한다 — 화면은 사건 id 와 사유만 보낸다.
 * 경로 · 헤더 · 요청 본문을 모두 명시한다(tsx 는 decorator metadata 를 만들지 않는다).
 */
@ApiTags('truth')
@Controller('truth')
export class TruthController {
  constructor(
    @Inject(TruthQueryService) private readonly query: TruthQueryService,
    @Inject(FactActionService) private readonly actions: FactActionService,
    @Inject(CorroborationService) private readonly corroborations: CorroborationService,
  ) {}

  @Get('facts')
  @ApiOperation({ summary: 'Facts a recovery run asked about: current value + state + every candidate event with its role (the AI quote, who said it, whether a human confirmed it)' })
  @ApiQuery({ name: 'recovery_run_id', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ type: FactListDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'RUN_NOT_FOUND', schema: ERROR_SCHEMA })
  @ApiQuery({ name: 'as_of', required: false, schema: { type: 'string' }, description: 'Judge freshness / expiry at this time (ISO 8601 with offset). Default: the plan scenario time for simulated runs, now for real ones' })
  facts(@Query('recovery_run_id') runId: string | undefined, @Query('as_of') asOf: string | undefined): Promise<FactListDto> {
    return this.query.forRun(runId, asOf);
  }

  @RequirePermission('truth.review')
  @Post('events/:eventId/revoke')
  @HttpCode(200)
  @ApiOperation({ summary: 'Withdraw a value without a replacement (a human only): it — and every older value of this fact — stops being the current fact; nothing is deleted' })
  @ApiParam(EVENT_ID)
  @ApiHeader(ACTOR)
  @ApiQuery(AS_OF)
  @ApiBody({ type: RevokeFactRequestDto })
  @ApiOkResponse({ type: FactCoordinateDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID · INVALID_FACT_REQUEST · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'EVENT_NOT_FOUND', schema: ERROR_SCHEMA })
  @ApiConflictResponse({ description: 'EVENT_SUPERSEDED · ALREADY_REJECTED', schema: ERROR_SCHEMA })
  revoke(@Param('eventId') eventId: string, @Headers(FACT_ACTOR_HEADER) actor: string | undefined, @Body() body: unknown, @Query('as_of') asOf: string | undefined): Promise<FactCoordinateDto> {
    return this.actions.revoke(eventId, actor, body, asOf);
  }

  @RequirePermission('truth.manual_entry')
  @Post('claims/partner-statement')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'T-136: record what a partner (shipping line · terminal · trucker) SAID about a publicly verifiable fact — currently the declared arrival time of a vessel call. It stays a claim (authority W → provisional), never a confirmation, and is cross-checked against the public observation (corroboration)',
  })
  @ApiHeader(ACTOR)
  @ApiOkResponse({ type: FactCoordinateDto })
  @ApiBadRequestResponse({ description: 'INVALID_FACT_REQUEST · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'TARGET_NOT_FOUND', schema: ERROR_SCHEMA })
  partnerStatement(@Headers(FACT_ACTOR_HEADER) actor: string | undefined, @Body() body: unknown): Promise<FactCoordinateDto> {
    return this.actions.enterPartnerStatement(actor, body);
  }

  @Get('corroborations')
  @ApiOperation({ summary: 'T-136: public-evidence cross-checks (MATCH · CONFLICT · NO_PUBLIC_EVIDENCE · STALE_PUBLIC_EVIDENCE · NOT_COMPARABLE) with both evidences, newest first. Decided by rules, not by an LLM' })
  @ApiQuery({ name: 'entity_id', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ type: CorroborationListDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID', schema: ERROR_SCHEMA })
  listCorroborations(@Query('entity_id') entityId?: string): Promise<CorroborationListDto> {
    if (entityId !== undefined && !z.string().uuid().safeParse(entityId).success) throw new ValidationError('INVALID_ID', 'entity_id must be a UUID', ['entity_id']);
    return this.corroborations.list({ entityIds: entityId ? [entityId] : undefined }).then((corroborations) => ({ corroborations: corroborations as CorroborationListDto['corroborations'] }));
  }

  @RequirePermission('truth.manual_entry')
  @Post('facts/manual')
  @HttpCode(200)
  @ApiOperation({ summary: 'An operator enters a fact they confirmed directly (phone, visit …) — no AI candidate. CONFIRMED at once (human input) with its source note and audit' })
  @ApiHeader(ACTOR)
  @ApiQuery(AS_OF)
  @ApiBody({ type: ManualFactRequestDto })
  @ApiOkResponse({ type: FactCoordinateDto })
  @ApiBadRequestResponse({ description: 'INVALID_FACT_REQUEST · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'TARGET_NOT_FOUND · SCENARIO_NOT_FOUND', schema: ERROR_SCHEMA })
  @ApiUnprocessableEntityResponse({ description: 'TARGET_NOT_SUPPORTED', schema: ERROR_SCHEMA })
  enter(@Headers(FACT_ACTOR_HEADER) actor: string | undefined, @Body() body: unknown, @Query('as_of') asOf: string | undefined): Promise<FactCoordinateDto> {
    return this.actions.enter(actor, body, asOf);
  }

  @RequirePermission('truth.review')
  @Post('events/:eventId/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirm a candidate value (VERIFICATION · CONFIRM by a human). The value becomes CONFIRMED; nothing else changes' })
  @ApiParam(EVENT_ID)
  @ApiHeader(ACTOR)
  @ApiQuery(AS_OF)
  @ApiBody({ type: ConfirmFactRequestDto })
  @ApiOkResponse({ type: FactCoordinateDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID · INVALID_FACT_REQUEST · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'EVENT_NOT_FOUND', schema: ERROR_SCHEMA })
  @ApiConflictResponse({ description: 'EVENT_SUPERSEDED · ALREADY_REJECTED', schema: ERROR_SCHEMA })
  confirm(@Param('eventId') eventId: string, @Headers(FACT_ACTOR_HEADER) actor: string | undefined, @Body() body: unknown, @Query('as_of') asOf: string | undefined): Promise<FactCoordinateDto> {
    return this.actions.confirm(eventId, actor, body, asOf);
  }

  @RequirePermission('truth.review')
  @Post('events/:eventId/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject a candidate value (VERIFICATION · REJECT by a human, reason required). It leaves the judgement; the event stays on record' })
  @ApiParam(EVENT_ID)
  @ApiHeader(ACTOR)
  @ApiQuery(AS_OF)
  @ApiBody({ type: RejectFactRequestDto })
  @ApiOkResponse({ type: FactCoordinateDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID · INVALID_FACT_REQUEST · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'EVENT_NOT_FOUND', schema: ERROR_SCHEMA })
  @ApiConflictResponse({ description: 'EVENT_SUPERSEDED', schema: ERROR_SCHEMA })
  reject(@Param('eventId') eventId: string, @Headers(FACT_ACTOR_HEADER) actor: string | undefined, @Body() body: unknown, @Query('as_of') asOf: string | undefined): Promise<FactCoordinateDto> {
    return this.actions.reject(eventId, actor, body, asOf);
  }

  @RequirePermission('truth.review')
  @Post('events/:eventId/correct')
  @HttpCode(200)
  @ApiOperation({ summary: 'Correct a candidate value: the old event is superseded (kept on record) and the operator’s value becomes a new CONFIRMED event' })
  @ApiParam(EVENT_ID)
  @ApiHeader(ACTOR)
  @ApiQuery(AS_OF)
  @ApiBody({ type: CorrectFactRequestDto })
  @ApiOkResponse({ type: FactCoordinateDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID · INVALID_FACT_REQUEST · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'EVENT_NOT_FOUND', schema: ERROR_SCHEMA })
  @ApiConflictResponse({ description: 'EVENT_SUPERSEDED · ALREADY_REJECTED', schema: ERROR_SCHEMA })
  @ApiUnprocessableEntityResponse({ description: 'VALUE_UNCHANGED · NOT_CORRECTABLE', schema: ERROR_SCHEMA })
  correct(@Param('eventId') eventId: string, @Headers(FACT_ACTOR_HEADER) actor: string | undefined, @Body() body: unknown, @Query('as_of') asOf: string | undefined): Promise<FactCoordinateDto> {
    return this.actions.correct(eventId, actor, body, asOf);
  }
}
