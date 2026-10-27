import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { DraftService } from '../communication/draft.service.js';
import { DATABASE, type Database } from '../db/database.js';
import { facility, planFollowUp, truckPool } from '../db/schema/index.js';
import { RegistryService } from '../registry/registry.service.js';
import { BusinessRuleError, ValidationError } from '../shared/errors/cera-error.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import { type FollowUpAction, type PlanItemLike, requiredFollowUps } from './follow-up.js';
import { RecoveryPlanService } from './recovery-plan.service.js';

export interface FollowUpView {
  action_key: string;
  kind: FollowUpAction['kind'];
  intent: FollowUpAction['intent'];
  target_id: string;
  target_name: string;
  date: string;
  quantity: number;
  window: { from: string; to: string } | null;
  /** 이 조치로 만든 초안(없으면 null). 발송은 초안마다 사람 승인 · 발송 요청 */
  message_id: string | null;
  message_status: string | null;
  /** 초안을 만들 수 없는 이유(예: 연락 가능한 주소 없음) */
  blocked_reason: string | null;
}

/**
 * 승인된 계획 → 후속 문의 초안(T-116). **계획 승인은 실행 지시가 아니고, 이 서비스도 보내지 않는다** — 초안만 만든다.
 * 초안은 기존 경계를 그대로 거친다: Contact Gate · 숫자 검사 · 사람 승인 · 발송 요청 · Worker. 판이 무효 · 교체되면 연결된 초안은
 * 승인 · 발송이 막힌다(`DraftService.inspect` → PLAN_SUPERSEDED). 같은 조치는 한 번만 초안이 된다(plan_follow_up UNIQUE).
 */
