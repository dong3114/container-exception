/**
 * CERA Frontend Data Contract v0.1 (T-062).
 *
 * The screen depends only on these view models, never on raw fixture files.
 * Today MockProvider returns them from the scenario data pack; later ApiProvider
 * returns the same shapes from the backend (docs/07_backend-architecture.md 5절).
 *
 * Rules carried from docs/01_project-rules.md:
 * - Money is integer KRW (`Krw`). Times are ISO-8601 strings with the +09:00 offset (`IsoDateTime`).
 * - Every number on screen comes from the provider. Components format, they do not calculate.
 * - Every response says whether it is simulated and whether it is a scenario result or an engine result.
 */

export type IsoDateTime = string;
export type IsoDate = string;
export type Krw = number;

export const CONTRACT_VERSION = "0.1.0";

// ---------- common ----------

/** Where a number came from. Engines do not exist yet, so every result today is SCENARIO_RESULT. */
export type ResultKind = "SCENARIO_RESULT" | "ENGINE_RESULT";

export interface ResponseMeta {
  contract_version: string;
  scenario_id: string;
  as_of: IsoDateTime;
  step_id: string;
  is_simulated: boolean;
  result_kind: ResultKind;
  provider: "mock" | "api";
}

export interface Envelope<T> {
  data: T;
  meta: ResponseMeta;
}

// ---------- trust / provenance (docs/05_event-and-state.md 3·5·6절) ----------

/** Screen-level trust category. Maps from source_type × value_status (see TRUST_CATEGORY_RULES in docs/16_frontend-prototype.md). */
export type TrustCategory = "HUMAN_VERIFIED" | "PARTNER" | "PUBLIC" | "EXTRACTED" | "SIMULATED" | "PREDICTED";

export type SourceType =
  | "HUMAN_UI"
  | "FILE_IMPORT"
  | "EMAIL"
  | "DOCUMENT"
  | "PUBLIC_API"
  | "PARTNER_SYSTEM"
  | "INFERENCE"
  | "SCENARIO";

export type ValueStatus = "CONFIRMED" | "OBSERVED" | "PROVISIONAL" | "INFERRED" | "UNKNOWN" | "SCENARIO_VALUE";
export type FreshnessStatus = "FRESH" | "AGING" | "STALE" | "EXPIRED" | "UNKNOWN" | "N_A";
export type EvidenceTimeQuality = "EVENT_TIME" | "RECORDED_TIME" | "RECEIVED_ONLY";
export type TemporalConfidence = "HIGH" | "MEDIUM" | "LOW";
export type DecisionUsability = "USABLE" | "USABLE_WITH_WARNING" | "APPROVAL_BLOCKED" | "UNUSABLE";

export interface TrustView {
  category: TrustCategory;
  source_type: SourceType;
  source_role: string;
  source_label: string;
  value_status: ValueStatus;
  verification_basis: string | null;
  freshness_status: FreshnessStatus;
  evidence_time: IsoDateTime | null;
  evidence_time_quality: EvidenceTimeQuality | null;
  temporal_confidence: TemporalConfidence | null;
  decision_usability: DecisionUsability;
  usability_reasons: string[];
  event_id: string | null;
  note: string | null;
}

export interface FactView {
  key: string;
  label: string;
  value: unknown;
  display: string;
  trust: TrustView;
}

// ---------- GET /operations/today ----------

export interface StepNarrative {
  step_id: string;
  index: number;
  title: string;
  caption: string;
}

export interface WarehouseKpi {
  id: string;
  name: string;
  capacity_today: number;
  normal_capacity: number;
  planned_today: number;
}

export interface OperationsSummary {
  active_containers: number;
  critical_count: number;
  high_count: number;
  /** Extra cost if nothing is done (Baseline TotalCost − normal direct transport). */
  current_exposure_krw: Krw;
  /** Potential Saving of the latest simulated recovery plan. null before a plan exists. */
  recoverable_exposure_krw: Krw | null;
  recoverable_plan_id: string | null;
  warehouse: WarehouseKpi;
  affected_count: number;
  verification_pending: number;
}

export type ExceptionStatus = "OPEN" | "PLAN_PROPOSED" | "RECOVERY_IN_PROGRESS" | "REPLAN_NEEDED" | "RESOLVED";

export interface ActiveException {
  exception_id: string;
  type: string;
  title: string;
  resource_id: string;
  resource_name: string;
  detected_at: IsoDateTime;
  capacity_before: number;
  capacity_after: number;
  day: IsoDate;
  planned_today: number;
  affected_count: number;
  affected_container_ids: string[];
  status: ExceptionStatus;
  status_note: string;
  source: { type: SourceType; role: string; label: string; event_id: string; value_status: ValueStatus; is_simulated: boolean };
}

