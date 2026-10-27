import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Res } from '@nestjs/common';
import { Public } from '../auth/auth.decorators.js';
import { ApiBearerAuth, ApiBody, ApiExtraModels, ApiHeader, ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AgentToolsService } from './agent-tools.service.js';
import { ENVELOPE_SCHEMA_VERSION } from './executor.js';
import { ToolGatewayError } from './tool-errors.js';

const RUN_HEADER = { name: 'X-CERA-Agent-Run-Id', required: true, description: 'Agent run (created by a human or the coordinator) that fixes the recovery-run scope', schema: { type: 'string' as const, format: 'uuid' } };
const IDEMPOTENCY = { name: 'Idempotency-Key', required: false, description: 'Required for PROPOSE and REQUEST tools', schema: { type: 'string' as const, pattern: '^[A-Za-z0-9._:-]{1,100}$' } };
const ENVELOPE = {
  type: 'object',
  required: ['schema_version', 'tool', 'tool_call_id', 'status', 'replayed', 'output', 'error'],
  properties: {
    schema_version: { type: 'string', enum: [ENVELOPE_SCHEMA_VERSION] },
    tool: { type: 'string' },
    tool_call_id: { type: 'string', format: 'uuid', nullable: true },
    status: { type: 'string', enum: ['SUCCEEDED', 'REJECTED', 'FAILED'] },
    replayed: { type: 'boolean' },
    output: { description: 'Tool output (output_schema in packages/contracts/agent-tools/agent-tools.v1.json)', nullable: true },
    error: {
      type: 'object',
      nullable: true,
      properties: { code: { type: 'string' }, retryable: { type: 'boolean' }, message: { type: 'string' }, cause_code: { type: 'string' }, details: { type: 'object' } },
    },
  },
};

/**
 * Agent 서비스 API(T-103) — **내부용**. 브라우저 · 화면이 부르지 않는다(Python Agent Runtime 만).
 * 기록된 호출의 결과(SUCCEEDED · REJECTED · FAILED)는 HTTP 200 + 봉투로 돌려준다 — Agent 가 상태 코드가 아니라 `status` · `error.code` 로 판단한다.
 * 기록할 수 없는 입구 오류(꺼짐 · 인증 · 실행 없음 · 모르는 Tool)만 HTTP 오류 상태다.
 */
@ApiTags('internal-agent-tools')
@ApiBearerAuth()
@ApiExtraModels()
// 사람 로그인 Guard 밖: Agent 서비스 토큰(Bearer)을 서비스가 따로 검사한다 — 사람 세션으로는 못 부른다
@Public()
@Controller('internal/agent-tools')
export class AgentToolsController {
  constructor(@Inject(AgentToolsService) private readonly tools: AgentToolsService) {}

  @Get()
  @ApiOperation({ summary: 'Agent tool catalog (same content as packages/contracts/agent-tools/agent-tools.v1.json). Service token required.' })
  @ApiOkResponse({ description: 'Catalog', schema: { type: 'object' } })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED_AGENT' })
  @ApiResponse({ status: 503, description: 'AGENT_TOOLS_DISABLED' })
  catalog(@Headers('authorization') authorization: string | undefined, @Res({ passthrough: true }) res: Response) {
    return guard(res, () => this.tools.catalog(authorization));
  }

  @Post(':tool')
  @HttpCode(200)
  @ApiOperation({ summary: 'Call one registered agent tool. Only READ · EXTERNAL_READ · COMPUTE · PROPOSE · REQUEST tools exist — never approve, send or confirm.' })
  @ApiParam({ name: 'tool', required: true, schema: { type: 'string', pattern: '^[a-z][a-z0-9_]{1,59}$' } })
  @ApiHeader(RUN_HEADER)
  @ApiHeader(IDEMPOTENCY)
  @ApiBody({ description: 'Tool input (input_schema of the tool)', schema: { type: 'object' } })
  @ApiOkResponse({ description: 'Recorded tool outcome', schema: ENVELOPE })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED_AGENT', schema: ENVELOPE })
  @ApiResponse({ status: 404, description: 'TOOL_NOT_FOUND · AGENT_RUN_NOT_FOUND', schema: ENVELOPE })
  @ApiResponse({ status: 409, description: 'AGENT_RUN_NOT_ACTIVE', schema: ENVELOPE })
  @ApiResponse({ status: 503, description: 'AGENT_TOOLS_DISABLED', schema: ENVELOPE })
  call(
    @Param('tool') tool: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-cera-agent-run-id') agentRunId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    return guard(res, () => this.tools.call(tool, body, { authorization, agentRunId, idempotencyKey }), tool);
  }
}

/** 입구 오류를 봉투 모양 + HTTP 상태로(기록 없음). 그 밖의 오류는 공통 오류 필터로 간다. */
async function guard<T>(res: Response, work: () => T | Promise<T>, tool = '') {
  try {
    return await work();
  } catch (error) {
    if (!(error instanceof ToolGatewayError)) throw error;
    res.status(error.httpStatus);
    return {
      schema_version: ENVELOPE_SCHEMA_VERSION,
      tool: tool.slice(0, 60),
      tool_call_id: null,
      status: 'REJECTED' as const,
      replayed: false,
      output: null,
      error: { code: error.code, retryable: error.code === 'AGENT_TOOLS_DISABLED', message: error.message },
    };
  }
}
