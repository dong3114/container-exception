import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { AgentRunRow, ToolCallEnd, ToolCallStart } from '../../src/agent-tools/agent-run.repository.js';
import { renderToolContracts } from '../../src/agent-tools/emit-tool-contracts.js';
import { contentHash, type ToolCallRecorder, ToolExecutor, type ToolHandler } from '../../src/agent-tools/executor.js';
import { FORBIDDEN_TOOL_NAMES, type ToolDefinition, TOOLS } from '../../src/agent-tools/registry.js';
import { TOOL_CONTRACT_PATH } from '../../src/agent-tools/tool-contracts.js';
import { fromDomainError } from '../../src/agent-tools/tool-errors.js';
import { BusinessRuleError, SystemError, ValidationError } from '../../src/shared/errors/cera-error.js';
import { FixedIdGenerator, UuidV7Generator } from '../../src/shared/id/uuid.js';
import { FakeClock } from '../../src/shared/time/clock.js';

/** 메모리 호출 기록기 — DB 와 같은 규칙(진행 중 · 성공은 키마다 하나, STARTED 에서만 끝난다). */
class MemoryRecorder implements ToolCallRecorder {
  rows = new Map<string, ToolCallStart & { status: string; errorCode: string | null; resultRefType: string | null; resultRefId: string | null; outputHash: string | null }>();
  async insertStarted(c: ToolCallStart) {
    const dup = [...this.rows.values()].some((r) => c.idempotencyKey && r.agentRunId === c.agentRunId && r.toolName === c.toolName && r.idempotencyKey === c.idempotencyKey && ['STARTED', 'SUCCEEDED'].includes(r.status));
    if (dup) return false;
    this.rows.set(c.toolCallId, { ...c, status: 'STARTED', errorCode: null, resultRefType: null, resultRefId: null, outputHash: null });
    return true;
  }
  async insertRejected(c: ToolCallStart, errorCode: string) {
    this.rows.set(c.toolCallId, { ...c, status: 'REJECTED', errorCode, resultRefType: null, resultRefId: null, outputHash: null });
  }
  async finish(_q: unknown, id: string, end: ToolCallEnd) {
    const r = this.rows.get(id);
    if (!r || r.status !== 'STARTED') return false;
    Object.assign(r, { status: end.status, errorCode: end.errorCode ?? null, resultRefType: end.resultRef?.type ?? null, resultRefId: end.resultRef?.id ?? null, outputHash: end.outputHash ?? null });
    return true;
  }
  async findLive(agentRunId: string, toolName: string, key: string) {
    const r = [...this.rows.values()].find((x) => x.agentRunId === agentRunId && x.toolName === toolName && x.idempotencyKey === key && ['STARTED', 'SUCCEEDED'].includes(x.status));
    return r ? { toolCallId: r.toolCallId, status: r.status, inputHash: r.inputHash, resultRefType: r.resultRefType, resultRefId: r.resultRefId, startedAt: r.startedAt.replace('T', ' ') } : null;
  }
}

const run: AgentRunRow = {
  agentRunId: '01a1a4c0-7e10-7a3b-9c21-5d0f00a0b101',
  recoveryRunId: '01a1a4c0-7e10-7a3b-9c21-5d0f00a0b102',
  goal: 'test',
  status: 'ACTIVE',
  agentActorId: '01a1a4c0-7e10-7a3b-9c21-5d0f00a0b103',
  createdByActorId: '01a1a4c0-7e10-7a3b-9c21-5d0f00a0b104',
  runtimeVersion: null,
  traceId: null,
  startedAt: '2026-10-22 00:00:00+00',
  finishedAt: null,
  isSimulated: true,
};

const def = (over: Partial<ToolDefinition> = {}): ToolDefinition => ({
  name: 'probe_tool',
  version: '1',
  category: 'READ',
  description: 'test',
  input: z.object({ n: z.number().int() }).strict(),
  output: z.object({ doubled: z.number().int() }).strict(),
  timeoutMs: 50,
  idempotency: 'NONE',
  ...over,
});