export interface OperationsToday {
  narrative: StepNarrative;
  summary: OperationsSummary;
  exceptions: ActiveException[];
  disclaimers: string[];
}

// ---------- GET /containers ----------

export type RiskGrade = "CRITICAL" | "HIGH" | "WATCH" | "LOW";
export type BusinessPriority = "CRITICAL" | "HIGH" | "NORMAL";
export type RouteCode =
  | "WAREHOUSE_DIRECT"
  | "ODCY_A"
  | "ODCY_B"
  | "TERMINAL_WAIT"
  | "WAREHOUSE_B_DIRECT"
  /** Planned for a later day (not moving today). */
  | "PLANNED_LATER"
  /** Original route no longer possible and no recovery plan yet. */
  | "BLOCKED";

export interface RiskView {
  grade: RiskGrade;
  reasons: string[];
  explanation: string;
  exposure_krw: Krw;
  residual_exposure_krw: Krw;
}

export interface ContainerView {
  id: string;
  container_no: string;
  size_type: string;
  size_label: string;
  carrier: string;
  cargo: string;
  business_priority: BusinessPriority;
  phase: string;
  lfd: IsoDate | null;
  destination_id: string;
  original_plan: { destination_id: string; day: IsoDate; depart_at: IsoDateTime | null; truck_id: string | null };
  impact: "AFFECTED" | "NONE";
  risk: RiskView;
  /** Route under the current plan (latest plan if any, otherwise the original plan). */
  current_route: RouteCode;
  current_route_label: string;
  current_plan_id: string | null;
  route_changed_in_current_plan: boolean;
  worst_usability: DecisionUsability;
  facts: FactView[];
}

// ---------- GET /risks ----------

export interface RiskSummary {
  by_grade: Record<RiskGrade, number>;
  affected_count: number;
  exposure_krw: Krw;
  residual_exposure_krw: Krw;
  grade_rules: Record<RiskGrade, string>;
  result_kind: ResultKind;
}

// ---------- GET /resources ----------

export interface ResourceFactView {
  key: string;
  label: string;
  value: unknown;
  display: string;
  changed_in_this_step: boolean;
  trust: TrustView;
}

export interface CapacityGauge {
  capacity: number;
  used: number;
  /** used − capacity when a plan assigns more than the latest capacity fact allows (plan input changed). */
  over_by: number;
  label: string;
}

export interface WarehouseStatus {
  id: string;
  name: string;
  area: string;
  receiving_window: { from: string; to: string };
  normal_capacity_per_day: number;
  today: CapacityGauge & { planned: number; overflow: number };
  by_day: { day: IsoDate; capacity: number; used: number; note: string | null }[];
  facts: ResourceFactView[];
}

export interface OdcyStatus {
  id: string;
  name: string;
  area: string;
  accepts: string[];
  rejects_note: string;
  gate_close: string;
  today: CapacityGauge;
  facts: ResourceFactView[];
}

export interface TruckHourLoad {
  hour: number;
  own_available: number;
  own_used: number;
  partner_available: number;
  partner_used: number;
}

export interface TruckPoolStatus {
  id: string;
  name: string;
  owner: string;
  trucks: { id: string; window: { from: string; to: string } }[];
  facts: ResourceFactView[];
}

export interface ResourceStatus {
  terminal: { id: string; name: string; area: string };
  warehouses: WarehouseStatus[];
  odcys: OdcyStatus[];
  truck_pools: TruckPoolStatus[];
  truck_load_by_hour: TruckHourLoad[];
  plan_basis: string;
}

// ---------- GET /recovery-plans/current ----------

export type PlanStatus = "PROPOSED" | "APPROVED" | "SUPERSEDED" | "REJECTED";

export interface CostLine {
  item: string;
  label: string;
  qty: number;
  unit_krw: Krw;
  amount_krw: Krw;
  basis: string;
}

export interface RecoveryAction {
  container_id: string;
  route: RouteCode;
  route_label: string;
  from: string;
  via: string | null;
  to: string;
  depart_at: IsoDateTime | null;
  truck_id: string | null;
  truck_pool: string | null;
  delivery_day: IsoDate;
  cost_krw: Krw;
  baseline_cost_krw: Krw;
  saving_krw: Krw;
  cost_breakdown: CostLine[];
  rationale: string;
  change_from_previous: { previous_route: RouteCode; previous_route_label: string; kind: "ROUTE_CHANGED" | "DISPATCH_ADJUSTED"; note: string | null } | null;
  uses_provisional_input: boolean;
}

export interface PlanInputRef {
  ref: string;
  resource_id: string;
  fact_key: string;
  value: unknown;
  event_id: string;
  label: string;
}

