import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '../../src/auth/permissions.js';
import { parseEnv } from '../../src/config/env.js';
import { PORTFOLIO_RATE_RULES, PortfolioRateLimiter, originCheck } from '../../src/http/public-guards.js';

/** T-131 공개 포트폴리오 데모 — 설정 방어 · 역할 · 요청 한도 · Origin 검사(DB 없이). API 수준 확인은 test/db/portfolio.test.ts */
const base = { APP_ENV: 'production', DATABASE_URL: 'postgres://cera_app:pw@127.0.0.1:5432/cera', CERA_SESSION_COOKIE_SECURE: 'true' };
const portfolio = { ...base, CERA_PORTFOLIO_DEMO_MODE: 'true', CERA_ALLOWED_ORIGINS: 'https://cera.example.com' };

function issues(source: Record<string, string>): string {
  try {
    parseEnv(source);
    return '';
  } catch (e) {
    return (e as Error).message;
  }
}

describe('portfolio configuration refuses anything that reaches outside', () => {
  it('starts with the minimal portfolio settings', () => {
    const env = parseEnv(portfolio);
    expect(env).toMatchObject({ CERA_PORTFOLIO_DEMO_MODE: true, CERA_GMAIL_ENABLED: false, CERA_PUBLIC_DATA_MODE: 'off', CERA_AUTH_MODE: 'session' });
    expect(env.CERA_ALLOWED_ORIGINS).toEqual(['https://cera.example.com']);
  });

  it.each([
    ['CERA_GMAIL_ENABLED', { CERA_GMAIL_ENABLED: 'true', GMAIL_CLIENT_ID: 'x', GMAIL_CLIENT_SECRET: 'x', GMAIL_REFRESH_TOKEN: 'x', GMAIL_ACCOUNT_EMAIL: 'a@b.c' }],
    ['CERA_TEST_RECIPIENT_ALLOWLIST', { CERA_TEST_RECIPIENT_ALLOWLIST: 'someone@example.com' }],
    ['CERA_PUBLIC_DATA_MODE', { CERA_PUBLIC_DATA_MODE: 'live', DATA_GO_KR_SERVICE_KEY: 'k' }],
    ['CERA_MOCK_CHANNEL_FAULT', { APP_ENV: 'staging', CERA_MOCK_CHANNEL_FAULT: 'transient' }],
    ['CERA_AUTH_MODE', { APP_ENV: 'test', CERA_AUTH_MODE: 'dev-header' }],
    ['CERA_ALLOWED_ORIGINS', { CERA_ALLOWED_ORIGINS: '' }],
  ])('%s is rejected at startup', (key, extra) => {
    expect(issues({ ...portfolio, ...extra })).toContain(key);
  });

  it('origins must be bare scheme://host[:port]; a trailing slash and case are normalised', () => {
    expect(issues({ ...portfolio, CERA_ALLOWED_ORIGINS: 'https://cera.example.com/path' })).toContain('CERA_ALLOWED_ORIGINS');
    expect(parseEnv({ ...portfolio, CERA_ALLOWED_ORIGINS: 'https://CERA.example.com/ , http://localhost:3000' }).CERA_ALLOWED_ORIGINS).toEqual(['https://cera.example.com', 'http://localhost:3000']);
  });

  it('a private (non-portfolio) deployment is unchanged: the flag defaults to false', () => {
    expect(parseEnv(base).CERA_PORTFOLIO_DEMO_MODE).toBe(false);
  });
});

describe('DEMO_VISITOR role', () => {
  it('can walk the product flow but cannot manage users, the registry, real planning input or public data', () => {
    const p = ROLE_PERMISSIONS.DEMO_VISITOR;
    expect(p).toEqual(expect.arrayContaining(['read', 'agent_run.manage', 'communication.draft', 'communication.approve', 'communication.send', 'truth.review', 'truth.manual_entry', 'extraction.retry', 'plan.recalculate', 'plan.approve', 'contact.select']));
    for (const denied of ['users.manage', 'registry.manage', 'planning.input', 'public_data.fetch'] as const) expect(p).not.toContain(denied);
  });
});

