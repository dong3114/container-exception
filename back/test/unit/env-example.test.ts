import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { envSchema, parseEnv } from '../../src/config/env.js';
import { envKeys } from '../../src/dev/env-check.js';

// 시험 전용 연결(앱 설정 스키마 밖 — test/db 가 직접 읽는다)
const TEST_ONLY = ['TEST_DATABASE_URL', 'TEST_OWNER_DATABASE_URL'];
const exampleText = readFileSync('.env.example', 'utf8');

function exampleValues(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of exampleText.split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$/.exec(line);
    if (m?.[1]) out[m[1]] = (m[2] ?? '').trim();
  }
  return out;
}

describe('.env.example ↔ envSchema', () => {
  it('lists exactly the keys the schema reads (plus test-only connections)', () => {
    const schemaKeys = Object.keys(envSchema.shape).sort();
    const example = envKeys(exampleText).filter((k) => !TEST_ONLY.includes(k)).sort();
    expect(example).toEqual(schemaKeys);
  });

  it('parses as-is for local development (placeholders stay valid)', () => {
    expect(() => parseEnv(exampleValues())).not.toThrow();
  });
});

describe('production guards and feature switches', () => {
  const base = { APP_ENV: 'local', DATABASE_URL: 'postgres://cera_app:pw@127.0.0.1:55442/cera' };
  const prod = { ...base, APP_ENV: 'production' };

  it('keeps public data and agent tools off by default, treating empty secrets as absent', () => {
    const env = parseEnv({ ...base, UNIPASS_API_KEY: '', DATA_GO_KR_SERVICE_KEY: '  ' });
    expect(env).toMatchObject({ CERA_PUBLIC_DATA_MODE: 'off', CERA_AGENT_TOOLS_ENABLED: false });
    expect(env.UNIPASS_API_KEY).toBeUndefined();
    expect(env.DATA_GO_KR_SERVICE_KEY).toBeUndefined();
  });

  it('rejects fault injection and public-data replay in production', () => {
    expect(() => parseEnv({ ...prod, CERA_MOCK_CHANNEL_FAULT: 'transient' })).toThrowError(/CERA_MOCK_CHANNEL_FAULT/);
    expect(() => parseEnv({ ...prod, CERA_PUBLIC_DATA_MODE: 'replay' })).toThrowError(/CERA_PUBLIC_DATA_MODE/);
    expect(() => parseEnv({ ...base, CERA_PUBLIC_DATA_MODE: 'replay' })).not.toThrow();
  });

  it('requires at least one public-data key for live mode, without echoing it', () => {
    expect(() => parseEnv({ ...base, CERA_PUBLIC_DATA_MODE: 'live' })).toThrowError(/CERA_PUBLIC_DATA_MODE/);
    const env = parseEnv({ ...base, CERA_PUBLIC_DATA_MODE: 'live', DATA_GO_KR_SERVICE_KEY: 'k-secret' });
    expect(env.UNIPASS_API_KEY).toBeUndefined();
  });

  it('requires a 32+ character service token before agent tools open, without echoing it', () => {
    const short = 'short-secret-token';
    try {
      parseEnv({ ...base, CERA_AGENT_TOOLS_ENABLED: 'true', CERA_AGENT_TOOL_TOKEN: short });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toContain('CERA_AGENT_TOOL_TOKEN');
      expect((e as Error).message).not.toContain(short);
    }
    expect(parseEnv({ ...base, CERA_AGENT_TOOLS_ENABLED: 'true', CERA_AGENT_TOOL_TOKEN: 'x'.repeat(32) }).CERA_AGENT_TOOLS_ENABLED).toBe(true);
  });
});
