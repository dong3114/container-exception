import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE, type Database, type DbTransaction } from '../db/database.js';
import {
  actor,
  facility,
  operationalException,
  operationalExceptionObservation,
  operationalExceptionContainer,
  planningContainerRecord,
  planningInputBatch,
  planningSnapshot,
  recoveryRun,
} from '../db/schema/index.js';
import { TransactionRunner } from '../db/transaction.js';
import { AuditRecorder } from '../persistence/audit-recorder.js';
import { AUDIT_ACTION } from '../persistence/catalog.js';
import { LIVE_HORIZON_DAYS } from '../planning/live-input.js';
import { RecoveryPlanService } from '../planning/recovery-plan.service.js';
import { planningInputFromScenario } from '../planning/scenario-input.js';
import { loadScenarioPack } from '../planning/scenario-pack.js';
import { DEFAULT_DATA_PACK } from '../seed/slice1-fixture.js';
import { BusinessRuleError, SystemError, ValidationError } from '../shared/errors/cera-error.js';
import { canonicalHash } from '../shared/hash/hash.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { DOMAIN_SIGNALS, type DomainSignals } from '../shared/signals/domain-signals.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import { TruthService } from '../truth/truth.service.js';
import {
  type CapacityAssessment,
  type CapacityObservation,
  type CapacityState,
  type DemandItem,
  WAREHOUSE_CAPACITY_SHORTAGE,
  assessWarehouseCapacity,
  capacityFactKey,
  decideLifecycle,
  evidenceMaterial,
  shouldCreateRun,
} from './exception-rules.js';

type Scope = { kind: 'LIVE'; scenarioId: null; isSimulated: false; asOf: Instant; window: string[] } | { kind: 'SCENARIO'; scenarioId: string; isSimulated: true; asOf: Instant; window: string[]; snapshotId: string; baseRunId: string | null; objectiveVersion: string };

export interface DetectionSummary {
  evaluated: number;
  detected: number;
  changed: number;
  resolved: number;
  indeterminate: number;
  runs_created: number;
}

const CAPACITY_STATES = new Set<CapacityState>(['CONFIRMED', 'OBSERVED', 'PROVISIONAL', 'NEEDS_REVIEW', 'STALE', 'REVOKED', 'UNKNOWN']);
const STATE_RANK: Record<string, number> = { CONFIRMED: 0, OBSERVED: 1, PROVISIONAL: 2, NEEDS_REVIEW: 3, STALE: 4, REVOKED: 5, UNKNOWN: 6 };

export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * 운영 예외 탐지기(T-132 · ADR-040) — 결정론 규칙(`exception-rules.ts`)을 DB 에 적용한다. LLM · 메일 · Agent 를 부르지 않는다.
 *
 * - 범위 LIVE: 운영 기준 계획(어느 실행에도 속하지 않은 컨테이너 기록, `recovery_run_id IS NULL`)의 지금 판 + 실제 Truth 수용량. 기준 시각 = 지금(경계에서 한 번)
 * - 범위 SCENARIO: 합성 시나리오 팩의 원래 계획 + 그 시나리오의 Truth 수용량. 기준 시각 = 시나리오 스냅숏 시각(시연 · 시험)
 * - 한 번에 하나만 돈다(트랜잭션 advisory lock) · 진행 중 예외는 정체마다 하나(부분 유일 인덱스) → API · Worker 가 같이 돌아도, 재시작돼도 중복이 없다
 * - 근거가 CONFIRMED 인 진행 중 예외에는 복구 실행을 하나 만든다(트리거 EXCEPTION_DETECTED, 참조 `EXCEPTION:<id>`). Agent 는 시작하지 않는다 —
 *   문의 수량 · 시간대는 사람이 정한다(ADR-040 결정 5). 외부 연락은 기존대로 사람 승인 뒤에만
 * - 호출 시점: 사실 · 운영 입력이 바뀐 알림(API · Worker 프로세스 안) + Worker 주기(`CERA_EXCEPTION_DETECT_INTERVAL_MS`). 알림을 놓쳐도 주기가 같은 결과를 낸다
 */
