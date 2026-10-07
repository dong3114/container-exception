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
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ACTOR_HEADER, ApprovalService } from './approval.service.js';
import { ApproveDraftRequestDto, ApproverListDto, DraftDto, RejectDraftRequestDto, RevokeApprovalRequestDto } from './dto.js';

const ERROR_SCHEMA = { $ref: '#/components/schemas/ErrorResponse' };
const MESSAGE_ID = { name: 'messageId', required: true, schema: { type: 'string' as const, format: 'uuid' } };
const APPROVAL_ID = { name: 'approvalId', required: true, schema: { type: 'string' as const, format: 'uuid' } };
const ACTOR = {
  name: 'X-CERA-Actor-Id',
  required: true,
  description: 'Deciding operator (active HUMAN actor). Development stand-in until authentication exists — the backend checks it.',
  schema: { type: 'string' as const, format: 'uuid' },
};

/**
 * 발송 승인(T-089 U4). 승인 · 반려 · 승인 취소 — 결정은 Backend 가 한다. 실제 발송은 없다(U5).
 * 경로 · 헤더 · 요청 본문을 모두 명시한다(tsx 는 decorator metadata 를 만들지 않는다 — docs/24 18.3 U2-3).
 */
@ApiTags('communication')
@Controller('communication')
export class ApprovalController {
  constructor(@Inject(ApprovalService) private readonly approvals: ApprovalService) {}

  @Get('approvers')
  @ApiOperation({ summary: 'Operators who may decide approvals (active HUMAN actors)' })
  @ApiOkResponse({ type: ApproverListDto })
  approvers(): Promise<ApproverListDto> {
    return this.approvals.approvers();
  }

  @Post('drafts/:messageId/approve')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Approve the exact content the operator reviewed: re-checks revision · content hash · number check · Contact Gate · plan, then freezes subject · body · structured values · recipient · plan run',
  })
  @ApiParam(MESSAGE_ID)
  @ApiHeader(ACTOR)
  @ApiBody({ type: ApproveDraftRequestDto })
  @ApiOkResponse({ type: DraftDto, description: 'The draft with its approval. Approving the same content again returns the same approval.' })
  @ApiBadRequestResponse({ description: 'INVALID_ID · INVALID_DRAFT_REQUEST · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED · RECIPIENT_NOT_ELIGIBLE', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'DRAFT_NOT_FOUND', schema: ERROR_SCHEMA })
  @ApiConflictResponse({
    description: 'CONTENT_CHANGED · MESSAGE_SUPERSEDED · NOT_PENDING_APPROVAL · ALREADY_APPROVED · PLAN_SUPERSEDED · CONTENT_MISSING · CONTENT_HASH_MISMATCH',
    schema: ERROR_SCHEMA,
  })
  @ApiUnprocessableEntityResponse({ description: 'NUMBER_CHECK_FAILED', schema: ERROR_SCHEMA })
  approve(@Param('messageId') messageId: string, @Headers(ACTOR_HEADER) actor: string | undefined, @Body() body: unknown): Promise<DraftDto> {
    return this.approvals.approve(messageId, actor, body);
  }

  @Post('drafts/:messageId/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject a draft awaiting approval (reason required). Fix it by revising — a revision is a new message.' })
  @ApiParam(MESSAGE_ID)
  @ApiHeader(ACTOR)
  @ApiBody({ type: RejectDraftRequestDto })
  @ApiOkResponse({ type: DraftDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID · INVALID_DRAFT_REQUEST · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'DRAFT_NOT_FOUND', schema: ERROR_SCHEMA })
  @ApiConflictResponse({ description: 'CONTENT_CHANGED · MESSAGE_SUPERSEDED · NOT_PENDING_APPROVAL', schema: ERROR_SCHEMA })
  reject(@Param('messageId') messageId: string, @Headers(ACTOR_HEADER) actor: string | undefined, @Body() body: unknown): Promise<DraftDto> {
    return this.approvals.reject(messageId, actor, body);
  }

  @Post('approvals/:approvalId/revoke')
  @HttpCode(200)
  @ApiOperation({ summary: 'Withdraw an approval that has not been used for sending (a new REVOKED row — the approval row is never edited)' })
  @ApiParam(APPROVAL_ID)
  @ApiHeader(ACTOR)
  @ApiBody({ type: RevokeApprovalRequestDto, required: false })
  @ApiOkResponse({ type: DraftDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID · INVALID_DRAFT_REQUEST · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'APPROVAL_NOT_FOUND', schema: ERROR_SCHEMA })
  @ApiConflictResponse({ description: 'NOT_AN_APPROVAL · ALREADY_SENT', schema: ERROR_SCHEMA })
  revoke(@Param('approvalId') approvalId: string, @Headers(ACTOR_HEADER) actor: string | undefined, @Body() body: unknown): Promise<DraftDto> {
    return this.approvals.revoke(approvalId, actor, body);
  }
}
