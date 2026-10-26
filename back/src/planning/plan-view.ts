import { Instant } from '../shared/time/instant.js';
import type { recoveryPlan, recoveryPlanItem } from '../db/schema/index.js';
import type { PlanDto, PlanItemDto, PlanSummaryDto } from './dto.js';

type PlanRow = typeof recoveryPlan.$inferSelect;
type ItemRow = typeof recoveryPlanItem.$inferSelect;

const num = (v: bigint | null): number | null => (v === null ? null : Number(v));
const iso = (v: string | null): string | null => (v === null ? null : Instant.fromDb(v).toSeoulIso());

/** 저장된 판 → 화면 · Agent 용 모양. 숫자는 저장된 엔진 출력 그대로(다시 계산하지 않는다). */
export function toPlanDto(p: PlanRow, items: ItemRow[], scope: Record<string, unknown> | null, names: Map<string, string>): PlanDto {
  const result = p.result as Record<string, unknown> & {
    as_of?: string;
    baseline?: { assignments?: { container_id: string; total: number }[] };
    resource_usage?: { resource_key: string; used: number; available: number | null }[];
  };
  const baselineBy = new Map((result.baseline?.assignments ?? []).map((a) => [a.container_id, a.total]));
  const planDay = typeof scope?.plan_day === 'string' ? scope.plan_day : null;
  const candidates = Array.isArray(scope?.candidates) ? (scope.candidates as string[]) : [];
  // 문제: 오늘(계획일) 창고마다 원래 들어올 수 vs 쓸 수 있는 용량
  const baselineAssignments = result.baseline?.assignments ?? [];
  const plannedToday = new Map<string, number>();
  // 계획 대상은 모두 원래 오늘 목적지 창고로 갈 컨테이너다
  for (const it of items) plannedToday.set(it.destinationRef, (plannedToday.get(it.destinationRef) ?? 0) + 1);
  const warehouses = (result.resource_usage ?? [])
    .filter((r) => planDay && r.resource_key.startsWith('WAREHOUSE_DAY:') && r.resource_key.endsWith(`:${planDay}`))
    .map((r) => {
      const id = r.resource_key.split(':')[1]!;
      const planned = plannedToday.get(id) ?? 0;
      return { facility_id: id, name: names.get(id) ?? id, day: planDay, planned, capacity: r.available, shortfall: r.available === null ? null : Math.max(0, planned - r.available) };
    });
  const facts = Array.isArray(scope?.facts) ? (scope.facts as Record<string, unknown>[]) : [];
  return {
    plan_id: p.planId,
    case_run_id: p.caseRunId,
    version: p.version,
    plan_status: p.planStatus,
    solver_status: p.solverStatus,
    solver_version: p.solverVersion,
    result_kind: 'ENGINE_RESULT',
    input_hash: p.inputHash,
    plan_hash: p.planHash,
    as_of: typeof result.as_of === 'string' ? result.as_of : '',
    objective_krw: num(p.objectiveKrw),
    base_cost_krw: num(p.baseCostKrw),
    risk_penalty_krw: num(p.riskPenaltyKrw),
    baseline_total_krw: Number(p.baselineTotalKrw),
    baseline_base_cost_krw: Number(p.baselineBaseCostKrw),
    saving_krw: num(p.savingKrw),
    base_saving_krw: num(p.baseSavingKrw),
    candidate_count: p.candidateCount,
    changed_count: items.filter((i) => i.action !== 'KEEP_CURRENT_PLAN').length,
    problem: { plan_day: planDay, candidates: candidates.length, warehouses, baseline_waiting: baselineAssignments.filter((a) => (a as { action?: string }).action === 'WAIT_AT_TERMINAL').length },
    result: p.result,
    facts: facts.map((f) => ({ ...f, subject_name: names.get(String(f.subject_id)) ?? f.subject_id })),
    outdated_reasons: (p.outdatedReasons as Record<string, unknown>[] | null) ?? null,
    outdated_at: iso(p.outdatedAt),
    superseded_by_plan_id: p.supersededByPlanId,
    approved_by_actor_id: p.approvedByActorId,
    approved_at: iso(p.approvedAt),
    created_by_actor_id: p.createdByActorId,
    agent_run_id: p.agentRunId,
    contains_simulated: p.containsSimulated,
    created_at: Instant.fromDb(p.createdAt).toSeoulIso(),
    cost_ms: p.costMs,
    solve_ms: p.solveMs,
    items: items.map(
      (i): PlanItemDto => ({
        container_id: i.containerRef,
        action: i.action,
        target_id: i.targetRef,
        target_name: names.get(i.targetRef) ?? i.targetRef,
        destination_id: i.destinationRef,
        delivery_day: i.deliveryDay,
        scheduled_time: iso(i.scheduledAt),
        truck_id: i.truckRef,
        base_cost_krw: Number(i.baseCostKrw),
        risk_penalty_krw: Number(i.riskPenaltyKrw),
        total_krw: Number(i.totalKrw),
        baseline_total_krw: baselineBy.get(i.containerRef) ?? null,
        reason_codes: ((i.detail as { reason_codes?: string[] }).reason_codes ?? []).slice(),
        detail: i.detail,
      }),
    ),
  };
}

export function toPlanSummary(p: PlanRow): PlanSummaryDto {
  return {
    plan_id: p.planId,
    version: p.version,
    plan_status: p.planStatus,
    solver_status: p.solverStatus,
    objective_krw: num(p.objectiveKrw),
    base_cost_krw: num(p.baseCostKrw),
    baseline_total_krw: Number(p.baselineTotalKrw),
    saving_krw: num(p.savingKrw),
    agent_run_id: p.agentRunId,
    created_at: Instant.fromDb(p.createdAt).toSeoulIso(),
    outdated_reason_count: p.outdatedReasons ? (p.outdatedReasons as unknown[]).length : null,
  };
}
