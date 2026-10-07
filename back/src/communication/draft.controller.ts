import { Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { DraftService } from './draft.service.js';
import { CreateDraftRequestDto, DraftDto, DraftListDto, ReviseDraftRequestDto, RunListDto } from './dto.js';

const ERROR_SCHEMA = { $ref: '#/components/schemas/ErrorResponse' };
const MESSAGE_ID = { name: 'messageId', required: true, schema: { type: 'string' as const, format: 'uuid' } };

/**
 * 문의 초안(T-088 U3). 승인은 approval.controller(U4), 발송은 아직 없다(U5). 문장은 템플릿 — AI 를 쓰지 않는다.
 * 경로 · 요청 본문을 모두 명시한다(tsx 는 decorator metadata 를 만들지 않는다 — docs/24 18.3 U2-3).
 */
@ApiTags('communication')
@Controller('communication')
export class DraftController {
  constructor(@Inject(DraftService) private readonly drafts: DraftService) {}

  @Post('drafts')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create an inquiry draft: Contact Gate → thread · question · structured values · template message · number check' })
  @ApiBody({ type: CreateDraftRequestDto })
  @ApiCreatedResponse({ type: DraftDto })
  @ApiBadRequestResponse({ description: 'INVALID_DRAFT_REQUEST · INVALID_DRAFT_VALUES · SOURCE_RUN_REQUIRED · SCENARIO_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'RECIPIENT_NOT_ELIGIBLE — Contact Gate blocked the address', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'ADDRESS_NOT_FOUND · TARGET_NOT_FOUND · RUN_NOT_FOUND', schema: ERROR_SCHEMA })
  @ApiUnprocessableEntityResponse({ description: 'TARGET_COUNTERPARTY_MISMATCH · TARGET_NOT_SUPPORTED · TARGET_REQUIRED · SIMULATION_MISMATCH', schema: ERROR_SCHEMA })
  create(@Body() body: unknown): Promise<DraftDto> {
    return this.drafts.create(body);
  }

  @Get('drafts')
  @ApiOperation({ summary: 'Latest outbound inquiry drafts (newest first)' })
  @ApiOkResponse({ type: DraftListDto })
  list(): Promise<DraftListDto> {
    return this.drafts.list();
  }

  @Get('drafts/:messageId')
  @ApiOperation({ summary: 'One draft with its thread, question, structured values, number check and approval readiness' })
  @ApiParam(MESSAGE_ID)
  @ApiOkResponse({ type: DraftDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'DRAFT_NOT_FOUND', schema: ERROR_SCHEMA })
  get(@Param('messageId') messageId: string): Promise<DraftDto> {
    return this.drafts.get(messageId);
  }

  @Post('drafts/:messageId/revisions')
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Operator edits the text (and optionally the structured values): a new message (content is immutable), re-checked. A live approval of the old message is invalidated (CONTENT_CHANGED) — the new text needs approval again',
  })
  @ApiParam(MESSAGE_ID)
  @ApiBody({ type: ReviseDraftRequestDto })
  @ApiCreatedResponse({ type: DraftDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID · INVALID_DRAFT_REQUEST', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'RECIPIENT_NOT_ELIGIBLE', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'DRAFT_NOT_FOUND', schema: ERROR_SCHEMA })
  @ApiConflictResponse({ description: 'DRAFT_NOT_EDITABLE — queued, sent or already superseded', schema: ERROR_SCHEMA })
  @ApiUnprocessableEntityResponse({ description: 'QUESTION_TARGET_CHANGED — date · window · size type define the question', schema: ERROR_SCHEMA })
  revise(@Param('messageId') messageId: string, @Body() body: unknown): Promise<DraftDto> {
    return this.drafts.revise(messageId, body);
  }
}

/** 계획 실행 목록 — 화면이 문의의 출처 실행을 고를 때(읽기 전용). */
@ApiTags('planning')
@Controller('planning')
export class PlanningRunController {
  constructor(@Inject(DraftService) private readonly drafts: DraftService) {}

  @Get('runs')
  @ApiOperation({ summary: 'Recovery runs (newest first) a plan-based inquiry can cite as its source' })
  @ApiOkResponse({ type: RunListDto })
  list(): Promise<RunListDto> {
    return this.drafts.listRuns();
  }
}
