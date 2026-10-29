import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../auth/auth.decorators.js';
import { ApiBadRequestResponse, ApiBody, ApiConflictResponse, ApiForbiddenResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../db/database.js';
import { facility, truckPool } from '../db/schema/index.js';
import { BusinessRuleError } from '../shared/errors/cera-error.js';
import { ApprovePlanRequestDto, CostPreviewDto, PlanDto, PlanListDto } from './dto.js';
import { toPlanDto, toPlanSummary } from './plan-view.js';
import { PLAN_ACTOR_HEADER, RecoveryPlanService } from './recovery-plan.service.js';

const ERROR_SCHEMA = { $ref: '#/components/schemas/ErrorResponse' };
const RUN_ID = { name: 'runId', required: true, schema: { type: 'string' as const, format: 'uuid' } };
const PLAN_ID = { name: 'planId', required: true, schema: { type: 'string' as const, format: 'uuid' } };
const AS_OF = { name: 'as_of', required: false, schema: { type: 'string' as const }, description: 'Judge facts at this time (ISO 8601 with offset). Default: scenario time for simulated runs, now for real ones' };
const ACTOR = { name: 'X-CERA-Actor-Id', required: true, description: 'Operator (active HUMAN actor). Development stand-in until authentication exists — the backend checks it.', schema: { type: 'string' as const, format: 'uuid' } };

/**
 * 복구 계획(T-114): 결정론 비용표 · Solver 제안 판 · 판 목록 · 사람 승인. 숫자는 엔진만 만든다 — 화면 · Agent 는 읽고 설명만 한다.
 */
@ApiTags('planning')
@Controller('planning')
export class PlanningController {
  constructor(
    @Inject(RecoveryPlanService) private readonly plans: RecoveryPlanService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  private async names(): Promise<Map<string, string>> {
    const f = await this.db.select({ id: facility.facilityId, name: facility.facilityName }).from(facility);
    const p = await this.db.select({ id: truckPool.truckPoolId, name: truckPool.poolName }).from(truckPool);
    return new Map([...f.map((x) => [x.id, x.name] as const), ...p.map((x) => [x.id, x.name] as const), ['TERMINAL_T1', '터미널 T1']]);
  }

  private async dto(planId: string): Promise<PlanDto> {
    const p = await this.plans.plan(planId);
    if (!p) throw new BusinessRuleError('NOT_FOUND', 'No recovery plan with this id', 404);
    return toPlanDto(p, await this.plans.items(planId), await this.plans.snapshotScope(p.snapshotId), await this.names());
  }

  @Get('runs/:runId/costs')
  @ApiOperation({ summary: 'Cost table of a recovery run (deterministic engine): every container × action with feasibility, reasons and cost breakdown, plus the baseline — nothing is stored' })
  @ApiParam(RUN_ID)
  @ApiQuery(AS_OF)
  @ApiOkResponse({ type: CostPreviewDto })
  @ApiConflictResponse({ description: 'PLANNING_INPUT_UNAVAILABLE', schema: ERROR_SCHEMA })
  async costs(@Param('runId') runId: string, @Query('as_of') asOf: string | undefined): Promise<CostPreviewDto> {
    const c = await this.plans.compute(runId, asOf);
    return {
      case_run_id: runId,
      as_of: c.asOf.toSeoulIso(),
      policy_version: c.table.policy_version,
      rate_version: c.table.rate_version,
      candidates: c.table.candidates,
      option_count: c.table.options.length,
      feasible_option_count: c.table.options.filter((o) => o.feasible).length,
      options: c.table.options.map((o) => ({ ...o })),
      resources: c.table.resources.map((r) => ({ ...r })),
      facts: c.table.facts.map((f) => ({ ...f })),
      baseline: { rule: c.baseline.rule, base_cost: c.baseline.base_cost, risk_penalty: c.baseline.risk_penalty, total: c.baseline.total, assignments: c.baseline.assignments.map((a) => ({ container_id: a.container_id, option_id: a.option.option_id, total: a.option.cost.total })), unplanned: c.baseline.unplanned },
      warnings: c.table.warnings,
      cost_ms: Math.round(c.costMs),
    };
  }

  @Get('runs/:runId/input-readiness')
  @ApiOperation({ summary: 'What the planner has and what is missing (T-115). Simulated runs use the scenario pack; real runs list missing_inputs instead of inventing values.' })
  @ApiParam(RUN_ID)
  @ApiQuery(AS_OF)
  @ApiOkResponse({ schema: { type: 'object' } })
  readiness(@Param('runId') runId: string, @Query('as_of') asOf: string | undefined) {
    return this.plans.readiness(runId, asOf);
  }

  @Get('runs/:runId/plans')
  @ApiOperation({ summary: 'Plan versions of a recovery run (newest first)' })
  @ApiParam(RUN_ID)
  @ApiOkResponse({ type: PlanListDto })
  async list(@Param('runId') runId: string): Promise<PlanListDto> {
    await this.plans.caseRun(runId);
    const plans = await this.plans.plans(runId);
    const current = await this.plans.currentPlan(runId);
    return { case_run_id: runId, current_plan_id: current?.planId ?? null, plans: plans.map(toPlanSummary) };
  }

  @RequirePermission('plan.recalculate')
  @Post('runs/:runId/plans')
  @HttpCode(200)
  @ApiOperation({ summary: 'Recalculate (operator): run the cost engine and solver on current facts and store a new PROPOSED version — the same inputs return the current version' })
  @ApiParam(RUN_ID)
  @ApiHeader(ACTOR)
  @ApiQuery(AS_OF)
  @ApiOkResponse({ type: PlanDto })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED', schema: ERROR_SCHEMA })
  @ApiConflictResponse({ description: 'PLANNING_INPUT_UNAVAILABLE', schema: ERROR_SCHEMA })
  async propose(@Param('runId') runId: string, @Headers(PLAN_ACTOR_HEADER) actorHeader: string | undefined, @Query('as_of') asOf: string | undefined): Promise<PlanDto> {
    const actorId = await this.plans.resolveHuman(actorHeader);
    const r = await this.plans.propose(runId, { actorId }, { asOf });
    return this.dto(r.plan.planId);
  }

  @Get('plans/:planId')
  @ApiOperation({ summary: 'One plan version: problem, baseline vs plan, per-container action · target · cost · reasons, facts used or excluded, warnings' })
  @ApiParam(PLAN_ID)
  @ApiOkResponse({ type: PlanDto })
  @ApiNotFoundResponse({ description: 'NOT_FOUND', schema: ERROR_SCHEMA })
  get(@Param('planId') planId: string): Promise<PlanDto> {
    return this.dto(planId);
  }

  @RequirePermission('plan.approve')
  @Post('plans/:planId/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a PROPOSED plan (a human only, quoting plan_hash). Approval is not dispatch — nothing is sent or booked' })
  @ApiParam(PLAN_ID)
  @ApiHeader(ACTOR)
  @ApiBody({ type: ApprovePlanRequestDto })
  @ApiOkResponse({ type: PlanDto })
  @ApiBadRequestResponse({ description: 'INVALID_PLAN_REQUEST', schema: ERROR_SCHEMA })
  @ApiConflictResponse({ description: 'PLAN_OUTDATED · PLAN_NOT_PROPOSED · PLAN_HASH_MISMATCH · PLAN_RELIES_ON_DISPUTED_FACT', schema: ERROR_SCHEMA })
  async approve(@Param('planId') planId: string, @Headers(PLAN_ACTOR_HEADER) actorHeader: string | undefined, @Body() body: unknown): Promise<PlanDto> {
    await this.plans.approve(planId, actorHeader, body);
    return this.dto(planId);
  }
}
