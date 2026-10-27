import { boolean, check, foreignKey, index, integer, primaryKey, text, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { cera, n, tstz } from './_common.js';
import { actor } from './m01-foundation.js';
import { commMessage } from './m04-communication.js';

/**
 * M28 사람이 요청한 회신 추출 재시도(T-124). 자동 재시도(`CERA_EXTRACTION_MAX_ATTEMPTS`)가 끝났거나 후보 없이 끝난 회신을
 * 운영자가 **한 번 더** 읽게 하는 요청 한 건 = 한 행. 자동 한도를 되돌리지 않는다 — 요청 하나가 시도 하나를 연다.
 * 이전 시도(실패 = `system_error`, 완료 = `audit_log` · `extraction`)는 지우거나 고치지 않는다. append-only(M29).
 * 같은 명령 id(`command_id`)의 재요청은 같은 행으로 모인다(사람 · 명령 id 마다 유일).
 */
export const extractionRetryRequest = cera.table(
  'extraction_retry_request',
  {
    retryRequestId: uuid('retry_request_id').notNull(),
    messageId: uuid('message_id').notNull(),
    commandId: uuid('command_id').notNull(),
    requestedByActorId: uuid('requested_by_actor_id').notNull(),
    requestedAt: tstz('requested_at').notNull(),
    /** 요청 때의 추출 상태(FAILED · NO_CANDIDATE · DONE)와 그때까지의 기술 실패 수 — 나중에 무엇을 보고 다시 시켰는지 */
    priorState: text('prior_state').notNull(),
    priorFailedAttempts: integer('prior_failed_attempts').notNull(),
    note: varchar('note', { length: 200 }),
    isSimulated: boolean('is_simulated').notNull(),
  },
  (t) => [
    primaryKey({ name: n('pk_extraction_retry_request'), columns: [t.retryRequestId] }),
    foreignKey({ name: n('fk_extraction_retry_request__message_id'), columns: [t.messageId], foreignColumns: [commMessage.messageId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({ name: n('fk_extraction_retry_request__requested_by_actor_id'), columns: [t.requestedByActorId], foreignColumns: [actor.actorId] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique(n('uq_extraction_retry_request__requested_by_actor_id__command_id')).on(t.requestedByActorId, t.commandId),
    check(n('ck_extraction_retry_request__prior_state'), sql`${t.priorState} IN ('FAILED', 'NO_CANDIDATE', 'DONE')`),
    check(n('ck_extraction_retry_request__prior_failed_attempts'), sql`${t.priorFailedAttempts} >= 0`),
    check(n('ck_extraction_retry_request__note'), sql`${t.note} IS NULL OR char_length(${t.note}) >= 1`),
    index(n('ix_extraction_retry_request__message_id')).on(t.messageId, t.requestedAt),
  ],
);
