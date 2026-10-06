/**
 * MockProvider — stands in for the backend until ApiProvider exists.
 *
 * It only looks things up in the scenario data pack and reshapes them into the contract.
 * Risk, cost and plan numbers are copied from the fixture as they are (SCENARIO_RESULT);
 * the only arithmetic here is counting for display (trucks per hour, trust categories),
 * which the backend will do in the same place later.
 */
import {
  CONTRACT_VERSION,
  type ActivityItem,
  type CommunicationThread,
  type MessageView,
  type ContainerView,
  type DataTrustSummary,
  type DecisionUsability,
  type Envelope,
  type IsoDateTime,
  type OperationsToday,
  type RecoveryPlanCurrent,
  type RecoveryPlanView,
  type ResourceFactView,
  type ResourceStatus,
  type RiskSummary,
  type RouteCode,
  type ScenarioInfo,
  type TrustCategory,
  type TrustView,
} from "@/contracts/cera";
import type { CeraDataProvider } from "@/data/provider";
import { fixture, type RawPlan, type RawStep, type RawTimelineFact, type RawTruckSlot } from "./fixture";

const { scenario, containers, resources, risk, plans, communications, activity, verifications } = fixture;

const stepIndex = (stepId: string): number => scenario.steps.findIndex((s) => s.step_id === stepId);

/** Latest step whose as_of is not after the requested as_of (all times share the +09:00 offset). */
function stepAt(asOf: IsoDateTime): RawStep {
  let found = scenario.steps[0];
  for (const s of scenario.steps) if (s.as_of <= asOf) found = s;
  return found;
}

function atStep<T extends { from_step: string }>(timeline: T[], step: RawStep): T | undefined {
  let found: T | undefined;
  for (const entry of timeline) if (stepIndex(entry.from_step) <= step.index) found = entry;
  return found;
}

function envelope<T>(data: T, step: RawStep): Envelope<T> {
  return {
    data,
    meta: {
      contract_version: CONTRACT_VERSION,
      scenario_id: scenario.scenario_id,
      as_of: step.as_of,
      step_id: step.step_id,
      is_simulated: true,
      result_kind: "SCENARIO_RESULT",
      provider: "mock",
    },
  };
}

const planById = (planId: string | null): RawPlan | undefined => plans.plans.find((p) => p.plan_id === planId);

const USABILITY_ORDER: DecisionUsability[] = ["USABLE", "USABLE_WITH_WARNING", "APPROVAL_BLOCKED", "UNUSABLE"];
const worst = (list: DecisionUsability[]): DecisionUsability =>
  list.reduce<DecisionUsability>((a, b) => (USABILITY_ORDER.indexOf(b) > USABILITY_ORDER.indexOf(a) ? b : a), "USABLE");

const ROUTE_LABEL: Record<RouteCode, string> = {
  WAREHOUSE_DIRECT: "창고 A 직송",
  ODCY_A: "ODCY A 경유",
  ODCY_B: "ODCY B 경유",
  TERMINAL_WAIT: "터미널 대기",
  WAREHOUSE_B_DIRECT: "창고 B 직송",
  PLANNED_LATER: "다른 날 입고 예정",
  BLOCKED: "창고 수용 불가 — 계획 대기",
};

function routeOf(containerId: string, group: string, step: RawStep): { route: RouteCode; changed: boolean } {
  if (group === "WH_B_D0") return { route: "WAREHOUSE_B_DIRECT", changed: false };
  if (group !== "WH_A_D0") return { route: "PLANNED_LATER", changed: false };
  const plan = planById(step.current_plan_id);
  if (plan) {
    const action = plan.actions.find((a) => a.container_id === containerId);
    if (action) return { route: action.route, changed: action.change_from_previous?.kind === "ROUTE_CHANGED" };
    return { route: "WAREHOUSE_DIRECT", changed: false };
  }
  const exception = risk.exceptions.find((e) => stepIndex(e.detected_step) <= step.index);
  if (exception?.affected_container_ids.includes(containerId)) return { route: "BLOCKED", changed: false };
  return { route: "WAREHOUSE_DIRECT", changed: false };
}

const FACT_LABEL: Record<string, string> = {
  roster: "근무 트럭",
  max_days: "최대 보관 일수",
  "rate.storage_per_day.40DRY": "보관료 40FT (일)",
  "rate.storage_per_day": "보관료 (일)",
  "rate.handling_in_out": "반입·반출 핸들링",
};

