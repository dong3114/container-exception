import type { z } from 'zod';
import type { DraftService } from '../communication/draft.service.js';
import type { DraftDto } from '../communication/dto.js';
import type { PublicDataService } from '../public-data/public-data.service.js';
import type { RecoveryPlanService } from '../planning/recovery-plan.service.js';
import type { RegistryService } from '../registry/registry.service.js';
import { BusinessRuleError } from '../shared/errors/cera-error.js';
import { Instant } from '../shared/time/instant.js';
import type { AgentRunRepository, AgentRunRow } from './agent-run.repository.js';
import type { RecoveryContextService } from './context.service.js';
import type { ToolHandler } from './executor.js';
import type { ToolName } from './registry.js';
import type {
  communicationStatusInput,
  createInquiryDraftInput,
  findCounterpartyInput,
  getVesselCallsInput,
  messageIdInput,
  messageStatusSchema,
  planIdInput,
  recoveryRunInput,
  vesselCallIdInput,
} from './schemas.js';
import { ToolFailure } from './tool-errors.js';

/**
 * Tool → 기존 도메인 서비스. **여기서 업무 규칙을 다시 쓰지 않는다** — 공공데이터 · 등록부 · 초안 · 승인 요청 모두
 * 이미 있는 서비스를 그대로 부르고, Tool 은 범위(이 실행의 계획 실행) 확인과 Agent 용 모양만 맡는다.
 * 행위자는 언제나 실행 기록의 AI_AGENT — 입력으로 행위자를 받지 않는다.
 */
export interface HandlerDeps {
  publicData: PublicDataService;
  registry: RegistryService;
  drafts: DraftService;
  context: RecoveryContextService;
  runs: AgentRunRepository;
  plans: RecoveryPlanService;
}

type MessageStatus = z.infer<typeof messageStatusSchema>;

export function messageStatus(d: DraftDto): MessageStatus {
  return {
    message_id: d.message.message_id,
    thread_id: d.thread.thread_id,
    counterparty_name: d.thread.counterparty_name,
    purpose: d.thread.purpose,
    status: d.message.status ?? 'UNKNOWN',
    drafted_by: d.message.drafted_by ?? 'UNKNOWN',
    approval_ready: d.approval_ready,
    blocked_reasons: [...d.blocked_reasons],
    approval_state: d.approval.state,
    dispatch_state: d.dispatch.state,
    reply_count: d.replies.length,
    replies: d.replies.map((r) => ({ raw_input_id: r.raw_input_id, status: r.status, received_at: r.received_at, has_extraction: r.extraction !== null, extraction_state: r.extraction?.state ?? null })),
    is_simulated: d.message.is_simulated,
  };
}

/**
 * 공백 하나에 대해 묻은 메시지들의 회신 · 추출 결과(작업 흐름 상태 — 사실이 아니다). 업무 공백(state)은 바꾸지 않는다:
 * 검증된 후보(PASSED · PENDING)가 있으면 CANDIDATE_RECEIVED, 회신은 왔는데 추출이 끝나 통과 후보가 없으면 NO_VALID_CANDIDATE.
 */
export function candidateState(messages: DraftDto[]): { state: 'NONE' | 'REPLY_RECEIVED' | 'CANDIDATE_RECEIVED' | 'CANDIDATE_ACCEPTED' | 'NO_VALID_CANDIDATE'; extractionIds: string[] } {
  const replies = messages.flatMap((m) => m.replies.filter((r) => r.status === 'NORMAL'));
  const candidates = replies.flatMap((r) => r.extraction?.candidates ?? []).filter((c) => c.validation === 'PASSED');
  // 검증은 통과했지만 임시 사실이 될 자격이 없어 사람을 기다리는 후보(PENDING) — 먼저 본다
  const passed = candidates.filter((c) => c.review_status === 'PENDING').map((c) => c.extraction_id);
  if (passed.length > 0) return { state: 'CANDIDATE_RECEIVED', extractionIds: passed.sort() };
  if (candidates.some((c) => c.review_status === 'ACCEPTED')) return { state: 'CANDIDATE_ACCEPTED', extractionIds: [] };
  if (replies.some((r) => r.extraction && ['DONE', 'NO_CANDIDATE', 'SKIPPED', 'FAILED'].includes(r.extraction.state))) return { state: 'NO_VALID_CANDIDATE', extractionIds: [] };
  return { state: replies.length > 0 ? 'REPLY_RECEIVED' : 'NONE', extractionIds: [] };
}

