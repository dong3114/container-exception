import { check, foreignKey, index, primaryKey, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { ckIn, cera, n, tstz } from './_common.js';
import { CONTACT_SELECTION_SCOPE, CONTACT_SELECTION_SUBJECT } from './codes.js';
import { actor } from './m01-foundation.js';
import { contactChannelAddress } from './m02-registry.js';
import { agentRun } from './m16-agent.js';
import { recoveryPlan } from './m22-recovery-plan.js';

/**
 * M34 연락처 수동 선택(T-129). 적격 주소가 둘 이상이라 CERA 가 고르지 않은 곳에서 **사람이 이번 한 건의 받는 주소를 정한 기록**이다.
 * 범위는 하나뿐이다 — 기다리는 Agent 실행의 공백 주체 하나(AGENT_RUN) 또는 승인된 계획 판의 후속 조치 하나(PLAN_FOLLOW_UP). 전역 기본값을 바꾸지 않는다.
 * append-only(M35): 다시 고르면 새 행, 가장 최근 행이 그 범위의 선택이다. 선택은 자격을 보장하지 않는다 — 초안 · 승인 · 발송 때 Contact Gate 를 다시 본다.
 */
export const contactSelection = cera.table(
  'contact_selection',
  {
    selectionId: uuid('selection_id').notNull(),
    scopeType: text('scope_type').notNull(),
    agentRunId: uuid('agent_run_id'),
    planId: uuid('plan_id'),
    actionKey: varchar('action_key', { length: 120 }),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    addressId: uuid('address_id').notNull(),
    selectedByActorId: uuid('selected_by_actor_id').notNull(),
    selectedAt: tstz('selected_at').notNull(),
    note: varchar('note', { length: 200 }),
  },
  (t) => [
    primaryKey({ name: n('pk_contact_selection'), columns: [t.selectionId] }),
    foreignKey({ name: n('fk_contact_selection__agent_run_id'), columns: [t.agentRunId], foreignColumns: [agentRun.agentRunId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_contact_selection__plan_id'), columns: [t.planId], foreignColumns: [recoveryPlan.planId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_contact_selection__address_id'), columns: [t.addressId], foreignColumns: [contactChannelAddress.addressId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_contact_selection__selected_by_actor_id'), columns: [t.selectedByActorId], foreignColumns: [actor.actorId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    ckIn('contact_selection', t.scopeType, CONTACT_SELECTION_SCOPE),
    ckIn('contact_selection', t.subjectType, CONTACT_SELECTION_SUBJECT),
    check(
      n('ck_contact_selection__scope'),
      sql`(${t.scopeType} = 'AGENT_RUN' AND ${t.agentRunId} IS NOT NULL AND ${t.planId} IS NULL AND ${t.actionKey} IS NULL) OR (${t.scopeType} = 'PLAN_FOLLOW_UP' AND ${t.planId} IS NOT NULL AND ${t.actionKey} IS NOT NULL AND ${t.agentRunId} IS NULL)`,
    ),
    index(n('ix_contact_selection__agent_run_id__subject_id')).on(t.agentRunId, t.subjectId),
    index(n('ix_contact_selection__plan_id__action_key')).on(t.planId, t.actionKey),
  ],
);
