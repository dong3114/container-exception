import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import type { z } from 'zod';
import { DATABASE, type Database } from '../db/database.js';
import {
  commMessage,
  commMessageQuestion,
  commThread,
  event,
  eventEntityLink,
  facility,
  planningSnapshot,
  questionItem,
  recoveryRun,
  truckPool,
} from '../db/schema/index.js';
import { sha256Bytes } from '../shared/hash/hash.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import type { CoordinateResult } from '../truth/truth.service.js';
import { TruthService } from '../truth/truth.service.js';
import type { factViewSchema, informationGapsOutput, recoveryContextOutput } from './schemas.js';
import { ToolFailure } from './tool-errors.js';

/** 정보 공백 규칙 판(결정론). 값은 [ASSUMPTION] — Reconciliation(T-093) · 신선도 정책(Q-24) 전까지의 최소 규칙 */
// gap-rules/1(T-105): 업무 공백(state)은 그대로, 묻은 상대의 회신 · 검증된 후보(candidate_state)를 따로 보여 준다
// gap-rules/2(T-093): 업무 공백이 사실의 상태를 따른다 — 사람이 확인한 사실만 공백을 닫고(known), 임시 사실은 PROVISIONAL_AVAILABLE, 충돌 · 보류는 NEEDS_REVIEW
// gap-rules/3(T-111): 확인됐어도 오래됐거나(STALE · 만료) 철회된 사실은 공백을 닫지 못한다 → NEEDS_REFRESH(다시 물어야 함). 새로 물었으면 ASKED
export const GAP_RULE_VERSION = 'gap-rules/3';
// 공백 id 의 재료는 판 1 그대로다 — 규칙 판이 올라가도 이미 도는 Agent 실행(checkpoint 에 공백 id 가 있다)이 자기 공백을 잃지 않게
const GAP_ID_BASIS = 'gap-rules/1';

type FactObservation = z.infer<typeof recoveryContextOutput>['latest_observations'][number];
type FactView = z.infer<typeof factViewSchema>;

const TRUTH_RANK: Record<string, number> = { CONFIRMED: 0, OBSERVED: 1, PROVISIONAL: 2, NEEDS_REVIEW: 3, STALE: 4, REVOKED: 5, UNKNOWN: 9 };

/** 아직 묻는 중으로 보는 메시지 상태(답이 오면 회신 · 추출 · 확인으로 넘어간다) */
const OPEN_INQUIRY_STATUSES = ['DRAFTED', 'PENDING_APPROVAL', 'APPROVED', 'QUEUED', 'SENT', 'REPLIED'];

/**
 * 계획 실행 맥락 · 정보 공백(T-103 `get_recovery_context` · `get_information_gaps`) — 읽기 전용, LLM 없음.
 * Agent 에게 표를 보여 주지 않고 판단에 필요한 모양만 돌려준다. 관측(사건)은 **현재 사실이 아니다**(T-093 전).
 */