function factLabel(key: string): string {
  if (FACT_LABEL[key]) return FACT_LABEL[key];
  const day = key.match(/day\((\d{4}-\d{2}-\d{2})\)/)?.[1];
  const slot = key.match(/slot\(\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/)?.[1];
  if (key.startsWith("capacity.") && day) return `수용 가능 (${day.slice(5).replace("-", "/")})`;
  if (key.startsWith("received.") && day) return `입고 완료 (${day.slice(5).replace("-", "/")})`;
  if (key.startsWith("available.slot") && slot) return `추가 트럭 ${slot}`;
  return key;
}

function factDisplay(fact: RawTimelineFact): string {
  const v = fact.value;
  if (v === null || v === undefined) return "정보 없음";
  if (typeof v === "number") {
    if (fact.key.startsWith("rate.")) return `${v.toLocaleString("ko-KR")}원`;
    if (fact.key === "max_days") return `${v}일`;
    return `${v}대`;
  }
  if (typeof v === "object") {
    return Object.entries(v as Record<string, number>)
      .map(([k, n]) => `${k.replace("DRY", "FT Dry")} ${n.toLocaleString("ko-KR")}원`)
      .join(" · ");
  }
  return String(v);
}

function resourceFacts(timeline: RawTimelineFact[], step: RawStep): ResourceFactView[] {
  const latest = new Map<string, RawTimelineFact>();
  for (const f of timeline) if (stepIndex(f.from_step) <= step.index) latest.set(f.key, f);
  return [...latest.values()].map((f) => ({
    key: f.key,
    label: factLabel(f.key),
    value: f.value,
    display: factDisplay(f),
    changed_in_this_step: f.from_step === step.step_id,
    trust: f.trust,
  }));
}

const factValue = (facts: ResourceFactView[], prefix: string): number =>
  (facts.find((f) => f.key.startsWith(prefix))?.value as number | undefined) ?? 0;

function planStatus(plan: RawPlan, step: RawStep) {
  return atStep(plan.status_timeline, step) ?? plan.status_timeline[0];
}

function toPlanView(plan: RawPlan, step: RawStep): RecoveryPlanView {
  const st = planStatus(plan, step);
  const approved = plan.status_timeline.find((s) => s.status === "APPROVED" && stepIndex(s.from_step) <= step.index);
  const activeApproved =
    st.status === "PROPOSED"
      ? plans.plans.find((p) => p.plan_id !== plan.plan_id && planStatus(p, step).status === "APPROVED" && stepIndex(p.generated_step) <= step.index)
      : undefined;
  return {
    plan_id: plan.plan_id,
    version: plan.version,
    label: plan.label,
    status: st.status,
    status_flags: st.flags ?? [],
    status_note: st.note ?? null,
    generated_at: plan.generated_at,
    trigger: plan.trigger,
    result_kind: "SCENARIO_RESULT",
    scope_label: plans.cost_scope.compared,
    excluded_label: plans.cost_scope.excluded,
    definitions: {
      total_cost: plans.cost_scope.total_cost_definition,
      exposure: plans.cost_scope.exposure_definition,
      saving: plans.cost_scope.saving_definition,
      delivery_day_rule: plans.cost_scope.delivery_day_rule,
    },
    baseline_cost_krw: plan.baseline_cost_krw,
    plan_cost_krw: plan.plan_cost_krw,
    potential_saving_krw: plan.potential_saving_krw,
    residual_exposure_krw: plan.residual_exposure_krw,
    route_summary_20: plan.route_summary_20,
    recovery_action_summary_12: plan.recovery_action_summary_12,
    unchanged_direct: { count: plan.unchanged_direct.count, container_ids: plan.unchanged_direct.container_ids, cost_krw: plan.unchanged_direct.cost_krw },
    actions: plan.actions.map((a) => ({
      container_id: a.container_id,
      route: a.route,
      route_label: a.route_label,
      from: a.from,
      via: a.via,
      to: a.to,
      depart_at: a.depart_at,
      truck_id: a.truck_id,
      truck_pool: a.truck_pool,
      delivery_day: a.delivery_day,
      cost_krw: a.cost_krw,
      baseline_cost_krw: a.baseline_cost_krw,
      saving_krw: a.saving_krw,
      cost_breakdown: a.cost_breakdown,
      rationale: a.rationale,
      change_from_previous: a.change_from_previous,
      uses_provisional_input: a.input_refs.length > 0,
    })),
    provisional_inputs: plan.provisional_inputs,
    binding_constraints: plan.binding_constraints,
    resource_gaps: plan.resource_gaps,
    approval: approved?.decided_by
      ? { decided_by: approved.decided_by, decided_at: approved.decided_at ?? "", acknowledged_provisional_inputs: approved.acknowledged_provisional_inputs ?? [] }
      : null,
    previous: plan.previous ?? null,
    change_summary: plan.change_summary ?? [],
    active_approved_plan_id: activeApproved?.plan_id ?? null,
  };
}

function truckLoad(step: RawStep): ResourceStatus["truck_load_by_hour"] {
  const own = resources.truck_pools.find((p) => p.id === "OWN_FLEET");
  const partner = resources.truck_pools.find((p) => p.id === "K_TRUCKING");
  const plan = planById(step.current_plan_id);
  const schedule: RawTruckSlot[] = plan ? plan.truck_schedule : plans.original_plan.truck_schedule;
  const partnerFacts = partner ? resourceFacts(partner.facts_timeline, step) : [];
  const hours = [13, 14, 15, 16, 17, 18, 19];
  return hours.map((hour) => {
    const onDuty = (own?.trucks ?? []).filter((t) => Number(t.window.from.slice(0, 2)) <= hour && hour < Number(t.window.to.slice(0, 2))).length;
    const partnerAvail = partnerFacts
      .filter((f) => f.key.includes(`T${String(hour).padStart(2, "0")}:00`))
      .reduce((a, f) => a + (f.value as number), 0);
    return {
      hour,
      own_available: onDuty,
      own_used: schedule.filter((s) => s.hour === hour && !s.truck_id.startsWith("K-")).length,
      partner_available: partnerAvail,
      partner_used: schedule.filter((s) => s.hour === hour && s.truck_id.startsWith("K-")).length,
    };
  });
}

const CATEGORY_INFO: Record<TrustCategory, { label: string; description: string }> = {
  HUMAN_VERIFIED: { label: "사람 확인", description: "현장 담당자·운영자가 직접 입력했거나 확인한 값 (CONFIRMED)" },
  PARTNER: { label: "파트너", description: "파트너 시스템·터미널 파일에서 온 값" },
  PUBLIC: { label: "공공 API", description: "공공 API 관측값 (OBSERVED). 현실의 최신 상태가 아님" },
  EXTRACTED: { label: "메일 추출", description: "메일에서 추출한 잠정값 (PROVISIONAL). 사람 확인 전" },
  SIMULATED: { label: "시뮬레이션", description: "시나리오 값·결과 (엔진 미구현)" },
  PREDICTED: { label: "예상", description: "ETA 등 예상값 (FORECAST). 실제가 오면 판단에서 빠짐" },
};

export class MockProvider implements CeraDataProvider {
  async getScenario(): Promise<ScenarioInfo> {
    return {
      scenario_id: scenario.scenario_id,
      title: scenario.title,
      version: scenario.version,
      timezone: scenario.timezone,
      disclaimers: scenario.disclaimers,
      steps: scenario.steps.map((s) => ({ step_id: s.step_id, index: s.index, as_of: s.as_of, title: s.title })),
    };
  }

  async getOperationsToday(asOf: IsoDateTime): Promise<Envelope<OperationsToday>> {
    const step = stepAt(asOf);
    const exceptions = risk.exceptions
      .filter((e) => stepIndex(e.detected_step) <= step.index)
      .map((e) => {
        const st = atStep(e.status_timeline, step) ?? e.status_timeline[0];
        const wh = resources.warehouses.find((w) => w.id === e.resource_id);
        return {
          exception_id: e.exception_id,
          type: e.type,
          title: e.title,
          resource_id: e.resource_id,
          resource_name: wh?.name ?? e.resource_id,
          detected_at: e.detected_at,
          capacity_before: e.capacity_before,
          capacity_after: e.capacity_after,
          day: e.day,
          planned_today: e.planned_today,
          affected_count: e.affected_count,
          affected_container_ids: e.affected_container_ids,
          status: st.status,
          status_note: st.note,
          source: { ...e.source, type: e.source.type as TrustView["source_type"], value_status: e.source.value_status as TrustView["value_status"] },
        };
      });
    return envelope(
      {
        narrative: { step_id: step.step_id, index: step.index, title: step.title, caption: step.caption },
        summary: step.kpi,
        exceptions,
        disclaimers: scenario.disclaimers,
      },
      step,
    );
  }

  async getContainers(asOf: IsoDateTime): Promise<Envelope<ContainerView[]>> {
    const step = stepAt(asOf);
    const state = risk.states[step.risk_state];
    const data = containers.map((c): ContainerView => {
      const a = state.assessments.find((x) => x.container_id === c.id)!;
      const { route, changed } = routeOf(c.id, c.group, step);
      const facts = c.facts.map((f) => ({ ...f, display: f.display ?? formatTime(f.value) }));
      return {
        id: c.id,
        container_no: c.container_no,
        size_type: c.size_type,
        size_label: c.size_label,
        carrier: c.carrier,
        cargo: c.cargo,
        business_priority: c.business_priority,
        phase: c.phase,
        lfd: c.lfd,
        destination_id: c.original_plan.destination_id,
        original_plan: c.original_plan,
        impact: a.impact,
        risk: { grade: a.grade, reasons: a.reasons, explanation: a.explanation, exposure_krw: a.exposure_krw, residual_exposure_krw: a.residual_exposure_krw },
        current_route: route,
        current_route_label: ROUTE_LABEL[route],
        current_plan_id: step.current_plan_id,
        route_changed_in_current_plan: changed,
        worst_usability: worst(facts.map((f) => f.trust.decision_usability)),
        facts,
      };
    });
    return envelope(data, step);
  }

  async getRisks(asOf: IsoDateTime): Promise<Envelope<RiskSummary>> {
    const step = stepAt(asOf);
    const s = risk.states[step.risk_state];
    return envelope(
      {
        by_grade: s.by_grade,
        affected_count: s.affected_count,
        exposure_krw: s.exposure_krw,
        residual_exposure_krw: s.residual_exposure_krw,
        grade_rules: risk.grade_rules,
        result_kind: "SCENARIO_RESULT",
      },
      step,
    );
  }

  async getResources(asOf: IsoDateTime): Promise<Envelope<ResourceStatus>> {
    const step = stepAt(asOf);
    const plan = planById(step.current_plan_id);
    const exception = risk.exceptions.find((e) => stepIndex(e.detected_step) <= step.index);
    const day0 = scenario.steps[0].as_of.slice(0, 10);
    const warehouses = resources.warehouses.map((w) => {
      const facts = resourceFacts(w.facts_timeline, step);
      const capacity = factValue(facts, `capacity.day(${day0})`);
      const isA = w.id === "WAREHOUSE_A";
      const planned = isA ? 20 : 3;
      const overflow = isA && exception ? exception.affected_count : 0;
      const byDay = isA && plan ? plan.capacity_usage.WAREHOUSE_A.map((d) => ({ day: d.day, capacity: d.capacity, used: d.used, note: d.note ?? null })) : [];
      return {
        id: w.id,
        name: w.name,
        area: w.area,
        receiving_window: w.receiving_window,
        normal_capacity_per_day: w.normal_capacity_per_day,
        today: { capacity, used: Math.min(planned, capacity), over_by: 0, planned, overflow, label: `${Math.min(planned, capacity)} / ${capacity}` },
        by_day: byDay,
        facts,
      };
    });
    const odcys = resources.odcys.map((o) => {
      const facts = resourceFacts(o.facts_timeline, step);
      const capacity = factValue(facts, "capacity.");
      const used = plan ? plan.capacity_usage[o.id as "ODCY_A" | "ODCY_B"].used : 0;
      return {
        id: o.id,
        name: o.name,
        area: o.area,
        accepts: o.accepts,
        rejects_note: o.rejects_note,
        gate_close: o.gate_close,
        today: { capacity, used, over_by: Math.max(0, used - capacity), label: `${used} / ${capacity}` },
        facts,
      };
    });
    const truck_pools = resources.truck_pools.map((p) => ({ id: p.id, name: p.name, owner: p.owner, trucks: p.trucks, facts: resourceFacts(p.facts_timeline, step) }));
    return envelope(
      {
        terminal: resources.terminal,
        warehouses,
        odcys,
        truck_pools,
        truck_load_by_hour: truckLoad(step),
        plan_basis: plan ? `${plan.label} 기준 사용량` : "원래 입고 계획 기준 사용량",
      },
      step,
    );
  }

  async getCurrentRecoveryPlan(asOf: IsoDateTime): Promise<Envelope<RecoveryPlanCurrent>> {
    const step = stepAt(asOf);
    const plan = planById(step.current_plan_id);
    const baselineVisible = stepIndex(plans.baseline.generated_step) <= step.index;
    const history = plans.plans
      .filter((p) => stepIndex(p.generated_step) <= step.index)
      .map((p) => ({ plan_id: p.plan_id, label: p.label, status: planStatus(p, step).status, plan_cost_krw: p.plan_cost_krw, potential_saving_krw: p.potential_saving_krw }));
    return envelope(
      {
        plan: plan ? toPlanView(plan, step) : null,
        baseline: baselineVisible
          ? {
              plan_id: plans.baseline.plan_id,
              label: plans.baseline.label,
              rule: plans.baseline.rule,
              total_cost_krw: plans.baseline.total_cost_krw,
              exposure_krw: plans.baseline.exposure_krw,
              actions: plans.baseline.actions,
            }
          : null,
        history,
      },
      step,
    );
  }

  async getCommunications(asOf: IsoDateTime): Promise<Envelope<CommunicationThread[]>> {
    const step = stepAt(asOf);
    const data = communications.threads
      .map((th): CommunicationThread => {
        const messages = th.messages
          .filter((m) => stepIndex(m.from_step) <= step.index)
          .map((m) => {
            const st = atStep(m.status_timeline, step) ?? m.status_timeline[0];
            return {
              message_id: m.message_id,
              direction: m.direction,
              status: st.status,
              at: st.at ?? m.received_at ?? null,
              subject: m.subject ?? null,
              body: m.body,
              extraction: m.extraction
                ? { method: m.extraction.method, value_status: m.extraction.value_status as TrustView["value_status"], fields: m.extraction.fields, note: m.extraction.note ?? null }
                : null,
            };
          });
        const replied = messages.some((m) => m.direction === "IN");
        const sent = messages.some((m) => m.status === "SENT_SIMULATED");
        // Scenario statuses → canonical lifecycle: a scenario draft waits for approval; a simulated send is SENT,
        // REPLIED once the reply arrived. No approval was ever invalidated in this scenario.
        const withLifecycle = messages.map((m): MessageView => ({
          ...m,
          lifecycle:
            m.direction === "OUT"
              ? {
                  status: m.status === "DRAFT" ? "PENDING_APPROVAL" : replied ? "REPLIED" : "SENT",
                  invalidation: null,
                  attempt_in_progress: false,
                }
              : null,
        }));
        return { ...th, messages: withLifecycle, state: replied ? "REPLIED" : sent ? "AWAITING_REPLY" : "DRAFT" };
      })
      .filter((th) => th.messages.length > 0);
    return envelope(data, step);
  }

  async getActivity(asOf: IsoDateTime): Promise<Envelope<ActivityItem[]>> {
    const step = stepAt(asOf);
    const data = activity.items
      .filter((i) => stepIndex(i.step_id) <= step.index)
      .map((i) => ({ ...i, is_new_in_step: i.step_id === step.step_id }));
    return envelope(data, step);
  }

  async getDataTrust(asOf: IsoDateTime): Promise<Envelope<DataTrustSummary>> {
    const step = stepAt(asOf);
    const trusts: TrustView[] = [
      ...containers.flatMap((c) => c.facts.map((f) => f.trust)),
      ...resources.warehouses.flatMap((w) => resourceFacts(w.facts_timeline, step).map((f) => f.trust)),
      ...resources.odcys.flatMap((o) => resourceFacts(o.facts_timeline, step).map((f) => f.trust)),
      ...resources.truck_pools.flatMap((p) => resourceFacts(p.facts_timeline, step).map((f) => f.trust)),
    ];
    const order: TrustCategory[] = ["HUMAN_VERIFIED", "PARTNER", "PUBLIC", "EXTRACTED", "SIMULATED", "PREDICTED"];
    const freshness = { FRESH: 0, AGING: 0, STALE: 0, UNKNOWN: 0 };
    for (const t of trusts) if (t.freshness_status in freshness) freshness[t.freshness_status as keyof typeof freshness]++;
    return envelope(
      {
        categories: order.map((category) => ({ category, count: trusts.filter((t) => t.category === category).length, ...CATEGORY_INFO[category] })),
        freshness,
        verification_queue: verifications.requests
          .filter((r) => stepIndex(r.created_step) <= step.index && (r.closed_step === null || stepIndex(r.closed_step) > step.index))
          .map(({ request_id, reason, subject, question, blocking }) => ({ request_id, reason, subject, question, blocking })),
        notes: [
          "개수는 화면에 보이는 사실(컨테이너 사실 + 자원 사실) 기준이다.",
          "위험 등급·비용·계획은 모두 시뮬레이션 결과(SCENARIO_RESULT)다.",
          "신선도 UNKNOWN = 발생 시각을 모름(수신 시각만 있음). STALE(오래됨)과 다르다.",
        ],
      },
      step,
    );
  }
}

function formatTime(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return value == null ? "—" : String(value);
  return `${value.slice(5, 7)}/${value.slice(8, 10)} ${value.slice(11, 16)}`;
}