describe('PortfolioRateLimiter', () => {
  it('counts per visitor IP in a fixed window and tells when to retry', () => {
    let t = 0;
    const l = new PortfolioRateLimiter([{ id: 'x', method: 'POST', path: /^\/x$/, limit: 2, windowMs: 1000 }], 100, () => t);
    expect(l.check('POST', '/x', 'a')).toBeNull();
    expect(l.check('POST', '/x', 'a')).toBeNull();
    expect(l.check('POST', '/x', 'a')).toEqual({ code: 'RATE_LIMITED', retryAfterSec: 1 });
    expect(l.check('POST', '/x', 'b')).toBeNull(); // 다른 방문자는 따로
    expect(l.check('GET', '/x', 'a')).toBeNull(); // 다른 방법은 이 규칙 밖
    t = 1000;
    expect(l.check('POST', '/x', 'a')).toBeNull(); // 창이 지나면 다시
  });

  it('the daily Agent-run ceiling is shared by everyone and refuses with DEMO_QUOTA_EXCEEDED', () => {
    let t = 0;
    const l = new PortfolioRateLimiter([], 2, () => t);
    expect(l.check('POST', '/agent-runs', 'a')).toBeNull();
    expect(l.check('POST', '/agent-runs', 'b')).toBeNull();
    expect(l.check('POST', '/agent-runs', 'c')?.code).toBe('DEMO_QUOTA_EXCEEDED');
    expect(l.check('POST', '/agent-runs/123/start', 'c')).toBeNull(); // 시작 · 재개는 실행 수가 아니다
    t = 24 * 60 * 60_000;
    expect(l.check('POST', '/agent-runs', 'c')).toBeNull();
  });

  it('the shipped rules cover the expensive or abusable routes', () => {
    const ids = PORTFOLIO_RATE_RULES.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['demo-session', 'login', 'agent-run', 'plan-recalculate', 'mock-reply', 'extraction-retry', 'mutation', 'read']));
    const match = (method: string, path: string) => PORTFOLIO_RATE_RULES.filter((r) => (r.method === 'MUTATING' ? method !== 'GET' : r.method === method) && r.path.test(path)).map((r) => r.id);
    expect(match('POST', '/planning/runs/abc/plans')).toEqual(['plan-recalculate', 'mutation']);
    expect(match('POST', '/communication/inbound/abc/extraction/retry')).toEqual(['extraction-retry', 'mutation']);
    expect(match('POST', '/agent-runs/abc/start')).toEqual(['agent-run', 'mutation']);
  });
});

describe('originCheck', () => {
  const env = parseEnv(portfolio);
  const run = (method: string, path: string, headers: Record<string, string>) => {
    let status = 0;
    let passed = false;
    const res = { status: (s: number) => ((status = s), { json: () => undefined }) } as unknown as Response;
    originCheck(env)({ method, path, headers } as unknown as Request, res, (() => (passed = true)) as NextFunction);
    return passed ? 'next' : status;
  };

  it('blocks a change request from another origin or a cross-site fetch; passes the site, reads and no-Origin calls', () => {
    expect(run('POST', '/agent-runs', { origin: 'https://evil.example' })).toBe(403);
    expect(run('POST', '/agent-runs', { origin: 'https://cera.example.com', 'sec-fetch-site': 'cross-site' })).toBe(403);
    expect(run('POST', '/agent-runs', { origin: 'https://cera.example.com' })).toBe('next');
    expect(run('GET', '/agent-runs', { origin: 'https://evil.example' })).toBe('next');
    expect(run('POST', '/agent-runs', {})).toBe('next');
    expect(run('POST', '/internal/agent-tools/x', { origin: 'https://evil.example' })).toBe('next');
  });
});
