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
import { ConfirmFactRequestDto, CorrectFactRequestDto, FactCoordinateDto, FactListDto, RejectFactRequestDto } from './dto.js';
import { FACT_ACTOR_HEADER, FactActionService } from './fact-actions.service.js';
import { TruthQueryService } from './truth-query.service.js';

const ERROR_SCHEMA = { $ref: '#/components/schemas/ErrorResponse' };
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
  ) {}

  @Get('facts')
  @ApiOperation({ summary: 'Facts a recovery run asked about: current value + state + every candidate event with its role (the AI quote, who said it, whether a human confirmed it)' })
  @ApiQuery({ name: 'recovery_run_id', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ type: FactListDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'RUN_NOT_FOUND', schema: ERROR_SCHEMA })
  facts(@Query('recovery_run_id') runId: string | undefined): Promise<FactListDto> {
    return this.query.forRun(runId);
  }

  @Post('events/:eventId/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirm a candidate value (VERIFICATION · CONFIRM by a human). The value becomes CONFIRMED; nothing else changes' })
  @ApiParam(EVENT_ID)
  @ApiHeader(ACTOR)
  @ApiBody({ type: ConfirmFactRequestDto })
  @ApiOkResponse({ type: FactCoordinateDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID · INVALID_FACT_REQUEST · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'EVENT_NOT_FOUND', schema: ERROR_SCHEMA })
  @ApiConflictResponse({ description: 'EVENT_SUPERSEDED · ALREADY_REJECTED', schema: ERROR_SCHEMA })
  confirm(@Param('eventId') eventId: string, @Headers(FACT_ACTOR_HEADER) actor: string | undefined, @Body() body: unknown): Promise<FactCoordinateDto> {
    return this.actions.confirm(eventId, actor, body);
  }

  @Post('events/:eventId/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject a candidate value (VERIFICATION · REJECT by a human, reason required). It leaves the judgement; the event stays on record' })
  @ApiParam(EVENT_ID)
  @ApiHeader(ACTOR)
  @ApiBody({ type: RejectFactRequestDto })
  @ApiOkResponse({ type: FactCoordinateDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID · INVALID_FACT_REQUEST · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'EVENT_NOT_FOUND', schema: ERROR_SCHEMA })
  @ApiConflictResponse({ description: 'EVENT_SUPERSEDED', schema: ERROR_SCHEMA })
  reject(@Param('eventId') eventId: string, @Headers(FACT_ACTOR_HEADER) actor: string | undefined, @Body() body: unknown): Promise<FactCoordinateDto> {
    return this.actions.reject(eventId, actor, body);
  }

  @Post('events/:eventId/correct')
  @HttpCode(200)
  @ApiOperation({ summary: 'Correct a candidate value: the old event is superseded (kept on record) and the operator’s value becomes a new CONFIRMED event' })
  @ApiParam(EVENT_ID)
  @ApiHeader(ACTOR)
  @ApiBody({ type: CorrectFactRequestDto })
  @ApiOkResponse({ type: FactCoordinateDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID · INVALID_FACT_REQUEST · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'EVENT_NOT_FOUND', schema: ERROR_SCHEMA })
  @ApiConflictResponse({ description: 'EVENT_SUPERSEDED · ALREADY_REJECTED', schema: ERROR_SCHEMA })
  @ApiUnprocessableEntityResponse({ description: 'VALUE_UNCHANGED · NOT_CORRECTABLE', schema: ERROR_SCHEMA })
  correct(@Param('eventId') eventId: string, @Headers(FACT_ACTOR_HEADER) actor: string | undefined, @Body() body: unknown): Promise<FactCoordinateDto> {
    return this.actions.correct(eventId, actor, body);
  }
}