/** 입력의 계획 실행이 이 Agent 실행의 범위인지. 생략하면 실행의 계획 실행. */
function scopedRun(run: AgentRunRow, requested: string | undefined): string {
  if (requested && requested !== run.recoveryRunId) throw new ToolFailure('OUT_OF_SCOPE', 'This agent run is bound to a different recovery run');
  return run.recoveryRunId;
}

/** 메시지가 이 실행의 계획 실행에 묶인 스레드의 것인지. */
async function scopedMessage(deps: HandlerDeps, run: AgentRunRow, messageId: string): Promise<void> {
  const scope = await deps.runs.messageScope(messageId);
  if (!scope) throw new ToolFailure('NOT_FOUND', 'No outbound message with this id');
  if (scope.relatedRunId !== run.recoveryRunId) throw new ToolFailure('OUT_OF_SCOPE', 'The message belongs to another recovery run');
}

export function buildHandlers(deps: HandlerDeps): Record<ToolName, ToolHandler> {
  return {
    get_vessel_calls: {
      async run(input, ctx) {
        const i = input as z.infer<typeof getVesselCallsInput>;
        const r = await deps.publicData.fetchVesselCallsAs({ from: i.from_date, to: i.to_date, callSign: i.call_sign ?? null }, ctx.run.agentActorId);
        upstream(r.summary);
        return { summary: r.summary, items: r.vessel_calls };
      },
    },
    get_vessel_call: {
      async run(input) {
        const i = input as z.infer<typeof vesselCallIdInput>;
        return deps.publicData.vesselCallDetail(i.vessel_call_id);
      },
    },
    get_container_manifest: {
      async run(input, ctx) {
        const i = input as z.infer<typeof vesselCallIdInput>;
        const r = await deps.publicData.fetchContainerManifestAs(i.vessel_call_id, ctx.run.agentActorId);
        upstream(r.summary);
        return r;
      },
    },
    get_recovery_context: {
      async run(input, ctx) {
        const runId = scopedRun(ctx.run, (input as z.infer<typeof recoveryRunInput>).recovery_run_id);
        const run = await deps.context.run(runId);
        const resources = await deps.context.resources();
        const subjects = [...resources.facilities.map((f) => f.facility_id), ...resources.truck_pools.map((p) => p.truck_pool_id)];
        const messages = await Promise.all((await deps.runs.outboundMessagesOfRun(runId)).map((id) => deps.drafts.get(id)));
        const sim = { isSimulated: run.containsSimulated, scenarioId: run.scenarioId };
        return {
          recovery_run: {
            run_id: run.runId,
            run_status: run.runStatus,
            trigger_type: run.triggerType,
            trigger_ref: run.triggerRef,
            executed_at: toSeoul(run.executedAt),
            superseded_by_run_id: run.successorRunId,
            total_cost_krw: run.totalCostKrw === null ? null : run.totalCostKrw.toString(),
            // 계획 실행 행의 비용은 시드(시나리오) 값이다(규칙 9) — 엔진 계획은 recovery_plan(get_recovery_plan)
            cost_result_kind: run.totalCostKrw === null ? 'NONE' : run.containsSimulated ? 'SCENARIO_RESULT' : 'ENGINE_RESULT',
            unmet_constraints: run.unmetConstraints ?? [],
            contains_simulated: run.containsSimulated,
            scenario_id: run.scenarioId,
          },
          snapshot: { snapshot_id: run.snapshotId, as_of: toSeoul(run.asOf), plan_date: run.planDate, rule_version: run.ruleVersion, policy_version: run.policyVersion },
          resources,
          latest_observations: await deps.context.latestObservations(subjects, sim),
          facts: await deps.context.facts(subjects, sim, deps.context.evaluationAsOf(run)),
          communications: messages.map(messageStatus),
          limitations: [
            'OBSERVATIONS_ARE_RAW_CLAIMS — latest_observations are unjudged claims; read `facts` for current values and their state',
            'PROVISIONAL_IS_NOT_CONFIRMED — a provisional fact is a validated reply value no human has confirmed; only a person makes it CONFIRMED',
            'FRESHNESS_IS_AN_ASSUMPTION — facts age by per-family starting values [ASSUMPTION] (explicit valid_until wins); simulated runs are judged at their scenario time',
            'PLANNING_IS_DETERMINISTIC — costs and plans come from the cost engine and solver tools (calculate_recovery_costs · solve_recovery · propose_recovery_plan); never compute or change numbers yourself',
            'CONTAINERS_NOT_LINKED_TO_RUN — public-data containers are not yet tied to this recovery run',
          ],
        };
      },
    },
    get_information_gaps: {
      async run(input, ctx) {
        const out = await deps.context.informationGaps(scopedRun(ctx.run, (input as z.infer<typeof recoveryRunInput>).recovery_run_id));
        for (const gap of out.gaps) {
          if (gap.open_question_message_ids.length === 0) continue;
          const c = candidateState(await Promise.all(gap.open_question_message_ids.map((id) => deps.drafts.get(id))));
          gap.candidate_state = c.state;
          gap.candidate_extraction_ids = c.extractionIds;
        }
        return out;
      },
    },
    get_reply_candidates: {
      async run(input, ctx) {
        const i = input as z.infer<typeof messageIdInput>;
        await scopedMessage(deps, ctx.run, i.message_id);
        const d = await deps.drafts.get(i.message_id);
        return {
          message_id: d.message.message_id,
          status: d.message.status ?? 'UNKNOWN',
          replies: d.replies
            .filter((r) => r.status === 'NORMAL')
            .map((r) => ({
              inbound_message_id: r.message_id,
              received_at: r.received_at,
              extraction_state: r.extraction?.state ?? null,
              no_candidate_outcome: r.extraction?.no_candidate_outcome ?? null,
              candidates: (r.extraction?.candidates ?? []).map((c) => ({
                extraction_id: c.extraction_id,
                field: c.field,
                value: c.value,
                unit: c.unit,
                validation: c.validation,
                failed_reasons: [...c.failed_reasons],
                review_status: c.review_status,
                generated_by: c.generated_by,
                fact_event_id: c.fact_event_id,
                promotion_blocked_reasons: [...c.promotion_blocked_reasons],
              })),
            })),
          note: 'Candidates are suggestions validated by the backend. A qualifying one becomes a provisional fact; only a human confirmation makes it CONFIRMED (T-093).' as const,
        };
      },
    },
    find_counterparty: {
      async run(input) {
        const i = input as z.infer<typeof findCounterpartyInput>;
        const list = await deps.registry.listCounterparties();
        const needle = i.name_contains?.toLowerCase();
        return {
          evaluated_at: list.evaluated_at,
          counterparties: list.counterparties
            .filter((c) => c.is_active && (!i.role || c.source_role === i.role) && (!needle || c.display_name.toLowerCase().includes(needle)))
            .map((c) => ({
              counterparty_id: c.counterparty_id,
              display_name: c.display_name,
              role: c.source_role,
              contacts: c.contacts
                .filter((p) => p.is_active)
                .map((p) => ({
                  contact_id: p.contact_id,
                  person_name: p.person_name ?? null,
                  // 주소 문자열은 돌려주지 않는다 — Agent 는 id 로만 고른다
                  addresses: p.addresses
                    .filter((a) => !i.eligible_only || a.eligible)
                    .map((a) => ({ address_id: a.address_id, channel_type: a.channel_type, eligible: a.eligible, blocked_reasons: a.reasons.map((r) => r.code), is_simulated: a.is_simulated })),
                }))
                .filter((p) => p.addresses.length > 0 || !i.eligible_only),
            }))
            .filter((c) => c.contacts.length > 0 || !i.eligible_only),
        };
      },
    },
    create_inquiry_draft: {
      async run(input, ctx) {
        const i = input as z.infer<typeof createInquiryDraftInput>;
        // 계획 실행은 실행 기록이 정한다(Agent 가 고르지 못한다). Contact Gate · 값 형식 · 숫자 검사는 기존 서비스가 한다
        const draft = await deps.drafts.create(
          { address_id: i.address_id, intent: i.intent, target_id: i.target_id, values: i.values, source_run_id: ctx.run.recoveryRunId },
          { actorId: ctx.run.agentActorId, submitForApproval: false, inTransaction: (tx, messageId) => ctx.commit(tx, { type: 'COMM_MESSAGE', id: messageId }) },
        );
        return draftCreated(draft);
      },
      async replay(ref) {
        return draftCreated(await deps.drafts.get(ref.id));
      },
    },
    get_communication_status: {
      async run(input, ctx) {
        const i = input as z.infer<typeof communicationStatusInput>;
        if (i.message_id) {
          await scopedMessage(deps, ctx.run, i.message_id);
          return { messages: [messageStatus(await deps.drafts.get(i.message_id))] };
        }
        const ids = await deps.runs.outboundMessagesOfRun(ctx.run.recoveryRunId);
        return { messages: (await Promise.all(ids.map((id) => deps.drafts.get(id)))).map(messageStatus) };
      },
    },
    request_approval: {
      async run(input, ctx) {
        const i = input as z.infer<typeof messageIdInput>;
        await scopedMessage(deps, ctx.run, i.message_id);
        const r = await deps.drafts.requestApproval(i.message_id, ctx.run.agentActorId, (tx) => ctx.commit(tx, { type: 'COMM_MESSAGE', id: i.message_id }));
        return approvalRequested(await deps.drafts.get(i.message_id), r.alreadyPending);
      },
      async replay(ref) {
        return approvalRequested(await deps.drafts.get(ref.id), true);
      },
    },
    calculate_recovery_costs: {
      async run(input, ctx) {
        const runId = scopedRun(ctx.run, (input as z.infer<typeof recoveryRunInput>).recovery_run_id);
        const c = await planningCall(() => deps.plans.compute(runId));
        return {
          recovery_run_id: runId,
          as_of: c.asOf.toSeoulIso(),
          result_kind: 'ENGINE_RESULT' as const,
          contains_simulated: c.run.containsSimulated,
          policy_version: c.table.policy_version,
          rate_version: c.table.rate_version,
          candidate_count: c.table.candidates.length,
          option_count: c.table.options.length,
          feasible_option_count: c.table.options.filter((o) => o.feasible).length,
          excluded_facts: c.table.facts.filter((f) => f.usage === 'EXCLUDED').slice(0, 50).map((f) => ({ subject_id: f.subject_id, fact_key: f.fact_key, fact_state: f.fact_state, freshness: f.freshness, reason: f.reason })),
          provisional_facts: c.table.facts.filter((f) => f.usage === 'USED_WITH_WARNING').slice(0, 50).map((f) => ({ subject_id: f.subject_id, fact_key: f.fact_key, reason: f.reason })),
          baseline: { base_cost_krw: c.baseline.base_cost, risk_penalty_krw: c.baseline.risk_penalty, total_krw: c.baseline.total, unplanned_count: c.baseline.unplanned.length },
          warnings: c.table.warnings.slice(0, 50).map((w) => w.slice(0, 300)),
          cost_ms: Math.round(c.costMs),
        };
      },
    },
    solve_recovery: {
      async run(input, ctx) {
        const runId = scopedRun(ctx.run, (input as z.infer<typeof recoveryRunInput>).recovery_run_id);
        const s = await planningCall(() => deps.plans.solve(runId));
        const r = s.result;
        return {
          recovery_run_id: runId,
          status: r.status,
          input_hash: r.input_hash,
          objective_krw: r.objective_value,
          base_cost_krw: r.base_cost,
          risk_penalty_krw: r.risk_penalty,
          baseline_total_krw: r.baseline_value,
          saving_krw: r.saving,
          changed_count: r.assignments.filter((a) => a.action !== 'KEEP_CURRENT_PLAN').length,
          assignments: r.assignments.slice(0, 100).map((a) => ({ container_id: a.container_id, action: a.action, target_id: a.target_id, delivery_day: a.delivery_day, total_krw: a.expected_cost.total })),
          unplanned: r.unplanned.slice(0, 100).map((u) => ({ container_id: u.container_id, reasons: u.reasons.slice(0, 5).map((x) => x.slice(0, 300)) })),
          binding_constraints: r.binding_constraints.slice(0, 30).map((b) => ({ type: b.type, ref: b.ref })),
          cost_ms: Math.round(s.costMs),
          solve_ms: Math.round(r.timings_ms.model + r.timings_ms.solve),
          note: 'Candidate only — nothing is stored. propose_recovery_plan stores it as a PROPOSED version for a human to review.' as const,
        };
      },
    },
    propose_recovery_plan: {
      async run(_input, ctx) {
        // 계획 실행 · 행위자는 실행 기록이 정한다. 사실이 그 사이 바뀌었으면 지금 사실로 다시 푼다(input_hash 가 달라진다)
        const r = await planningCall(() => deps.plans.propose(ctx.run.recoveryRunId, { actorId: ctx.run.agentActorId, agentRunId: ctx.run.agentRunId }, { inTransaction: (tx, planId) => ctx.commit(tx, { type: 'RECOVERY_PLAN', id: planId }) }));
        return planStatus(r.plan, r.reused);
      },
      async replay(ref) {
        const plan = await deps.plans.plan(ref.id);
        if (!plan) throw new ToolFailure('NOT_FOUND', 'The proposed plan no longer exists');
        return planStatus(plan, true);
      },
    },
    get_recovery_plan: {
      async run(input, ctx) {
        const i = input as z.infer<typeof planIdInput>;
        const plan = i.plan_id ? await deps.plans.plan(i.plan_id) : await deps.plans.currentPlan(ctx.run.recoveryRunId);
        if (plan && plan.caseRunId !== ctx.run.recoveryRunId) throw new ToolFailure('OUT_OF_SCOPE', 'The plan belongs to another recovery run');
        return { plan: plan ? planStatus(plan, false) : null };
      },
    },
  };
}

