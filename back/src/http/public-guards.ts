import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../config/env.js';
import { currentContext } from '../shared/context/request-context.js';

/**
 * 인터넷 공개 배포의 앞문(T-131 · ADR-039). 업무 규칙이 아니라 요청 자체를 거르는 두 가지다 — 권한 Guard(auth.guard.ts)보다 먼저 돈다.
 *
 * 1. Origin 검사(CSRF 2차 방어): `CERA_ALLOWED_ORIGINS` 가 있으면, 브라우저가 붙인 Origin 이 목록에 없는 변경 요청을 403 으로 막는다.
 *    세션 쿠키가 SameSite=Strict 라 다른 사이트의 요청에는 쿠키가 실리지 않는다 — 이 검사는 같은 사이트의 다른 하위 도메인 · 잘못된 프록시를 대비한 둘째 줄이다.
 *    Origin 이 없는 요청(서버 간 호출 · curl)은 통과시킨다: 쿠키 없이는 어차피 401 이고, 브라우저는 교차 출처 변경 요청에 Origin 을 반드시 붙인다
 * 2. 포트폴리오 요청 한도(`CERA_PORTFOLIO_DEMO_MODE` 만): 방문자 IP 별 고정 창 + 전체 하루 Agent 실행 한도. 프로세스 메모리에 센다 —
 *    API 가 여러 개면 인스턴스마다 따로 세고, 재시작하면 처음부터 센다 [ASSUMPTION — 포트폴리오 규모에서는 API 1개]
 *
 * Agent Runtime 의 내부 Tool 경로(`/internal/*`)와 상태 확인(`/health`)은 둘 다 건너뛴다 — 서비스 토큰 · 내부망 전용이다.
 */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const EXEMPT = /^\/(internal|health)(\/|$)/;

function reject(res: Response, status: number, code: string, message: string): void {
  const requestId = currentContext()?.requestId ?? null;
  res.status(status).json({ code, message, request_id: requestId });
}

export function originCheck(env: Env) {
  const allowed = new Set(env.CERA_ALLOWED_ORIGINS);
  return (req: Request, res: Response, next: NextFunction): void => {
    if (allowed.size === 0 || !MUTATING.has(req.method) || EXEMPT.test(req.path)) return next();
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin.replace(/\/+$/, '').toLowerCase() : null;
    const fetchSite = req.headers['sec-fetch-site'];
    if ((origin !== null && !allowed.has(origin)) || fetchSite === 'cross-site') {
      return reject(res, 403, 'ORIGIN_NOT_ALLOWED', 'Requests from this origin are not accepted');
    }
    next();
  };
}

export interface RateRule {
  id: string;
  /** 'MUTATING' = POST · PUT · PATCH · DELETE 전부 */
  method: 'GET' | 'POST' | 'MUTATING';
  path: RegExp;
  limit: number;
  windowMs: number;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

/** 방문자 IP 별 한도 [ASSUMPTION — 한 사람이 체험 흐름을 몇 번 반복해도 넉넉하고, 스크립트 반복은 막는 정도]. 겹치는 규칙은 모두 센다. */
export const PORTFOLIO_RATE_RULES: readonly RateRule[] = [
  { id: 'demo-session', method: 'POST', path: /^\/auth\/demo-session$/, limit: 10, windowMs: HOUR },
  { id: 'login', method: 'POST', path: /^\/auth\/login$/, limit: 20, windowMs: 15 * MIN },
  { id: 'agent-run', method: 'POST', path: /^\/agent-runs(\/[^/]+\/(start|resume))?$/, limit: 20, windowMs: HOUR },
  { id: 'plan-recalculate', method: 'POST', path: /^\/planning\/runs\/[^/]+\/plans$/, limit: 30, windowMs: HOUR },
  { id: 'mock-reply', method: 'POST', path: /^\/dev\/demo\/mock-reply$/, limit: 30, windowMs: HOUR },
  { id: 'extraction-retry', method: 'POST', path: /^\/communication\/inbound\/[^/]+\/extraction\/retry$/, limit: 30, windowMs: HOUR },
  { id: 'mutation', method: 'MUTATING', path: /^\//, limit: 120, windowMs: 10 * MIN },
  // 화면이 5초마다 몇 개의 목록을 읽는다(탭 하나 ≈ 분당 60) — 탭 여러 개까지 넉넉히
  { id: 'read', method: 'GET', path: /^\//, limit: 600, windowMs: MIN },
];

const DAY = 24 * HOUR;
const AGENT_RUN_CREATE = /^\/agent-runs$/;

export class PortfolioRateLimiter {
  /** `rule|ip` → 창 시작 시각 · 개수 */
  private readonly windows = new Map<string, { start: number; count: number }>();
  /** 최근 24시간 Agent 실행 만들기 시각(전체) */
  private agentRuns: number[] = [];

  constructor(
    private readonly rules: readonly RateRule[],
    private readonly maxAgentRunsPerDay: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** 통과면 null, 막히면 { code, retryAfterSec } */
  check(method: string, path: string, ip: string): { code: 'RATE_LIMITED' | 'DEMO_QUOTA_EXCEEDED'; retryAfterSec: number } | null {
    const t = this.now();
    const hits = this.rules.filter((r) => (r.method === 'MUTATING' ? MUTATING.has(method) : r.method === method) && r.path.test(path));
    for (const r of hits) {
      const w = this.windows.get(`${r.id}|${ip}`);
      if (w && t - w.start < r.windowMs && w.count >= r.limit) return { code: 'RATE_LIMITED', retryAfterSec: Math.ceil((w.start + r.windowMs - t) / 1000) };
    }
    if (method === 'POST' && AGENT_RUN_CREATE.test(path)) {
      this.agentRuns = this.agentRuns.filter((x) => t - x < DAY);
      if (this.agentRuns.length >= this.maxAgentRunsPerDay) return { code: 'DEMO_QUOTA_EXCEEDED', retryAfterSec: Math.ceil((this.agentRuns[0]! + DAY - t) / 1000) };
      this.agentRuns.push(t);
    }
    for (const r of hits) {
      const key = `${r.id}|${ip}`;
      const w = this.windows.get(key);
      if (!w || t - w.start >= r.windowMs) this.windows.set(key, { start: t, count: 1 });
      else w.count += 1;
    }
    if (this.windows.size > 50_000) this.prune(t);
    return null;
  }

  private prune(t: number): void {
    const longest = Math.max(...this.rules.map((r) => r.windowMs));
    for (const [k, w] of this.windows) if (t - w.start >= longest) this.windows.delete(k);
  }
}

export function portfolioRateLimit(env: Env, limiter = new PortfolioRateLimiter(PORTFOLIO_RATE_RULES, env.CERA_PORTFOLIO_MAX_AGENT_RUNS_PER_DAY)) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!env.CERA_PORTFOLIO_DEMO_MODE || EXEMPT.test(req.path)) return next();
    const blocked = limiter.check(req.method, req.path, req.ip ?? 'unknown');
    if (!blocked) return next();
    res.setHeader('Retry-After', String(blocked.retryAfterSec));
    if (blocked.code === 'DEMO_QUOTA_EXCEEDED') return reject(res, 429, blocked.code, 'The demo has reached its daily limit — please try again later');
    reject(res, 429, blocked.code, 'Too many requests — please slow down');
  };
}
