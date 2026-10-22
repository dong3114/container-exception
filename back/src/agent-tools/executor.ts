import canonicalize from 'canonicalize';
import type { DbTransaction } from '../db/database.js';
import { sha256Bytes, type Sha256Hash } from '../shared/hash/hash.js';
import type { IdGenerator } from '../shared/id/uuid.js';
import type { Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import type { AgentRunRow, ToolCallEnd, ToolCallStart } from './agent-run.repository.js';
import type { ToolDefinition } from './registry.js';
import { fromDomainError, type ToolErrorBody, ToolFailure } from './tool-errors.js';

/**
 * Tool 실행기(T-103). 모든 Tool 호출이 같은 순서를 지난다:
 *   멱등 키 검사 → 입력 계약 검사 → 같은 키의 앞선 호출 확인 → STARTED 기록 → 시간 제한 안에서 실행 → 출력 계약 검사 → 끝 기록.
 * 기록에는 입력 · 출력 **지문**만 남는다(원문 · 비밀값 없음). 실행 전 거부(인자 · 범위 · 멱등)도 REJECTED 로 남는다.
 *
 * 부작용 Tool(PROPOSE · REQUEST)은 `ctx.commit(tx, ref)` 로 **업무 기록과 같은 트랜잭션에서** 성공을 표시한다 —
 * 초안은 생겼는데 호출 기록은 STARTED 로 남는 틈이 없다. 시간 초과로 먼저 FAILED 가 되면 commit 이 실패해 업무 트랜잭션도 되돌린다.
 */
export const ENVELOPE_SCHEMA_VERSION = 'agent-tool/1';

export interface ToolCallRecorder {
  insertStarted(c: ToolCallStart): Promise<boolean>;
  insertRejected(c: ToolCallStart, errorCode: string, finishedAt: string): Promise<void>;
  finish(q: DbTransaction | null, toolCallId: string, end: ToolCallEnd): Promise<boolean>;
  findLive(agentRunId: string, toolName: string, idempotencyKey: string): Promise<{
    toolCallId: string;
    status: string;
    inputHash: string;
    resultRefType: string | null;
    resultRefId: string | null;
    startedAt: string;
  } | null>;
}

export interface ToolContext {
  run: AgentRunRow;
  toolCallId: string;
  /** 부작용 Tool: 업무 기록과 같은 트랜잭션에서 성공 표시 */
  commit(tx: DbTransaction, ref: { type: string; id: string }): Promise<void>;
}

export interface ToolHandler {
  run(input: unknown, ctx: ToolContext): Promise<unknown>;
  /** 같은 멱등 키로 다시 부르면 앞선 결과 참조로 출력을 다시 만든다 */
  replay?(ref: { type: string; id: string }, run: AgentRunRow): Promise<unknown>;
}

export interface ToolEnvelope {
  schema_version: typeof ENVELOPE_SCHEMA_VERSION;
  tool: string;
  tool_call_id: string | null;
  status: 'SUCCEEDED' | 'REJECTED' | 'FAILED';
  replayed: boolean;
  output: unknown;
  error: ToolErrorBody | null;
}

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{1,100}$/;

/** JCS(RFC 8785) 지문 — 10진 값도 받는다(입력 값 숫자). */
export function contentHash(kind: string, value: unknown): Sha256Hash {
  const text = canonicalize({ k: kind, v: 1, value: JSON.parse(JSON.stringify(value ?? null)) });
  return sha256Bytes(text ?? 'null');
}

export class ToolExecutor {
  constructor(
    private readonly recorder: ToolCallRecorder,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(
    tool: ToolDefinition,
    handler: ToolHandler,
    rawInput: unknown,
    meta: { run: AgentRunRow; idempotencyKey: string | null; requestId: string | null; traceId: string | null },
  ): Promise<ToolEnvelope> {
    const started = this.clock.now();
    const key = tool.idempotency === 'REQUIRED' ? meta.idempotencyKey : null;
    const base: ToolCallStart = {
      toolCallId: this.ids.newId(),
      agentRunId: meta.run.agentRunId,
      toolName: tool.name,
      toolVersion: tool.version,
      category: tool.category,
      idempotencyKey: key && IDEMPOTENCY_KEY.test(key) ? key : null,
      inputHash: contentHash('agent-tool-input', rawInput),
      startedAt: started.toDb(),
      requestId: meta.requestId,
      traceId: meta.traceId,
    };
    const reject = async (failure: ToolFailure): Promise<ToolEnvelope> => {
      await this.recorder.insertRejected(base, failure.code, this.clock.now().toDb());
      return envelope(tool.name, base.toolCallId, failure);
    };

    if (tool.idempotency === 'REQUIRED') {
      if (!key) return reject(new ToolFailure('IDEMPOTENCY_KEY_REQUIRED', 'This tool has side effects: send an Idempotency-Key header'));
      if (!IDEMPOTENCY_KEY.test(key)) return reject(new ToolFailure('INVALID_ARGUMENT', 'Idempotency-Key must be 1-100 of [A-Za-z0-9._:-]'));
    }
    const parsed = tool.input.safeParse(rawInput ?? {});
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path.join('.') || '(root)');
      return reject(new ToolFailure('INVALID_ARGUMENT', `Input does not match ${tool.name} v${tool.version}`, { details: { fields } }));
    }

    // 같은 실행 · Tool · 키의 앞선 호출
    if (base.idempotencyKey) {
      const prior = await this.recorder.findLive(base.agentRunId, tool.name, base.idempotencyKey);
      if (prior) {
        const replayed = await this.fromPrior(tool, handler, prior, base, meta.run, started);
        if (replayed) return replayed;
      }
    }
    if (!(await this.recorder.insertStarted(base))) {
      // 동시에 같은 키가 먼저 들어갔다
      const prior = base.idempotencyKey ? await this.recorder.findLive(base.agentRunId, tool.name, base.idempotencyKey) : null;
      const replayed = prior ? await this.fromPrior(tool, handler, prior, base, meta.run, started) : null;
      return replayed ?? reject(new ToolFailure('TOOL_CALL_IN_PROGRESS', 'The same call is already running — retry later', {}));
    }

    let committed = false;
    const ctx: ToolContext = {
      run: meta.run,
      toolCallId: base.toolCallId,
      commit: async (tx, ref) => {
        const ok = await this.recorder.finish(tx, base.toolCallId, { status: 'SUCCEEDED', outputHash: contentHash('agent-tool-result-ref', ref), resultRef: ref, finishedAt: this.clock.now().toDb(), durationMs: this.elapsed(started) });
        if (!ok) throw new ToolFailure('TOOL_TIMEOUT', 'The tool call ended (timeout) before its result was committed');
        committed = true;
      },
    };

    const work = handler.run(parsed.data, ctx);
    work.catch(() => undefined); // 시간 초과 뒤 늦게 끝나는 실패를 삼킨다(기록은 이미 끝났다)
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, rejectTimeout) => {
      timer = setTimeout(
        () => rejectTimeout(new ToolFailure(tool.category === 'EXTERNAL_READ' ? 'UPSTREAM_TIMEOUT' : 'TOOL_TIMEOUT', `${tool.name} did not finish within ${tool.timeoutMs} ms`)),
        tool.timeoutMs,
      );
    });
    try {
      const output = await Promise.race([work, timeout]);
      const checked = tool.output.safeParse(output);
      if (!checked.success) {
        const failure = new ToolFailure('OUTPUT_CONTRACT_VIOLATION', `Backend output does not match ${tool.name} v${tool.version}`);
        if (!committed) await this.end(base.toolCallId, failure, started);
        return envelope(tool.name, base.toolCallId, failure);
      }
      if (!committed) {
        await this.recorder.finish(null, base.toolCallId, { status: 'SUCCEEDED', outputHash: contentHash('agent-tool-output', checked.data), finishedAt: this.clock.now().toDb(), durationMs: this.elapsed(started) });
      }
      return { schema_version: ENVELOPE_SCHEMA_VERSION, tool: tool.name, tool_call_id: base.toolCallId, status: 'SUCCEEDED', replayed: false, output: checked.data, error: null };
    } catch (error) {
      const failure = fromDomainError(error);
      if (!committed) await this.end(base.toolCallId, failure, started);
      return envelope(tool.name, base.toolCallId, failure);
    } finally {
      clearTimeout(timer);
    }
  }

  private async fromPrior(
    tool: ToolDefinition,
    handler: ToolHandler,
    prior: NonNullable<Awaited<ReturnType<ToolCallRecorder['findLive']>>>,
    base: ToolCallStart,
    run: AgentRunRow,
    now: Instant,
  ): Promise<ToolEnvelope | null> {
    if (prior.inputHash !== base.inputHash) {
      await this.recorder.insertRejected(base, 'IDEMPOTENCY_KEY_REUSED', this.clock.now().toDb());
      return envelope(tool.name, base.toolCallId, new ToolFailure('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was used with a different input'));
    }
    if (prior.status === 'SUCCEEDED' && prior.resultRefType && prior.resultRefId && handler.replay) {
      const output = await handler.replay({ type: prior.resultRefType, id: prior.resultRefId }, run);
      return { schema_version: ENVELOPE_SCHEMA_VERSION, tool: tool.name, tool_call_id: prior.toolCallId, status: 'SUCCEEDED', replayed: true, output: tool.output.parse(output), error: null };
    }
    if (prior.status === 'STARTED') {
      // 끝나지 못한 앞선 호출(프로세스 중단 등): 시간 제한의 두 배가 지났으면 실패로 닫고 새로 시도한다.
      // 부작용은 commit 과 한 트랜잭션이라, 닫힌 호출이 업무 기록을 남겼을 수는 없다.
      if (now.epochMs - Instant.fromDb(prior.startedAt).epochMs > tool.timeoutMs * 2) {
        await this.recorder.finish(null, prior.toolCallId, { status: 'FAILED', errorCode: 'TOOL_TIMEOUT', finishedAt: this.clock.now().toDb(), durationMs: tool.timeoutMs * 2 });
        return null;
      }
      await this.recorder.insertRejected(base, 'TOOL_CALL_IN_PROGRESS', this.clock.now().toDb());
      return envelope(tool.name, base.toolCallId, new ToolFailure('TOOL_CALL_IN_PROGRESS', 'The same call is already running — retry later'));
    }
    return null;
  }

  private async end(toolCallId: string, failure: ToolFailure, started: Instant): Promise<void> {
    await this.recorder.finish(null, toolCallId, { status: failure.status, errorCode: failure.code, finishedAt: this.clock.now().toDb(), durationMs: this.elapsed(started) });
  }

  private elapsed(started: Instant): number {
    return Math.max(0, this.clock.now().epochMs - started.epochMs);
  }
}

function envelope(tool: string, toolCallId: string | null, failure: ToolFailure): ToolEnvelope {
  return { schema_version: ENVELOPE_SCHEMA_VERSION, tool, tool_call_id: toolCallId, status: failure.status, replayed: false, output: null, error: failure.body() };
}
