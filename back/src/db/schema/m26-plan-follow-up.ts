import { foreignKey, index, primaryKey, text, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { ckIn, cera, n, tstz } from './_common.js';
import { FOLLOW_UP_KIND } from './codes.js';
import { actor } from './m01-foundation.js';
import { commMessage } from './m04-communication.js';
import { recoveryPlan } from './m22-recovery-plan.js';

/**
 * M26 승인된 계획 → 후속 문의(T-116). 계획 판의 조치 하나 = 문의 초안 하나. **승인 ≠ 실행** — 이 행은 초안을 만들었다는 기록일 뿐,
 * 발송은 초안마다 사람 승인 · 발송 요청을 거친다. 판이 무효(OUTDATED) · 교체(SUPERSEDED)되면 연결된 초안은 승인 · 발송이 막힌다.
 * append-only(M27).
 */
export const planFollowUp = cera.table(
  'plan_follow_up',
  {
    followUpId: uuid('follow_up_id').notNull(),
    planId: uuid('plan_id').notNull(),
    actionKey: varchar('action_key', { length: 120 }).notNull(),
    messageId: uuid('message_id').notNull(),
    createdByActorId: uuid('created_by_actor_id').notNull(),
    createdAt: tstz('created_at').notNull(),
    /** T-128(M33): REQUEST = 새 요청 · CORRECTION = 이미 보낸 요청의 정정 · CANCELLATION = 취소 */
    followUpKind: text('follow_up_kind').notNull().default('REQUEST'),
    /** 정정 · 취소가 가리키는 이미 보낸 메시지(그 메시지는 그대로 둔다) */
    refersToMessageId: uuid('refers_to_message_id'),
  },
  (t) => [
    primaryKey({ name: n('pk_plan_follow_up'), columns: [t.followUpId] }),
    foreignKey({ name: n('fk_plan_follow_up__plan_id'), columns: [t.planId], foreignColumns: [recoveryPlan.planId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_plan_follow_up__message_id'), columns: [t.messageId], foreignColumns: [commMessage.messageId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_plan_follow_up__created_by_actor_id'), columns: [t.createdByActorId], foreignColumns: [actor.actorId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_plan_follow_up__refers_to_message_id'), columns: [t.refersToMessageId], foreignColumns: [commMessage.messageId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    ckIn('plan_follow_up', t.followUpKind, FOLLOW_UP_KIND),
    unique(n('uq_plan_follow_up__plan_id__action_key')).on(t.planId, t.actionKey),
    unique(n('uq_plan_follow_up__message_id')).on(t.messageId),
    index(n('ix_plan_follow_up__plan_id')).on(t.planId),
  ],
);
