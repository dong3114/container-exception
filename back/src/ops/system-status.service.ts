import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { EXTRACTION_COMPONENT, OPEN_RETRY } from '../communication/extraction.repository.js';
import { DATABASE, type Database } from '../db/database.js';
import { DatabaseHealth } from '../db/database.module.js';
import { EXECUTION_QUEUE, type ExecutionQueue } from '../queue/execution-queue.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import { HeartbeatRepository } from './heartbeat.repository.js';
import { type ComponentLevel, type DeploymentMode, type OverallStatus, deploymentMode, overallStatus, redisLevel, workerLevel } from './system-status.policy.js';

const API_VERSION = '0.1.0';
/** DB 왕복이 이보다 느리면 DEGRADED [ASSUMPTION] */
const DB_SLOW_MS = 1_000;
/** 인증 문제로 사람이 다시 동의해야 하는 Gmail 오류 코드(gmail-client.ts H.3) */
const GMAIL_AUTH_CODES = new Set(['GMAIL_TOKEN_REVOKED', 'GMAIL_TOKEN_REJECTED', 'GMAIL_AUTH_FAILED']);

export interface QueueLine {
  count: number;
  /** 가장 오래 기다린 작업의 나이(초). 없으면 null */
  oldest_age_seconds: number | null;
}

export interface ComponentStatus {
  level: ComponentLevel;
  [key: string]: unknown;
}

export interface SystemStatusView {
  checked_at: string;
  mode: DeploymentMode;
  overall: { status: OverallStatus; reasons: string[] };
  core: { api: ComponentStatus; database: ComponentStatus; redis: ComponentStatus; worker: ComponentStatus; ai_server: ComponentStatus; agent_runtime: ComponentStatus };
  integrations: { llm: ComponentStatus; gmail: ComponentStatus; public_data: ComponentStatus };
  queues: { send: QueueLine & { retrying: number }; extraction: QueueLine; extraction_retry: QueueLine; agent_retry: QueueLine };
}

type Row = Record<string, unknown>;
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : Instant.fromDb(v instanceof Date ? v.toISOString() : String(v)).toSeoulIso());

/**
 * 운영 화면의 시스템 상태(T-133). **새 업무 기록을 만들지 않는다** — 이미 있는 기록(메시지 상태 · 발송 시도 · 감사 · 시스템 오류 ·
 * 공공데이터 조회 · Agent 실행)과 Worker heartbeat 를 읽어 모은다. 대기 작업은 PostgreSQL 이 정본이다(Redis 는 빠른 경로일 뿐 — 큐에 무엇이 있는지는 보지 않는다).
 * 응답에는 주소 · 호스트 · 경로 · 키 · 토큰을 넣지 않는다.
 */
@Injectable()
export class SystemStatusService {
  private readonly startedAt = Date.now(); // 이 API 프로세스의 가동 시간(프로세스마다 다르다 — 업무 판정에 쓰지 않는다)

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(DatabaseHealth) private readonly database: DatabaseHealth,
    @Inject(EXECUTION_QUEUE) private readonly queue: ExecutionQueue,
    @Inject(HeartbeatRepository) private readonly heartbeats: HeartbeatRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** 배포 모드만(로그인한 누구에게나 보여도 되는 값) */
  mode(): DeploymentMode {
    return deploymentMode(this.env.APP_ENV, this.env.CERA_PORTFOLIO_DEMO_MODE);
  }

