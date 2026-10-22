import { z } from 'zod';
import { TOOL_ERROR_CODES, GATEWAY_ERROR_CODES } from './tool-errors.js';
import { ENVELOPE_SCHEMA_VERSION } from './executor.js';
import { TOOLS } from './registry.js';

/**
 * Agent Tool 계약 파일(`packages/contracts/agent-tools/agent-tools.v1.json`)의 내용. 정본은 `registry.ts` · `schemas.ts`(zod) 하나고,
 * 이 함수가 JSON Schema(draft 2020-12)로 바꾼다. Python Agent Runtime 은 이 파일을 읽어 Tool Registry 를 만든다 — DTO 를 따로 쓰지 않는다.
 * `npm run agent-tools:emit` 이 파일을 쓰고, 단위 시험이 최신인지 검사한다.
 */
export const TOOL_CONTRACT_PATH = '../packages/contracts/agent-tools/agent-tools.v1.json';

const toJson = (schema: z.ZodTypeAny, io: 'input' | 'output') => {
  const out = z.toJSONSchema(schema, { target: 'draft-2020-12', io, unrepresentable: 'any' }) as Record<string, unknown>;
  delete out.$schema;
  return out;
};

export function toolCatalog() {
  return {
    schema_version: 'agent-tools/1',
    envelope_schema_version: ENVELOPE_SCHEMA_VERSION,
    transport: {
      method: 'POST',
      path: '/internal/agent-tools/{tool}',
      headers: {
        authorization: 'Bearer <CERA_AGENT_TOOL_TOKEN> (service token — never in the URL or query)',
        'x-cera-agent-run-id': 'Agent run created by a human or the coordinator; fixes the recovery-run scope',
        'idempotency-key': 'Required for PROPOSE and REQUEST tools; same key + same input returns the same result',
        traceparent: 'W3C trace context (optional)',
      },
      body: 'Tool input object (input_schema)',
      response: 'Envelope { schema_version, tool, tool_call_id, status: SUCCEEDED|REJECTED|FAILED, replayed, output, error }',
    },
    categories: {
      READ: 'Reads CERA state, no external I/O',
      EXTERNAL_READ: 'Backend reads an external system and keeps the raw response; no business state is confirmed',
      COMPUTE: 'Deterministic calculation, no side effects',
      PROPOSE: 'Creates a draft or candidate; business truth does not change',
      REQUEST: 'Asks a human to act (e.g. approval queue); never approves or sends',
    },
    not_available_to_agents: 'COMMIT actions — approve, reject, send, confirm a fact, select the final plan, change the registry',
    error_codes: {
      tool: Object.fromEntries(Object.entries(TOOL_ERROR_CODES).map(([k, v]) => [k, { status: v.status, retryable: v.retryable }])),
      gateway: GATEWAY_ERROR_CODES,
    },
    tools: TOOLS.map((t) => ({
      name: t.name,
      version: t.version,
      category: t.category,
      description: t.description,
      timeout_ms: t.timeoutMs,
      idempotency: t.idempotency,
      input_schema: toJson(t.input, 'input'),
      output_schema: toJson(t.output, 'output'),
    })),
  };
}
