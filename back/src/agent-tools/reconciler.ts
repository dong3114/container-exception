import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DraftService } from '../communication/draft.service.js';
import { TruthService } from '../truth/truth.service.js';
import { RecoveryContextService, truckWindowOf } from './context.service.js';
import { candidateState } from './handlers.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DOMAIN_SIGNALS, type DomainSignal, type DomainSignals } from '../shared/signals/domain-signals.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { AgentCoordinator } from './coordinator.js';
import { RuntimeStoreRepository } from './runtime-store.repository.js';
import { contactWakeReason, planWakeReason, repliesWakeReason, wakeReason } from './wake-rules.js';
import { ContactSelectionRepository } from '../registry/contact-selection.repository.js';
import { RecoveryPlanService } from '../planning/recovery-plan.service.js';
import { RegistryService } from '../registry/registry.service.js';

/** 값이 생긴 사실 상태(회신 검토 대기를 깨운다 — T-124). STALE · REVOKED · UNKNOWN 은 값이 없다 */
const VALUE_STATES: readonly string[] = ['CONFIRMED', 'OBSERVED', 'PROVISIONAL', 'NEEDS_REVIEW'];

export interface ReconcileSummary {
  retried: number;
  woken: number;
  checked: number;
}

/**
 * Agent 재조정(T-104 durability) — **알림이 아니라 DB 상태로** 기다리는 실행을 깨운다. Worker 가 기동할 때 · 주기마다 부른다.
 *
 * 1. WAITING_RUNTIME 이고 다음 시도 시각이 지난 실행 → 다시 시도(Runtime 일시 장애 뒤)
 * 2. WAITING_HUMAN · WAITING_EXTERNAL 이고 대기 대상이 메시지인 실행 → 메시지의 지금 상태로 `wakeReason` 판정 → 깨움
 *
 * 깨우기는 Coordinator 의 조건부 전이로만 한다 — API 의 알림 경로 · 다른 Worker 와 동시에 깨워도 한 번만 이긴다.
 * 승인 · 발송 · 사실을 바꾸지 않는다(읽기만). 새 메시지 브로커 없이 PostgreSQL 만 쓴다.
 */
@Injectable()
export class AgentReconciler implements OnModuleInit {
  private readonly logger = new Logger('AgentReconciler');
  private running: Promise<unknown> | null = null;
  private again = false;

  constructor(
    @Inject(RuntimeStoreRepository) private readonly store: RuntimeStoreRepository,
    @Inject(AgentCoordinator) private readonly coordinator: AgentCoordinator,
    @Inject(DraftService) private readonly drafts: DraftService,
    @Inject(TruthService) private readonly truth: TruthService,
    @Inject(RecoveryContextService) private readonly context: RecoveryContextService,
    @Inject(RecoveryPlanService) private readonly plans: RecoveryPlanService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
    @Inject(DOMAIN_SIGNALS) private readonly signals: DomainSignals,
    @Inject(RegistryService) private readonly registry: RegistryService,
    @Inject(ContactSelectionRepository) private readonly selections: ContactSelectionRepository,
  ) {}

  /** 수신 · 추출 알림(Worker 프로세스) → 바로 한 번 더 재조정. 이미 도는 중이면 끝난 뒤 한 번 더. 승인 알림은 Coordinator 가 직접 받는다. */
  onModuleInit(): void {
    this.signals.subscribe((s: DomainSignal) => {
      if (s.type !== 'INBOUND_REPLY_RECEIVED' && s.type !== 'REPLY_EXTRACTED' && s.type !== 'FACT_CHANGED' && s.type !== 'PLAN_CHANGED' && s.type !== 'REGISTRY_CHANGED') return;
      this.kick();
    });
  }

  /** 실행 큐(T-121)가 다른 프로세스의 알림으로 깨울 때. 도는 중이면 끝난 뒤 한 번 더(같은 프로세스 안 직렬). */
  wake(): void {
    this.kick();
  }

  private kick(): void {
    if (!this.env.CERA_AGENT_RECONCILE_ENABLED) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = this.runOnce()
      .catch((e: unknown) => this.warn('signal', e))
      .finally(() => {
        this.running = null;
        if (this.again) {
          this.again = false;
          this.kick();
        }
      });
  }

  /** 시험 · 종료용: 알림으로 시작된 재조정이 끝날 때까지 */
  async idle(): Promise<void> {
    while (this.running) await this.running;
  }

