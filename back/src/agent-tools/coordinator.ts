import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { TransactionRunner } from '../db/transaction.js';
import { SYSTEM_ERROR_CATEGORY } from '../persistence/catalog.js';
import { SystemErrorRecorder } from '../persistence/system-error-recorder.js';
import { currentContext } from '../shared/context/request-context.js';
import { BusinessRuleError, ValidationError } from '../shared/errors/cera-error.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { DOMAIN_SIGNALS, type DomainSignal, type DomainSignals } from '../shared/signals/domain-signals.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import { AgentRunRepository, type AgentRunRow } from './agent-run.repository.js';
import { AgentToolsService } from './agent-tools.service.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { AGENT_RUNTIME_CLIENT, type AgentRuntimeClient, isTransientRuntimeError, RuntimeCallError, type RuntimeOutcome } from './runtime-client.js';
import { RuntimeStoreRepository } from './runtime-store.repository.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RESUME_REASON = /^[A-Z][A-Z0-9_]{0,59}$/;

/**
 * Agent Runtime Coordinator(T-104 · ADR-036) — **업무 흐름(NestJS)과 Agent 추론(LangGraph)을 잇는 유일한 자리.**
 *
 * - 실행 생성 · 시작 · 재개 · 끝 상태 반영은 Backend 가 소유한다. Python 이 실행을 만들거나 상태를 바꾸지 못한다
 * - 시작 · 재개는 조건부 전이(CREATED → RUNNING · WAITING_* → RUNNING) — 한 요청만 이긴다(중복 시작 · 재개 = 그래프 하나)
 * - 업무 사건(승인 결정 등)은 DomainSignals 로 받아, 그것을 기다리던 실행을 깨운다. 재개한 그래프는 업무 상태를 Tool 로 다시 읽는다 —
 *   이 알림 내용(예: "승인됨")을 그래프에 사실로 넘기지 않는다(이유 코드와 대상 참조만)
 * - **알림은 최적화일 뿐이다.** 알림은 프로세스 안에서만 돈다 — 커밋 직후 프로세스가 죽으면 사라진다. 정확성은 DB 상태가 보장한다:
 *   Worker 의 `AgentReconciler` 가 기다리는 실행마다 기다리던 업무 기록을 다시 보고, 조건이 이미 채워졌으면 깨운다(시작 · 주기마다)
 * - Runtime 일시 장애(연결 실패 · 시간 초과 · 5xx)는 실행을 끝내지 않는다: WAITING_RUNTIME + 다음 시도 시각(2배씩) →
 *   `CERA_AGENT_RUNTIME_MAX_ATTEMPTS` 번째 실패에서 FAILED. 거부 · 계약 위반은 바로 FAILED. 무한 재시도 없음
 */
@Injectable()
export class AgentCoordinator implements OnModuleInit {
  private readonly inflight = new Set<Promise<unknown>>();

  constructor(
    @Inject(AgentRunRepository) private readonly runs: AgentRunRepository,
    @Inject(RuntimeStoreRepository) private readonly store: RuntimeStoreRepository,
    @Inject(AGENT_RUNTIME_CLIENT) private readonly runtime: AgentRuntimeClient,
    @Inject(AgentToolsService) private readonly tools: AgentToolsService,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(SystemErrorRecorder) private readonly systemErrors: SystemErrorRecorder,
    @Inject(DOMAIN_SIGNALS) private readonly signals: DomainSignals,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.signals.subscribe((s) => this.onSignal(s));
  }