const setup = () => {
  const recorder = new MemoryRecorder();
  const executor = new ToolExecutor(recorder, new FakeClock('2026-10-22T10:00:00+09:00'), new UuidV7Generator());
  const meta = { run, idempotencyKey: null as string | null, requestId: 'req', traceId: 'a'.repeat(32) };
  return { recorder, executor, meta };
};

describe('tool registry', () => {
  it('has the ten tools (T-103 nine + T-105 get_reply_candidates, READ) and no COMMIT tool or category', () => {
    expect(TOOLS.map((t) => t.name)).toEqual([
      'get_vessel_calls', 'get_vessel_call', 'get_container_manifest', 'get_recovery_context', 'get_information_gaps',
      'find_counterparty', 'create_inquiry_draft', 'get_communication_status', 'get_reply_candidates', 'request_approval',
    ]);
    expect(TOOLS.every((t) => ['READ', 'EXTERNAL_READ', 'COMPUTE', 'PROPOSE', 'REQUEST'].includes(t.category))).toBe(true);
    for (const forbidden of FORBIDDEN_TOOL_NAMES) expect(TOOLS.some((t) => t.name === forbidden)).toBe(false);
    expect(TOOLS.filter((t) => t.idempotency === 'REQUIRED').map((t) => t.category).sort()).toEqual(['PROPOSE', 'REQUEST']);
    expect(TOOLS.filter((t) => ['PROPOSE', 'REQUEST'].includes(t.category)).every((t) => t.idempotency === 'REQUIRED')).toBe(true);
    expect(TOOLS.every((t) => t.description.length > 80 && /Use |Use$|Use when|call request_approval|wait/i.test(t.description))).toBe(true);
  });

  it('the shared contract file is current (python reads it — no hand-written DTOs)', () => {
    expect(readFileSync(TOOL_CONTRACT_PATH, 'utf8')).toBe(renderToolContracts());
  });
});

