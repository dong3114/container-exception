import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AgentToolsService } from './agent-tools.service.js';
import { AgentCoordinator } from './coordinator.js';

const ERROR_SCHEMA = { $ref: '#/components/schemas/ErrorResponse' };
const ACTOR = {
  name: 'X-CERA-Actor-Id',
  required: true,
  description: 'Operator who starts or cancels the agent run (active HUMAN actor). Development stand-in until authentication exists.',
  schema: { type: 'string' as const, format: 'uuid' },
};
const RUN_VIEW = { type: 'object', description: 'Agent run with its tool-call log (hashes and refs only — no raw content)' };

/**
 * Agent 실행(T-103). **실행의 범위(계획 실행)는 사람이 정한다** — Agent 가 자기 실행을 만들거나 범위를 고르지 못한다.
 * 실행 시작 · 재개를 Agent Runtime 에 알리는 일(Coordinator)은 T-104.
 */
@ApiTags('agent-runs')
@Controller('agent-runs')
export class AgentRunsController {
  constructor(
    @Inject(AgentToolsService) private readonly tools: AgentToolsService,
    @Inject(AgentCoordinator) private readonly coordinator: AgentCoordinator,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Recent agent runs — status, current node, waiting reason, pending reference' })
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } })
  @ApiOkResponse({ schema: { type: 'object' } })
  list(@Query('limit') limit: string | undefined) {
    const n = Number(limit ?? 50);
    return this.coordinator.list(Number.isInteger(n) && n >= 1 && n <= 200 ? n : 50);
  }

  @Get('runtime')
  @ApiOperation({ summary: 'Whether the Python Agent Runtime (CERA_AGENT_RUNTIME_URL) answers, and whether agent tools are enabled' })
  @ApiOkResponse({ schema: { type: 'object' } })
  runtime() {
    return this.tools.runtimeStatus();
  }

  @Post()
  @ApiOperation({ summary: 'Start an agent run bound to one recovery run (the scope every tool call is checked against)' })
  @ApiHeader(ACTOR)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['recovery_run_id', 'goal'],
      properties: {
        recovery_run_id: { type: 'string', format: 'uuid' },
        goal: { type: 'string', maxLength: 300 },
        runtime_version: { type: 'string', maxLength: 40, nullable: true },
        parameters: { type: 'object', description: 'Human-provided values the agent may use (e.g. inquiry.quantity · window_from · window_to) — the agent never invents numbers' },
      },
    },
  })
  @ApiOkResponse({ schema: RUN_VIEW })
  create(@Headers('x-cera-actor-id') actor: string | undefined, @Body() body: unknown) {
    return this.tools.createRun(actor, body);
  }

  @Get(':agentRunId')
  @ApiOperation({ summary: 'One agent run: status · current node · waiting reason · recent steps · tool calls' })
  @ApiParam({ name: 'agentRunId', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ schema: RUN_VIEW })
  get(@Param('agentRunId') agentRunId: string) {
    return this.coordinator.view(agentRunId);
  }

  @Post(':agentRunId/start')
  @HttpCode(200)
  @ApiOperation({ summary: 'Start the graph of a CREATED run (runs until it waits or ends). Starting twice returns the current state — never a second graph.' })
  @ApiParam({ name: 'agentRunId', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiHeader(ACTOR)
  @ApiOkResponse({ schema: RUN_VIEW })
  start(@Param('agentRunId') agentRunId: string, @Headers('x-cera-actor-id') actor: string | undefined) {
    return this.coordinator.start(agentRunId, actor);
  }

  @Post(':agentRunId/resume')
  @HttpCode(200)
  @ApiOperation({ summary: 'Resume a waiting run (normally the backend does this when the awaited event happens). Not waiting = no-op.' })
  @ApiParam({ name: 'agentRunId', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiHeader(ACTOR)
  @ApiBody({ schema: { type: 'object', properties: { reason: { type: 'string', pattern: '^[A-Z][A-Z0-9_]{0,59}$' } } } })
  @ApiOkResponse({ schema: RUN_VIEW })
  resume(@Param('agentRunId') agentRunId: string, @Headers('x-cera-actor-id') actor: string | undefined, @Body() body: unknown) {
    return this.coordinator.resumeByHuman(agentRunId, actor, body);
  }

  @Post(':agentRunId/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel an active agent run — its tool calls stop being accepted' })
  @ApiParam({ name: 'agentRunId', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiHeader(ACTOR)
  @ApiOkResponse({ schema: RUN_VIEW, description: 'Cancelled run' })
  async cancel(@Param('agentRunId') agentRunId: string, @Headers('x-cera-actor-id') actor: string | undefined) {
    await this.tools.cancelRun(agentRunId, actor);
    return this.coordinator.view(agentRunId);
  }
}

export { ERROR_SCHEMA };
