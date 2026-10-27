import { Body, Controller, Headers, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { RequirePermission } from '../auth/auth.decorators.js';
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
  ApiTags,
} from '@nestjs/swagger';
import { ACTOR_HEADER } from './approval.service.js';
import { DraftDto, SendDraftRequestDto } from './dto.js';
import { SendService } from './send.service.js';

const ERROR_SCHEMA = { $ref: '#/components/schemas/ErrorResponse' };

/**
 * 발송 요청(T-090 U5). **즉시 네트워크로 보내지 않는다** — 검증 뒤 Outbox(`QUEUED`)에 넣고, 별도 Worker 가 보낸다.
 * 경로 · 헤더 · 요청 본문을 모두 명시한다(tsx 는 decorator metadata 를 만들지 않는다 — docs/24 18.3 U2-3).
 */
@ApiTags('communication')
@Controller('communication')
export class SendController {
  constructor(@Inject(SendService) private readonly sends: SendService) {}

  @RequirePermission('communication.send')
  @Post('drafts/:messageId/send')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Request sending of an approved message: re-checks the valid approval (six conditions), the frozen copy, Contact Gate and the plan, then queues it (Outbox). The worker sends it. Repeating the request does not queue or send twice.',
  })
  @ApiParam({ name: 'messageId', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiHeader({
    name: 'X-CERA-Actor-Id',
    required: true,
    description: 'Requesting operator (active HUMAN actor). Development stand-in until authentication exists — the backend checks it.',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ type: SendDraftRequestDto })
  @ApiOkResponse({ type: DraftDto, description: 'The draft with its dispatch state (QUEUED, or the current state if already queued / sent)' })
  @ApiBadRequestResponse({ description: 'INVALID_ID · INVALID_DRAFT_REQUEST · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED · RECIPIENT_NOT_ELIGIBLE', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'DRAFT_NOT_FOUND', schema: ERROR_SCHEMA })
  @ApiConflictResponse({
    description:
      'CONTENT_CHANGED · NOT_APPROVED · APPROVAL_MISSING · APPROVAL_EXPIRED · APPROVAL_REVOKED · APPROVAL_INVALIDATED · APPROVAL_CONTENT_MISMATCH · APPROVAL_RECIPIENT_MISMATCH · APPROVAL_COPY_INVALID · CONTENT_HASH_MISMATCH · PLAN_SUPERSEDED · MESSAGE_SUPERSEDED · SIMULATION_MISMATCH · CHANNEL_UNAVAILABLE',
    schema: ERROR_SCHEMA,
  })
  send(@Param('messageId') messageId: string, @Headers(ACTOR_HEADER) actor: string | undefined, @Body() body: unknown): Promise<DraftDto> {
    return this.sends.requestSend(messageId, actor, body);
  }
}
