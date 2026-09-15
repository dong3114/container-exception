/**
 * Raw scenario data pack (data/scenarios/busan-wh-capacity-01/). Only MockProvider may import this.
 * Components must go through CeraDataProvider (front/web/src/data/provider.ts).
 * Shapes are checked by `npm run validate:scenario`.
 */
import activityJson from "@scenario/busan-wh-capacity-01/activity.json";
import communicationsJson from "@scenario/busan-wh-capacity-01/communications.json";
import containersJson from "@scenario/busan-wh-capacity-01/containers.json";
import plansJson from "@scenario/busan-wh-capacity-01/plans.json";
import resourcesJson from "@scenario/busan-wh-capacity-01/resources.json";
import riskJson from "@scenario/busan-wh-capacity-01/risk.json";
import scenarioJson from "@scenario/busan-wh-capacity-01/scenario.json";
import verificationsJson from "@scenario/busan-wh-capacity-01/verifications.json";

import type {
  ActivityKind,
  CostLine,
  ExceptionStatus,
  FactView,
  Krw,
  OperationsSummary,
  PlanStatus,
  RiskGrade,
  RouteCode,
  TrustView,
} from "@/contracts/cera";

export interface RawStep {
  step_id: string;
  index: number;
  as_of: string;
  title: string;
  caption: string;
  risk_state: string;
  current_plan_id: string | null;
  kpi: OperationsSummary;
}

export interface RawScenario {
  scenario_id: string;
  title: string;
  version: string;
  timezone: string;
  disclaimers: string[];
  steps: RawStep[];
}

export interface RawContainer {
  id: string;
  container_no: string;
  size_type: string;
  size_label: string;
  carrier: string;
  cargo: string;
  business_priority: "CRITICAL" | "HIGH" | "NORMAL";
  lfd: string | null;
  phase: string;
  group: "WH_A_D0" | "WH_B_D0" | "WH_A_D1" | "WH_A_D2";
  original_plan: { destination_id: string; day: string; depart_at: string | null; truck_id: string | null };
  facts: (Omit<FactView, "display"> & { display: string | null })[];
}

export interface RawTimelineFact {
  from_step: string;
  key: string;
  value: unknown;
  change_reason?: string;
  truck_ids?: string[];
  trust: TrustView;
}

export interface RawResources {
  terminal: { id: string; name: string; area: string };
  warehouses: {
    id: string;
    name: string;
    area: string;
    receiving_window: { from: string; to: string };
    normal_capacity_per_day: number;
    facts_timeline: RawTimelineFact[];
  }[];
  odcys: { id: string; name: string; area: string; accepts: string[]; rejects_note: string; gate_close: string; facts_timeline: RawTimelineFact[] }[];
  truck_pools: { id: string; name: string; owner: string; trucks: { id: string; window: { from: string; to: string } }[]; facts_timeline: RawTimelineFact[] }[];
}

export interface RawAssessment {
  container_id: string;
  impact: "AFFECTED" | "NONE";
  grade: RiskGrade;
  reasons: string[];
  explanation: string;
  exposure_krw: Krw;
  residual_exposure_krw: Krw;
}

export interface RawRiskState {
  by_grade: Record<RiskGrade, number>;
  affected_count: number;
  exposure_krw: Krw;
  residual_exposure_krw: Krw;
  assessments: RawAssessment[];
}

export interface RawException {
  exception_id: string;
  type: string;
  title: string;
  resource_id: string;
  detected_at: string;
  detected_step: string;
  capacity_before: number;
  capacity_after: number;
  day: string;
  planned_today: number;
  affected_count: number;
  affected_container_ids: string[];
  source: { type: string; role: string; label: string; event_id: string; value_status: string; is_simulated: boolean };
  status_timeline: { from_step: string; status: ExceptionStatus; note: string }[];
}

export interface RawRisk {
  grade_rules: Record<RiskGrade, string>;
  states: Record<string, RawRiskState>;
  step_state: Record<string, string>;
  exceptions: RawException[];
}

