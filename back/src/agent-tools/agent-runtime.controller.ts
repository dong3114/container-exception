import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Put, Query, Res } from '@nestjs/common';
import { Public } from '../auth/auth.decorators.js';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AgentRuntimeService } from './agent-runtime.service.js';
import { ToolGatewayError } from './tool-errors.js';

const RUN = { name: 'agentRunId', required: true, schema: { type: 'string' as const, format: 'uuid' } };

/**
 * Agent Runtime 저장 통로(T-104) — **내부용**. Python LangGraph checkpointer · 단계 보고만 부른다(서비스 토큰).
 * 실행 상태(어디서 이어 갈지)이지 업무 사실이 아니다.
 */
@ApiTags('internal-agent-runtime')
@ApiBearerAuth()
// 사람 로그인 Guard 밖: Agent 서비스 토큰(Bearer)을 서비스가 따로 검사한다 — 사람 세션으로는 못 부른다
@Public()
@Controller('internal/agent-runtime/runs/:agentRunId')
export class AgentRuntimeController {
  constructor(@Inject(AgentRuntimeService) private readonly runtime: AgentRuntimeService) {}

  @Put('checkpoints')
  @HttpCode(200)
  @ApiOperation({ summary: 'Store one LangGraph checkpoint (execution state — not business truth). Content goes to the content store; the row keeps ref + hash.' })
  @ApiParam(RUN)
  @ApiBody({ schema: { type: 'object' } })
  @ApiOkResponse({ schema: { type: 'object' } })
  put(@Param('agentRunId') id: string, @Body() body: unknown, @Headers('authorization') auth: string | undefined, @Res({ passthrough: true }) res: Response) {
    return gateway(res, () => this.runtime.putCheckpoint(auth, id, body));
  }

  @Post('checkpoint-writes')
  @HttpCode(200)
  @ApiOperation({ summary: 'Store pending writes of a checkpoint (special writes such as interrupt/resume overwrite; normal writes are kept once)' })
  @ApiParam(RUN)
  @ApiBody({ schema: { type: 'object' } })
  @ApiOkResponse({ schema: { type: 'object' } })
  writes(@Param('agentRunId') id: string, @Body() body: unknown, @Headers('authorization') auth: string | undefined, @Res({ passthrough: true }) res: Response) {
    return gateway(res, () => this.runtime.putWrites(auth, id, body));
  }

  @Get('checkpoints')
  @ApiOperation({ summary: 'Latest (or a given / earlier) checkpoints with their pending writes' })
  @ApiParam(RUN)
  @ApiOkResponse({ schema: { type: 'object' } })
  list(
    @Param('agentRunId') id: string,
    @Query() q: { ns?: string; checkpoint_id?: string; before?: string; limit?: string },
    @Headers('authorization') auth: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    return gateway(res, () => this.runtime.getCheckpoints(auth, id, q));
  }

  @Post('steps')
  @HttpCode(200)
  @ApiOperation({ summary: 'Report finished graph nodes (node · outcome · branch · tool call · retries · timing) — no payloads' })
  @ApiParam(RUN)
  @ApiBody({ schema: { type: 'object' } })
  @ApiOkResponse({ schema: { type: 'object' } })
  steps(@Param('agentRunId') id: string, @Body() body: unknown, @Headers('authorization') auth: string | undefined, @Res({ passthrough: true }) res: Response) {
    return gateway(res, () => this.runtime.addSteps(auth, id, body));
  }
}

async function gateway<T>(res: Response, work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (!(error instanceof ToolGatewayError)) throw error;
    res.status(error.httpStatus);
    return { code: error.code, message: error.message };
  }
}