describe('tool executor', () => {
  it('rejects bad input and missing idempotency keys before running, and records it', async () => {
    const { recorder, executor, meta } = setup();
    const ran: unknown[] = [];
    const handler: ToolHandler = { run: async (i) => ran.push(i) && { doubled: 0 } };
    const bad = await executor.execute(def(), handler, { n: 'x' }, meta);
    expect(bad).toMatchObject({ status: 'REJECTED', error: { code: 'INVALID_ARGUMENT', retryable: false } });
    const noKey = await executor.execute(def({ category: 'PROPOSE', idempotency: 'REQUIRED' }), handler, { n: 1 }, meta);
    expect(noKey.error?.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(ran).toEqual([]);
    expect([...recorder.rows.values()].map((r) => [r.status, r.errorCode])).toEqual([['REJECTED', 'INVALID_ARGUMENT'], ['REJECTED', 'IDEMPOTENCY_KEY_REQUIRED']]);
  });

  it('J. a tool that does not finish in time is a typed FAILED (retryable), and a late commit cannot succeed', async () => {
    const { recorder, executor, meta } = setup();
    let lateCommit: Promise<void> | null = null;
    const handler: ToolHandler = {
      run: (_i, ctx) =>
        new Promise((resolve) =>
          setTimeout(() => {
            lateCommit = ctx.commit({} as never, { type: 'COMM_MESSAGE', id: run.agentRunId });
            lateCommit.catch(() => undefined); // 아래에서 거부를 확인한다
            resolve({ doubled: 2 });
          }, 120),
        ),
    };
    const external = await executor.execute(def({ category: 'EXTERNAL_READ' }), handler, { n: 1 }, meta);
    expect(external).toMatchObject({ status: 'FAILED', error: { code: 'UPSTREAM_TIMEOUT', retryable: true } });
    const internal = await executor.execute(def({ name: 'probe_two' }), { run: () => new Promise(() => undefined) }, { n: 1 }, meta);
    expect(internal.error?.code).toBe('TOOL_TIMEOUT');
    await new Promise((r) => setTimeout(r, 150));
    await expect(lateCommit).rejects.toMatchObject({ code: 'TOOL_TIMEOUT' }); // 업무 트랜잭션이 되돌려진다
    expect([...recorder.rows.values()].every((r) => r.status === 'FAILED')).toBe(true);
  });

  it('maps domain errors to typed tool errors, keeping the original code', async () => {
    const { executor, meta } = setup();
    const fail = (e: Error): ToolHandler => ({ run: async () => Promise.reject(e) });
    expect((await executor.execute(def(), fail(new BusinessRuleError('RECIPIENT_NOT_ELIGIBLE', 'gate', 403)), { n: 1 }, meta)).error).toMatchObject({ code: 'HUMAN_ACTION_REQUIRED', cause_code: 'RECIPIENT_NOT_ELIGIBLE' });
    expect((await executor.execute(def(), fail(new SystemError('DB_DOWN', 'x')), { n: 1 }, meta)).error).toMatchObject({ code: 'INTERNAL_ERROR', retryable: true, message: 'Internal error' });
    expect(fromDomainError(new ValidationError('BAD', 'x')).code).toBe('INVALID_ARGUMENT');
    expect(fromDomainError(new BusinessRuleError('PUBLIC_DATA_KEY_MISSING', 'x')).code).toBe('CAPABILITY_DISABLED');
    expect(fromDomainError(new Error('raw secret in message')).message).toBe('Internal error');
  });

  it('checks its own output against the contract', async () => {
    const { executor, meta } = setup();
    const out = await executor.execute(def(), { run: async () => ({ doubled: 'two' }) }, { n: 1 }, meta);
    expect(out).toMatchObject({ status: 'FAILED', error: { code: 'OUTPUT_CONTRACT_VIOLATION' } });
  });

  it('same key + same input replays the committed result; same key + other input is refused', async () => {
    const { recorder, executor, meta } = setup();
    const ids = new FixedIdGenerator(['01a1a4c0-7e10-7a3b-9c21-5d0f00a0b1aa']);
    const ref = { type: 'COMM_MESSAGE', id: ids.newId() };
    const proposeDef = def({ category: 'PROPOSE', idempotency: 'REQUIRED' });
    const handler: ToolHandler = {
      run: async (i, ctx) => {
        await ctx.commit({} as never, ref);
        return { doubled: (i as { n: number }).n * 2 };
      },
      replay: async () => ({ doubled: 2 }),
    };
    const k = { ...meta, idempotencyKey: 'k-1' };
    const first = await executor.execute(proposeDef, handler, { n: 1 }, k);
    const again = await executor.execute(proposeDef, handler, { n: 1 }, k);
    expect(first).toMatchObject({ status: 'SUCCEEDED', replayed: false });
    expect(again).toMatchObject({ status: 'SUCCEEDED', replayed: true, tool_call_id: first.tool_call_id, output: { doubled: 2 } });
    expect((await executor.execute(proposeDef, handler, { n: 5 }, k)).error?.code).toBe('IDEMPOTENCY_KEY_REUSED');
    const succeeded = [...recorder.rows.values()].filter((r) => r.status === 'SUCCEEDED');
    expect(succeeded).toHaveLength(1);
    expect(succeeded[0]).toMatchObject({ resultRefType: 'COMM_MESSAGE', resultRefId: ref.id, outputHash: contentHash('agent-tool-result-ref', ref) });
  });

  it('input and output are stored as hashes only', () => {
    expect(contentHash('agent-tool-input', { a: 1.5, b: 'x' })).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(contentHash('agent-tool-input', { b: 'x', a: 1.5 })).toBe(contentHash('agent-tool-input', { a: 1.5, b: 'x' }));
  });
});
