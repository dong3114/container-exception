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
import { RequirePermission } from '../auth/auth.decorators.js';
import { ACTOR_HEADER } from './approval.service.js';
import { ExtractionRetryRequestDto, ExtractionRetryResultDto, HeldReprocessResultDto, InboundListDto } from './dto.js';
import { ExtractionRetryService } from './extraction-retry.service.js';
import { InboundService } from './inbound.service.js';
import { HeldReprocessService } from './held-reprocess.service.js';

const ERROR_SCHEMA = { $ref: '#/components/schemas/ErrorResponse' };
const ACTOR = {
  name: 'X-CERA-Actor-Id',
  required: true,
  description: 'Requesting operator (active HUMAN actor). In session mode the backend sets it from the session',
  schema: { type: 'string' as const, format: 'uuid' },
};

/**
 * 받은 메일(T-091 U6) — 회신은 Worker 가 채널에서 가져온다. 이 API 에는 "가짜 회신 만들기"가 없다
 * (개발 · 시험용 회신 주입은 `npm run mock:reply` CLI — production 에서 거부). 바꾸는 요청은 사람의 추출 재시도 하나뿐이다(T-124).
 */
@ApiTags('communication')
@Controller('communication')
export class InboundController {
  constructor(
    @Inject(InboundService) private readonly inbound: InboundService,
    @Inject(ExtractionRetryService) private readonly retries: ExtractionRetryService,
    @Inject(HeldReprocessService) private readonly held: HeldReprocessService,
  ) {}

  @Get('inbound')
  @ApiOperation({ summary: 'Received mail, newest first: attached replies (NORMAL) and the hold box (HOLD) with the reason decided at receipt' })
  @ApiQuery({ name: 'status', required: false, enum: ['NORMAL', 'HOLD'] })
  @ApiOkResponse({ type: InboundListDto })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_STATUS', schema: ERROR_SCHEMA })
  list(@Query('status') status?: string): Promise<InboundListDto> {
    return this.inbound.list(status);
  }

  @RequirePermission('extraction.retry')
  @Post('inbound/:messageId/extraction/retry')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Ask for one more extraction of a reply that gave no validated value (automatic retries exhausted, no answer found, or every answer rejected). Opens one new attempt; earlier attempts stay recorded. The usual validation and promotion rules apply',
  })
  @ApiParam({ name: 'messageId', required: true, schema: { type: 'string', format: 'uuid' }, description: 'The INBOUND message (reply) id' })
  @ApiHeader(ACTOR)
  @ApiBody({ type: ExtractionRetryRequestDto })
  @ApiOkResponse({ type: ExtractionRetryResultDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID · INVALID_RETRY_REQUEST · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED · PERMISSION_DENIED', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'NOT_FOUND', schema: ERROR_SCHEMA })
  @ApiConflictResponse({ description: 'EXTRACTION_IN_PROGRESS · EXTRACTION_NOT_REQUIRED · NOT_EXTRACTABLE · REPLY_SUPERSEDED · GAP_ALREADY_RESOLVED · COMMAND_ID_REUSED', schema: ERROR_SCHEMA })
  retry(@Param('messageId') messageId: string, @Headers(ACTOR_HEADER) actor: string | undefined, @Body() body: unknown): Promise<ExtractionRetryResultDto> {
    return this.retries.request(messageId, actor, body);
  }

  @RequirePermission('communication.approve')
  @Post('inbound/held/:rawInputId/reprocess')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Judge a held mail again against the current registry and threads (after registering / approving the sender or fixing the thread). The original and its hold record stay as they are; if it now matches, it is attached as a reply and extracted as usual. Safe to repeat',
  })
  @ApiParam({ name: 'rawInputId', required: true, schema: { type: 'string', format: 'uuid' }, description: 'The held mail (raw_input) id' })
  @ApiHeader(ACTOR)
  @ApiOkResponse({ type: HeldReprocessResultDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED · PERMISSION_DENIED', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'NOT_FOUND', schema: ERROR_SCHEMA })
  @ApiConflictResponse({ description: 'CONTENT_MISSING', schema: ERROR_SCHEMA })
  reprocessHeld(@Param('rawInputId') rawInputId: string, @Headers(ACTOR_HEADER) actor: string | undefined): Promise<HeldReprocessResultDto> {
    return this.held.reprocess(rawInputId, actor);
  }
}