  /** 사람(또는 SYSTEM Coordinator)이 시작한다. 이미 시작했으면 지금 상태를 돌려준다(새 그래프를 만들지 않는다). */
  async start(agentRunId: string, actorHeader: string | undefined) {
    await this.tools.requireHuman(actorHeader);
    const run = await this.load(agentRunId);
    const now = this.clock.now().toDb();
    const won = await this.tx.run(async (tx) => {
      const ok = await this.store.transition(tx, agentRunId, ['CREATED'], { status: 'RUNNING', updatedAt: now });
      if (ok) await this.step(tx, agentRunId, 'START', 'STARTED', null);
      return ok;
    });
    if (!won) return { ...(await this.view(agentRunId)), already: true };
    await this.drive(run, () => this.runtime.start({ agent_run_id: agentRunId, recovery_run_id: run.recoveryRunId, goal: run.goal, parameters: run.parameters ?? null }));
    return { ...(await this.view(agentRunId)), already: false };
  }

  /**
   * 기다리던 실행을 이어 간다. 이유 코드와 대상 참조만 넘긴다(업무 사실이 아니다). 기다리는 중이 아니면 아무것도 하지 않는다(멱등).
   * 사람 API(POST /agent-runs/:id/resume) · 업무 사건 알림 · 재조정(Worker)이 부른다. WAITING_RUNTIME 은 Runtime 재시도다.
   * 그래프가 아직 checkpoint 를 하나도 남기지 못했으면(시작 중 장애) 처음부터 시작을 다시 요청한다 — Tool 멱등 키가 부작용 중복을 막는다.
   */
  async resume(agentRunId: string, reason: string, ref: { type: string; id: string } | null) {
    if (!RESUME_REASON.test(reason)) throw new ValidationError('INVALID_REQUEST', 'reason must be an UPPER_SNAKE code', ['reason']);
    const run = await this.load(agentRunId);
    const now = this.clock.now().toDb();
    const won = await this.tx.run(async (tx) => {
      const ok = await this.store.transition(tx, agentRunId, ['WAITING_HUMAN', 'WAITING_EXTERNAL', 'WAITING_RUNTIME'], { status: 'RUNNING', currentNode: run.currentNode ?? null, updatedAt: now });
      if (ok) await this.step(tx, agentRunId, 'RESUME', 'RESUMED', reason);
      return ok;
    });
    if (!won) return { ...(await this.view(agentRunId)), already: true };
    const started = await this.store.hasCheckpoint(agentRunId);
    await this.drive(run, () =>
      started
        ? this.runtime.resume({ agent_run_id: agentRunId, reason, ref })
        : this.runtime.start({ agent_run_id: agentRunId, recovery_run_id: run.recoveryRunId, goal: run.goal, parameters: run.parameters ?? null }),
    );
    return { ...(await this.view(agentRunId)), already: false };
  }

  async resumeByHuman(agentRunId: string, actorHeader: string | undefined, body: unknown) {
    await this.tools.requireHuman(actorHeader);
    const reason = typeof (body as { reason?: unknown })?.reason === 'string' ? (body as { reason: string }).reason : 'OPERATOR_RESUME';
    return this.resume(agentRunId, reason, null);
  }

  async view(agentRunId: string) {
    const row = await this.load(agentRunId);
    // the last 50 steps, oldest first (read newest-first, then reversed)
    const steps = (await this.store.steps(agentRunId, 50)).reverse().map((s) => ({
      seq: s.seq,
      kind: s.kind,
      node: s.node,
      outcome: s.outcome,
      detail_code: s.detailCode,
      tool_call_id: s.toolCallId,
      retry_count: s.retryCount,
      duration_ms: s.durationMs,
      started_at: Instant.fromDb(s.startedAt).toSeoulIso(),
    }));
    return this.tools.runView(row, steps);
  }

  async list(limit: number) {
    const rows = await this.store.listRuns(limit);
    return {
      runs: rows.map((r) => ({
        agent_run_id: r.agentRunId,
        recovery_run_id: r.recoveryRunId,
        status: r.status,
        current_node: r.currentNode,
        waiting_reason: r.waitingReason,
        pending_ref: r.pendingRefType && r.pendingRefId ? { type: r.pendingRefType, id: r.pendingRefId } : null,
        last_error_code: r.lastErrorCode,
        started_at: Instant.fromDb(r.startedAt).toSeoulIso(),
        finished_at: r.finishedAt ? Instant.fromDb(r.finishedAt).toSeoulIso() : null,
      })),
    };
  }