  async runOnce(limit = 100): Promise<ReconcileSummary> {
    const summary: ReconcileSummary = { retried: 0, woken: 0, checked: 0 };
    if (!this.env.CERA_AGENT_RECONCILE_ENABLED) return summary;

    for (const id of await this.store.dueRetries(this.clock.now().toDb(), limit)) {
      const r = await this.coordinator.resume(id, 'RUNTIME_RETRY', null).catch((e: unknown) => this.warn(id, e));
      if (r && !r.already) summary.retried += 1;
    }

    for (const w of await this.allWaiting(limit)) {
      if (w.waitingReason === 'AWAITING_REPLIES') {
        // T-136: 이 실행의 다른 문의들의 회신을 기다리는 실행 — 기다릴 회신이 더 없으면(값이 들어옴 · 검토로 넘어감 · 문의가 닫힘) 깨운다.
        // 깨어난 그래프는 공백을 다시 읽고, 더 기다릴 것이 없으니 다시 이 대기로 돌아오지 않는다(같은 조건으로 반복해 깨우지 않는다)
        summary.checked += 1;
        const gaps = await this.context.informationGaps(w.recoveryRunId, null, truckWindowOf(w.parameters)).catch(() => null);
        if (!gaps) continue;
        const asked = [];
        for (const g of gaps.gaps) {
          if (g.state !== 'ASKED') continue;
          const messages = (await Promise.all(g.open_question_message_ids.map((id) => this.drafts.get(id).catch(() => null)))).filter((m): m is NonNullable<typeof m> => m !== null);
          asked.push({ candidateState: candidateState(messages).state });
        }
        const reason = repliesWakeReason(asked);
        if (!reason) continue;
        const r = await this.coordinator.resume(w.agentRunId, reason, { type: 'RECOVERY_RUN', id: w.recoveryRunId }).catch((e: unknown) => this.warn(w.agentRunId, e));
        if (r && !r.already) summary.woken += 1;
        continue;
      }
      if (w.pendingRefType === 'RECOVERY_PLAN' && w.pendingRefId) {
        // 계획 판을 기다리는 실행(T-114) — 판의 지금 상태로 판정한다
        summary.checked += 1;
        const plan = await this.plans.plan(w.pendingRefId).catch(() => null);
        const reason = planWakeReason(w.waitingReason, plan?.planStatus ?? null);
        if (!reason) continue;
        const r = await this.coordinator.resume(w.agentRunId, reason, { type: 'RECOVERY_PLAN', id: w.pendingRefId }).catch((e: unknown) => this.warn(w.agentRunId, e));
        if (r && !r.already) summary.woken += 1;
        continue;
      }
      if ((w.pendingRefType === 'FACILITY' || w.pendingRefType === 'TRUCK_POOL') && w.pendingRefId) {
        // 물어볼 연락처가 없어 사람을 기다리는 실행(운영 준비) — 그 주체의 공백이 더는 열려 있지 않으면(사람이 값을 넣음 · 다른 경로로 앎) 깨운다.
        // T-127: 연락처가 없어 기다리던 실행은 그 주체의 주인(운영 거래처 · 풀 소유 운송사)에게 이 실행이 쓸 수 있는 적격 주소가 생기면 깨운다.
        // 깨어난 그래프가 Tool 로 등록부를 다시 읽는다 — 하나면 초안, 둘 이상이면 CONTACT_SELECTION_REQUIRED(사람이 고른다).
        // T-129: 고르기를 기다리던 실행은 사람이 고른 주소가 쓸 수 있거나, 등록부가 바뀌어 고를 필요가 없어지면(하나 · 없음) 깨운다(contactWakeReason)
        summary.checked += 1;
        const recoveryRunId = await this.store.recoveryRunOf(w.agentRunId);
        if (!recoveryRunId) continue;
        const gaps = await this.context.informationGaps(recoveryRunId, null, truckWindowOf(w.parameters)).catch(() => null);
        if (!gaps) continue;
        const openGap = gaps.gaps.find((g) => g.subject_id === w.pendingRefId && (g.state === 'MISSING' || g.state === 'NEEDS_REFRESH'));
        if (openGap) {
          if (!openGap.owner_counterparty_id) continue;
          const reason = contactWakeReason(w.waitingReason, await this.usable(openGap.owner_counterparty_id, recoveryRunId), (await this.selections.latestForAgentRun(w.agentRunId, w.pendingRefId))?.addressId ?? null);
          if (!reason) continue;
          const r = await this.coordinator.resume(w.agentRunId, reason, { type: w.pendingRefType, id: w.pendingRefId }).catch((e: unknown) => this.warn(w.agentRunId, e));
          if (r && !r.already) summary.woken += 1;
          continue;
        }
        const r = await this.coordinator.resume(w.agentRunId, 'GAP_STATE_CHANGED', { type: w.pendingRefType, id: w.pendingRefId }).catch((e: unknown) => this.warn(w.agentRunId, e));
        if (r && !r.already) summary.woken += 1;
        continue;
      }
      if (w.pendingRefType !== 'COMM_MESSAGE' || !w.pendingRefId) continue;
      summary.checked += 1;
      const dto = await this.drafts.get(w.pendingRefId).catch(() => null);
      if (!dto) continue;
      const reason = wakeReason(w.waitingReason, {
        status: dto.message.status ?? '',
        approvalState: dto.approval.state,
        replies: dto.replies.map((r) => ({ status: r.status, extractionState: r.extraction?.state ?? null, passedCandidates: r.extraction?.candidates.filter((c) => c.validation === 'PASSED').length ?? 0 })),
        // 사실 대기 · 회신 검토 대기만 사실을 읽는다 — 다른 대기는 이 조회가 필요 없다
        ...(w.waitingReason === 'AWAITING_FACT_VERIFICATION' || w.waitingReason === 'REPLY_REVIEW_REQUIRED' ? { facts: await this.factStates(w.agentRunId, w.pendingRefId) } : {}),
      });
      if (!reason) continue;
      const r = await this.coordinator.resume(w.agentRunId, reason, { type: 'COMM_MESSAGE', id: w.pendingRefId }).catch((e: unknown) => this.warn(w.agentRunId, e));
      if (r && !r.already) summary.woken += 1;
    }
    return summary;
  }

