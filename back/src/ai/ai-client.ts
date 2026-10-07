import { z } from 'zod';
import { assertOutsideTransaction } from '../db/transaction.js';

/**
 * Python AI Server 호출 계약(T-092 · docs/18 D.3 · ADR-033). 정본 계약 파일: `packages/contracts/ai/reply-extract.v1.*`
 * (Python 이 스키마를 내보내고, 양쪽 시험이 같은 견본을 읽는다).
 *
 * AI 응답은 **믿지 않는다**: 여기서는 모양만(엄격 — 모르는 키 거부) 확인하고, 의미(인용 · 단위 · 질문 범위 · 값)는
 * 결정론 검증기(`extraction-rules.ts`)가 본다. 출력에는 신원 · 사실 키 · 근거 강도 자리가 없다.
 */
export const REPLY_EXTRACT_SCHEMA = 'reply-extract/1';

export interface AskField {
  name: string;
  kind: 'QUANTITY' | 'TIME' | 'MONEY';
  unit: string | null;
}

export interface Ask {
  ask_id: string;
  question: string;
  answer_shape: 'QUANTITY_IN_TIME_WINDOW' | 'QUANTITY_ON_DATE';
  fields: AskField[];
  window: { date: string; from: string; to: string } | null;
}

export interface ExtractionRequest {
  schema_version: typeof REPLY_EXTRACT_SCHEMA;
  inbound_message_id: string;
  reference_date: string;
  counterparty_name: string;
  asks: Ask[];
  message_text: string;
}

const answerSchema = z
  .object({
    ask_id: z.string().max(40),
    field: z.string().regex(/^[a-z][a-z0-9_]*$/).max(60),
    raw_value: z.string().max(200),
    value: z.string().max(100),
    unit: z.string().max(40).nullable(),
    evidence: z.object({ quote: z.string().min(1).max(500) }).strict(),
    confidence: z.number().min(0).max(1).nullable(),
  })
  .strict();

export const extractionResponseSchema = z
  .object({
    schema_version: z.literal(REPLY_EXTRACT_SCHEMA),
    outcome: z.enum(['VALUES', 'NO_CHANGE', 'REFUSAL', 'UNPARSEABLE']),
    answers: z.array(answerSchema).max(50),
    unmapped_statements: z.array(z.string()).max(50),
    ambiguity_flags: z.array(z.string()).max(20),
    meta: z
      .object({
        provider: z.string().max(40),
        model_version: z.string().max(60),
        prompt_version: z.string().max(20),
        latency_ms: z.number().int().min(0),
        usage: z.object({ input_tokens: z.number().int().nullable(), output_tokens: z.number().int().nullable() }).strict().nullable(),
      })
      .strict(),
  })
  .strict();

export type ExtractionResponse = z.infer<typeof extractionResponseSchema>;
export type ExtractionAnswer = ExtractionResponse['answers'][number];

/** 기술 실패의 분류(docs/22 15.9.2 — `system_error`, 검증기 결과가 아니다). */
export type AiFailureCode = 'AI_SERVER_UNAVAILABLE' | 'EXTRACTION_TIMEOUT' | 'EXTRACTION_PROVIDER_FAILED' | 'EXTRACTION_OUTPUT_INVALID' | 'EXTRACTION_REQUEST_REJECTED';

export type AiCallResult =
  | { ok: true; response: ExtractionResponse }
  | { ok: false; code: AiFailureCode; providerCode: string | null; retryable: boolean; httpStatus: number | null };

export interface AiClient {
  extractReply(request: ExtractionRequest, requestId: string | null): Promise<AiCallResult>;
}

export const AI_CLIENT = Symbol('CERA_AI_CLIENT');

/** HTTP/JSON 구현. 원문을 로그에 남기지 않는다(호출자도 마찬가지). */
export class HttpAiClient implements AiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async extractReply(request: ExtractionRequest, requestId: string | null): Promise<AiCallResult> {
    assertOutsideTransaction('AiClient.extractReply');
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}/v1/extractions/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(requestId ? { 'X-Request-Id': requestId } : {}) },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'TimeoutError' || name === 'AbortError') return { ok: false, code: 'EXTRACTION_TIMEOUT', providerCode: null, retryable: true, httpStatus: null };
      return { ok: false, code: 'AI_SERVER_UNAVAILABLE', providerCode: null, retryable: true, httpStatus: null };
    }
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      return { ok: false, code: 'EXTRACTION_OUTPUT_INVALID', providerCode: null, retryable: false, httpStatus: res.status };
    }
    if (!res.ok) {
      const body = payload as { code?: unknown; retryable?: unknown };
      const providerCode = typeof body.code === 'string' ? body.code.slice(0, 60) : null;
      if (res.status === 502) {
        const invalid = providerCode === 'PROVIDER_OUTPUT_INVALID' || providerCode === 'PROVIDER_OUTPUT_NOT_JSON';
        return { ok: false, code: invalid ? 'EXTRACTION_OUTPUT_INVALID' : 'EXTRACTION_PROVIDER_FAILED', providerCode, retryable: body.retryable === true, httpStatus: 502 };
      }
      // 4xx = AI Server 가 우리 요청을 거부했다(계약 어긋남 — 재시도해도 같다)
      return { ok: false, code: res.status >= 500 ? 'AI_SERVER_UNAVAILABLE' : 'EXTRACTION_REQUEST_REJECTED', providerCode, retryable: res.status >= 500, httpStatus: res.status };
    }
    const parsed = extractionResponseSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, code: 'EXTRACTION_OUTPUT_INVALID', providerCode: null, retryable: false, httpStatus: res.status };
    return { ok: true, response: parsed.data };
  }
}
