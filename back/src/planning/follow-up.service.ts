import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import { DraftService } from '../communication/draft.service.js';
import { DATABASE, type Database } from '../db/database.js';
import { commMessage, commMessageStructuredField, contactChannelAddress, counterpartyContact, facility, planFollowUp, recoveryPlan, truckPool } from '../db/schema/index.js';
import { RegistryService } from '../registry/registry.service.js';
import { ContactSelectionRepository, selectionView } from '../registry/contact-selection.repository.js';
import type { ContactSelectionDto } from '../registry/dto.js';
import { TransactionRunner } from '../db/transaction.js';
import { AuditRecorder } from '../persistence/audit-recorder.js';
import { AUDIT_ACTION } from '../persistence/catalog.js';
import { BusinessRuleError, ValidationError } from '../shared/errors/cera-error.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import { type FollowUpAction, type FollowUpKind, type FollowUpPlanItem, type PlanItemLike, type SentFollowUp, baseKeyOf, followUpDelta, requiredFollowUps } from './follow-up.js';
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
  /** T-128: REQUEST(새 요청) · CORRECTION(이미 보낸 요청의 정정) · CANCELLATION(취소) */
  follow_up_kind: FollowUpKind;
  /** 이미 보낸 후속과 비교한 결과: ADDED · MODIFIED · REMOVED · CONTACT_CHANGED */
  delta: FollowUpPlanItem['delta'];
  /** 정정 · 취소가 가리키는 이미 보낸 메시지(그 메시지는 바꾸지 않는다) */
  refers_to_message_id: string | null;
  previous_quantity: number | null;
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
    @Inject(ContactSelectionRepository) private readonly selections: ContactSelectionRepository,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(AuditRecorder) private readonly audit: AuditRecorder,
  ) {}

  async list(planId: string): Promise<{ plan_id: string; plan_status: string; actions: FollowUpView[]; unchanged: string[]; note: string }> {
    const plan = await this.load(planId);
    const { items, unchanged } = await this.delta(planId, plan.caseRunId);
    const linked = new Map((await this.db.select().from(planFollowUp).where(eq(planFollowUp.planId, planId))).map((r) => [r.actionKey, r.messageId]));
    const views: FollowUpView[] = [];
    for (const it of items) {
      const messageId = linked.get(it.action_key) ?? null;
      const status = messageId ? (await this.drafts.get(messageId)).message.status : null;
      views.push({ ...(await this.describe(it.action)), action_key: it.action_key, message_id: messageId, message_status: status, blocked_reason: null, follow_up_kind: it.kind, delta: it.delta, refers_to_message_id: it.refers_to_message_id, previous_quantity: it.previous_quantity });
    }
    return {
      plan_id: planId,
      plan_status: plan.planStatus,
      actions: views,
      unchanged,
      note: 'Plan approval is not execution: drafts are created on request and each one needs human approval and a send request. Requests already sent and unchanged are not sent again; changed or removed ones get a correction or cancellation draft to the original recipient.',
    };
  }

  /**
   * 이미 보낸 후속(같은 계획 실행의 다른 판) ↔ 이 판의 조치(T-128). 보낸 메시지는 그대로 두고, 비교는 결정론(`followUpDelta`).
   * 상대 = 시설 운영 거래처 · 풀 소유 운송사(등록부) — 같은 역할의 다른 회사로 대신 보내지 않는다.
   */
  private async delta(planId: string, caseRunId: string): Promise<{ items: FollowUpPlanItem[]; unchanged: string[] }> {
    const next = requiredFollowUps(await this.planItems(planId));
    const rows = await this.db
      .select({ actionKey: planFollowUp.actionKey, kind: planFollowUp.followUpKind, messageId: commMessage.messageId, addressId: commMessage.toAddressId, sentAt: commMessage.sentAt, counterpartyId: counterpartyContact.counterpartyId })
      .from(planFollowUp)
      .innerJoin(recoveryPlan, eq(recoveryPlan.planId, planFollowUp.planId))
      .innerJoin(commMessage, eq(commMessage.messageId, planFollowUp.messageId))
      .innerJoin(contactChannelAddress, eq(contactChannelAddress.addressId, commMessage.toAddressId))
      .innerJoin(counterpartyContact, eq(counterpartyContact.contactId, contactChannelAddress.contactId))
      .where(and(eq(recoveryPlan.caseRunId, caseRunId), ne(planFollowUp.planId, planId), isNotNull(commMessage.sentAt)));
    const sent: SentFollowUp[] = [];
    for (const r of rows) {
      const [q] = await this.db.select({ v: commMessageStructuredField.valueNumber }).from(commMessageStructuredField).where(and(eq(commMessageStructuredField.messageId, r.messageId), eq(commMessageStructuredField.fieldKey, 'quantity'))).limit(1);
      sent.push({ base_key: baseKeyOf(r.actionKey), kind: r.kind as FollowUpKind, message_id: r.messageId, address_id: r.addressId!, counterparty_id: r.counterpartyId, quantity: Number(q?.v ?? 0), sent_at: r.sentAt! });
    }
    const operators = new Map((await this.db.select({ id: facility.facilityId, op: facility.operatorCounterpartyId }).from(facility)).map((f) => [f.id, f.op]));
    const owners = new Map((await this.db.select({ id: truckPool.truckPoolId, op: truckPool.ownerCounterpartyId }).from(truckPool)).map((p) => [p.id, p.op]));
    return followUpDelta(next, sent, (a) => (a.kind === 'PARTNER_TRUCKS' ? (owners.get(a.truck_pool_id) ?? null) : (operators.get(a.facility_id) ?? null)));
  }

  /** 승인된 지금 판의 조치마다 초안(아직 없는 것만). 연락 가능한 주소가 없는 조치는 이유와 함께 건너뛴다. */
  async createDrafts(planId: string, actorId: string): Promise<{ plan_id: string; plan_status: string; actions: FollowUpView[]; unchanged: string[]; note: string }> {
    const plan = await this.load(planId);
    if (plan.planStatus !== 'APPROVED') throw new BusinessRuleError('PLAN_NOT_APPROVED', `Follow-ups come from an approved plan (this one is ${plan.planStatus})`, 409);
    const run = await this.plans.caseRun(plan.caseRunId);
    const { items } = await this.delta(planId, plan.caseRunId);
    const linked = new Set((await this.db.select({ k: planFollowUp.actionKey }).from(planFollowUp).where(eq(planFollowUp.planId, planId))).map((r) => r.k));
    const blocked = new Map<string, string>();
    for (const it of items) {
      const a = { ...it.action, action_key: it.action_key };
      if (linked.has(it.action_key)) continue;
      // 정정 · 취소 = 원래 받은 회사(원래 주소가 아직 쓸 수 있으면 그 주소). 새 요청 = 등록부의 지금 상대. Contact Gate 는 초안 · 승인 · 발송 때 다시 본다
      const picked = await this.recipientFor(planId, it, run.containsSimulated);
      if ('blocked' in picked) {
        blocked.set(it.action_key, picked.blocked);
        continue;
      }
      const address = picked.address;
      const unit = a.intent === 'TRUCK_SLOT' ? 'TRUCK' : 'CONTAINER';
      const notice =
        it.kind === 'REQUEST'
          ? []
          : [{ key: 'notice', value_text: it.kind }, ...(it.previous_quantity !== null ? [{ key: 'previous_quantity', value_number: it.previous_quantity, unit, source_path: `plan_follow_up:${it.refers_to_message_id}` }] : [])];
      const values = [...notice, ...(
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
            ])];
      const followUpId = this.ids.newId();
      try {
        await this.drafts.create(
          { address_id: address, intent: a.intent, target_id: a.kind === 'PARTNER_TRUCKS' ? a.truck_pool_id : a.facility_id, values, source_run_id: plan.caseRunId },
          {
            actorId,
            // 숫자 검사를 통과하면 사람 승인 대기(PENDING_APPROVAL)로 — 승인 · 발송은 사람이 따로 한다
            // 초안과 같은 트랜잭션에 연결 기록 — 초안만 생기고 연결이 빠지는 일이 없다
            inTransaction: async (tx, messageId) => {
              await tx.insert(planFollowUp).values({ followUpId, planId, actionKey: it.action_key, messageId, createdByActorId: actorId, createdAt: this.clock.now().toDb(), followUpKind: it.kind, refersToMessageId: it.refers_to_message_id });
            },
          },
        );
      } catch (error) {
        blocked.set(it.action_key, error instanceof Error && 'code' in error ? String((error as { code: string }).code) : 'DRAFT_FAILED');
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
   * 받는 사람(운영 준비 · T-128 · T-129). 상대 회사: 새 요청 = 그 풀의 소유 운송사 · 그 시설의 운영 거래처(등록부), 정정 · 취소 = 원래 받은 회사.
   * 같은 역할의 다른 회사로 대신 보내지 않는다. 그 회사에서 실행의 Mock/Real 과 맞고 Contact Gate 를 통과하는 주소 중에서:
   * 사람이 이 조치에 고른 주소(아직 쓸 수 있으면) → 정정 · 취소는 원래 주소(아직 쓸 수 있으면) → 정확히 하나면 그 주소.
   * 하나도 없으면 NO_ELIGIBLE_CONTACT(등록 · 승인이 필요), 둘 이상이면 임의로 고르지 않고 CONTACT_SELECTION_REQUIRED(사람이 고른다).
   * 원래 주소가 중지 · 거절됐어도 보낸 메일의 받는 사람 기록은 그대로다 — 새 정정 · 취소만 다른 주소로 간다.
   */
  private async recipientFor(planId: string, it: FollowUpPlanItem, simulated: boolean): Promise<{ address: string } | { blocked: 'NO_ELIGIBLE_CONTACT' | 'CONTACT_SELECTION_REQUIRED' }> {
    const counterpartyId = await this.counterpartyFor(it);
    if (!counterpartyId) return { blocked: 'NO_ELIGIBLE_CONTACT' };
    const usable = await this.registry.usableAddresses(counterpartyId, simulated);
    const chosen = await this.selections.latestForFollowUp(planId, it.action_key);
    if (chosen && usable.includes(chosen.addressId)) return { address: chosen.addressId };
    if (it.to_address_id && usable.includes(it.to_address_id)) return { address: it.to_address_id };
    if (usable.length === 0) return { blocked: 'NO_ELIGIBLE_CONTACT' };
    if (usable.length > 1) return { blocked: 'CONTACT_SELECTION_REQUIRED' };
    return { address: usable[0]! };
  }

  /** 이 조치의 상대 회사 — 정정 · 취소는 원래 받은 주소의 회사, 새 요청은 등록부의 지금 주인(없으면 null) */
  private async counterpartyFor(it: FollowUpPlanItem): Promise<string | null> {
    if (it.to_address_id) {
      const [r] = await this.db
        .select({ cp: counterpartyContact.counterpartyId })
        .from(contactChannelAddress)
        .innerJoin(counterpartyContact, eq(counterpartyContact.contactId, contactChannelAddress.contactId))
        .where(eq(contactChannelAddress.addressId, it.to_address_id))
        .limit(1);
      return r?.cp ?? null;
    }
    const a = it.action;
    if (a.kind === 'PARTNER_TRUCKS') {
      const [pool] = await this.db.select({ owner: truckPool.ownerCounterpartyId }).from(truckPool).where(eq(truckPool.truckPoolId, a.truck_pool_id)).limit(1);
      return pool?.owner ?? null;
    }
    const [f] = await this.db.select({ operator: facility.operatorCounterpartyId }).from(facility).where(eq(facility.facilityId, a.facility_id)).limit(1);
    return f?.operator ?? null;
  }

  /**
   * T-129 사람이 이 판의 후속 조치 하나의 받는 주소를 고른다(그 조치에만 — 전역 기본값 아님). 승인된 판 · 아직 초안이 없는 조치만.
   * Backend 가 다시 판정한다: 그 조치의 상대 회사 소속 · 필요한 역할 · 활성 담당자 · Contact Gate · 실행의 Mock/Real. 고른 뒤 초안 만들기를 다시 부르면 그 주소로 간다.
   */
  async selectContact(planId: string, actorId: string, body: unknown): Promise<ContactSelectionDto> {
    const parsed = z
      .object({ action_key: z.string().min(1).max(120), address_id: z.string().uuid(), note: z.string().trim().min(1).max(200).optional() })
      .strict()
      .safeParse(body ?? {});
    if (!parsed.success) throw new ValidationError('INVALID_SELECTION_REQUEST', 'action_key and address_id (uuid) are required; note is optional (max 200)', parsed.error.issues.map((i) => i.path.join('.')));
    const plan = await this.load(planId);
    if (plan.planStatus !== 'APPROVED') throw new BusinessRuleError('PLAN_NOT_APPROVED', `Follow-ups come from an approved plan (this one is ${plan.planStatus})`, 409);
    const { items } = await this.delta(planId, plan.caseRunId);
    const it = items.find((x) => x.action_key === parsed.data.action_key);
    if (!it) throw new BusinessRuleError('NOT_FOUND', 'This plan has no follow-up action with this key', 404);
    const [linked] = await this.db.select({ id: planFollowUp.followUpId }).from(planFollowUp).where(and(eq(planFollowUp.planId, planId), eq(planFollowUp.actionKey, it.action_key))).limit(1);
    if (linked) throw new BusinessRuleError('FOLLOW_UP_ALREADY_DRAFTED', 'This action already has a draft — reject that draft in the approval flow instead of re-addressing it', 409);
    const counterpartyId = await this.counterpartyFor(it);
    if (!counterpartyId) throw new BusinessRuleError('NO_OWNER_REGISTERED', 'Nobody is registered as the counterparty for this action — register one first', 409);
    const run = await this.plans.caseRun(plan.caseRunId);
    await this.registry.assertSelectable(parsed.data.address_id, { counterpartyId, role: it.action.kind === 'PARTNER_TRUCKS' ? 'TRUCKING' : 'ODCY', simulated: run.containsSimulated });
    const selectionId = this.ids.newId();
    await this.tx.run(async (t) => {
      await this.selections.insert(t, {
        selectionId,
        scopeType: 'PLAN_FOLLOW_UP',
        planId,
        actionKey: it.action_key,
        subjectType: it.action.kind === 'PARTNER_TRUCKS' ? 'TRUCK_POOL' : 'FACILITY',
        subjectId: it.action.kind === 'PARTNER_TRUCKS' ? it.action.truck_pool_id : it.action.facility_id,
        addressId: parsed.data.address_id,
        selectedByActorId: actorId,
        selectedAt: this.clock.now().toDb(),
        note: parsed.data.note ?? null,
      });
      await this.audit.record(t, {
        actorId,
        action: AUDIT_ACTION.CONTACT_SELECTED,
        targetType: 'CONTACT_SELECTION',
        targetId: selectionId,
        afterRef: `plan=${planId};address=${parsed.data.address_id}`,
        result: 'SUCCESS',
        isSimulated: run.containsSimulated,
      });
    });
    return selectionView((await this.selections.find(selectionId))!);
  }

  private async describe(a: FollowUpAction): Promise<Omit<FollowUpView, 'message_id' | 'message_status' | 'blocked_reason' | 'follow_up_kind' | 'delta' | 'refers_to_message_id' | 'previous_quantity'>> {
    if (a.kind === 'PARTNER_TRUCKS') {
      const [p] = await this.db.select({ name: truckPool.poolName }).from(truckPool).where(eq(truckPool.truckPoolId, a.truck_pool_id)).limit(1);
      return { action_key: a.action_key, kind: a.kind, intent: a.intent, target_id: a.truck_pool_id, target_name: p?.name ?? '', date: a.date, quantity: a.quantity, window: { from: a.window_from, to: a.window_to } };
    }
    const [f] = await this.db.select({ name: facility.facilityName }).from(facility).where(eq(facility.facilityId, a.facility_id)).limit(1);
    return { action_key: a.action_key, kind: a.kind, intent: a.intent, target_id: a.facility_id, target_name: f?.name ?? '', date: a.date, quantity: a.quantity, window: null };
  }
}