  /** 기다리는 실행 전부(쪽마다 `limit` 건씩 이어 읽는다 — T-108). 한 쪽이 `limit` 보다 적으면 끝 */
  private async allWaiting(limit: number) {
    const all: Awaited<ReturnType<RuntimeStoreRepository['waitingOnRecords']>> = [];
    let after: string | null = null;
    for (;;) {
      const page = await this.store.waitingOnRecords(limit, after);
      all.push(...page);
      if (page.length < limit) return all;
      after = page[page.length - 1]!.agentRunId;
    }
  }

  /** 이 문의가 물은 좌표들의 지금 사실이 "사람 확인 대기"인지 — 사건에서 바로 판정한다(알림 · 파생 표에 기대지 않는다). */
  private async factStates(agentRunId: string, outboundMessageId: string): Promise<{ awaitingConfirmation: boolean; hasValue: boolean }[]> {
    // 실행의 판정 기준 시각(실제 = 지금 · 시뮬레이션 = 시나리오 시각) — 시간이 지나 STALE 이 된 것도 알림 없이 여기서 보인다
    const recoveryRunId = await this.store.recoveryRunOf(agentRunId);
    const asOf = recoveryRunId ? this.context.evaluationAsOf(await this.context.run(recoveryRunId)) : this.clock.now();
    const coordinates = await this.truth.repo.messageCoordinates(outboundMessageId);
    const out: { awaitingConfirmation: boolean; hasValue: boolean }[] = [];
    for (const c of coordinates) {
      const live = await this.truth.liveForCoordinate(c, asOf);
      out.push({ awaitingConfirmation: live.state === 'PROVISIONAL', hasValue: VALUE_STATES.includes(live.state) });
    }
    return out;
  }

  /** 주인 거래처에서 이 실행이 쓸 수 있는 주소(Contact Gate 통과 · 활성 담당자 · 실행의 Mock/Real 과 같은 종류) — find_counterparty 와 같은 규칙 */
  private async usable(counterpartyId: string, recoveryRunId: string): Promise<string[]> {
    return this.registry.usableAddresses(counterpartyId, (await this.context.run(recoveryRunId)).containsSimulated);
  }

  private warn(agentRunId: string, error: unknown): null {
    this.logger.warn({ msg: 'agent reconcile failed for a run — next cycle retries', agent_run_id: agentRunId, error: error instanceof Error ? error.name : 'unknown' });
    return null;
  }
}
