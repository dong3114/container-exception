/**
 * 운영 화면의 시스템 상태 판정(T-133) — 순수 함수. 같은 관측이면 같은 판정이다(LLM 을 쓰지 않는다).
 *
 * 구성 요소 상태: HEALTHY(정상) · DEGRADED(일은 되지만 느리거나 대체 경로) · DOWN(그 구성 요소가 일하지 못함) · DISABLED(이 배포에서 쓰지 않음)
 * 전체 상태는 **업무 영향**으로 정한다 — 빨간 경고를 늘어놓지 않는다:
 * - DOWN: PostgreSQL(업무 정본)에 닿지 않는다 — 어떤 업무도 기록할 수 없다
 * - ACTION_REQUIRED: 사람이 손대야 풀린다 — Worker 가 멈춤(발송 · 수신 · 추출 · 재조정이 서 있음) · 켜 둔 Gmail 인증이 거부됨
 * - DEGRADED: 업무는 계속되지만 대체 경로 · 지연 — Redis 장애(PostgreSQL 폴링) · AI 장애(사람 검토 · 직접 입력) · 공공데이터 실패 · 오래 기다리는 작업
 * - HEALTHY: 그 밖
 */

export type ComponentLevel = 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'DISABLED';
export type OverallStatus = 'HEALTHY' | 'DEGRADED' | 'ACTION_REQUIRED' | 'DOWN';

/** Worker heartbeat 가 이보다 오래되면 경고 [ASSUMPTION — Worker 주기 기본 5초의 6배] */
export const WORKER_STALE_WARN_MS = 30_000;
/** 이보다 오래되면 Worker 가 멈춘 것으로 본다 [ASSUMPTION — 18주기] */
export const WORKER_STALE_DOWN_MS = 90_000;
/** 대기 작업이 이보다 오래 기다리면 DEGRADED [ASSUMPTION — 추출 재시도 간격 상한 · 사람 체감 기준] */
export const QUEUE_STALL_MS = 15 * 60_000;

export interface WorkerObservation {
  /** 마지막 heartbeat 이후 지난 시간. 기록이 없으면 null */
  ageMs: number | null;
  lastCycleErrors: number;
}

export function workerLevel(w: WorkerObservation): ComponentLevel {
  if (w.ageMs === null || w.ageMs > WORKER_STALE_DOWN_MS) return 'DOWN';
  if (w.ageMs > WORKER_STALE_WARN_MS || w.lastCycleErrors > 0) return 'DEGRADED';
  return 'HEALTHY';
}

/** 실행 큐(Redis)는 빠른 경로일 뿐 — 내려가도 PostgreSQL 폴링이 같은 일을 한다(T-121) */
export function redisLevel(queue: 'up' | 'down' | 'disabled'): ComponentLevel {
  return queue === 'up' ? 'HEALTHY' : queue === 'down' ? 'DEGRADED' : 'DISABLED';
}

export interface OverallInput {
  database: ComponentLevel;
  worker: ComponentLevel;
  redis: ComponentLevel;
  aiServer: ComponentLevel;
  agentRuntime: ComponentLevel;
  llm: ComponentLevel;
  gmail: ComponentLevel;
  publicData: ComponentLevel;
  /** 가장 오래 기다린 대기 작업의 나이(없으면 null) */
  oldestPendingMs: number | null;
}

export interface OverallResult {
  status: OverallStatus;
  /** 왜 그 상태인지 — 화면이 쉬운 말로 바꾸는 코드 */
  reasons: string[];
}

export function overallStatus(i: OverallInput): OverallResult {
  if (i.database === 'DOWN') return { status: 'DOWN', reasons: ['DATABASE_DOWN'] };
  const action: string[] = [];
  if (i.worker === 'DOWN') action.push('WORKER_DOWN');
  if (i.gmail === 'DOWN') action.push('GMAIL_AUTH_FAILED');
  if (action.length > 0) return { status: 'ACTION_REQUIRED', reasons: action };
  const degraded: string[] = [];
  if (i.database === 'DEGRADED') degraded.push('DATABASE_SLOW');
  if (i.worker === 'DEGRADED') degraded.push('WORKER_DELAYED');
  if (i.redis === 'DEGRADED' || i.redis === 'DOWN') degraded.push('QUEUE_FALLBACK_POLLING');
  if (i.aiServer === 'DOWN' || i.aiServer === 'DEGRADED') degraded.push('AI_UNAVAILABLE');
  else if (i.agentRuntime === 'DOWN' || i.agentRuntime === 'DEGRADED') degraded.push('AGENT_RUNTIME_UNAVAILABLE');
  if (i.llm === 'DEGRADED' || (i.llm === 'DOWN' && i.aiServer !== 'DOWN')) degraded.push('LLM_FAILING');
  if (i.gmail === 'DEGRADED') degraded.push('GMAIL_DELAYED');
  if (i.publicData === 'DEGRADED' || i.publicData === 'DOWN') degraded.push('PUBLIC_DATA_FAILING');
  if (i.oldestPendingMs !== null && i.oldestPendingMs > QUEUE_STALL_MS) degraded.push('QUEUE_STALLED');
  return degraded.length > 0 ? { status: 'DEGRADED', reasons: degraded } : { status: 'HEALTHY', reasons: [] };
}

/** 배포 모드 — 운영자가 지금 어디에 있는지(설정에서만 정한다) */
export type DeploymentMode = 'PUBLIC_PORTFOLIO_DEMO' | 'PRIVATE_STAGING' | 'PRODUCTION' | 'LOCAL';

export function deploymentMode(appEnv: 'local' | 'test' | 'staging' | 'production', portfolioDemo: boolean): DeploymentMode {
  if (portfolioDemo) return 'PUBLIC_PORTFOLIO_DEMO';
  if (appEnv === 'staging') return 'PRIVATE_STAGING';
  if (appEnv === 'production') return 'PRODUCTION';
  return 'LOCAL';
}
