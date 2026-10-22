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
import { Instant } from '../shared/time/instant.js';
import type { informationGapsOutput, recoveryContextOutput } from './schemas.js';
import { ToolFailure } from './tool-errors.js';

/** 정보 공백 규칙 판(결정론). 값은 [ASSUMPTION] — Reconciliation(T-093) · 신선도 정책(Q-24) 전까지의 최소 규칙 */
export const GAP_RULE_VERSION = 'gap-rules/0';

type FactObservation = z.infer<typeof recoveryContextOutput>['latest_observations'][number];

/** 아직 묻는 중으로 보는 메시지 상태(답이 오면 회신 · 추출 · 확인으로 넘어간다) */
const OPEN_INQUIRY_STATUSES = ['DRAFTED', 'PENDING_APPROVAL', 'APPROVED', 'QUEUED', 'SENT', 'REPLIED'];

/**
 * 계획 실행 맥락 · 정보 공백(T-103 `get_recovery_context` · `get_information_gaps`) — 읽기 전용, LLM 없음.
 * Agent 에게 표를 보여 주지 않고 판단에 필요한 모양만 돌려준다. 관측(사건)은 **현재 사실이 아니다**(T-093 전).
 */
@Injectable()
export class RecoveryContextService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

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
      .select({ facility_id: facility.facilityId, facility_type: facility.facilityType, facility_name: facility.facilityName })
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
      .select({ messageId: commMessage.messageId, status: commMessage.currentStatus, targetEntityId: questionItem.targetEntityId, targetFactKey: questionItem.targetFactKey })
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
  async informationGaps(recoveryRunId: string): Promise<z.infer<typeof informationGapsOutput>> {
    const run = await this.run(recoveryRunId);
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
            ? { kind: 'FACILITY_CAPACITY', subjectType: 'FACILITY', id: f.facility_id, name: f.facility_name, fact: `capacity.day(${D})`, matches: (k) => k === `capacity.day(${D})`, role: 'WAREHOUSE', owner: null }
            : { kind: 'FACILITY_CAPACITY', subjectType: 'FACILITY', id: f.facility_id, name: f.facility_name, fact: `capacity.*.day(${D})`, matches: (k) => k.startsWith('capacity.') && k.endsWith(`day(${D})`), role: 'ODCY', owner: null },
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
    const observed = await this.allObservations(needs.map((n) => n.id), { isSimulated: run.containsSimulated, scenarioId: run.scenarioId });
    const questions = await this.openQuestions(recoveryRunId);
    const gaps: z.infer<typeof informationGapsOutput>['gaps'] = [];
    const known: z.infer<typeof informationGapsOutput>['known'] = [];
    for (const n of needs) {
      const evidence = observed.find((o) => o.subject_id === n.id && n.matches(o.fact_key));
      if (evidence) {
        known.push({ subject_type: n.subjectType, subject_id: n.id, required_fact: n.fact, evidence });
        continue;
      }
      const asked = questions.filter((q) => q.targetEntityId === n.id && q.targetFactKey !== null && n.matches(q.targetFactKey) && OPEN_INQUIRY_STATUSES.includes(q.status ?? ''));
      gaps.push({
        gap_id: `gap:${sha256Bytes(`${GAP_RULE_VERSION}|${recoveryRunId}|${n.id}|${n.fact}`).slice(7, 23)}`,
        gap_kind: n.kind,
        subject_type: n.subjectType,
        subject_id: n.id,
        subject_name: n.name,
        required_fact: n.fact,
        state: asked.length > 0 ? 'ASKED' : 'MISSING',
        open_question_message_ids: asked.map((q) => q.messageId),
        public_data_can_resolve: false,
        suggested_source: 'PARTNER_INQUIRY',
        suggested_intent: n.kind === 'TRUCK_AVAILABILITY' ? 'TRUCK_SLOT' : 'FACILITY_CAPACITY',
        suggested_counterparty_role: n.role,
        owner_counterparty_id: n.owner,
      });
    }
    return { recovery_run_id: recoveryRunId, plan_date: D, rule_version: GAP_RULE_VERSION, gaps, known };
  }

  /** 공백 판정용: 개체의 모든 관측(사실 키 무관) 중 사실 키별 최신. */
  private async allObservations(subjectIds: string[], sim: { isSimulated: boolean; scenarioId: string | null }) {
    if (subjectIds.length === 0) return [];
    const obs = await this.latestObservations(subjectIds, sim);
    return obs.filter((o) => o.fact_key.startsWith('capacity.') || o.fact_key.startsWith('available.'));
  }
}