type PlanRow = NonNullable<Awaited<ReturnType<RecoveryPlanService['plan']>>>;

function planStatus(p: PlanRow, reused: boolean) {
  return {
    plan_id: p.planId,
    recovery_run_id: p.caseRunId,
    version: p.version,
    plan_status: p.planStatus as 'PROPOSED' | 'APPROVED' | 'SUPERSEDED' | 'OUTDATED' | 'INFEASIBLE',
    solver_status: p.solverStatus,
    input_hash: p.inputHash,
    objective_krw: p.objectiveKrw === null ? null : Number(p.objectiveKrw),
    baseline_total_krw: Number(p.baselineTotalKrw),
    saving_krw: p.savingKrw === null ? null : Number(p.savingKrw),
    outdated_reason_codes: ((p.outdatedReasons ?? []) as { code?: string }[]).map((x) => String(x.code ?? 'UNKNOWN')).slice(0, 50),
    superseded_by_plan_id: p.supersededByPlanId,
    approved: p.planStatus === 'APPROVED' || p.approvedByActorId !== null,
    reused,
    note: 'A PROPOSED plan is a candidate. Only a human approves it; approval is not dispatch.' as const,
  };
}

/** 계획 입력을 만들 수 없는 실행(실제 실행 — 컨테이너 데이터 없음)은 Agent 에게 업무 오류로 알린다. */
async function planningCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof BusinessRuleError && e.code === 'PLANNING_INPUT_UNAVAILABLE') throw new ToolFailure('CAPABILITY_NOT_AVAILABLE', e.message);
    throw e;
  }
}

