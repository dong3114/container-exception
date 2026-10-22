import { z } from 'zod';
import { assertOutsideTransaction } from '../db/transaction.js';
import { outboundHeaders } from '../shared/context/request-context.js';

/**
 * Backend → Python Agent Runtime(CERA_AGENT_RUNTIME_URL). 시작 · 재개를 요청하고, 그래프가 interrupt 나 끝에 닿으면 결과를 받는다.
 * 결과는 **믿지 않는다**: 모양을 엄격하게 확인하고, 상태 전이는 Coordinator 가 DB 규칙 안에서 한다.
 * 서비스 토큰은 헤더에만(로그 · 오류에 없음). 트랜잭션 안에서 부르지 않는다(외부 I/O).
 */
export const AGENT_RUNTIME_CLIENT = Symbol('CERA_AGENT_RUNTIME_CLIENT');

const code = z.string().regex(/^[A-Z][A-Z0-9_]{0,59}$/);
export const runtimeOutcomeSchema = z
  .object({
    schema_version: z.literal('agent-runtime/1'),
    agent_run_id: z.uuid(),
    status: z.enum(['WAITING_HUMAN', 'WAITING_EXTERNAL', 'COMPLETED', 'FAILED']),
    node: z.string().regex(/^[a-z][a-z0-9_]{0,59}$/).nullable(),
    waiting_reason: code.nullable(),
    pending: z.object({ type: z.enum(['COMM_MESSAGE']), id: z.uuid() }).strict().nullable(),
    result_code: code.nullable(),
    error_code: code.nullable(),
    // 끝났을 때의 요약 — 코드 · id · 개수만(업무 값 · 원문 없음). 기다리는 중이면 null
    result_summary: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,59}$/), z.union([z.string().max(200), z.number(), z.boolean(), z.null(), z.array(z.string().max(200)).max(50)])).nullable(),
  })
  .strict()
  .superRefine((o, ctx) => {
    const waiting = o.status === 'WAITING_HUMAN' || o.status === 'WAITING_EXTERNAL';
    if (waiting !== (o.waiting_reason !== null)) ctx.addIssue({ code: 'custom', message: 'waiting_reason is required exactly for waiting states' });
    if (o.status === 'FAILED' && !o.error_code) ctx.addIssue({ code: 'custom', message: 'FAILED needs error_code' });
  });
export type RuntimeOutcome = z.infer<typeof runtimeOutcomeSchema>;

export interface StartRequest {
  agent_run_id: string;
  recovery_run_id: string;
  goal: string;
  parameters: Record<string, unknown> | null;
}

export interface ResumeRequest {
  agent_run_id: string;
  reason: string;
  ref: { type: string; id: string } | null;
}

/** 일시 장애 — 같은 실행을 나중에 다시 시도한다(WAITING_RUNTIME). 그 밖(거부 · 계약 위반)은 실행을 끝낸다. */
export const TRANSIENT_RUNTIME_ERRORS = ['AGENT_RUNTIME_UNAVAILABLE', 'AGENT_RUNTIME_TIMEOUT'] as const;
export const isTransientRuntimeError = (code: string) => (TRANSIENT_RUNTIME_ERRORS as readonly string[]).includes(code);

export class RuntimeCallError extends Error {
  constructor(readonly code: 'AGENT_RUNTIME_UNAVAILABLE' | 'AGENT_RUNTIME_TIMEOUT' | 'AGENT_RUNTIME_PROTOCOL_ERROR' | 'AGENT_RUNTIME_REFUSED') {
    super(code);
    this.name = 'RuntimeCallError';
  }
}

export interface AgentRuntimeClient {
  start(req: StartRequest): Promise<RuntimeOutcome>;
  resume(req: ResumeRequest): Promise<RuntimeOutcome>;
}

export class HttpAgentRuntimeClient implements AgentRuntimeClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string | undefined,
    private readonly timeoutMs: number,
  ) {}

  start(req: StartRequest): Promise<RuntimeOutcome> {
    return this.post(`/v1/agent-runs/${req.agent_run_id}/start`, req, req.agent_run_id);
  }

  resume(req: ResumeRequest): Promise<RuntimeOutcome> {
    return this.post(`/v1/agent-runs/${req.agent_run_id}/resume`, req, req.agent_run_id);
  }

  private async post(path: string, body: unknown, agentRunId: string): Promise<RuntimeOutcome> {
    assertOutsideTransaction('agent runtime call');
    if (!this.token) throw new RuntimeCallError('AGENT_RUNTIME_REFUSED');
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}`, ...outboundHeaders() },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      throw new RuntimeCallError(name === 'TimeoutError' || name === 'AbortError' ? 'AGENT_RUNTIME_TIMEOUT' : 'AGENT_RUNTIME_UNAVAILABLE');
    }
    if (response.status === 401 || response.status === 403) throw new RuntimeCallError('AGENT_RUNTIME_REFUSED');
    // 5xx = Runtime 이 지금 일을 못 한다(재기동 중 · Backend 저장 통로 장애) — 일시 장애로 본다
    if (response.status >= 500) throw new RuntimeCallError('AGENT_RUNTIME_UNAVAILABLE');
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new RuntimeCallError('AGENT_RUNTIME_PROTOCOL_ERROR');
    }
    const parsed = runtimeOutcomeSchema.safeParse(json);
    if (!response.ok || !parsed.success || parsed.data.agent_run_id !== agentRunId) throw new RuntimeCallError('AGENT_RUNTIME_PROTOCOL_ERROR');
    return parsed.data;
  }
}