  async status(): Promise<SystemStatusView> {
    const now = this.clock.now();
    const t0 = Date.now();
    const dbUp = await this.database.ping();
    const dbMs = Date.now() - t0;
    const [queueState, ai, agentRt] = await Promise.all([this.queue.status().catch(() => 'down' as const), this.probe(this.env.CERA_AI_SERVER_URL), this.probe(this.env.CERA_AGENT_RUNTIME_URL)]);

    const database: ComponentStatus = { level: !dbUp ? 'DOWN' : dbMs > DB_SLOW_MS ? 'DEGRADED' : 'HEALTHY', connected: dbUp, latency_ms: dbUp ? dbMs : null };
    const redis: ComponentStatus = { level: redisLevel(queueState), state: queueState, fallback: queueState === 'up' ? null : 'POSTGRES_POLLING' };
    const api: ComponentStatus = { level: 'HEALTHY', version: API_VERSION, commit: this.env.CERA_BUILD_COMMIT ?? null, uptime_seconds: Math.floor((Date.now() - this.startedAt) / 1000) };
    const aiServer: ComponentStatus = { level: ai.reachable ? 'HEALTHY' : 'DOWN', reachable: ai.reachable, provider_mode: ai.provider === 'replay' ? 'REPLAY' : ai.provider ? 'COMMERCIAL' : null };
    const agentRuntime: ComponentStatus = !this.env.CERA_AGENT_TOOLS_ENABLED
      ? { level: 'DISABLED', reachable: agentRt.reachable, tools_enabled: false }
      : { level: agentRt.reachable && agentRt.agentRuntime !== 'disabled' ? 'HEALTHY' : 'DOWN', reachable: agentRt.reachable, tools_enabled: true };

    if (!dbUp) {
      const down: ComponentStatus = { level: 'DOWN', reason: 'DATABASE_DOWN' };
      return this.compose(now, { api, database, redis, worker: down, ai_server: aiServer, agent_runtime: agentRuntime }, { llm: { level: aiServer.level === 'HEALTHY' ? 'HEALTHY' : 'DOWN', provider: ai.provider }, gmail: { level: this.env.CERA_GMAIL_ENABLED ? 'DEGRADED' : 'DISABLED' }, public_data: { level: this.env.CERA_PUBLIC_DATA_MODE === 'off' ? 'DISABLED' : 'DEGRADED' } }, { send: { count: 0, oldest_age_seconds: null, retrying: 0 }, extraction: { count: 0, oldest_age_seconds: null }, extraction_retry: { count: 0, oldest_age_seconds: null }, agent_retry: { count: 0, oldest_age_seconds: null } });
    }

    const [beat, queues, llmRow, gmailRow, publicRow] = await Promise.all([this.heartbeats.worker(), this.queues(now), this.llmEvidence(), this.gmailEvidence(), this.publicDataEvidence(now)]);
    const ageMs = beat ? Math.max(0, now.epochMs - Instant.fromDb(beat.lastSeenAt).epochMs) : null;
    const worker: ComponentStatus = {
      level: workerLevel({ ageMs, lastCycleErrors: beat?.lastCycleErrors ?? 0 }),
      last_seen_at: beat ? iso(beat.lastSeenAt) : null,
      last_seen_seconds_ago: ageMs === null ? null : Math.floor(ageMs / 1000),
      last_cycle_ms: beat?.lastCycleMs ?? null,
      failed_steps: beat?.detail.failed_steps ?? [],
      queue_consumer: beat?.queueConsumer ?? null,
    };

    const llmLevel: ComponentLevel = !aiServer.reachable ? 'DOWN' : llmRow.failedAfterSuccess ? 'DEGRADED' : 'HEALTHY';
    const llm: ComponentStatus = { level: llmLevel, mode: aiServer.provider_mode, provider: ai.provider, model: llmRow.model, last_success_at: llmRow.lastSuccess, last_failure_at: llmRow.lastFailure, last_failure_code: llmRow.lastFailureCode };

    const gmail = this.gmailStatus(beat?.detail.inbound.GMAIL ?? null, beat ? iso(beat.lastSeenAt) : null, gmailRow);

    const publicData: ComponentStatus =
      this.env.CERA_PUBLIC_DATA_MODE === 'off'
        ? { level: 'DISABLED', mode: 'OFF' }
        : { level: publicRow.lastOutcome && !['SUCCESS', 'NO_DATA'].includes(publicRow.lastOutcome) ? 'DEGRADED' : 'HEALTHY', mode: this.env.CERA_PUBLIC_DATA_MODE.toUpperCase(), last_request_at: publicRow.lastRequest, last_outcome: publicRow.lastOutcome, last_success_at: publicRow.lastSuccess, corroboration: publicRow.corroboration };

    return this.compose(now, { api, database, redis, worker, ai_server: aiServer, agent_runtime: agentRuntime }, { llm, gmail, public_data: publicData }, queues);
  }