export interface RecoveryPlanView {
  plan_id: string;
  version: number;
  label: string;
  status: PlanStatus;
  status_flags: string[];
  status_note: string | null;
  generated_at: IsoDateTime;
  trigger: string;
  result_kind: ResultKind;
  scope_label: string;
  excluded_label: string;
  definitions: { total_cost: string; exposure: string; saving: string; delivery_day_rule: string };
  baseline_cost_krw: Krw;
  plan_cost_krw: Krw;
  potential_saving_krw: Krw;
  residual_exposure_krw: Krw;
  /** 20 containers originally planned for Warehouse A today. */
  route_summary_20: Partial<Record<RouteCode, number>>;
  /** 12 affected containers only. Sum equals the exception's affected_count. */
  recovery_action_summary_12: Partial<Record<RouteCode, number>>;
  unchanged_direct: { count: number; container_ids: string[]; cost_krw: Krw };
  actions: RecoveryAction[];
  provisional_inputs: PlanInputRef[];
  binding_constraints: { type: string; ref: string; note: string }[];
  resource_gaps: { type: string; note: string; ask: string; window?: string; needed?: number; available?: number }[];
  approval: { decided_by: string; decided_at: IsoDateTime; acknowledged_provisional_inputs: string[] } | null;
  previous: { plan_id: string; plan_cost_krw: Krw; potential_saving_krw: Krw } | null;
  change_summary: string[];
  /** Approved plan still in force when this plan is only PROPOSED. */
  active_approved_plan_id: string | null;
}

export interface BaselineView {
  plan_id: string;
  label: string;
  rule: string;
  total_cost_krw: Krw;
  exposure_krw: Krw;
  actions: { container_id: string; delivery_day: IsoDate; cost_krw: Krw; exposure_krw: Krw; cost_breakdown: CostLine[] }[];
}

export interface RecoveryPlanCurrent {
  plan: RecoveryPlanView | null;
  baseline: BaselineView | null;
  history: { plan_id: string; label: string; status: PlanStatus; plan_cost_krw: Krw; potential_saving_krw: Krw }[];
}

// ---------- GET /communications ----------

export type MessageStatus = "DRAFT" | "SENT_SIMULATED" | "RECEIVED";

/**
 * Canonical outbound message status (comm_message.current_status — docs/22 · docs/24 22절) and approval invalidation
 * cause. Mirrored, not imported from the backend; from T-087 the generated OpenAPI types replace these.
 */
export type MessageStatusCode =
  | "DRAFTED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "QUEUED"
  | "SENT"
  | "DELIVERY_FAILED"
  | "REPLIED"
  | "CLOSED";
export type InvalidationCause = "USER_REVOKED" | "PLAN_SUPERSEDED" | "CONTENT_CHANGED";

export interface MessageLifecycleView {
  status: MessageStatusCode;
  /** Set when the latest approval was revoked or invalidated (a new approval is needed). */
  invalidation: InvalidationCause | null;
  /** A send attempt without a result yet (shown as 발송 중). */
  attempt_in_progress: boolean;
}

export interface MessageView {
  message_id: string;
  direction: "OUT" | "IN";
  status: MessageStatus;
  at: IsoDateTime | null;
  subject: string | null;
  body: string;
  extraction: { method: string; value_status: ValueStatus; fields: { field: string; value: unknown; evidence: string }[]; note: string | null } | null;
  /** OUTBOUND only. MockProvider maps the scenario status; ApiProvider passes the backend value. */
  lifecycle: MessageLifecycleView | null;
}

export interface CommunicationThread {
  thread_id: string;
  counterparty: string;
  counterparty_role: string;
  purpose: string;
  messages: MessageView[];
  state: "DRAFT" | "AWAITING_REPLY" | "REPLIED";
}

// ---------- GET /activity ----------

export type ActivityKind = "FACT" | "STATE" | "RESULT" | "HUMAN" | "COMMS";

export interface ActivityItem {
  at: IsoDateTime;
  step_id: string;
  actor: string;
  kind: ActivityKind;
  text: string;
  is_new_in_step: boolean;
  refs: Record<string, unknown>;
}

// ---------- GET /data-trust ----------

export interface VerificationRequestView {
  request_id: string;
  reason: string;
  subject: string;
  question: string;
  blocking: string;
}

export interface DataTrustSummary {
  categories: { category: TrustCategory; count: number; label: string; description: string }[];
  freshness: Record<"FRESH" | "AGING" | "STALE" | "UNKNOWN", number>;
  verification_queue: VerificationRequestView[];
  notes: string[];
}

// ---------- scenario playback ----------

export interface ScenarioStep {
  step_id: string;
  index: number;
  as_of: IsoDateTime;
  title: string;
}

export interface ScenarioInfo {
  scenario_id: string;
  title: string;
  version: string;
  timezone: string;
  steps: ScenarioStep[];
  disclaimers: string[];
}