  /** 시험 · 종료용: 알림으로 시작된 재개가 모두 끝날 때까지 기다린다. */
  async idle(): Promise<void> {
    while (this.inflight.size > 0) await Promise.allSettled([...this.inflight]);
  }

  // ── 내부 ──

  /** 알림 = 빨리 깨우기(최적화). 놓쳐도 재조정이 같은 실행을 깨운다. */
  private onSignal(signal: DomainSignal): void {
    if (signal.type === 'PLAN_CHANGED') {
      // 계획 판 승인 · 무효(T-114) — 그 판을 기다리던 실행을 깨운다. 놓쳐도 Worker 재조정이 판 상태로 같은 결론을 낸다
      this.track(
        (async () => {
          for (const id of await this.store.runsWaitingFor('RECOVERY_PLAN', signal.planId)) {
            await this.resume(id, signal.status === 'APPROVED' ? 'PLAN_APPROVED' : 'PLAN_OUTDATED', { type: 'RECOVERY_PLAN', id: signal.planId }).catch((e) => this.recordFailure(id, 'resume', e, false));
          }
        })(),
      );
      return;
    }
    if (signal.type !== 'APPROVAL_DECIDED') return; // 수신 · 추출은 Worker 프로세스에서 재조정이 바로 이어 받는다(AgentReconciler)
    this.track(
      (async () => {
        for (const id of await this.store.runsWaitingFor('COMM_MESSAGE', signal.messageId)) {
          await this.resume(id, 'APPROVAL_DECIDED', { type: 'COMM_MESSAGE', id: signal.messageId }).catch((e) => this.recordFailure(id, 'resume', e, false));
        }
      })(),
    );
  }

  /** 백그라운드 작업을 idle() 이 기다릴 수 있게 둔다. */
  track(work: Promise<unknown>): void {
    this.inflight.add(work);
    void work.finally(() => this.inflight.delete(work));
  }

  /** Python 그래프를 한 번 돌리고(interrupt 나 끝까지) 결과를 상태 전이로 반영한다. */
  private async drive(run: AgentRunRow, call: () => Promise<RuntimeOutcome>): Promise<void> {
    let outcome: RuntimeOutcome;
    try {
      outcome = await call();
    } catch (error) {
      const code = error instanceof RuntimeCallError ? error.code : 'AGENT_RUNTIME_UNAVAILABLE';
      const transient = isTransientRuntimeError(code);
      await this.recordFailure(run.agentRunId, 'drive', error, transient);
      if (transient) await this.scheduleRetry(run.agentRunId, code);
      else await this.finishFailed(run.agentRunId, code);
      return;
    }
    const now = this.clock.now().toDb();
    await this.tx.run(async (tx) => {
      const locked = await this.store.lockRun(tx, run.agentRunId);
      if (locked?.status !== 'RUNNING') return; // 도는 사이 취소됐다 — 결과를 반영하지 않는다
      const waiting = outcome.status === 'WAITING_HUMAN' || outcome.status === 'WAITING_EXTERNAL';
      const terminal = !waiting;
      await this.store.transition(tx, run.agentRunId, ['RUNNING'], {
        status: outcome.status,
        currentNode: outcome.node,
        waitingReason: waiting ? outcome.waiting_reason : null,
        pendingRefType: waiting ? (outcome.pending?.type ?? null) : null,
        pendingRefId: waiting ? (outcome.pending?.id ?? null) : null,
        lastErrorCode: outcome.error_code,
        finishedAt: terminal ? now : null,
        updatedAt: now,
        runtimeAttempts: 0,
        resultSummary: terminal ? (outcome.result_summary ?? null) : null,
      });
      await this.step(tx, run.agentRunId, waiting ? 'INTERRUPT' : 'TERMINAL', outcome.status, waiting ? outcome.waiting_reason : (outcome.result_code ?? outcome.error_code));
    });
  }