  private compose(now: Instant, core: SystemStatusView['core'], integrations: SystemStatusView['integrations'], queues: SystemStatusView['queues']): SystemStatusView {
    const ages = [queues.send, queues.extraction, queues.extraction_retry, queues.agent_retry].map((q) => q.oldest_age_seconds).filter((v): v is number => v !== null);
    const overall = overallStatus({
      database: core.database.level,
      worker: core.worker.level,
      redis: core.redis.level,
      aiServer: core.ai_server.level,
      agentRuntime: core.agent_runtime.level,
      llm: integrations.llm.level,
      gmail: integrations.gmail.level,
      publicData: integrations.public_data.level,
      oldestPendingMs: ages.length ? Math.max(...ages) * 1000 : null,
    });
    return { checked_at: now.toSeoulIso(), mode: this.mode(), overall, core, integrations, queues };
  }

  private gmailStatus(inbound: { ok: boolean; code?: string } | null, checkedAt: string | null, row: { lastSendOk: string | null; lastSendFail: string | null; lastSendFailCode: string | null; lastReceive: string | null }): ComponentStatus {
    if (!this.env.CERA_GMAIL_ENABLED) return { level: 'DISABLED', enabled: false };
    const sendAuthFailedLast = row.lastSendFail !== null && GMAIL_AUTH_CODES.has(row.lastSendFailCode ?? '') && (row.lastSendOk === null || row.lastSendFail > row.lastSendOk);
    const authFailed = (inbound && !inbound.ok && GMAIL_AUTH_CODES.has(inbound.code ?? '')) || sendAuthFailedLast;
    const level: ComponentLevel = authFailed ? 'DOWN' : inbound && !inbound.ok ? 'DEGRADED' : 'HEALTHY';
    return {
      level,
      enabled: true,
      // 연결 상태 = Worker 의 마지막 수신 확인 결과. 실제 토큰 만료 시각은 CERA 가 알 수 없으므로 추측해 보이지 않는다
      connection: authFailed ? 'AUTH_FAILED' : inbound === null ? 'NOT_CHECKED' : inbound.ok ? 'CONNECTED' : 'CHECK_FAILED',
      connection_checked_at: inbound ? checkedAt : null,
      last_error_code: inbound && !inbound.ok ? (inbound.code ?? null) : sendAuthFailedLast ? row.lastSendFailCode : null,
      last_send_at: row.lastSendOk,
      last_send_failure_at: row.lastSendFail,
      last_receive_at: row.lastReceive,
    };
  }