@Injectable()
export class ExceptionDetectorService implements OnModuleInit {
  private readonly logger = new Logger('ExceptionDetector');
  private pack: ReturnType<typeof loadScenarioPack> | null = null;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(TruthService) private readonly truth: TruthService,
    @Inject(RecoveryPlanService) private readonly plans: RecoveryPlanService,
    @Inject(AuditRecorder) private readonly audit: AuditRecorder,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DOMAIN_SIGNALS) private readonly signals: DomainSignals,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get enabled(): boolean {
    return this.env.CERA_EXCEPTION_DETECTION === 'on';
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    this.signals.subscribe(async (s) => {
      if (s.type !== 'FACT_CHANGED' && s.type !== 'OPERATIONAL_INPUT_CHANGED') return;
      try {
        await this.detect();
      } catch (e) {
        this.logger.warn(`exception detection after ${s.type} failed: ${(e as Error).message}`);
      }
    });
  }

  /** 모든 범위를 한 번 탐지한다. 같은 입력으로 다시 부르면 아무것도 바뀌지 않는다. */
  async detect(): Promise<DetectionSummary> {
    const summary: DetectionSummary = { evaluated: 0, detected: 0, changed: 0, resolved: 0, indeterminate: 0, runs_created: 0 };
    for (const scope of await this.scopes()) {
      const assessments = await this.assess(scope);
      summary.evaluated += assessments.length;
      await this.tx.run(async (t) => {
        await t.execute(sql`SELECT pg_advisory_xact_lock(hashtext('cera.exception_detector'))`);
        const system = await this.systemActor(t);
        if (scope.kind === 'LIVE') summary.resolved += await this.expirePast(t, scope, system);
        for (const a of assessments) await this.apply(t, scope, a, system, summary);
      });
    }
    if (summary.detected + summary.changed + summary.resolved + summary.runs_created > 0) this.logger.log({ msg: 'exception detection', ...summary });
    return summary;
  }

  /** 사람이 요청한 탐지 — 꺼져 있으면 거절(설정이 정한다). */
  async detectOnDemand(): Promise<DetectionSummary> {
    if (!this.enabled) throw new BusinessRuleError('EXCEPTION_DETECTION_OFF', 'Exception detection is off in this deployment (CERA_EXCEPTION_DETECTION)', 409);
    return this.detect();
  }

  // ------------------------------------------------------------------ 범위 · 판정 재료

  private async scopes(): Promise<Scope[]> {
    const now = this.clock.now();
    const today = now.toSeoulIso().slice(0, 10);
    const out: Scope[] = [{ kind: 'LIVE', scenarioId: null, isSimulated: false, asOf: now, window: Array.from({ length: LIVE_HORIZON_DAYS }, (_, i) => addDays(today, i)) }];
    // 합성 시나리오: 시드 스냅숏(시나리오가 있는 가장 이른 스냅숏) — 시나리오 팩은 하나(DEFAULT_DATA_PACK)
    const [snap] = await this.db
      .select({ snapshotId: planningSnapshot.snapshotId, scenarioId: planningSnapshot.scenarioId, asOf: planningSnapshot.asOf })
      .from(planningSnapshot)
      .where(and(eq(planningSnapshot.containsSimulated, true), sql`${planningSnapshot.scenarioId} IS NOT NULL`))
      .orderBy(asc(planningSnapshot.createdAt))
      .limit(1);
    if (snap?.scenarioId) {
      const [base] = await this.db
        .select({ runId: recoveryRun.runId, objectiveVersion: recoveryRun.objectiveVersion })
        .from(recoveryRun)
        .where(and(eq(recoveryRun.snapshotId, snap.snapshotId), sql`${recoveryRun.triggerRef} NOT LIKE 'EXCEPTION:%'`))
        .orderBy(asc(recoveryRun.executedAt))
        .limit(1);
      const days = this.scenarioPack().scenario.days;
      out.push({
        kind: 'SCENARIO',
        scenarioId: snap.scenarioId,
        isSimulated: true,
        asOf: Instant.fromDb(snap.asOf),
        window: Object.keys(days).sort().map((k) => days[k]!),
        snapshotId: snap.snapshotId,
        baseRunId: base?.runId ?? null,
        objectiveVersion: base?.objectiveVersion ?? 'scenario',
      });
    }
    return out;
  }

  private scenarioPack() {
    this.pack ??= loadScenarioPack(DEFAULT_DATA_PACK);
    return this.pack;
  }

  private async assess(scope: Scope): Promise<CapacityAssessment[]> {
    const warehouses = await this.warehouses(scope);
    if (warehouses.size === 0) return [];
    const demand = scope.kind === 'LIVE' ? await this.baselineDemand() : this.scenarioDemand(scope);
    const capacity = await this.capacity([...warehouses], scope);
    const active = await this.db
      .select({ facilityId: operationalException.facilityId, day: operationalException.windowDay })
      .from(operationalException)
      .where(and(eq(operationalException.status, 'ACTIVE'), eq(operationalException.scope, scope.kind), eq(operationalException.exceptionType, WAREHOUSE_CAPACITY_SHORTAGE)));
    return assessWarehouseCapacity(demand, capacity, scope.window, warehouses, active.map((r) => ({ facility_id: r.facilityId, day: r.day })));
  }

  private async warehouses(scope: Scope): Promise<Set<string>> {
    const rows = await this.db.select({ id: facility.facilityId }).from(facility).where(and(eq(facility.facilityType, 'WAREHOUSE'), eq(facility.isActive, true)));
    const ids = rows.map((r) => r.id);
    if (scope.kind === 'LIVE') return new Set(ids);
    const mapped = new Set(Object.values(this.plans.packIds));
    return new Set(ids.filter((id) => mapped.has(id)));
  }

  /** 운영 기준 계획의 지금 판(밀리지 않은 · ACTIVE) */
  private async baselineDemand(): Promise<DemandItem[]> {
    const rows = await this.db
      .select({ id: planningContainerRecord.recordId, no: planningContainerRecord.containerNo, facilityId: planningContainerRecord.destinationFacilityId, day: planningContainerRecord.plannedDay, hour: planningContainerRecord.plannedDepartHour, status: planningContainerRecord.recordStatus, batchId: planningContainerRecord.batchId })
      .from(planningContainerRecord)
      .where(and(isNull(planningContainerRecord.recoveryRunId), sql`NOT EXISTS (SELECT 1 FROM cera.planning_container_record s WHERE s.supersedes_record_id = ${planningContainerRecord.recordId})`));
    return rows.filter((r) => r.status === 'ACTIVE').map((r) => ({ ref: r.id, container_no: r.no, facility_id: r.facilityId, day: r.day, depart_hour: r.hour, batch_id: r.batchId }));
  }

  private scenarioDemand(scope: Extract<Scope, { kind: 'SCENARIO' }>): DemandItem[] {
    const input = planningInputFromScenario(this.scenarioPack(), { as_of: scope.asOf.toSeoulIso(), truthFacts: [], ids: this.plans.packIds });
    return input.containers.map((c) => ({ ref: c.container_id, container_no: c.container_no, facility_id: c.destination_id, day: c.planned_day, depart_hour: c.planned_depart_hour }));
  }

  /** 창고 × 날짜 수용량 사실 — Truth 판정 그대로(같은 좌표가 적용 범위별로 여럿이면 가장 믿을 만한 것). */
  private async capacity(warehouseIds: string[], scope: Scope): Promise<CapacityObservation[]> {
    const results = await this.truth.liveForSubjects(warehouseIds, { isSimulated: scope.isSimulated, scenarioId: scope.scenarioId }, scope.asOf);
    const best = new Map<string, CapacityObservation>();
    for (const r of results) {
      const day = scope.window.find((d) => r.data.coordinate.factKey === capacityFactKey(d));
      if (!day) continue;
      const w = r.result.winner;
      const state = (CAPACITY_STATES.has(r.state as CapacityState) ? r.state : 'UNKNOWN') as CapacityState;
      const obs: CapacityObservation = { facility_id: r.data.coordinate.entityId, day, value: w && w.value !== null && Number.isSafeInteger(w.value) && w.value >= 0 ? w.value : null, state, event_id: w?.eventId ?? null, fact_key: r.data.coordinate.factKey };
      const k = `${obs.facility_id}|${day}`;
      const cur = best.get(k);
      if (!cur || (STATE_RANK[obs.state] ?? 9) < (STATE_RANK[cur.state] ?? 9)) best.set(k, obs);
    }
    return [...best.values()];
  }

  // ------------------------------------------------------------------ 기록

  private async apply(t: DbTransaction, scope: Scope, a: CapacityAssessment, system: string, summary: DetectionSummary): Promise<void> {
    const identity = and(
      eq(operationalException.exceptionType, WAREHOUSE_CAPACITY_SHORTAGE),
      eq(operationalException.scope, scope.kind),
      scope.scenarioId ? eq(operationalException.scenarioId, scope.scenarioId) : isNull(operationalException.scenarioId),
      eq(operationalException.facilityId, a.facility_id),
      eq(operationalException.windowDay, a.day),
      eq(operationalException.status, 'ACTIVE'),
    );
    const [active] = await t.select().from(operationalException).where(identity).limit(1).for('update');
    const material = evidenceMaterial(a);
    const evidenceHash = canonicalHash({ k: 'exception-evidence', v: 1, m: material as never });
    let lastHash: string | null = null;
    if (active) {
      const [last] = await t.select({ h: operationalExceptionObservation.evidenceHash }).from(operationalExceptionObservation).where(eq(operationalExceptionObservation.exceptionId, active.exceptionId)).orderBy(desc(operationalExceptionObservation.observedAt), desc(operationalExceptionObservation.observationId)).limit(1);
      lastHash = last?.h ?? null;
    }
    const decision = decideLifecycle(active ? { basis: active.basis as 'CONFIRMED' | 'PROVISIONAL', scheduled_demand: active.scheduledDemand, capacity: active.capacity, shortage: active.shortage, last_evidence_hash: lastHash } : null, a, evidenceHash);
    const now = this.clock.now().toDb();
    const observe = async (exceptionId: string, kind: 'DETECTED' | 'CHANGED' | 'RESOLVED' | 'INDETERMINATE') => {
      const batchIds = scope.kind === 'LIVE' ? await this.batchIdsOf(t, a.demand_refs) : [];
      const observationId = this.ids.newId();
      await t.insert(operationalExceptionObservation).values({
        observationId,
        exceptionId,
        kind,
        asOf: scope.asOf.toDb(),
        observedAt: now,
        scheduledDemand: a.demand,
        capacity: a.capacity,
        capacityState: a.capacity_state,
        capacityEventId: a.capacity_event_id,
        shortage: a.shortage,
        evidence: { ...material, fact_key: a.fact_key, scheduled: a.scheduled, affected: a.affected, input_batch_ids: batchIds, rule: 'warehouse-capacity/1', as_of: scope.asOf.toSeoulIso() },
        evidenceHash,
      });
      // T-136 Phase 5: 넘친 컨테이너를 관계로 남긴다(evidence JSON 은 감사용으로 그대로). 복구 계획은 이 관계로 재배치 후보 · 고정 계획을 나눈다
      // 컨테이너 표시 = 계획이 쓰는 컨테이너 id(LIVE = 컨테이너 번호, SCENARIO = 시나리오 컨테이너 id). 탐지 규칙의 affected 는 컨테이너 번호다 —
      // 시나리오는 같은 순서의 demand_refs(시나리오 id)로 바꾼다
      if ((kind === 'DETECTED' || kind === 'CHANGED') && a.affected.length > 0) {
        const rows = a.affected.map((no) => {
          const idx = Math.max(0, a.scheduled.indexOf(no));
          return { exceptionId, observationId, containerRef: scope.kind === 'SCENARIO' ? (a.demand_refs[idx] ?? no) : no, planOrder: idx, createdAt: now };
        });
        await t.insert(operationalExceptionContainer).values(rows).onConflictDoNothing();
      }
    };

    let exceptionId = active?.exceptionId ?? null;
    let basis = (active?.basis ?? null) as 'CONFIRMED' | 'PROVISIONAL' | null;
    let status: 'ACTIVE' | 'RESOLVED' | null = active ? 'ACTIVE' : null;
    const hasRun = Boolean(active?.recoveryRunId);
    if (decision.action === 'DETECT') {
      exceptionId = this.ids.newId();
      basis = decision.basis;
      status = 'ACTIVE';
      await t.insert(operationalException).values({ exceptionId, exceptionType: WAREHOUSE_CAPACITY_SHORTAGE, scope: scope.kind, scenarioId: scope.scenarioId, facilityId: a.facility_id, windowDay: a.day, status: 'ACTIVE', basis: decision.basis, scheduledDemand: a.demand, capacity: a.capacity, shortage: a.shortage, recoveryRunId: null, isSimulated: scope.isSimulated, detectedAt: now, updatedAt: now, resolvedAt: null });
      await observe(exceptionId, 'DETECTED');
      await this.audit.record(t, { actorId: system, action: AUDIT_ACTION.EXCEPTION_DETECTED, targetType: 'OPERATIONAL_EXCEPTION', targetId: exceptionId, result: 'SUCCESS', isSimulated: scope.isSimulated });
      summary.detected += 1;
    } else if (decision.action === 'CHANGE' && active) {
      basis = decision.basis;
      await t.update(operationalException).set({ basis: decision.basis, scheduledDemand: a.demand, capacity: a.capacity, shortage: a.shortage, updatedAt: now }).where(eq(operationalException.exceptionId, active.exceptionId));
      await observe(active.exceptionId, 'CHANGED');
      summary.changed += 1;
    } else if (decision.action === 'RESOLVE' && active) {
      status = 'RESOLVED';
      await t.update(operationalException).set({ status: 'RESOLVED', scheduledDemand: a.demand, capacity: a.capacity, shortage: 0, updatedAt: now, resolvedAt: now }).where(eq(operationalException.exceptionId, active.exceptionId));
      await observe(active.exceptionId, 'RESOLVED');
      await this.audit.record(t, { actorId: system, action: AUDIT_ACTION.EXCEPTION_RESOLVED, targetType: 'OPERATIONAL_EXCEPTION', targetId: active.exceptionId, result: 'SUCCESS', isSimulated: scope.isSimulated });
      summary.resolved += 1;
    } else if (decision.action === 'INDETERMINATE' && active) {
      // 숫자를 믿을 수 없다 — 진행 중 예외의 숫자는 그대로 두고(단정하지 않음) 관측만 남긴다
      await t.update(operationalException).set({ updatedAt: now }).where(eq(operationalException.exceptionId, active.exceptionId));
      await observe(active.exceptionId, 'INDETERMINATE');
      summary.indeterminate += 1;
    }

    if (exceptionId && status && basis && shouldCreateRun(status, basis, hasRun)) {
      const runId = await this.createRun(t, scope, exceptionId, a, system);
      await t.update(operationalException).set({ recoveryRunId: runId, updatedAt: now }).where(eq(operationalException.exceptionId, exceptionId));
      await this.audit.record(t, { actorId: system, action: AUDIT_ACTION.EXCEPTION_RUN_CREATED, targetType: 'RECOVERY_RUN', targetId: runId, result: 'SUCCESS', isSimulated: scope.isSimulated });
      summary.runs_created += 1;
    }
  }

  /**
   * 날짜가 지나 계산 범위 밖으로 나간 LIVE 예외를 닫는다(근거 = 날짜 경과 — 수용량이 충분해졌다고 말하지 않는다). 복구 실행 · 계획 기록은 그대로다.
   */
  private async expirePast(t: DbTransaction, scope: Scope, system: string): Promise<number> {
    const first = scope.window[0]!;
    const stale = await t.select().from(operationalException).where(and(eq(operationalException.status, 'ACTIVE'), eq(operationalException.scope, 'LIVE'), sql`${operationalException.windowDay} < ${first}`)).for('update');
    const now = this.clock.now().toDb();
    for (const e of stale) {
      const material = { facility_id: e.facilityId, day: e.windowDay, verdict: 'WINDOW_PASSED' };
      await t.update(operationalException).set({ status: 'RESOLVED', updatedAt: now, resolvedAt: now }).where(eq(operationalException.exceptionId, e.exceptionId));
      await t.insert(operationalExceptionObservation).values({ observationId: this.ids.newId(), exceptionId: e.exceptionId, kind: 'RESOLVED', asOf: scope.asOf.toDb(), observedAt: now, scheduledDemand: e.scheduledDemand, capacity: e.capacity, capacityState: 'WINDOW_PASSED', capacityEventId: null, shortage: e.shortage, evidence: { ...material, rule: 'warehouse-capacity/1', as_of: scope.asOf.toSeoulIso() }, evidenceHash: canonicalHash({ k: 'exception-evidence', v: 1, m: material as never }) });
      await this.audit.record(t, { actorId: system, action: AUDIT_ACTION.EXCEPTION_RESOLVED, targetType: 'OPERATIONAL_EXCEPTION', targetId: e.exceptionId, result: 'SUCCESS', isSimulated: false });
    }
    return stale.length;
  }

  private async batchIdsOf(t: DbTransaction, recordIds: string[]): Promise<string[]> {
    if (recordIds.length === 0) return [];
    const rows = await t.selectDistinct({ b: planningContainerRecord.batchId }).from(planningContainerRecord).where(inArray(planningContainerRecord.recordId, recordIds));
    return rows.map((r) => r.b).sort();
  }

  /**
   * 예외 → 복구 실행. LIVE: 지금 기준 새 스냅숏 + 운영 기준 계획의 지금 판을 그 실행의 계획 입력으로 옮겨 적는다(같은 내용 지문 — 원본은 그대로).
   * SCENARIO: 시나리오 스냅숏을 그대로 쓰는 새 시뮬레이션 실행(같은 합성 팩 · 같은 시나리오 사실).
   */
  private async createRun(t: DbTransaction, scope: Scope, exceptionId: string, a: CapacityAssessment, system: string): Promise<string> {
    const runId = this.ids.newId();
    const now = this.clock.now();
    const triggerRef = `EXCEPTION:${exceptionId}`;
    if (scope.kind === 'SCENARIO') {
      await t.insert(recoveryRun).values({ runId, snapshotId: scope.snapshotId, previousRunId: scope.baseRunId, triggerType: 'EXCEPTION_DETECTED', triggerRef, objectiveVersion: scope.objectiveVersion, runStatus: 'FEASIBLE', totalCostKrw: null, containsSimulated: true, executedAt: now.toDb() });
      return runId;
    }
    const snapshotId = this.ids.newId();
    await t.insert(planningSnapshot).values({
      snapshotId,
      asOf: now.toDb(),
      factFingerprint: canonicalHash({ k: 'snap-facts', v: 1, facts: [] }),
      ruleVersion: 'live-run/1',
      tariffVersion: 'live-run/1',
      policyVersion: 'live-run/1',
      scopeRef: { kind: 'EXCEPTION_RUN', exception_id: exceptionId, exception_type: WAREHOUSE_CAPACITY_SHORTAGE, facility_id: a.facility_id, window_day: a.day, note: 'Created by the deterministic exception detector from the operational baseline' },
      containsSimulated: false,
      createdAt: now.toDb(),
      scenarioId: null,
    });
    await t.insert(recoveryRun).values({ runId, snapshotId, triggerType: 'EXCEPTION_DETECTED', triggerRef, objectiveVersion: 'live-run/1', runStatus: 'FEASIBLE', totalCostKrw: null, containsSimulated: false, executedAt: now.toDb() });
    // 운영 기준 계획의 지금 판(ACTIVE) 전부를 이 실행의 계획 입력으로 — 다른 창고 · 다른 날의 컨테이너도 대안 자원을 나눠 쓰므로 함께 옮긴다
    const heads = (
      await t
        .select()
        .from(planningContainerRecord)
        .where(and(isNull(planningContainerRecord.recoveryRunId), sql`NOT EXISTS (SELECT 1 FROM cera.planning_container_record s WHERE s.supersedes_record_id = ${planningContainerRecord.recordId})`))
        .orderBy(asc(planningContainerRecord.containerNo))
    ).filter((r) => r.recordStatus === 'ACTIVE');
    const batchId = this.ids.newId();
    await t.insert(planningInputBatch).values({
      batchId,
      inputKind: 'CONTAINERS',
      recoveryRunId: runId,
      commandId: exceptionId,
      submittedByActorId: system,
      sourceType: 'ROWS',
      sourceLabel: `exception:${exceptionId}`.slice(0, 100),
      contentHash: canonicalHash({ k: 'planning-input-batch', v: 1, kind: 'CONTAINERS', scope: runId, rows: heads.map((h) => h.contentHash).sort() }),
      rowCount: heads.length,
      acceptedCount: heads.length,
      unchangedCount: 0,
      submittedAt: now.toDb(),
    });
    if (heads.length > 0) {
      await t.insert(planningContainerRecord).values(
        heads.map((h, i) => ({ ...h, recordId: this.ids.newId(), batchId, recoveryRunId: runId, supersedesRecordId: null, rowNo: i + 1, recordedAt: now.toDb() })),
      );
    }
    return runId;
  }

  private async systemActor(q: Database | DbTransaction): Promise<string> {
    const [row] = await q.select({ id: actor.actorId }).from(actor).where(and(eq(actor.actorType, 'SYSTEM'), eq(actor.isActive, true))).orderBy(asc(actor.actorId)).limit(1);
    if (!row) throw new SystemError('SYSTEM_ACTOR_MISSING', 'No active SYSTEM actor is registered (run npm run db:bootstrap)');
    return row.id;
  }

  // ------------------------------------------------------------------ 조회(API)

  async list(status?: string): Promise<{ exceptions: ExceptionView[]; summary: { active: number; detected_today: number } }> {
    if (status !== undefined && status !== 'ACTIVE' && status !== 'RESOLVED') throw new ValidationError('INVALID_STATUS', 'status must be ACTIVE or RESOLVED', ['status']);
    const rows = await this.db
      .select({ e: operationalException, name: facility.facilityName })
      .from(operationalException)
      .innerJoin(facility, eq(facility.facilityId, operationalException.facilityId))
      .where(status ? eq(operationalException.status, status) : undefined)
      .orderBy(desc(operationalException.detectedAt))
      .limit(200);
    const today = this.clock.now().toSeoulIso().slice(0, 10);
    const all = await this.db.select({ status: operationalException.status, detectedAt: operationalException.detectedAt }).from(operationalException);
    return {
      exceptions: rows.map((r) => this.view(r.e, r.name)),
      summary: { active: all.filter((x) => x.status === 'ACTIVE').length, detected_today: all.filter((x) => Instant.fromDb(x.detectedAt).toSeoulIso().slice(0, 10) === today).length },
    };
  }

  async get(exceptionId: string): Promise<ExceptionView & { observations: ObservationView[] }> {
    if (!/^[0-9a-f-]{36}$/.test(exceptionId)) throw new ValidationError('INVALID_ID', 'exception id must be a UUID', ['exceptionId']);
    const [row] = await this.db.select({ e: operationalException, name: facility.facilityName }).from(operationalException).innerJoin(facility, eq(facility.facilityId, operationalException.facilityId)).where(eq(operationalException.exceptionId, exceptionId)).limit(1);
    if (!row) throw new BusinessRuleError('NOT_FOUND', 'No operational exception with this id', 404);
    const obs = await this.db.select().from(operationalExceptionObservation).where(eq(operationalExceptionObservation.exceptionId, exceptionId)).orderBy(asc(operationalExceptionObservation.observedAt), asc(operationalExceptionObservation.observationId));
    return {
      ...this.view(row.e, row.name),
      observations: obs.map((o) => ({
        observation_id: o.observationId,
        kind: o.kind,
        as_of: Instant.fromDb(o.asOf).toSeoulIso(),
        observed_at: Instant.fromDb(o.observedAt).toSeoulIso(),
        scheduled_demand: o.scheduledDemand,
        capacity: o.capacity,
        capacity_state: o.capacityState,
        capacity_event_id: o.capacityEventId,
        shortage: o.shortage,
        evidence: o.evidence,
      })),
    };
  }

  private view(e: typeof operationalException.$inferSelect, facilityName: string): ExceptionView {
    return {
      exception_id: e.exceptionId,
      exception_type: e.exceptionType,
      scope: e.scope,
      is_simulated: e.isSimulated,
      facility_id: e.facilityId,
      facility_name: facilityName,
      window_day: e.windowDay,
      status: e.status as 'ACTIVE' | 'RESOLVED',
      basis: e.basis as 'CONFIRMED' | 'PROVISIONAL',
      scheduled_demand: e.scheduledDemand,
      capacity: e.capacity,
      shortage: e.shortage,
      recovery_run_id: e.recoveryRunId,
      detected_at: Instant.fromDb(e.detectedAt).toSeoulIso(),
      updated_at: Instant.fromDb(e.updatedAt).toSeoulIso(),
      resolved_at: e.resolvedAt ? Instant.fromDb(e.resolvedAt).toSeoulIso() : null,
    };
  }
}

export interface ExceptionView {
  exception_id: string;
  exception_type: string;
  scope: string;
  is_simulated: boolean;
  facility_id: string;
  facility_name: string;
  window_day: string;
  status: 'ACTIVE' | 'RESOLVED';
  basis: 'CONFIRMED' | 'PROVISIONAL';
  scheduled_demand: number;
  capacity: number | null;
  shortage: number;
  recovery_run_id: string | null;
  detected_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface ObservationView {
  observation_id: string;
  kind: string;
  as_of: string;
  observed_at: string;
  scheduled_demand: number;
  capacity: number | null;
  capacity_state: string;
  capacity_event_id: string | null;
  shortage: number;
  evidence: Record<string, unknown>;
}