function draftCreated(d: DraftDto) {
  const passed = d.number_check?.passed ?? false;
  return { message: messageStatus(d), number_check_passed: passed, next_step: passed ? ('REQUEST_APPROVAL' as const) : ('HUMAN_EDIT_REQUIRED' as const) };
}

function approvalRequested(d: DraftDto, alreadyPending: boolean) {
  return {
    message: messageStatus(d),
    approval_requested: true,
    already_pending: alreadyPending,
    note: 'A human must approve. This tool never approves or sends.' as const,
  };
}

/** 공공 API 첫 페이지가 실패했으면 Tool 실패(종류별). 데이터 없음은 성공(빈 결과). */
function upstream(summary: { outcome: string; pages: { result_code: string | null }[] }): void {
  if (summary.outcome === 'TRANSPORT_ERROR') {
    const timedOut = summary.pages.at(-1)?.result_code === 'TIMEOUT';
    throw new ToolFailure(timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR', `Public API transport failed (${summary.pages.at(-1)?.result_code ?? 'unknown'})`, { causeCode: 'PUBLIC_DATA_TRANSPORT_FAILED' });
  }
  if (summary.outcome === 'UPSTREAM_ERROR' || summary.outcome === 'PARSE_ERROR') {
    throw new ToolFailure('UPSTREAM_ERROR', `Public API returned ${summary.outcome} (${summary.pages.at(-1)?.result_code ?? 'no code'})`, { causeCode: `PUBLIC_DATA_${summary.outcome}` });
  }
}

function toSeoul(db: string): string {
  return Instant.fromDb(db).toSeoulIso();
}