@Injectable()
export class RecoveryContextService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(TruthService) private readonly truth: TruthService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * 사실을 판정하는 기준 시각(T-111 as_of). 실제 실행 = 지금(시계 포트 — 시험은 바꿔 넣는다). 시뮬레이션 실행 = 그 시나리오의 시각
   * (스냅샷 기준 시각 — 가상 시나리오는 실제 시간에 늙지 않는다). 호출자가 `override` 를 주면 그 시각(과거 시점 재현 · 시험).
   */
  evaluationAsOf(run: { containsSimulated: boolean; asOf: string }, override?: Instant | null): Instant {
    if (override) return override;
    return run.containsSimulated ? Instant.fromDb(run.asOf) : this.clock.now();
  }

  async run(recoveryRunId: string) {
    const [row] = await this.db
      .select({
        runId: recoveryRun.runId,
        runStatus: recoveryRun.runStatus,
        triggerType: recoveryRun.triggerType,
        triggerRef: recoveryRun.triggerRef,
        executedAt: recoveryRun.executedAt,
        totalCostKrw: recoveryRun.totalCostKrw,
        unmetConstraints: recoveryRun.unmetConstraints,
        containsSimulated: recoveryRun.containsSimulated,
        snapshotId: planningSnapshot.snapshotId,
        asOf: planningSnapshot.asOf,
        ruleVersion: planningSnapshot.ruleVersion,
        policyVersion: planningSnapshot.policyVersion,
        scenarioId: planningSnapshot.scenarioId,
      })
      .from(recoveryRun)
      .innerJoin(planningSnapshot, eq(planningSnapshot.snapshotId, recoveryRun.snapshotId))
      .where(eq(recoveryRun.runId, recoveryRunId))
      .limit(1);
    if (!row) throw new ToolFailure('NOT_FOUND', 'Recovery run not found');
    const [successor] = await this.db.select({ id: recoveryRun.runId }).from(recoveryRun).where(eq(recoveryRun.previousRunId, recoveryRunId)).limit(1);
    return { ...row, successorRunId: successor?.id ?? null, planDate: Instant.fromDb(row.asOf).toSeoulIso().slice(0, 10) };
  }

  async resources() {
    const facilities = await this.db
      .select({ facility_id: facility.facilityId, facility_type: facility.facilityType, facility_name: facility.facilityName, operator_counterparty_id: facility.operatorCounterpartyId })
      .from(facility)
      .where(eq(facility.isActive, true))
      .orderBy(asc(facility.facilityName));
    const truckPools = await this.db
      .select({ truck_pool_id: truckPool.truckPoolId, pool_name: truckPool.poolName, ownership: truckPool.ownership, owner_counterparty_id: truckPool.ownerCounterpartyId })
      .from(truckPool)
      .where(eq(truckPool.isActive, true))
      .orderBy(asc(truckPool.poolName));
    return { facilities, truck_pools: truckPools };
  }

  /** 개체 · 사실 키별 최신 관측(받은 시각 순). 시뮬레이션 실행이면 같은 시나리오의 시뮬레이션 사건만, 실제면 실제 사건만. */
  async latestObservations(subjectIds: string[], sim: { isSimulated: boolean; scenarioId: string | null }): Promise<FactObservation[]> {
    if (subjectIds.length === 0) return [];
    const rows = await this.db
      .selectDistinctOn([eventEntityLink.entityId, event.factKey], {
        eventId: event.eventId,
        subjectType: eventEntityLink.entityType,
        subjectId: eventEntityLink.entityId,
        factKey: event.factKey,
        valueText: event.valueText,
        valueNumber: event.valueNumber,
        valueUnit: event.valueUnit,
        sourceType: event.sourceType,
        receivedAt: event.receivedAt,
        isSimulated: event.isSimulated,
        scenarioId: event.scenarioId,
      })
      .from(event)
      .innerJoin(eventEntityLink, and(eq(eventEntityLink.eventId, event.eventId), eq(eventEntityLink.linkRole, 'SUBJECT')))
      .where(and(inArray(eventEntityLink.entityId, subjectIds), eq(event.eventClass, 'OBSERVATION'), eq(event.isSimulated, sim.isSimulated)))
      .orderBy(eventEntityLink.entityId, event.factKey, desc(event.receivedAt), desc(event.recordedAt), desc(event.eventId));
    return rows
      .filter((r) => !sim.isSimulated || r.scenarioId === sim.scenarioId)
      .map((r) => ({
        event_id: r.eventId,
        subject_type: r.subjectType,
        subject_id: r.subjectId,
        fact_key: r.factKey ?? '',
        value_text: r.valueText,
        value_number: r.valueNumber,
        value_unit: r.valueUnit,
        source_type: r.sourceType,
        received_at: Instant.fromDb(r.receivedAt).toSeoulIso(),
        is_simulated: r.isSimulated,
      }));
  }

  /** 이 실행에 묶인 문의(대체되지 않은 보내는 메시지)의 질문 대상. */
  async openQuestions(recoveryRunId: string) {
    return this.db
      .select({ messageId: commMessage.messageId, status: commMessage.currentStatus, createdAt: commMessage.createdAt, targetEntityId: questionItem.targetEntityId, targetFactKey: questionItem.targetFactKey })
      .from(commMessage)
      .innerJoin(commThread, eq(commThread.threadId, commMessage.threadId))
      .innerJoin(commMessageQuestion, eq(commMessageQuestion.messageId, commMessage.messageId))
      .innerJoin(questionItem, eq(questionItem.questionItemId, commMessageQuestion.questionItemId))
      .where(and(eq(commThread.relatedRunId, recoveryRunId), eq(commMessage.direction, 'OUTBOUND'), ne(commMessage.currentStatus, 'CLOSED')));
  }

  /**
   * 정보 공백(`gap-rules/0`) — 계획 날짜 D(스냅숏 기준 시각의 Asia/Seoul 날짜)에 계획이 기대는 자원마다 필요한 사실:
   *   창고 = `capacity.day(D)` · ODCY = `capacity.….day(D)`(규격별 포함) · 협력 운송사 차량 풀 = `available.slot(D…)`.
   * 같은 시뮬레이션 구분의 관측(사건)이 있으면 known, 없으면 공백 — 이 실행에서 이미 묻는 중이면 ASKED.
   * 공공데이터는 이 공백을 풀지 못한다(창고 · ODCY · 트럭은 공공 API 에 없다 — docs/11 4절).
   */
  async informationGaps(recoveryRunId: string, asOfOverride?: Instant | null): Promise<z.infer<typeof informationGapsOutput>> {
    const run = await this.run(recoveryRunId);
    const asOf = this.evaluationAsOf(run, asOfOverride);
    const { facilities, truck_pools } = await this.resources();
    const D = run.planDate;
    type Need = {
      kind: 'FACILITY_CAPACITY' | 'TRUCK_AVAILABILITY';
      subjectType: 'FACILITY' | 'TRUCK_POOL';
      id: string;
      name: string;
      fact: string;
      matches: (k: string) => boolean;
      role: 'TRUCKING' | 'ODCY' | 'WAREHOUSE';
      owner: string | null;
    };
    const needs: Need[] = [
      ...facilities
        .filter((f) => f.facility_type === 'WAREHOUSE' || f.facility_type === 'ODCY')
        .map((f): Need =>
          f.facility_type === 'WAREHOUSE'
            ? { kind: 'FACILITY_CAPACITY', subjectType: 'FACILITY', id: f.facility_id, name: f.facility_name, fact: `capacity.day(${D})`, matches: (k) => k === `capacity.day(${D})`, role: 'WAREHOUSE', owner: f.operator_counterparty_id }
            : { kind: 'FACILITY_CAPACITY', subjectType: 'FACILITY', id: f.facility_id, name: f.facility_name, fact: `capacity.*.day(${D})`, matches: (k) => k.startsWith('capacity.') && k.endsWith(`day(${D})`), role: 'ODCY', owner: f.operator_counterparty_id },
        ),
      ...truck_pools
        .filter((p) => p.ownership === 'PARTNER')
        .map((p): Need => ({
          kind: 'TRUCK_AVAILABILITY',
          subjectType: 'TRUCK_POOL',
          id: p.truck_pool_id,
          name: p.pool_name,
          fact: `available.slot(${D}…)`,
          matches: (k) => k.startsWith(`available.slot(${D}`),
          role: 'TRUCKING',
          owner: p.owner_counterparty_id,
        })),
    ];
    // 값이 있는 사실 + 철회돼 값이 없어진 사실(REVOKED). 처음부터 값이 없던 좌표(UNKNOWN)는 공백 판정에 쓰지 않는다
    const live = (await this.truth.liveForSubjects(needs.map((n) => n.id), { isSimulated: run.containsSimulated, scenarioId: run.scenarioId }, asOf)).filter((f) => f.state !== 'UNKNOWN');
    const questions = await this.openQuestions(recoveryRunId);
    const gaps: z.infer<typeof informationGapsOutput>['gaps'] = [];
    const known: z.infer<typeof informationGapsOutput>['known'] = [];
    for (const n of needs) {
      // 이 공백을 겨냥한 사실들 중 가장 믿을 만한 것(확인됨 → 공식 기록 → 임시 → 검토 필요). 사람이 확인한 사실만 공백을 닫는다
      const matching = live
        .filter((f) => f.data.coordinate.entityId === n.id && n.matches(f.data.coordinate.factKey))
        .sort((a, b) => (TRUTH_RANK[a.state] ?? 9) - (TRUTH_RANK[b.state] ?? 9) || a.data.coordinate.factKey.localeCompare(b.data.coordinate.factKey));
      const best = matching[0];
      if (best && (best.state === 'CONFIRMED' || best.state === 'OBSERVED')) {
        known.push({ subject_type: n.subjectType, subject_id: n.id, required_fact: n.fact, evidence: this.observationOf(best), fact: this.factViewOf(best) as FactView });
        continue;
      }
      // 다시 물어야 하는 사실(오래됨 · 만료 · 철회): 그 근거 사건보다 뒤에 보낸 문의가 있을 때만 "묻는 중"이다(옛 문의로 공백을 덮지 않는다)
      const refresh = best && (best.state === 'STALE' || best.state === 'REVOKED') ? best : null;
      const basisEventId = refresh ? (refresh.result.revokedBy ?? refresh.result.winner?.eventId ?? null) : null;
      const basisTime = refresh ? (refresh.result.revokedBy ? refresh.result.scored.find((e) => e.eventId === refresh.result.revokedBy)?.receivedAt : refresh.result.winner?.receivedAt) : null;
      const asked = questions.filter(
        (q) => q.targetEntityId === n.id && q.targetFactKey !== null && n.matches(q.targetFactKey) && OPEN_INQUIRY_STATUSES.includes(q.status ?? '') && (!basisTime || Instant.fromDb(q.createdAt).isAfter(Instant.parseIso(basisTime))),
      );
      let state: 'MISSING' | 'ASKED' | 'PROVISIONAL_AVAILABLE' | 'NEEDS_REVIEW' | 'NEEDS_REFRESH';
      if (refresh) state = asked.length > 0 ? 'ASKED' : 'NEEDS_REFRESH';
      else if (best) state = best.state === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : 'PROVISIONAL_AVAILABLE';
      else state = asked.length > 0 ? 'ASKED' : 'MISSING';
      gaps.push({
        gap_id: `gap:${sha256Bytes(`${GAP_ID_BASIS}|${recoveryRunId}|${n.id}|${n.fact}`).slice(7, 23)}`,
        gap_kind: n.kind,
        subject_type: n.subjectType,
        subject_id: n.id,
        subject_name: n.name,
        required_fact: n.fact,
        state,
        fact: best ? this.factViewOf(best) : null,
        refresh_basis_event_id: basisEventId,
        open_question_message_ids: asked.map((q) => q.messageId),
        public_data_can_resolve: false,
        suggested_source: 'PARTNER_INQUIRY',
        suggested_intent: n.kind === 'TRUCK_AVAILABILITY' ? 'TRUCK_SLOT' : 'FACILITY_CAPACITY',
        suggested_counterparty_role: n.role,
        owner_counterparty_id: n.owner,
        candidate_state: 'NONE', // 회신 · 추출은 handler 가 메시지 상태로 채운다(candidateState)
        candidate_extraction_ids: [],
      });
    }
    return { recovery_run_id: recoveryRunId, plan_date: D, rule_version: GAP_RULE_VERSION, evaluated_as_of: asOf.toSeoulIso(), gaps, known };
  }

  /** 판정된 현재 사실들(Agent 용) — 값과 함께 상태 · 근거를 준다. 값이 없는(UNKNOWN) 좌표는 뺀다. */
  async facts(subjectIds: string[], sim: { isSimulated: boolean; scenarioId: string | null }, asOf: Instant): Promise<FactView[]> {
    const live = await this.truth.liveForSubjects(subjectIds, sim, asOf);
    return live
      .filter((f) => f.result.winner !== null && f.state !== 'UNKNOWN')
      .map((f) => this.factViewOf(f) as FactView)
      .sort((a, b) => a.subject_id.localeCompare(b.subject_id) || a.fact_key.localeCompare(b.fact_key));
  }

  factViewOf(f: CoordinateResult): FactView | null {
    const w = f.result.winner;
    const row = f.winnerRow;
    if (!w || !row || f.state === 'UNKNOWN') return null;
    const c = f.data.coordinate;
    return {
      subject_type: c.entityType,
      subject_id: c.entityId,
      fact_key: c.factKey,
      fact_state: f.state as FactView['fact_state'],
      freshness_status: f.result.freshness,
      value_number: row.valueNumber,
      value_unit: row.valueUnit,
      valid_from: row.validFrom ? Instant.fromDb(row.validFrom).toSeoulIso() : null,
      valid_until: row.validUntil ? Instant.fromDb(row.validUntil).toSeoulIso() : null,
      verified_by_human: f.result.verificationBasis === 'HUMAN_VERIFICATION',
      verification_basis: f.result.verificationBasis,
      conflict_status: f.result.conflictStatus,
      hold_status: f.result.holdStatus,
      decision_usability: f.result.usability,
      evidence: {
        event_id: row.eventId,
        source_type: row.sourceType,
        received_at: Instant.fromDb(row.receivedAt).toSeoulIso(),
        extraction_id: row.extractionId,
        generated_by: row.extractionId ? (((row.payload as { extraction?: { model_version?: string } } | null)?.extraction?.model_version ?? '').startsWith('replay:') ? 'RECORDED_REPLAY' : 'LLM') : row.sourceType === 'HUMAN_UI' ? 'HUMAN' : 'SYSTEM',
      },
    };
  }

  private observationOf(f: CoordinateResult): FactObservation {
    const row = f.winnerRow as NonNullable<CoordinateResult['winnerRow']>;
    const c = f.data.coordinate;
    return {
      event_id: row.eventId,
      subject_type: c.entityType,
      subject_id: c.entityId,
      fact_key: c.factKey,
      value_text: row.valueText,
      value_number: row.valueNumber,
      value_unit: row.valueUnit,
      source_type: row.sourceType,
      received_at: Instant.fromDb(row.receivedAt).toSeoulIso(),
      is_simulated: row.isSimulated,
    };
  }
}
