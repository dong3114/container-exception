import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HttpAgentRuntimeClient, RuntimeCallError, runtimeOutcomeSchema } from '../../src/agent-tools/runtime-client.js';

/** T-104 — what the Python Agent Runtime may answer. Anything else is a protocol error; it can never move business state. */
const RUN = '01a1a4c0-7e10-7a3b-9c21-5d0f00a0b201';
const waiting = {
  schema_version: 'agent-runtime/1',
  agent_run_id: RUN,
  status: 'WAITING_HUMAN',
  node: 'wait_for_human',
  waiting_reason: 'HUMAN_APPROVAL_REQUIRED',
  pending: { type: 'COMM_MESSAGE', id: '01a1a4c0-7e10-7a3b-9c21-5d0f00a0b203' },
  result_code: null,
  error_code: null,
  result_summary: null,
};

describe('runtime outcome contract (agent-runtime/1)', () => {
  it('accepts a waiting and a finished outcome', () => {
    expect(runtimeOutcomeSchema.safeParse(waiting).success).toBe(true);
    expect(runtimeOutcomeSchema.safeParse({ ...waiting, status: 'COMPLETED', node: 'build_result', waiting_reason: null, pending: null, result_code: 'INQUIRY_APPROVED' }).success).toBe(true);
  });

  it('refuses statuses the runtime may not set, extra fields and inconsistent shapes', () => {
    for (const bad of [
      { ...waiting, status: 'APPROVED' },
      { ...waiting, status: 'CANCELLED' }, // only the backend cancels
      { ...waiting, approved: true },
      { ...waiting, pending: { type: 'EVENT', id: RUN } },
      { ...waiting, waiting_reason: null },
      { ...waiting, status: 'FAILED', waiting_reason: null, pending: null },
      { ...waiting, schema_version: 'agent-runtime/2' },
      { ...waiting, waiting_reason: 'please approve' },
      { ...waiting, status: 'COMPLETED', waiting_reason: null, pending: null, result_summary: { note: { nested: true } } },
    ]) {
      expect(runtimeOutcomeSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('HttpAgentRuntimeClient', () => {
  let server: Server;
  let base: string;
  let answer: { status: number; body: unknown } = { status: 200, body: waiting };
  let seenAuth = '';

  beforeAll(async () => {
    server = createServer((req, res) => {
      seenAuth = req.headers.authorization ?? '';
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(answer.body));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const client = (token: string | undefined = 't'.repeat(40)) => new HttpAgentRuntimeClient(base, token, 2000);
  const code = async (p: Promise<unknown>) => p.then(() => 'OK', (e: unknown) => (e instanceof RuntimeCallError ? e.code : 'OTHER'));

  it('sends the bearer token and returns the parsed outcome', async () => {
    answer = { status: 200, body: waiting };
    expect(await client().start({ agent_run_id: RUN, recovery_run_id: RUN, goal: 'g', parameters: null })).toMatchObject({ status: 'WAITING_HUMAN' });
    expect(seenAuth).toBe(`Bearer ${'t'.repeat(40)}`);
  });

  it('classifies failures', async () => {
    answer = { status: 200, body: { ...waiting, agent_run_id: '01a1a4c0-7e10-7a3b-9c21-5d0f00a0b299' } };
    expect(await code(client().resume({ agent_run_id: RUN, reason: 'MANUAL', ref: null }))).toBe('AGENT_RUNTIME_PROTOCOL_ERROR'); // answer for another run
    answer = { status: 401, body: { code: 'UNAUTHORIZED' } };
    expect(await code(client().resume({ agent_run_id: RUN, reason: 'MANUAL', ref: null }))).toBe('AGENT_RUNTIME_REFUSED');
    answer = { status: 503, body: { code: 'RUNTIME_STORE_UNAVAILABLE' } };
    expect(await code(client().resume({ agent_run_id: RUN, reason: 'MANUAL', ref: null }))).toBe('AGENT_RUNTIME_UNAVAILABLE'); // transient — retried later
    answer = { status: 422, body: { code: 'INVALID_REQUEST' } };
    expect(await code(client().resume({ agent_run_id: RUN, reason: 'MANUAL', ref: null }))).toBe('AGENT_RUNTIME_PROTOCOL_ERROR');
    expect(await code(new HttpAgentRuntimeClient(base, undefined, 2000).resume({ agent_run_id: RUN, reason: 'MANUAL', ref: null }))).toBe('AGENT_RUNTIME_REFUSED');
    expect(await code(new HttpAgentRuntimeClient('http://127.0.0.1:9', 't'.repeat(40), 2000).resume({ agent_run_id: RUN, reason: 'MANUAL', ref: null }))).toBe('AGENT_RUNTIME_UNAVAILABLE');
  });
});