  private async probe(baseUrl: string): Promise<{ reachable: boolean; provider: string | null; agentRuntime: string | null }> {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(2_000) });
      if (!res.ok) return { reachable: false, provider: null, agentRuntime: null };
      const body = (await res.json().catch(() => ({}))) as { provider?: unknown; agent_runtime?: unknown };
      // 공급자 이름만(예: replay · gemini · gemini>openai) — 형식이 아니면 버린다
      const provider = typeof body.provider === 'string' && /^[a-z0-9>._-]{1,60}$/.test(body.provider) ? body.provider : null;
      const agentRuntime = typeof body.agent_runtime === 'string' && /^[a-z]{1,20}$/.test(body.agent_runtime) ? body.agent_runtime : null;
      return { reachable: true, provider, agentRuntime };
    } catch {
      return { reachable: false, provider: null, agentRuntime: null };
    }
  }

  private async rows(query: ReturnType<typeof sql>): Promise<Row[]> {
    const result = await this.db.execute(query);
    return result.rows as Row[];
  }

  /** 대기 작업 — PostgreSQL 기준(정본). 나이는 지금 기준 초 */
  private async queues(now: Instant): Promise<SystemStatusView['queues']> {
    const max = this.env.CERA_EXTRACTION_MAX_ATTEMPTS;
    const at = now.toDb();
    const [send] = await this.rows(sql`
      SELECT count(*)::int AS count,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM cera.send_attempt s WHERE s.message_id = m.message_id AND s.result = 'RETRYABLE_FAILURE'))::int AS retrying,
             min((SELECT max(t.occurred_at) FROM cera.message_status_transition t WHERE t.message_id = m.message_id AND t.status = 'QUEUED')) AS oldest
      FROM cera.comm_message m WHERE m.direction = 'OUTBOUND' AND m.current_status = 'QUEUED'`);
    const [ext] = await this.rows(sql`
      WITH inbound AS (
        SELECT coalesce(m.received_at, m.created_at) AS since,
               (SELECT count(*) FROM cera.system_error e WHERE e.related_entity_type = 'COMM_MESSAGE' AND e.related_entity_id = m.message_id::text AND e.component_name = ${EXTRACTION_COMPONENT}) AS failures,
               EXISTS (SELECT 1 FROM cera.system_error e WHERE e.related_entity_type = 'COMM_MESSAGE' AND e.related_entity_id = m.message_id::text AND e.component_name = ${EXTRACTION_COMPONENT} AND e.retryable = false) AS fatal,
               (EXISTS (SELECT 1 FROM cera.extraction x WHERE x.message_id = m.message_id)
                 OR EXISTS (SELECT 1 FROM cera.audit_log a WHERE a.target_type = 'COMM_MESSAGE' AND a.target_id = m.message_id::text AND a.action LIKE 'EXTRACTION\\_%')) AS done,
               EXISTS (SELECT 1 FROM cera.extraction_retry_request r WHERE r.message_id = m.message_id AND ${OPEN_RETRY}) AS open_retry
        FROM cera.comm_message m WHERE m.direction = 'INBOUND'
      )
      SELECT count(*) FILTER (WHERE NOT done AND NOT fatal AND failures = 0)::int AS first_count,
             min(since) FILTER (WHERE NOT done AND NOT fatal AND failures = 0) AS first_oldest,
             count(*) FILTER (WHERE (NOT done AND NOT fatal AND failures > 0 AND failures < ${max}) OR open_retry)::int AS retry_count,
             min(since) FILTER (WHERE (NOT done AND NOT fatal AND failures > 0 AND failures < ${max}) OR open_retry) AS retry_oldest
      FROM inbound`);
    const [agent] = await this.rows(sql`
      SELECT count(*)::int AS count, min(coalesce(updated_at, started_at)) AS oldest
      FROM cera.agent_run WHERE status = 'WAITING_RUNTIME'`);
    const age = (v: unknown): number | null => (v === null || v === undefined ? null : Math.max(0, Math.floor((Instant.fromDb(at).epochMs - Instant.fromDb(v instanceof Date ? v.toISOString() : String(v)).epochMs) / 1000)));
    return {
      send: { count: Number(send?.count ?? 0), retrying: Number(send?.retrying ?? 0), oldest_age_seconds: age(send?.oldest) },
      extraction: { count: Number(ext?.first_count ?? 0), oldest_age_seconds: age(ext?.first_oldest) },
      extraction_retry: { count: Number(ext?.retry_count ?? 0), oldest_age_seconds: age(ext?.retry_oldest) },
      agent_retry: { count: Number(agent?.count ?? 0), oldest_age_seconds: age(agent?.oldest) },
    };
  }

  /** LLM 최근 결과 — 공급자가 답한 추출 감사(완료 · 후보 없음)와 추출 기술 실패(system_error). 모델 = 가장 최근 후보의 model_version */
  private async llmEvidence(): Promise<{ lastSuccess: string | null; lastFailure: string | null; lastFailureCode: string | null; model: string | null; failedAfterSuccess: boolean }> {
    const [r] = await this.rows(sql`
      SELECT (SELECT max(a.occurred_at) FROM cera.audit_log a WHERE a.action = 'EXTRACTION_COMPLETED' OR a.action LIKE 'EXTRACTION\\_NO\\_CANDIDATE\\_%') AS last_success,
             (SELECT e.occurred_at FROM cera.system_error e WHERE e.component_name = ${EXTRACTION_COMPONENT} ORDER BY e.occurred_at DESC LIMIT 1) AS last_failure,
             (SELECT e.error_code FROM cera.system_error e WHERE e.component_name = ${EXTRACTION_COMPONENT} ORDER BY e.occurred_at DESC LIMIT 1) AS last_failure_code,
             (SELECT x.model_version FROM cera.extraction x ORDER BY x.extraction_id DESC LIMIT 1) AS model`);
    const lastSuccess = iso(r?.last_success);
    const lastFailure = iso(r?.last_failure);
    return { lastSuccess, lastFailure, lastFailureCode: (r?.last_failure_code as string | null) ?? null, model: (r?.model as string | null) ?? null, failedAfterSuccess: lastFailure !== null && (lastSuccess === null || lastFailure > lastSuccess) };
  }

  private async gmailEvidence(): Promise<{ lastSendOk: string | null; lastSendFail: string | null; lastSendFailCode: string | null; lastReceive: string | null }> {
    const [r] = await this.rows(sql`
      SELECT (SELECT max(s.finished_at) FROM cera.send_attempt s JOIN cera.comm_message m ON m.message_id = s.message_id WHERE m.channel_type = 'GMAIL' AND s.result = 'SUCCESS') AS send_ok,
             (SELECT s.finished_at FROM cera.send_attempt s JOIN cera.comm_message m ON m.message_id = s.message_id WHERE m.channel_type = 'GMAIL' AND s.result IN ('RETRYABLE_FAILURE', 'PERMANENT_FAILURE') ORDER BY s.finished_at DESC NULLS LAST LIMIT 1) AS send_fail,
             (SELECT s.error_code FROM cera.send_attempt s JOIN cera.comm_message m ON m.message_id = s.message_id WHERE m.channel_type = 'GMAIL' AND s.result IN ('RETRYABLE_FAILURE', 'PERMANENT_FAILURE') ORDER BY s.finished_at DESC NULLS LAST LIMIT 1) AS send_fail_code,
             (SELECT max(coalesce(m.received_at, m.created_at)) FROM cera.comm_message m WHERE m.channel_type = 'GMAIL' AND m.direction = 'INBOUND') AS receive`);
    return { lastSendOk: iso(r?.send_ok), lastSendFail: iso(r?.send_fail), lastSendFailCode: (r?.send_fail_code as string | null) ?? null, lastReceive: iso(r?.receive) };
  }

  /** 공공데이터 최근 호출 + T-136 교차 확인 요약(최근 판정 시각 · 지난 24시간 결과별 건수). 값 · 식별자는 내보내지 않는다 */
  private async publicDataEvidence(now: Instant): Promise<{ lastRequest: string | null; lastOutcome: string | null; lastSuccess: string | null; corroboration: { last_at: string | null; last_24h: Record<string, number> } }> {
    const counts = await this.rows(sql`
      SELECT c.result, count(*)::int AS n FROM cera.corroboration c
       WHERE c.created_at > ${now.toDb()}::timestamptz - interval '24 hours' GROUP BY c.result`);
    const [last] = await this.rows(sql`SELECT max(c.created_at) AS last_at FROM cera.corroboration c`);
    const last24h: Record<string, number> = { MATCH: 0, CONFLICT: 0, NO_PUBLIC_EVIDENCE: 0, STALE_PUBLIC_EVIDENCE: 0, NOT_COMPARABLE: 0 };
    for (const c of counts) last24h[String(c.result)] = Number(c.n);
    const [r] = await this.rows(sql`
      SELECT (SELECT f.requested_at FROM cera.public_data_fetch f ORDER BY f.requested_at DESC LIMIT 1) AS last_request,
             (SELECT f.outcome FROM cera.public_data_fetch f ORDER BY f.requested_at DESC LIMIT 1) AS last_outcome,
             (SELECT max(f.requested_at) FROM cera.public_data_fetch f WHERE f.outcome IN ('SUCCESS', 'NO_DATA')) AS last_success`);
    return { lastRequest: iso(r?.last_request), lastOutcome: (r?.last_outcome as string | null) ?? null, lastSuccess: iso(r?.last_success), corroboration: { last_at: iso(last?.last_at), last_24h: last24h } };
  }
}
