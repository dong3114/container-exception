import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DraftService } from '../communication/draft.service.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { PublicDataService } from '../public-data/public-data.service.js';
import { RegistryService } from '../registry/registry.service.js';
import { currentContext } from '../shared/context/request-context.js';
import { BusinessRuleError, ValidationError } from '../shared/errors/cera-error.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import { AgentRunRepository, type AgentRunRow } from './agent-run.repository.js';
import { RecoveryContextService } from './context.service.js';
import { AgentServiceAuth } from './service-auth.js';
import { ENVELOPE_SCHEMA_VERSION, type ToolEnvelope, ToolExecutor, type ToolHandler } from './executor.js';
import { buildHandlers } from './handlers.js';
import { findTool, TOOLS, type ToolName } from './registry.js';
import { toolCatalog } from './tool-contracts.js';
import { ToolGatewayError } from './tool-errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** 사람이 실행을 만들 때 주는 값 — Agent 는 문의 수량 · 시간창 같은 숫자를 지어내지 않는다(규칙 3). */
export const runParametersSchema = z
  .object({
    inquiry: z
      .object({
        quantity: z.number().int().min(1).max(999),
        window_from: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
        window_to: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const createRunSchema = z
  .object({ recovery_run_id: z.uuid(), goal: z.string().min(1).max(300), runtime_version: z.string().max(40).nullish(), parameters: runParametersSchema.optional() })
  .strict();

/**
 * Agent Tool API 입구(T-103 · ADR-036).
 *
 * 1. **서비스 인증**: `Authorization: Bearer <CERA_AGENT_TOOL_TOKEN>` 만. 사람 헤더(`X-CERA-Actor-Id`)를 흉내 내지 않는다 —
 *    행위자는 실행 기록의 AI_AGENT 이고 요청이 바꿀 수 없다. 비교는 SHA-256 지문을 시간 일정 비교(timingSafeEqual)로. 토큰은 기록 · 로그 · 오류에 없다
 * 2. **실행 범위**: `X-CERA-Agent-Run-Id` 의 ACTIVE 실행. 실행은 사람(또는 SYSTEM Coordinator)이 계획 실행 하나에 묶어 만든다
 * 3. 꺼져 있으면(`CERA_AGENT_TOOLS_ENABLED=false`) 모든 호출을 거부한다
 */
@Injectable()
export class AgentToolsService {
  private readonly executor: ToolExecutor;
  private readonly handlers: Record<ToolName, ToolHandler>;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(AgentRunRepository) private readonly runs: AgentRunRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(PublicDataService) publicData: PublicDataService,
    @Inject(RegistryService) registry: RegistryService,
    @Inject(DraftService) drafts: DraftService,
    @Inject(RecoveryContextService) context: RecoveryContextService,
    @Inject(AgentServiceAuth) private readonly auth: AgentServiceAuth,
  ) {
    this.executor = new ToolExecutor(
      {
        insertStarted: (c) => this.runs.insertStarted(c),
        insertRejected: (c, code, at) => this.runs.insertRejected(c, code, at),
        finish: (q, id, end) => this.runs.finish(q, id, end),
        findLive: (runId, tool, key) => this.runs.findLive(runId, tool, key),
      },
      clock,
      ids,
    );
    this.handlers = buildHandlers({ publicData, registry, drafts, context, runs });
  }

  /** 인증 · 실행 확인 뒤 도구 목록(계약 파일과 같은 내용). */
  catalog(authorization: string | undefined) {
    this.authenticate(authorization);
    return toolCatalog();
  }

  async call(toolName: string, body: unknown, headers: { authorization?: string; agentRunId?: string; idempotencyKey?: string }): Promise<ToolEnvelope> {
    this.authenticate(headers.authorization);
    const tool = findTool(toolName);
    if (!tool) throw new ToolGatewayError('TOOL_NOT_FOUND', 404, `No agent tool named ${toolName.slice(0, 60)} — only registered tools exist`);
    const run = await this.activeRun(headers.agentRunId);
    const ctx = currentContext();
    const handler = this.handlers[tool.name as ToolName];
    if (!handler) throw new ToolGatewayError('TOOL_NOT_FOUND', 404, `Agent tool ${tool.name} has no handler`);
    return this.executor.execute(tool, handler, body, {
      run,
      idempotencyKey: headers.idempotencyKey?.trim() || null,
      requestId: ctx?.requestId ?? null,
      traceId: ctx?.traceId ?? null,
    });
  }

  // ── 사람(또는 Coordinator) 쪽: 실행 만들기 · 보기 · 취소 ──

  async createRun(actorHeader: string | undefined, body: unknown) {
    const creator = await this.requireHuman(actorHeader);
    const parsed = createRunSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('INVALID_REQUEST', 'Body must be { recovery_run_id, goal, runtime_version? }', parsed.error.issues.map((i) => i.path.join('.')));
    const recovery = await this.runs.findRecoveryRun(parsed.data.recovery_run_id);
    if (!recovery) throw new BusinessRuleError('RUN_NOT_FOUND', 'No recovery run with this id', 404);
    const agentActorId = await this.runs.findAgentActorId();
    if (!agentActorId) throw new BusinessRuleError('AGENT_ACTOR_MISSING', 'No active AI_AGENT actor is registered', 409);
    const row: AgentRunRow = {
      agentRunId: this.ids.newId(),
      recoveryRunId: recovery.runId,
      goal: parsed.data.goal,
      status: 'CREATED',
      parameters: parsed.data.parameters ?? null,
      agentActorId,
      createdByActorId: creator,
      runtimeVersion: parsed.data.runtime_version ?? null,
      traceId: currentContext()?.traceId ?? null,
      startedAt: this.clock.now().toDb(),
      finishedAt: null,
      isSimulated: recovery.containsSimulated,
    };
    await this.runs.insertRun(row);
    return this.runView(row);
  }

  async getRun(agentRunId: string) {
    if (!UUID.test(agentRunId)) throw new ValidationError('INVALID_ID', 'agentRunId must be a UUID', ['agentRunId']);
    const row = await this.runs.findRun(agentRunId);
    if (!row) throw new BusinessRuleError('AGENT_RUN_NOT_FOUND', 'No agent run with this id', 404);
    return this.runView(row);
  }

  async cancelRun(agentRunId: string, actorHeader: string | undefined) {
    await this.requireHuman(actorHeader);
    const run = await this.getRun(agentRunId);
    if (!(await this.runs.cancelRun(agentRunId, this.clock.now().toDb()))) {
      throw new BusinessRuleError('AGENT_RUN_NOT_ACTIVE', `The agent run is ${run.status}`, 409);
    }
    return this.getRun(agentRunId);
  }

  /** Backend → Agent Runtime 연결 확인(CERA_AGENT_RUNTIME_URL). 실행 시작 · 재개 호출은 T-104. */
  async runtimeStatus() {
    const url = `${this.env.CERA_AGENT_RUNTIME_URL.replace(/\/$/, '')}/health`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      return { runtime_url: this.env.CERA_AGENT_RUNTIME_URL, reachable: res.ok, http_status: res.status, tools_enabled: this.env.CERA_AGENT_TOOLS_ENABLED, tool_count: TOOLS.length };
    } catch {
      return { runtime_url: this.env.CERA_AGENT_RUNTIME_URL, reachable: false, http_status: null, tools_enabled: this.env.CERA_AGENT_TOOLS_ENABLED, tool_count: TOOLS.length };
    }
  }

  // ── 내부 ──

  private authenticate(authorization: string | undefined): void {
    this.auth.verify(authorization);
  }

  private async activeRun(header: string | undefined): Promise<AgentRunRow> {
    const id = header?.trim() ?? '';
    if (!UUID.test(id)) throw new ToolGatewayError('AGENT_RUN_NOT_FOUND', 404, 'X-CERA-Agent-Run-Id must name an agent run');
    const run = await this.runs.findRun(id);
    if (!run) throw new ToolGatewayError('AGENT_RUN_NOT_FOUND', 404, 'No agent run with this id');
    // Tool 은 시작 전(CREATED) · 실행 중(RUNNING)에만. 기다리는(사람 · 외부 사건) · 끝난 실행은 Tool 을 부르지 않는다
    if (run.status !== 'CREATED' && run.status !== 'RUNNING') throw new ToolGatewayError('AGENT_RUN_NOT_ACTIVE', 409, `The agent run is ${run.status}`);
    return run;
  }

  async requireHuman(header: string | undefined): Promise<string> {
    const value = header?.trim();
    if (!value) throw new ValidationError('ACTOR_REQUIRED', 'The X-CERA-Actor-Id header is required', ['x-cera-actor-id']);
    if (!UUID.test(value)) throw new ValidationError('INVALID_ID', 'x-cera-actor-id must be a UUID', ['x-cera-actor-id']);
    const found = await this.runs.findActor(value);
    if (!found || !found.isActive || found.actorType !== 'HUMAN') throw new BusinessRuleError('ACTOR_NOT_ALLOWED', 'Only an active human operator can start or cancel an agent run', 403);
    return value;
  }

  async runView(row: AgentRunRow, steps: unknown[] = []) {
    const calls = await this.runs.listCalls(row.agentRunId);
    return {
      agent_run_id: row.agentRunId,
      recovery_run_id: row.recoveryRunId,
      goal: row.goal,
      status: row.status,
      agent_actor_id: row.agentActorId,
      created_by_actor_id: row.createdByActorId,
      runtime_version: row.runtimeVersion,
      trace_id: row.traceId,
      started_at: Instant.fromDb(row.startedAt).toSeoulIso(),
      finished_at: row.finishedAt ? Instant.fromDb(row.finishedAt).toSeoulIso() : null,
      is_simulated: row.isSimulated,
      parameters: row.parameters ?? null,
      current_node: row.currentNode ?? null,
      waiting_reason: row.waitingReason ?? null,
      pending_ref: row.pendingRefType && row.pendingRefId ? { type: row.pendingRefType, id: row.pendingRefId } : null,
      last_error_code: row.lastErrorCode ?? null,
      updated_at: row.updatedAt ? Instant.fromDb(row.updatedAt).toSeoulIso() : null,
      runtime_attempts: row.runtimeAttempts ?? 0,
      next_attempt_at: row.nextAttemptAt ? Instant.fromDb(row.nextAttemptAt).toSeoulIso() : null,
      result_summary: row.resultSummary ?? null,
      steps,
      tool_calls: calls.map((c) => ({
        tool_call_id: c.toolCallId,
        tool_name: c.toolName,
        tool_version: c.toolVersion,
        category: c.category,
        status: c.status,
        idempotency_key: c.idempotencyKey,
        input_hash: c.inputHash,
        output_hash: c.outputHash,
        result_ref: c.resultRefType && c.resultRefId ? { type: c.resultRefType, id: c.resultRefId } : null,
        error_code: c.errorCode,
        started_at: Instant.fromDb(c.startedAt).toSeoulIso(),
        finished_at: c.finishedAt ? Instant.fromDb(c.finishedAt).toSeoulIso() : null,
        duration_ms: c.durationMs,
        trace_id: c.traceId,
      })),
    };
  }
}

export { ENVELOPE_SCHEMA_VERSION };
