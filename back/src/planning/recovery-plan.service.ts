import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DATABASE, type Database, type DbTransaction } from '../db/database.js';
import { actor, bl, container, containerBl, counterparty, facility, planningSnapshot, recoveryPlan, recoveryPlanItem, recoveryRun, truckPool } from '../db/schema/index.js';
import { TransactionRunner } from '../db/transaction.js';
import { AuditRecorder } from '../persistence/audit-recorder.js';
import { AUDIT_ACTION } from '../persistence/catalog.js';
import { DEFAULT_DATA_PACK, PACK_FACILITY_IDS, SEED_IDS } from '../seed/slice1-fixture.js';
import { BusinessRuleError, SystemError, ValidationError } from '../shared/errors/cera-error.js';
import { canonicalHash } from '../shared/hash/hash.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { DOMAIN_SIGNALS, type DomainSignals } from '../shared/signals/domain-signals.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import type { CoordinateResult } from '../truth/truth.service.js';
import { TruthService } from '../truth/truth.service.js';
import { TruthRepository } from '../truth/truth.repository.js';
import { BASELINE_RULE, computeBaseline, type BaselineResult } from './engine/baseline.js';
import { buildCostTable } from './engine/cost-engine.js';
import { COST_POLICY_VERSION } from './engine/cost-policy.js';
import { SOLVER_VERSION, solveRecovery, type SolverResult } from './engine/solver.js';
import type { CostTable, PlanningFact, PlanningInput } from './engine/types.js';
import { isTruthManagedKey, planningInputFromScenario, type ScenarioPack } from './scenario-input.js';
import { loadScenarioPack } from './scenario-pack.js';
import { LIVE_HORIZON_DAYS, type LiveAssessment, type LiveProvenance, assessLiveInput, groupSummary } from './live-input.js';
import { PlanningInputService } from './planning-input.service.js';

/**
 * 복구 계획(T-114) — 결정론 Cost Engine + Solver 를 계획 실행(recovery_run) 하나에 대해 돌리고, 결과를 **제안(PROPOSED) 판**으로 남긴다.
 * - 입력 방식(`input_mode`) 둘 — 섞지 않는다:
 *   SCENARIO(시뮬레이션 실행) = 시나리오 팩(합성 컨테이너 · 요율 · 자사 명부) + Truth 사실(창고 · ODCY 용량, 협력 차량 가용)
 *   LIVE(실제 실행, T-123) = 사람이 넣은 운영 기록(컨테이너 계획 정보 · 계약 요율 · 시설 계획 정보) + Truth 사실. 시나리오 값으로 메우지 않는다
 *   각 사실은 `source` 로 TRUTH(사건 id) · SCENARIO(팩 위치) · OPERATIONAL_RECORD(기록 id)를 가진다
 * - 판: 같은 계획 실행 안에서 1, 2, 3 … 새 판이 서면 옛 판은 SUPERSEDED. 입력 지문이 같으면 새 판을 만들지 않는다
 * - 사실 변경: 판이 기대던 Truth 사실(사건 · 상태 · 값)이 바뀌면 OUTDATED → Agent 를 깨워 다시 계산하게 한다
 * - 승인: 사람만, 본 판의 지문(plan_hash)으로. 승인은 실행 지시가 아니다(배차 · 발송 없음)
 * 숫자는 모두 엔진 출력이다(ADR-029). LLM 은 여기 닿지 않는다.
 */

export const PLAN_ACTOR_HEADER = 'x-cera-actor-id';
const PACK_TRUCK_POOL_IDS: Record<string, string> = { OWN_FLEET: SEED_IDS.truckPoolOwnFleet, K_TRUCKING: SEED_IDS.truckPoolPartner };
const TRUTH_RANK: Record<string, number> = { CONFIRMED: 0, OBSERVED: 1, PROVISIONAL: 2, NEEDS_REVIEW: 3, STALE: 4, REVOKED: 5, UNKNOWN: 6 };
const CURRENT_STATUSES = ['PROPOSED', 'APPROVED', 'INFEASIBLE'] as const;

export interface CaseRun {
  runId: string;
  snapshotAsOf: string;
  containsSimulated: boolean;
  scenarioId: string | null;
}

export interface PlanningComputation {
  run: CaseRun;
  asOf: Instant;
  input: PlanningInput;
  table: CostTable;
  baseline: BaselineResult;
  costMs: number;
  /** LIVE 실행만: 쓴 운영 기록의 판 id · 지문(스냅숏에 남긴다) */
  provenance: LiveProvenance | null;
}

type PlanRow = typeof recoveryPlan.$inferSelect;
type ItemRow = typeof recoveryPlanItem.$inferSelect;

/** 판이 기대던 Truth 사실 하나(스냅숏에 남긴 모양). */
interface FactSignature {
  subject_id: string;
  fact_key: string;
  fact_ref: string;
  value: number | null;
  fact_state: string;
  freshness: string;
}