export interface RawAction {
  container_id: string;
  route: RouteCode;
  route_label: string;
  from: string;
  via: string | null;
  to: string;
  depart_at: string | null;
  truck_id: string | null;
  truck_pool: string | null;
  delivery_day: string;
  cost_krw: Krw;
  baseline_cost_krw: Krw;
  saving_krw: Krw;
  cost_breakdown: CostLine[];
  rationale: string;
  change_from_previous: { previous_route: RouteCode; previous_route_label: string; kind: "ROUTE_CHANGED" | "DISPATCH_ADJUSTED"; note: string | null } | null;
  input_refs: string[];
}

export interface RawTruckSlot {
  truck_id: string;
  hour: number;
  container_id: string;
  leg: string;
}

export interface RawPlan {
  plan_id: string;
  version: number;
  label: string;
  generated_step: string;
  generated_at: string;
  trigger: string;
  status_timeline: { from_step: string; status: PlanStatus; flags?: string[]; note?: string; decided_by?: string; decided_at?: string; acknowledged_provisional_inputs?: string[] }[];
  baseline_cost_krw: Krw;
  plan_cost_krw: Krw;
  potential_saving_krw: Krw;
  residual_exposure_krw: Krw;
  previous?: { plan_id: string; plan_cost_krw: Krw; potential_saving_krw: Krw };
  change_summary?: string[];
  route_summary_20: Partial<Record<RouteCode, number>>;
  recovery_action_summary_12: Partial<Record<RouteCode, number>>;
  unchanged_direct: { count: number; container_ids: string[]; cost_krw: Krw; actions: RawAction[] };
  actions: RawAction[];
  provisional_inputs: { ref: string; resource_id: string; fact_key: string; value: unknown; event_id: string; label: string }[];
  binding_constraints: { type: string; ref: string; note: string }[];
  resource_gaps: { type: string; note: string; ask: string; window?: string; needed?: number; available?: number }[];
  capacity_usage: {
    WAREHOUSE_A: { day: string; capacity: number; used: number; note?: string }[];
    ODCY_A: { capacity: number; used: number };
    ODCY_B: { capacity: number; used: number };
  };
  truck_schedule: RawTruckSlot[];
}

export interface RawPlans {
  cost_scope: { compared: string; excluded: string; total_cost_definition: string; exposure_definition: string; saving_definition: string; delivery_day_rule: string };
  original_plan: { truck_schedule: RawTruckSlot[] };
  baseline: {
    plan_id: string;
    label: string;
    generated_step: string;
    rule: string;
    total_cost_krw: Krw;
    exposure_krw: Krw;
    actions: { container_id: string; delivery_day: string; cost_krw: Krw; exposure_krw: Krw; cost_breakdown: CostLine[] }[];
  };
  plans: RawPlan[];
}

export interface RawMessage {
  message_id: string;
  direction: "OUT" | "IN";
  from_step: string;
  received_at?: string;
  status_timeline: { from_step: string; status: "DRAFT" | "SENT_SIMULATED" | "RECEIVED"; at?: string }[];
  subject?: string;
  body: string;
  extraction?: { method: string; value_status: string; fields: { field: string; value: unknown; evidence: string }[]; note?: string };
}

export interface RawCommunications {
  threads: { thread_id: string; counterparty: string; counterparty_role: string; purpose: string; messages: RawMessage[] }[];
}

export interface RawActivity {
  items: { at: string; step_id: string; actor: string; kind: ActivityKind; text: string; refs: Record<string, unknown> }[];
}

export interface RawVerifications {
  requests: { request_id: string; reason: string; subject: string; question: string; blocking: string; created_step: string; closed_step: string | null }[];
}

export const fixture = {
  scenario: scenarioJson as unknown as RawScenario,
  containers: (containersJson as unknown as { containers: RawContainer[] }).containers,
  resources: resourcesJson as unknown as RawResources,
  risk: riskJson as unknown as RawRisk,
  plans: plansJson as unknown as RawPlans,
  communications: communicationsJson as unknown as RawCommunications,
  activity: activityJson as unknown as RawActivity,
  verifications: verificationsJson as unknown as RawVerifications,
};