  /** 일시 장애: 연속 실패 횟수를 올리고 다음 시도 시각을 정한다(첫 기다림 × 2^(n-1)). 상한에 닿으면 FAILED. */
  private async scheduleRetry(agentRunId: string, code: string): Promise<void> {
    const now = this.clock.now();
    await this.tx.run(async (tx) => {
      const locked = await this.store.lockRun(tx, agentRunId);
      if (locked?.status !== 'RUNNING') return;
      const attempts = (locked.runtimeAttempts ?? 0) + 1;
      if (attempts >= this.env.CERA_AGENT_RUNTIME_MAX_ATTEMPTS) {
        if (await this.store.transition(tx, agentRunId, ['RUNNING'], { status: 'FAILED', lastErrorCode: code, finishedAt: now.toDb(), updatedAt: now.toDb(), runtimeAttempts: attempts })) {
          await this.step(tx, agentRunId, 'TERMINAL', 'FAILED', code);
        }
        return;
      }
      const waitMs = this.env.CERA_AGENT_RUNTIME_RETRY_BASE_MS * 2 ** (attempts - 1);
      await this.store.transition(tx, agentRunId, ['RUNNING'], {
        status: 'WAITING_RUNTIME',
        currentNode: locked.currentNode,
        waitingReason: code,
        lastErrorCode: code,
        updatedAt: now.toDb(),
        runtimeAttempts: attempts,
        nextAttemptAt: now.plusMs(waitMs).toDb(),
      });
      await this.step(tx, agentRunId, 'INTERRUPT', 'WAITING_RUNTIME', code);
    });
  }

  private async finishFailed(agentRunId: string, code: string): Promise<void> {
    const now = this.clock.now().toDb();
    await this.tx.run(async (tx) => {
      if (await this.store.transition(tx, agentRunId, ['RUNNING'], { status: 'FAILED', lastErrorCode: code, finishedAt: now, updatedAt: now })) {
        await this.step(tx, agentRunId, 'TERMINAL', 'FAILED', code);
      }
    });
  }

  private async step(tx: Parameters<Parameters<TransactionRunner['run']>[0]>[0], agentRunId: string, kind: 'START' | 'INTERRUPT' | 'RESUME' | 'TERMINAL', outcome: string, detail: string | null) {
    const now = this.clock.now().toDb();
    await this.store.insertStep(tx, agentRunId, {
      stepId: this.ids.newId(),
      kind,
      node: null,
      outcome,
      detailCode: detail,
      toolCallId: null,
      retryCount: 0,
      startedAt: now,
      finishedAt: now,
      durationMs: 0,
      traceId: currentContext()?.traceId ?? null,
    });
  }

  private async load(agentRunId: string): Promise<AgentRunRow> {
    if (!UUID.test(agentRunId)) throw new ValidationError('INVALID_ID', 'agentRunId must be a UUID', ['agentRunId']);
    const run = await this.runs.findRun(agentRunId);
    if (!run) throw new BusinessRuleError('AGENT_RUN_NOT_FOUND', 'No agent run with this id', 404);
    return run;
  }

  private async recordFailure(agentRunId: string, operation: string, error: unknown, retryable: boolean): Promise<void> {
    await this.systemErrors.record({
      serviceName: 'cera-api',
      componentName: 'AgentCoordinator',
      operationName: operation,
      errorBoundary: 'INTEGRATION',
      errorCategory: SYSTEM_ERROR_CATEGORY.AGENT_RUNTIME,
      errorCode: error instanceof RuntimeCallError ? error.code : 'AGENT_RUNTIME_UNAVAILABLE',
      safeErrorMessage: `Agent runtime ${operation} failed`,
      cause: error,
      targetSystem: 'AGENT_RUNTIME',
      retryable,
      relatedEntity: { type: 'AGENT_RUN', id: agentRunId },
    });
  }
}
