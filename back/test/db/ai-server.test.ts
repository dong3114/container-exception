import { type ChildProcess, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ExtractionRequest, HttpAiClient } from '../../src/ai/ai-client.js';

/**
 * NestJS ↔ Python AI Server 계약을 실제 프로세스로(ADR-033). 녹화 재생 공급자(`CERA_LLM_MODE=replay`)라 LLM 은 부르지 않는다.
 * 같은 견본(packages/contracts/ai)을 Python 시험도 읽는다.
 */
const SAMPLE = JSON.parse(readFileSync('../packages/contracts/ai/reply-extract.v1.request.sample.json', 'utf8')) as ExtractionRequest;
let child: ChildProcess;
let baseUrl: string;

const freePort = () =>
  new Promise<number>((r) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => r(port));
    });
  });

beforeAll(async () => {
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.env.CERA_PYTHON ?? 'python', ['-m', 'cera_ai'], {
    cwd: resolve('../ai'),
    env: { ...process.env, CERA_AI_PORT: String(port), CERA_LLM_MODE: 'replay', PYTHONIOENCODING: 'utf-8' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('AI Server did not start (python -m cera_ai)');
}, 30_000);

afterAll(() => {
  child?.kill();
});

describe('Python AI Server — the real process behind the same client the worker uses', () => {
  it('health says replay — no LLM provider is selected', async () => {
    expect(await (await fetch(`${baseUrl}/health`)).json()).toMatchObject({ status: 'ok', provider: 'replay' });
  });

  it('returns recorded candidates that the backend schema accepts', async () => {
    const res = await new HttpAiClient(baseUrl, 5000).extractReply(SAMPLE, 'req-x');
    if (!res.ok) throw new Error(`expected ok, got ${res.code}`);
    expect(res.response.meta).toMatchObject({ provider: 'replay', model_version: 'replay:fixtures-1', prompt_version: 'reply-extract-v2' }); // one prompt (v2) also serves v1 requests;
    expect(res.response.answers.map((a) => [a.field, a.value, a.evidence.quote])).toEqual([
      ['quantity', '4', '차량 4대 가능합니다'],
      ['available_from', '15:00', '오후 3시 이후'],
    ]);
  });

  it('no recording / malformed recording / unknown request key are classified failures', async () => {
    const client = new HttpAiClient(baseUrl, 5000);
    expect(await client.extractReply({ ...SAMPLE, message_text: '녹화가 없는 문장' }, null)).toMatchObject({ ok: false, code: 'EXTRACTION_PROVIDER_FAILED', providerCode: 'NO_RECORDING' });
    expect(await client.extractReply({ ...SAMPLE, message_text: '시험용 — 깨진 응답' }, null)).toMatchObject({ ok: false, code: 'EXTRACTION_OUTPUT_INVALID' });
    expect(await client.extractReply({ ...SAMPLE, entity_id: 'x' } as unknown as ExtractionRequest, null)).toMatchObject({ ok: false, code: 'EXTRACTION_REQUEST_REJECTED', httpStatus: 422 });
  });
});
