import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ContactSelectionDto, SelectFollowUpContactRequestDto } from '../registry/dto.js';
import { RequirePermission } from '../auth/auth.decorators.js';
import { PlanFollowUpService } from './follow-up.service.js';
import { PLAN_ACTOR_HEADER, RecoveryPlanService } from './recovery-plan.service.js';

const PLAN_ID = { name: 'planId', required: true, schema: { type: 'string' as const, format: 'uuid' } };

/**
 * 승인된 계획 → 후속 문의(T-116). 계획 승인 ≠ 자동 실행 ≠ 자동 발송 — 여기서는 필요한 조치를 보여 주고, 요청하면 **초안만** 만든다.
 * 초안마다 사람 승인 · 발송 요청이 따로 필요하다(기존 경계 그대로).
 */
@ApiTags('planning')
@Controller('planning/plans/:planId/follow-ups')
export class PlanFollowUpController {
  constructor(
    @Inject(PlanFollowUpService) private readonly followUps: PlanFollowUpService,
    @Inject(RecoveryPlanService) private readonly plans: RecoveryPlanService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Required external actions of a plan (ODCY receipts, partner trucks) and the drafts made for them' })
  @ApiParam(PLAN_ID)
  @ApiOkResponse({ schema: { type: 'object' } })
  list(@Param('planId') planId: string) {
    return this.followUps.list(planId);
  }

  @RequirePermission('communication.draft')
  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Create inquiry drafts for the approved plan actions that have none yet (no approval, no send)' })
  @ApiParam(PLAN_ID)
  @ApiOkResponse({ schema: { type: 'object' } })
  async create(@Param('planId') planId: string, @Headers(PLAN_ACTOR_HEADER) actorHeader: string | undefined) {
    const actorId = await this.plans.resolveHuman(actorHeader);
    return this.followUps.createDrafts(planId, actorId);
  }

  @RequirePermission('contact.select')
  @Post('contact-selection')
  @HttpCode(201)
  @ApiOperation({ summary: 'T-129: choose the recipient address for one follow-up action that is blocked with CONTACT_SELECTION_REQUIRED (this plan and this action only). The backend re-checks counterparty, role, channel kind and the Contact Gate; call POST follow-ups again to draft to it' })
  @ApiParam(PLAN_ID)
  @ApiBody({ type: SelectFollowUpContactRequestDto })
  @ApiCreatedResponse({ type: ContactSelectionDto })
  async selectContact(@Param('planId') planId: string, @Headers(PLAN_ACTOR_HEADER) actorHeader: string | undefined, @Body() body: unknown) {
    const actorId = await this.plans.resolveHuman(actorHeader);
    return this.followUps.selectContact(planId, actorId, body);
  }
}