const approveSchema = z.object({ plan_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/), note: z.string().trim().max(200).optional() }).strict();

@Injectable()
export class RecoveryPlanService implements OnModuleInit {
  private readonly logger = new Logger('RecoveryPlan');
  private pack: ScenarioPack | null = null;
  /** 시나리오 팩 id(WAREHOUSE_A …) → 저장소 id. 기본 = 시드(docs/24 21절). 시험은 자기 행으로 바꿔 끼운다 */
  packIds: Record<string, string> = { ...PACK_FACILITY_IDS, ...PACK_TRUCK_POOL_IDS };

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(TruthService) private readonly truth: TruthService,
    @Inject(TruthRepository) private readonly truthRepo: TruthRepository,
    @Inject(AuditRecorder) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(DOMAIN_SIGNALS) private readonly signals: DomainSignals,
    @Inject(PlanningInputService) private readonly inputs: PlanningInputService,
  ) {}

  /** 사실이 바뀌면(승격 · 확인 · 거절 · 정정 · 철회 · 직접 입력) 그 사실에 기댄 판을 곧바로 다시 본다. 정확성은 Worker 주기 점검이 맡는다. */
  onModuleInit(): void {
    this.signals.subscribe(async (s) => {
      if (s.type !== 'FACT_CHANGED' && s.type !== 'OPERATIONAL_INPUT_CHANGED') return;
      try {
        await this.refreshOutdated();
      } catch (e) {
        this.logger.warn(`outdated check after ${s.type} failed: ${(e as Error).message}`);
      }
    });
  }

  // ------------------------------------------------------------------ 입력

  async caseRun(runId: string): Promise<CaseRun> {
    if (!z.string().uuid().safeParse(runId).success) throw new ValidationError('INVALID_ID', 'recovery run id must be a UUID', ['run_id']);
    const [row] = await this.db
      .select({ runId: recoveryRun.runId, asOf: planningSnapshot.asOf, containsSimulated: recoveryRun.containsSimulated, scenarioId: planningSnapshot.scenarioId })
      .from(recoveryRun)
      .innerJoin(planningSnapshot, eq(planningSnapshot.snapshotId, recoveryRun.snapshotId))
      .where(eq(recoveryRun.runId, runId))
      .limit(1);
    if (!row) throw new BusinessRuleError('NOT_FOUND', 'No recovery run with this id', 404);
    return { runId: row.runId, snapshotAsOf: row.asOf, containsSimulated: row.containsSimulated, scenarioId: row.scenarioId };
  }

  /** 판정 기준 시각 — Truth 와 같은 규칙: 시뮬레이션 실행 = 스냅숏(시나리오) 시각, 실제 = 지금, 호출자가 주면 그 값. */
  evaluationAsOf(run: CaseRun, override?: string | null): Instant {
    if (override) {
      try {
        return Instant.parseIso(override);
      } catch {
        throw new ValidationError('INVALID_AS_OF', 'as_of must be ISO 8601 with an offset', ['as_of']);
      }
    }
    return run.containsSimulated ? Instant.fromDb(run.snapshotAsOf) : this.clock.now();
  }

  private scenarioPack(): ScenarioPack {
    this.pack ??= loadScenarioPack(DEFAULT_DATA_PACK);
    return this.pack;
  }

  /** Truth Layer 의 현재 사실 → 계획 사실. 같은 좌표(주체 · 키)가 적용 범위별로 여럿이면 가장 믿을 만한 것 하나. */
  private toPlanningFacts(results: CoordinateResult[], planDay: string, horizon: string[], kinds: Map<string, 'WAREHOUSE' | 'ODCY' | 'TRUCK_POOL'>): PlanningFact[] {
    const best = new Map<string, CoordinateResult>();
    for (const r of results) {
      const kind = kinds.get(r.data.coordinate.entityId);
      if (!kind) continue;
      const key = r.data.coordinate.factKey;
      const relevant = kind === 'TRUCK_POOL' ? isTruthManagedKey(key, planDay, kind) : horizon.some((d) => key.endsWith(`day(${d})`)) && key.startsWith('capacity.');
      if (!relevant) continue;
      const k = `${r.data.coordinate.entityId}|${key}`;
      const cur = best.get(k);
      if (!cur || (TRUTH_RANK[r.state] ?? 9) < (TRUTH_RANK[cur.state] ?? 9)) best.set(k, r);
    }
    return [...best.values()].map((r) => {
      const w = r.result.winner;
      const ref = w ? `event:${w.eventId}` : r.result.revokedBy ? `event:${r.result.revokedBy}` : `truth:${r.data.coordinate.entityId}:${r.data.coordinate.factKey}`;
      return {
        fact_ref: ref,
        subject_id: r.data.coordinate.entityId,
        fact_key: r.data.coordinate.factKey,
        value: w && w.value !== null && Number.isSafeInteger(w.value) && w.value >= 0 ? w.value : null,
        fact_state: r.state,
        freshness: r.result.freshness,
        source: 'TRUTH' as const,
        is_simulated: r.data.coordinate.isSimulated,
        evidence_time: w ? Instant.parseIso(w.evidenceTime).toSeoulIso() : null,
      };
    });
  }

  /**
   * 계획 입력 준비도(T-115 · T-123) — 무엇이 있고 무엇이 없나. 시뮬레이션 실행은 시나리오 팩 + Truth 로 늘 준비됨.
   * 실제 실행은 운영 기록 · Truth 에서 모으고, 없는 값은 `missing_inputs`(필드 단위 · 묶음)로 돌려준다(지어내지 않는다).
   */
  async readiness(runId: string, asOfOverride?: string | null) {
    const run = await this.caseRun(runId);
    const asOf = this.evaluationAsOf(run, asOfOverride);
    if (run.containsSimulated) {
      return { mode: 'SCENARIO' as const, status: 'READY' as const, ready: true, source: 'SCENARIO_PACK', plan_day: this.scenarioPack().scenario.days.D0!, missing_inputs: [], groups: {}, note: 'Simulated run: synthetic scenario pack (containers · rates) + Truth facts for the asked series.' };
    }
    const a = await this.liveAssessment(run, asOf);
    return this.readinessView(a, run, asOf);
  }

  private readinessView(a: LiveAssessment & { planDay: string }, run: CaseRun, asOf: Instant) {
    const blocking = a.missing_inputs.filter((m) => m.severity === 'BLOCKING');
    return {
      mode: 'LIVE' as const,
      status: a.status,
      ready: a.ready,
      source: 'LIVE_INPUTS',
      recovery_run_id: run.runId,
      plan_day: a.planDay,
      as_of: asOf.toSeoulIso(),
      available: a.available,
      missing_inputs: a.missing_inputs,
      groups: groupSummary(a.missing_inputs),
      provisional_facts: a.provisional_facts,
      operational_fingerprint: a.provenance.operational_fingerprint,
      note: a.ready
        ? a.status === 'READY_WITH_PROVISIONAL'
          ? 'Ready — some facts are provisional (used with a penalty and a warning; a person still confirms them).'
          : 'All blocking inputs are present.'
        : `Not computed: ${blocking.map((m) => `${m.code}(${m.count})`).join(', ')}. Values are never invented — provide them from the listed sources.`,
    };
  }

  /** 실제 실행의 입력 원천을 모아 판정한다 — 등록부 · 운영 기록(지금 판) · Truth(as_of). 시나리오 팩은 읽지 않는다. */
  private async liveAssessment(run: CaseRun, asOf: Instant, knownBy?: Instant): Promise<LiveAssessment & { planDay: string }> {
    const planDay = Instant.fromDb(run.snapshotAsOf).toSeoulIso().slice(0, 10);
    const horizon = Array.from({ length: LIVE_HORIZON_DAYS }, (_, k) => new Date(Date.parse(`${planDay}T00:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10));
    const facilities = await this.db.select({ id: facility.facilityId, type: facility.facilityType, name: facility.facilityName }).from(facility).where(eq(facility.isActive, true));
    const pools = await this.db.select({ id: truckPool.truckPoolId, name: truckPool.poolName, ownership: truckPool.ownership }).from(truckPool).where(eq(truckPool.isActive, true));
    const ops = await this.inputs.operationalSources(run.runId, planDay);
    const kinds = new Map<string, 'WAREHOUSE' | 'ODCY' | 'TRUCK_POOL'>([
      ...facilities.filter((f) => f.type === 'WAREHOUSE' || f.type === 'ODCY').map((f) => [f.id, f.type as 'WAREHOUSE' | 'ODCY'] as const),
      ...pools.map((p) => [p.id, 'TRUCK_POOL'] as const),
    ]);
    const live = await this.truth.liveForSubjects([...kinds.keys()], { isSimulated: false, scenarioId: null }, asOf, knownBy);
    const truthFacts = this.toPlanningFacts(live, planDay, horizon, kinds);
    const a = assessLiveInput({ planDay, asOf: asOf.toSeoulIso(), containers: ops.containers, unrecordedPublicContainers: ops.unrecordedPublicContainers, facilities, profiles: ops.profiles, rates: ops.rates, pools, truthFacts });
    return { ...a, planDay };
  }

  /**
   * `knownBy`(T-136) — 사실을 "이 시각까지 알려진 사건"으로 판정한다. 기본 = asOf(과거 as_of 에 미래 사건이 섞이지 않는다).
   * 무효 점검만 판의 as_of(신선도) + 지금까지 들어온 사건(knownBy = 지금)으로 다시 만든다.
   */
  async planningInput(runId: string, asOfOverride?: string | null, knownBy?: Instant): Promise<{ run: CaseRun; asOf: Instant; input: PlanningInput; provenance: LiveProvenance | null }> {
    const run = await this.caseRun(runId);
    const asOf = this.evaluationAsOf(run, asOfOverride);
    if (!run.containsSimulated) {
      // 실제 실행(T-123): 운영 기록 + Truth 만. 빠진 것이 있으면 계산하지 않고 무엇이 빠졌는지 정확히 돌려준다 — 숫자를 지어내지 않는다
      const a = await this.liveAssessment(run, asOf, knownBy);
      if (!a.ready || !a.input) {
        const view = this.readinessView(a, run, asOf);
        throw new BusinessRuleError('PLANNING_INPUT_UNAVAILABLE', `Live run inputs missing — ${view.note} See GET /planning/runs/${runId}/input-readiness`, 409, { status: view.status, plan_day: view.plan_day, missing_inputs: view.missing_inputs, groups: view.groups });
      }
      return { run, asOf, input: a.input, provenance: a.provenance };
    }
    const pack = this.scenarioPack();
    const ids = this.packIds;
    const mapped = new Set(Object.values(ids));
    const days = pack.scenario.days;
    const horizon = Object.keys(days).sort().map((k) => days[k]!);
    // 팩이 가리키는 저장소 행만(같은 DB 의 다른 시설 · 풀의 사실은 이 계획의 입력이 아니다)
    const facilities = (await this.db.select({ id: facility.facilityId, type: facility.facilityType }).from(facility).where(eq(facility.isActive, true))).filter((f) => mapped.has(f.id));
    const pools = (await this.db.select({ id: truckPool.truckPoolId, ownership: truckPool.ownership }).from(truckPool).where(eq(truckPool.isActive, true))).filter((p) => mapped.has(p.id));
    const kinds = new Map<string, 'WAREHOUSE' | 'ODCY' | 'TRUCK_POOL'>([
      ...facilities.filter((f) => f.type === 'WAREHOUSE' || f.type === 'ODCY').map((f) => [f.id, f.type as 'WAREHOUSE' | 'ODCY'] as const),
      ...pools.filter((p) => p.ownership === 'PARTNER').map((p) => [p.id, 'TRUCK_POOL'] as const),
    ]);
    const live = await this.truth.liveForSubjects([...kinds.keys()], { isSimulated: run.containsSimulated, scenarioId: run.scenarioId }, asOf, knownBy);
    const truthFacts = this.toPlanningFacts(live, days.D0!, horizon, kinds);
    const input = planningInputFromScenario(pack, { as_of: asOf.toSeoulIso(), truthFacts, ids });
    return { run, asOf, input, provenance: null };
  }

  async compute(runId: string, asOfOverride?: string | null): Promise<PlanningComputation> {
    const { run, asOf, input, provenance } = await this.planningInput(runId, asOfOverride);
    const t0 = performance.now();
    const table = buildCostTable(input);
    const costMs = performance.now() - t0;
    return { run, asOf, input, table, baseline: computeBaseline(input, table), costMs, provenance };
  }

  // ------------------------------------------------------------------ 계산 · 제안

  async solve(runId: string, asOfOverride?: string | null): Promise<PlanningComputation & { result: SolverResult }> {
    const c = await this.compute(runId, asOfOverride);
    return { ...c, result: await solveRecovery(c.input, c.table, c.baseline) };
  }

  /**
   * 계산 → 저장(새 판 PROPOSED, 실행 불가면 INFEASIBLE). 지금 판과 입력 지문이 같으면 새 판을 만들지 않고 그 판을 돌려준다.
   * `inTransaction` — Agent Tool 이 같은 트랜잭션에 실행 기록을 남길 때.
   */
  async propose(
    runId: string,
    by: { actorId: string; agentRunId?: string | null },
    opts: { asOf?: string | null; expectedInputHash?: string | null; inTransaction?: (tx: DbTransaction, planId: string) => Promise<void> } = {},
  ): Promise<{ plan: PlanRow; items: ItemRow[]; reused: boolean }> {
    const s = await this.solve(runId, opts.asOf);
    // T-136 낙관적 동시성: 계산을 시작한 쪽이 본 입력 지문과 지금 입력이 다르면 오래된 계산을 조용히 저장하지 않는다
    if (opts.expectedInputHash && opts.expectedInputHash !== s.result.input_hash) {
      throw new BusinessRuleError('STALE_PLAN_INPUT', 'Planning inputs changed after the calculation started — nothing was stored. Solve again on the current inputs.', 409, { expected_input_hash: opts.expectedInputHash, current_input_hash: s.result.input_hash });
    }
    const current = await this.currentPlan(runId);
    if (current && current.inputHash === s.result.input_hash && current.planStatus !== 'OUTDATED') {
      if (opts.inTransaction) await this.tx.run((tx) => opts.inTransaction!(tx, current.planId));
      return { plan: current, items: await this.items(current.planId), reused: true };
    }
    const r = s.result;
    const planId = this.ids.newId();
    const snapshotId = this.ids.newId();
    const now = this.clock.now().toDb();
    const feasible = r.objective_value !== null;
    const planHash = canonicalHash({
      k: 'recovery_plan',
      v: 1,
      input_hash: r.input_hash,
      items: r.assignments.map((a) => ({ c: a.container_id, o: a.option_id, t: a.truck_id, at: a.scheduled_time, total: a.expected_cost.total })),
      unplanned: r.unplanned.map((u) => u.container_id),
    });
    const truthFacts = s.input.facts.filter((f) => f.source === 'TRUTH');
    const scope = {
      kind: 'RECOVERY_PLAN_INPUT',
      case_run_id: runId,
      input_mode: s.run.containsSimulated ? 'SCENARIO' : 'LIVE',
      // LIVE: 판이 기댄 운영 기록(판 id · 지문 · 요율 금액) — 나중에 값이 바뀌어도 이 판이 무엇으로 계산했는지 남는다(OUTDATED 비교에도 쓴다)
      operational_inputs: s.provenance ? (s.provenance as unknown as Record<string, unknown>) : null,
      plan_day: s.input.plan_day,
      horizon_days: s.input.horizon_days,
      scenario_pack: s.input.scenario_id,
      cost_policy_version: COST_POLICY_VERSION,
      rate_version: s.input.rates.rate_version,
      solver_version: SOLVER_VERSION,
      baseline_rule: BASELINE_RULE,
      candidates: s.table.candidates,
      // 판이 기댄 사실 — 사실이 바뀌었는지 이 목록과 비교한다(OUTDATED)
      truth_facts: truthFacts.map((f) => this.signature(f)),
      facts: s.table.facts.map((f) => ({ ...f })),
      commitments: s.table.commitments.map((x) => ({ ...x })),
      trucks: s.table.trucks.map((t) => ({ truck_id: t.truck_id, kind: t.kind, from_hour: t.from_hour, to_hour: t.to_hour, fact_ref: t.fact_ref, warning: t.warning })),
    };
    const resultJson = {
      status: r.status,
      engine: r.engine,
      objective_value: r.objective_value,
      base_cost: r.base_cost,
      risk_penalty: r.risk_penalty,
      baseline: {
        rule: s.baseline.rule,
        base_cost: s.baseline.base_cost,
        risk_penalty: s.baseline.risk_penalty,
        total: s.baseline.total,
        assignments: s.baseline.assignments.map((a) => ({ container_id: a.container_id, option_id: a.option.option_id, action: a.option.action, target_id: a.option.target_id, delivery_day: a.option.delivery_day, base_cost: a.option.cost.base_cost, total: a.option.cost.total })),
        unplanned: s.baseline.unplanned,
      },
      unplanned: r.unplanned,
      binding_constraints: r.binding_constraints,
      resource_usage: r.resource_usage,
      truck_usage: r.truck_usage,
      assumptions: r.assumptions,
      warnings: r.warnings,
      model_size: r.model_size,
      timings_ms: { cost: Math.round(s.costMs), model: Math.round(r.timings_ms.model), solve: Math.round(r.timings_ms.solve) },
      as_of: s.asOf.toSeoulIso(),
    };
    await this.tx.run(async (tx) => {
      // 같은 계획 실행의 판 번호를 한 줄로 세운다
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cera.recovery_plan:${runId}`}))`);
      const [{ max } = { max: 0 }] = await tx.select({ max: sql<number>`coalesce(max(${recoveryPlan.version}), 0)::int` }).from(recoveryPlan).where(eq(recoveryPlan.caseRunId, runId));
      await tx.insert(planningSnapshot).values({
        snapshotId,
        asOf: s.asOf.toDb(),
        factFingerprint: r.input_hash,
        ruleVersion: SOLVER_VERSION,
        tariffVersion: s.input.rates.rate_version,
        policyVersion: COST_POLICY_VERSION,
        scopeRef: scope,
        containsSimulated: s.run.containsSimulated,
        createdAt: now,
        scenarioId: s.run.scenarioId,
      });
      // 옛 판(아직 밀리지 않은 것)을 새 판이 밀어낸다 — FK 는 커밋 때 검사(M23)
      await tx
        .update(recoveryPlan)
        .set({ planStatus: 'SUPERSEDED', supersededByPlanId: planId, updatedAt: now })
        .where(and(eq(recoveryPlan.caseRunId, runId), inArray(recoveryPlan.planStatus, ['PROPOSED', 'APPROVED', 'OUTDATED', 'INFEASIBLE'])));
      await tx.insert(recoveryPlan).values({
        planId,
        caseRunId: runId,
        snapshotId,
        version: Number(max) + 1,
        planStatus: feasible ? 'PROPOSED' : 'INFEASIBLE',
        solverStatus: r.status,
        solverVersion: SOLVER_VERSION,
        inputHash: r.input_hash,
        planHash,
        objectiveKrw: feasible ? BigInt(r.objective_value!) : null,
        baseCostKrw: r.base_cost === null ? null : BigInt(r.base_cost),
        riskPenaltyKrw: r.risk_penalty === null ? null : BigInt(r.risk_penalty),
        baselineTotalKrw: BigInt(r.baseline_value),
        baselineBaseCostKrw: BigInt(r.baseline_base_cost),
        savingKrw: r.saving === null ? null : BigInt(r.saving),
        baseSavingKrw: r.base_saving === null ? null : BigInt(r.base_saving),
        candidateCount: s.table.candidates.length,
        result: resultJson,
        costMs: Math.round(s.costMs),
        solveMs: Math.round(r.timings_ms.model + r.timings_ms.solve),
        createdByActorId: by.actorId,
        agentRunId: by.agentRunId ?? null,
        containsSimulated: s.run.containsSimulated,
        scenarioId: s.run.scenarioId,
        createdAt: now,
        updatedAt: now,
      });
      if (r.assignments.length > 0) {
        await tx.insert(recoveryPlanItem).values(
          r.assignments.map((a) => ({
            planId,
            containerRef: a.container_id,
            action: a.action,
            targetRef: a.target_id,
            destinationRef: a.destination_id,
            deliveryDay: a.delivery_day,
            scheduledAt: a.scheduled_time ? Instant.parseIso(a.scheduled_time).toDb() : null,
            truckRef: a.truck_id,
            baseCostKrw: BigInt(a.expected_cost.base_cost),
            riskPenaltyKrw: BigInt(a.expected_cost.risk_penalty),
            totalKrw: BigInt(a.expected_cost.total),
            detail: {
              option_id: a.option_id,
              truck_pool_id: a.truck_pool_id,
              cost: a.expected_cost,
              reason_codes: a.reason_codes,
              alternatives: a.alternatives,
              warning_refs: a.warning_refs,
              evidence_refs: a.evidence_refs,
              assumptions: a.assumptions,
            },
          })),
        );
      }
      await this.audit.record(tx, { actorId: by.actorId, action: AUDIT_ACTION.PLAN_PROPOSED, targetType: 'RECOVERY_PLAN', targetId: planId, result: 'SUCCESS', isSimulated: s.run.containsSimulated });
      if (opts.inTransaction) await opts.inTransaction(tx, planId);
    });
    const plan = (await this.plan(planId))!;
    return { plan, items: await this.items(planId), reused: false };
  }

  // ------------------------------------------------------------------ 사실 변경 → OUTDATED

  private signature(f: PlanningFact): FactSignature {
    return { subject_id: f.subject_id, fact_key: f.fact_key, fact_ref: f.fact_ref, value: f.value, fact_state: f.fact_state, freshness: f.freshness };
  }

  /**
   * 지금 쓰이는 판(제안 · 승인 · 실행 불가)마다, 판이 기댄 Truth 사실을 판의 as_of 로 다시 판정해 비교한다.
   * 다르면(다른 사건이 이김 · 철회 · 상태 · 값 · 새 사실) OUTDATED 로 바꾸고 이유를 남긴다. 바뀐 판 수를 돌려준다.
   */
  async refreshOutdated(runId?: string): Promise<number> {
    const plans = await this.db
      .select({ planId: recoveryPlan.planId, caseRunId: recoveryPlan.caseRunId, status: recoveryPlan.planStatus, asOf: planningSnapshot.asOf, scope: planningSnapshot.scopeRef, sim: recoveryPlan.containsSimulated })
      .from(recoveryPlan)
      .innerJoin(planningSnapshot, eq(planningSnapshot.snapshotId, recoveryPlan.snapshotId))
      .where(and(inArray(recoveryPlan.planStatus, [...CURRENT_STATUSES]), runId ? eq(recoveryPlan.caseRunId, runId) : undefined));
    let changed = 0;
    for (const p of plans) {
      const reasons = await this.outdatedReasons(p.caseRunId, Instant.fromDb(p.asOf).toSeoulIso(), (p.scope?.truth_facts ?? []) as FactSignature[], (p.scope?.operational_inputs ?? null) as LiveProvenance | null);
      if (reasons.length === 0) continue;
      const now = this.clock.now().toDb();
      const done = await this.tx.run(async (tx) => {
        const rows = await tx
          .update(recoveryPlan)
          .set({ planStatus: 'OUTDATED', outdatedReasons: reasons, outdatedAt: now, updatedAt: now })
          .where(and(eq(recoveryPlan.planId, p.planId), inArray(recoveryPlan.planStatus, [...CURRENT_STATUSES])))
          .returning({ id: recoveryPlan.planId });
        if (rows.length === 0) return false;
        await this.audit.record(tx, { actorId: await this.systemActor(tx), action: AUDIT_ACTION.PLAN_OUTDATED, targetType: 'RECOVERY_PLAN', targetId: p.planId, result: 'SUCCESS', isSimulated: p.sim });
        return true;
      });
      if (done) {
        changed += 1;
        this.signals.emit({ type: 'PLAN_CHANGED', recoveryRunId: p.caseRunId, planId: p.planId, status: 'OUTDATED' });
      }
    }
    return changed;
  }

  private async outdatedReasons(runId: string, asOf: string, before: FactSignature[], beforeOps: LiveProvenance | null = null): Promise<Record<string, unknown>[]> {
    let rebuilt: Awaited<ReturnType<RecoveryPlanService['planningInput']>>;
    try {
      // 신선도는 판의 as_of 로, 사건은 지금까지 들어온 것 전부로 — 판을 만든 뒤 들어온 새 사실이 무효 사유가 된다
      rebuilt = await this.planningInput(runId, asOf, this.clock.now());
    } catch (e) {
      // LIVE: 판이 기댄 입력이 이제 빠졌다(기록 철회 · 사실 철회) — 계산할 수 없으니 그 판은 더는 지금 판이 아니다
      if (e instanceof BusinessRuleError && e.code === 'PLANNING_INPUT_UNAVAILABLE') return [{ code: 'INPUT_UNAVAILABLE', details: e.details }];
      throw e;
    }
    const { input } = rebuilt;
    const reasons: Record<string, unknown>[] = [];
    if (beforeOps && rebuilt.provenance && beforeOps.operational_fingerprint !== rebuilt.provenance.operational_fingerprint) reasons.push(...this.operationalChanges(beforeOps, rebuilt.provenance));
    const now = new Map(input.facts.filter((f) => f.source === 'TRUTH').map((f) => [`${f.subject_id}|${f.fact_key}`, this.signature(f)]));
    const prev = new Map(before.map((f) => [`${f.subject_id}|${f.fact_key}`, f]));
    for (const [k, b] of prev) {
      const a = now.get(k);
      if (!a) reasons.push({ code: 'FACT_GONE', subject_id: b.subject_id, fact_key: b.fact_key, before: b, after: null });
      else if (a.fact_state === 'REVOKED' && b.fact_state !== 'REVOKED') reasons.push({ code: 'FACT_REVOKED', subject_id: b.subject_id, fact_key: b.fact_key, before: b, after: a });
      else if (a.fact_ref !== b.fact_ref) reasons.push({ code: 'FACT_SUPERSEDED', subject_id: b.subject_id, fact_key: b.fact_key, before: b, after: a });
      else if (a.fact_state !== b.fact_state || a.value !== b.value || a.freshness !== b.freshness) reasons.push({ code: a.fact_state === 'NEEDS_REVIEW' ? 'FACT_CONFLICTED' : a.fact_state === 'STALE' || a.freshness === 'STALE' || a.freshness === 'EXPIRED' ? 'FACT_STALE' : 'FACT_STATE_CHANGED', subject_id: b.subject_id, fact_key: b.fact_key, before: b, after: a });
    }
    for (const [k, a] of now) if (!prev.has(k)) reasons.push({ code: 'FACT_ADDED', subject_id: a.subject_id, fact_key: a.fact_key, before: null, after: a });
    return reasons;
  }

  /** 운영 기록 판 비교 — 무엇이 바뀌었나(컨테이너 · 요율 · 시설 계획 정보). */
  private operationalChanges(before: LiveProvenance, after: LiveProvenance): Record<string, unknown>[] {
    const out: Record<string, unknown>[] = [];
    const diff = <T>(kind: string, a: T[], b: T[], key: (x: T) => string, sig: (x: T) => string) => {
      const am = new Map(a.map((x) => [key(x), x]));
      const bm = new Map(b.map((x) => [key(x), x]));
      for (const [k, x] of am) {
        const y = bm.get(k);
        if (!y) out.push({ code: 'OPERATIONAL_RECORD_REMOVED', kind, key: k, before: x, after: null });
        else if (sig(x) !== sig(y)) out.push({ code: 'OPERATIONAL_RECORD_CHANGED', kind, key: k, before: x, after: y });
      }
      for (const [k, y] of bm) if (!am.has(k)) out.push({ code: 'OPERATIONAL_RECORD_ADDED', kind, key: k, before: null, after: y });
    };
    diff('CONTAINER', before.container_records, after.container_records, (x) => x.container_no, (x) => x.content_hash);
    diff('RATE', before.rate_records, after.rate_records, (x) => x.key, (x) => `${x.rate_id}:${x.content_hash}`);
    diff('FACILITY_PROFILE', before.facility_profiles, after.facility_profiles, (x) => x.facility_id, (x) => x.content_hash);
    return out;
  }

  private async systemActor(q: Database | DbTransaction = this.db): Promise<string> {
    const [row] = await q.select({ id: actor.actorId }).from(actor).where(and(eq(actor.actorType, 'SYSTEM'), eq(actor.isActive, true))).orderBy(actor.actorId).limit(1);
    if (!row) throw new SystemError('SYSTEM_ACTOR_MISSING', 'No active SYSTEM actor is registered');
    return row.id;
  }

  // ------------------------------------------------------------------ 승인(사람)

  async approve(planId: string, actorHeader: string | undefined, body: unknown): Promise<PlanRow> {
    if (!actorHeader) throw new ValidationError('ACTOR_REQUIRED', 'X-CERA-Actor-Id header is required', ['x-cera-actor-id']);
    if (!z.string().uuid().safeParse(actorHeader).success || !z.string().uuid().safeParse(planId).success) throw new ValidationError('INVALID_ID', 'ids must be UUIDs', ['x-cera-actor-id']);
    const parsed = approveSchema.safeParse(body ?? {});
    if (!parsed.success) throw new ValidationError('INVALID_PLAN_REQUEST', 'plan_hash (sha256) is required', ['plan_hash']);
    const human = await this.truthRepo.activeHuman(actorHeader);
    if (!human) throw new BusinessRuleError('ACTOR_NOT_ALLOWED', 'Only an active human operator can approve a recovery plan', 403);
    const plan = await this.plan(planId);
    if (!plan) throw new BusinessRuleError('NOT_FOUND', 'No recovery plan with this id', 404);
    // 승인 직전에 사실이 바뀌었는지 다시 본다 — 바뀌었으면 OUTDATED 가 되고 승인은 거부된다
    await this.refreshOutdated(plan.caseRunId);
    const fresh = (await this.plan(planId))!;
    if (fresh.planStatus === 'OUTDATED') throw new BusinessRuleError('PLAN_OUTDATED', 'A fact this plan relied on changed — recalculate before approving', 409);
    if (fresh.planStatus !== 'PROPOSED') throw new BusinessRuleError('PLAN_NOT_PROPOSED', `Only a PROPOSED plan can be approved (this one is ${fresh.planStatus})`, 409);
    if (fresh.planHash !== parsed.data.plan_hash) throw new BusinessRuleError('PLAN_HASH_MISMATCH', 'The plan changed since you viewed it — reload and review again', 409);
    const now = this.clock.now().toDb();
    await this.tx.run(async (tx) => {
      const rows = await tx
        .update(recoveryPlan)
        .set({ planStatus: 'APPROVED', approvedByActorId: human.actorId, approvedAt: now, updatedAt: now })
        .where(and(eq(recoveryPlan.planId, planId), eq(recoveryPlan.planStatus, 'PROPOSED')))
        .returning({ id: recoveryPlan.planId });
      if (rows.length === 0) throw new BusinessRuleError('PLAN_NOT_PROPOSED', 'The plan is no longer PROPOSED', 409);
      await this.audit.record(tx, { actorId: human.actorId, action: AUDIT_ACTION.PLAN_APPROVED, targetType: 'RECOVERY_PLAN', targetId: planId, result: 'SUCCESS', isSimulated: fresh.containsSimulated });
    });
    this.signals.emit({ type: 'PLAN_CHANGED', recoveryRunId: fresh.caseRunId, planId, status: 'APPROVED' });
    return (await this.plan(planId))!;
  }

  async resolveHuman(actorHeader: string | undefined): Promise<string> {
    if (!actorHeader) throw new ValidationError('ACTOR_REQUIRED', 'X-CERA-Actor-Id header is required', ['x-cera-actor-id']);
    if (!z.string().uuid().safeParse(actorHeader).success) throw new ValidationError('INVALID_ID', 'X-CERA-Actor-Id must be a UUID', ['x-cera-actor-id']);
    const human = await this.truthRepo.activeHuman(actorHeader);
    if (!human) throw new BusinessRuleError('ACTOR_NOT_ALLOWED', 'Only an active human operator can request a recalculation', 403);
    return human.actorId;
  }

  // ------------------------------------------------------------------ 읽기

  async plan(planId: string): Promise<PlanRow | null> {
    const [row] = await this.db.select().from(recoveryPlan).where(eq(recoveryPlan.planId, planId)).limit(1);
    return row ?? null;
  }

  async items(planId: string): Promise<ItemRow[]> {
    return this.db.select().from(recoveryPlanItem).where(eq(recoveryPlanItem.planId, planId)).orderBy(recoveryPlanItem.containerRef);
  }

  async plans(runId: string): Promise<PlanRow[]> {
    return this.db.select().from(recoveryPlan).where(eq(recoveryPlan.caseRunId, runId)).orderBy(desc(recoveryPlan.version));
  }

  /** 지금 판: 밀리지 않은 가장 새 판(제안 · 승인 · 실행 불가 · OUTDATED). */
  async currentPlan(runId: string): Promise<PlanRow | null> {
    const [row] = await this.db
      .select()
      .from(recoveryPlan)
      .where(and(eq(recoveryPlan.caseRunId, runId), inArray(recoveryPlan.planStatus, ['PROPOSED', 'APPROVED', 'INFEASIBLE', 'OUTDATED'])))
      .orderBy(desc(recoveryPlan.version))
      .limit(1);
    return row ?? null;
  }

  async snapshotScope(snapshotId: string): Promise<Record<string, unknown> | null> {
    const [row] = await this.db.select({ scope: planningSnapshot.scopeRef }).from(planningSnapshot).where(eq(planningSnapshot.snapshotId, snapshotId)).limit(1);
    return row?.scope ?? null;
  }
}