@Injectable()
export class PlanFollowUpService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(RecoveryPlanService) private readonly plans: RecoveryPlanService,
    @Inject(DraftService) private readonly drafts: DraftService,
    @Inject(RegistryService) private readonly registry: RegistryService,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(planId: string): Promise<{ plan_id: string; plan_status: string; actions: FollowUpView[]; note: string }> {
    const plan = await this.load(planId);
    const actions = requiredFollowUps(await this.planItems(planId));
    const linked = new Map((await this.db.select().from(planFollowUp).where(eq(planFollowUp.planId, planId))).map((r) => [r.actionKey, r.messageId]));
    const views: FollowUpView[] = [];
    for (const a of actions) {
      const messageId = linked.get(a.action_key) ?? null;
      const status = messageId ? (await this.drafts.get(messageId)).message.status : null;
      views.push({ ...(await this.describe(a)), message_id: messageId, message_status: status, blocked_reason: null });
    }
    return {
      plan_id: planId,
      plan_status: plan.planStatus,
      actions: views,
      note: 'Plan approval is not execution: drafts are created on request and each one needs human approval and a send request.',
    };
  }

  /** 승인된 지금 판의 조치마다 초안(아직 없는 것만). 연락 가능한 주소가 없는 조치는 이유와 함께 건너뛴다. */
  async createDrafts(planId: string, actorId: string): Promise<{ plan_id: string; plan_status: string; actions: FollowUpView[]; note: string }> {
    const plan = await this.load(planId);
    if (plan.planStatus !== 'APPROVED') throw new BusinessRuleError('PLAN_NOT_APPROVED', `Follow-ups come from an approved plan (this one is ${plan.planStatus})`, 409);
    const run = await this.plans.caseRun(plan.caseRunId);
    const actions = requiredFollowUps(await this.planItems(planId));
    const linked = new Set((await this.db.select({ k: planFollowUp.actionKey }).from(planFollowUp).where(eq(planFollowUp.planId, planId))).map((r) => r.k));
    const counterparties = (await this.registry.listCounterparties()).counterparties;
    const blocked = new Map<string, string>();
    for (const a of actions) {
      if (linked.has(a.action_key)) continue;
      const picked = await this.addressFor(a, counterparties, run.containsSimulated);
      if ('blocked' in picked) {
        blocked.set(a.action_key, picked.blocked);
        continue;
      }
      const address = picked.address;
      const values =
        a.intent === 'TRUCK_SLOT'
          ? [
              { key: 'quantity', value_number: a.quantity, unit: 'TRUCK', source_path: `recovery_plan:${planId}` },
              { key: 'date', value_text: a.date },
              { key: 'window_from', value_text: a.window_from },
              { key: 'window_to', value_text: a.window_to },
            ]
          : [
              { key: 'quantity', value_number: a.quantity, unit: 'CONTAINER', source_path: `recovery_plan:${planId}` },
              { key: 'date', value_text: a.date },
            ];
      const followUpId = this.ids.newId();
      try {
        await this.drafts.create(
          { address_id: address, intent: a.intent, target_id: a.kind === 'PARTNER_TRUCKS' ? a.truck_pool_id : a.facility_id, values, source_run_id: plan.caseRunId },
          {
            actorId,
            // 숫자 검사를 통과하면 사람 승인 대기(PENDING_APPROVAL)로 — 승인 · 발송은 사람이 따로 한다
            // 초안과 같은 트랜잭션에 연결 기록 — 초안만 생기고 연결이 빠지는 일이 없다
            inTransaction: async (tx, messageId) => {
              await tx.insert(planFollowUp).values({ followUpId, planId, actionKey: a.action_key, messageId, createdByActorId: actorId, createdAt: this.clock.now().toDb() });
            },
          },
        );
      } catch (error) {
        blocked.set(a.action_key, error instanceof Error && 'code' in error ? String((error as { code: string }).code) : 'DRAFT_FAILED');
      }
    }
    const view = await this.list(planId);
    return { ...view, actions: view.actions.map((v) => ({ ...v, blocked_reason: v.message_id ? null : (blocked.get(v.action_key) ?? null) })) };
  }

  private async planItems(planId: string): Promise<PlanItemLike[]> {
    return (await this.plans.items(planId)).map((i) => ({
      action: i.action,
      targetRef: i.targetRef,
      deliveryDay: i.deliveryDay,
      scheduledDay: i.scheduledAt ? Instant.fromDb(i.scheduledAt).toSeoulIso().slice(0, 10) : null,
      truckRef: i.truckRef,
    }));
  }

  private async load(planId: string) {
    if (!z.string().uuid().safeParse(planId).success) throw new ValidationError('INVALID_ID', 'plan id must be a UUID', ['plan_id']);
    const plan = await this.plans.plan(planId);
    if (!plan) throw new BusinessRuleError('NOT_FOUND', 'No recovery plan with this id', 404);
    return plan;
  }

  /**
   * 받는 사람(운영 준비): 트럭 = 그 풀의 소유 운송사, ODCY = 그 시설의 운영 거래처(등록부 `facility.operator_counterparty_id`).
   * 같은 역할의 다른 회사로 보내지 않는다 — 운영 거래처가 없으면 NO_ELIGIBLE_CONTACT. 실행의 Mock/Real 과 맞는 eligible 주소가
   * 정확히 하나일 때만 고른다. 둘 이상이면 임의로 고르지 않고 CONTACT_SELECTION_REQUIRED(사람이 정한다).
   */
  private async addressFor(a: FollowUpAction, counterparties: Awaited<ReturnType<RegistryService['listCounterparties']>>['counterparties'], simulated: boolean): Promise<{ address: string } | { blocked: 'NO_ELIGIBLE_CONTACT' | 'CONTACT_SELECTION_REQUIRED' }> {
    let owner: string | null = null;
    if (a.kind === 'PARTNER_TRUCKS') {
      const [pool] = await this.db.select({ owner: truckPool.ownerCounterpartyId }).from(truckPool).where(eq(truckPool.truckPoolId, a.truck_pool_id)).limit(1);
      owner = pool?.owner ?? null;
    } else {
      const [f] = await this.db.select({ operator: facility.operatorCounterpartyId }).from(facility).where(eq(facility.facilityId, a.facility_id)).limit(1);
      owner = f?.operator ?? null;
    }
    const party = owner ? counterparties.find((c) => c.counterparty_id === owner && c.is_active) : undefined;
    const eligible = party ? party.contacts.filter((x) => x.is_active).flatMap((p) => p.addresses.filter((addr) => addr.eligible && addr.is_simulated === simulated)) : [];
    if (eligible.length === 0) return { blocked: 'NO_ELIGIBLE_CONTACT' };
    if (eligible.length > 1) return { blocked: 'CONTACT_SELECTION_REQUIRED' };
    return { address: eligible[0]!.address_id };
  }

  private async describe(a: FollowUpAction): Promise<Omit<FollowUpView, 'message_id' | 'message_status' | 'blocked_reason'>> {
    if (a.kind === 'PARTNER_TRUCKS') {
      const [p] = await this.db.select({ name: truckPool.poolName }).from(truckPool).where(eq(truckPool.truckPoolId, a.truck_pool_id)).limit(1);
      return { action_key: a.action_key, kind: a.kind, intent: a.intent, target_id: a.truck_pool_id, target_name: p?.name ?? '', date: a.date, quantity: a.quantity, window: { from: a.window_from, to: a.window_to } };
    }
    const [f] = await this.db.select({ name: facility.facilityName }).from(facility).where(eq(facility.facilityId, a.facility_id)).limit(1);
    return { action_key: a.action_key, kind: a.kind, intent: a.intent, target_id: a.facility_id, target_name: f?.name ?? '', date: a.date, quantity: a.quantity, window: null };
  }
}
