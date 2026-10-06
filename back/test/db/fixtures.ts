import type pg from 'pg';
import { v7 } from 'uuid';
import { sha256Bytes } from '../../src/shared/hash/hash.js';

/**
 * 트리거·권한 시험용 최소 fixture. 매번 새 UUIDv7 을 쓰므로 시험끼리 행을 지울 필요가 없다(append-only 표는 지울 수도 없다).
 * 모든 쿼리는 매개변수 바인딩만 쓴다. 기본은 앱 역할(cera_app) 연결로 넣는다 — 실제 권한·트리거를 통과해야 한다.
 */
export const T0 = '2026-10-01T00:00:00.000Z';
export const T1 = '2026-10-01T01:00:00.000Z';
export const T2 = '2026-10-01T02:00:00.000Z';
export const T3 = '2026-10-01T03:00:00.000Z';

export const hashOf = (s: string) => sha256Bytes(s);
export const cref = (category: string) => `cref:v1:${category}:${v7()}`;

type Q = Pick<pg.Pool | pg.PoolClient, 'query'>;

export async function actor(db: Q, actorType: 'HUMAN' | 'SYSTEM' | 'AI_AGENT' = 'HUMAN'): Promise<string> {
  const id = v7();
  await db.query('INSERT INTO cera.actor (actor_id, actor_type, display_name) VALUES ($1, $2, $3)', [id, actorType, `test ${actorType}`]);
  return id;
}

export interface Registry {
  humanId: string;
  systemId: string;
  counterpartyId: string;
  contactId: string;
  addressId: string;
}

export async function registry(db: Q): Promise<Registry> {
  const humanId = await actor(db, 'HUMAN');
  const systemId = await actor(db, 'SYSTEM');
  const counterpartyId = v7();
  const contactId = v7();
  const addressId = v7();
  await db.query("INSERT INTO cera.counterparty (counterparty_id, display_name, source_role) VALUES ($1, 'Test Trucking', 'TRUCKING')", [
    counterpartyId,
  ]);
  await db.query("INSERT INTO cera.counterparty_contact (contact_id, counterparty_id, person_name) VALUES ($1, $2, 'Dispatcher')", [
    contactId,
    counterpartyId,
  ]);
  await db.query(
    `INSERT INTO cera.contact_channel_address (address_id, contact_id, channel_type, normalized_address,
       email_verification_status, relationship_status, communication_status, verified_at, approved_by_actor_id, approved_at)
     VALUES ($1, $2, 'MOCK', $3, 'VERIFIED', 'APPROVED', 'ACTIVE', $4, $5, $4)`,
    [addressId, contactId, `dispatch-${addressId}@example.invalid`, T0, humanId],
  );
  return { humanId, systemId, counterpartyId, contactId, addressId };
}

export interface Thread {
  threadId: string;
}

export async function thread(db: Q, r: Registry): Promise<Thread> {
  const threadId = v7();
  await db.query(
    `INSERT INTO cera.comm_thread (thread_id, channel_type, counterparty_id, contact_id, purpose, thread_status,
       opened_at, last_activity_at, is_simulated)
     VALUES ($1, 'MOCK', $2, $3, 'CAPACITY_CHECK', 'OPEN', $4, $4, false)`,
    [threadId, r.counterpartyId, r.contactId, T0],
  );
  return { threadId };
}

export interface OutboundMessage {
  messageId: string;
  contentHash: string;
  contentRef: string;
}

/** OUTBOUND · BUSINESS · DRAFTED 메시지 + DRAFTED 전이. */
export async function outboundMessage(db: Q, r: Registry, t: Thread): Promise<OutboundMessage> {
  const messageId = v7();
  const contentHash = hashOf(`content-${messageId}`);
  const contentRef = cref('COMM_MESSAGE_CONTENT');
  await db.query(
    `INSERT INTO cera.comm_message (message_id, thread_id, direction, message_kind, channel_type, to_address_id,
       message_content_ref, content_hash, current_status, drafted_by, created_at, is_simulated)
     VALUES ($1, $2, 'OUTBOUND', 'BUSINESS', 'MOCK', $3, $4, $5, 'DRAFTED', 'TEMPLATE', $6, false)`,
    [messageId, t.threadId, r.addressId, contentRef, contentHash, T0],
  );
  await transition(db, messageId, 'DRAFTED', r.systemId);
  return { messageId, contentHash, contentRef };
}

export async function transition(db: Q, messageId: string, status: string, actorId: string | null, sendAttemptId: string | null = null) {
  await db.query(
    `INSERT INTO cera.message_status_transition (transition_id, message_id, status, occurred_at, actor_id, send_attempt_id, is_simulated)
     VALUES ($1, $2, $3, $4, $5, $6, false)`,
    [v7(), messageId, status, T1, actorId, sendAttemptId],
  );
}

export async function approve(
  db: Q,
  r: Registry,
  m: OutboundMessage,
  options: { actorId?: string; expiresAt?: string | null; contentHash?: string; planRunId?: string | null } = {},
): Promise<string> {
  const approvalId = v7();
  await db.query(
    `INSERT INTO cera.message_approval (approval_id, message_id, decision, actor_id, decided_at, expires_at,
       approved_content_ref, approved_content_hash, approved_to_address_id, approved_plan_run_id)
     VALUES ($1, $2, 'APPROVED', $3, $4, $5, $6, $7, $8, $9)`,
    [
      approvalId,
      m.messageId,
      options.actorId ?? r.humanId,
      T1,
      options.expiresAt ?? null,
      cref('MESSAGE_APPROVAL_CONTENT'),
      options.contentHash ?? m.contentHash,
      r.addressId,
      options.planRunId ?? null,
    ],
  );
  return approvalId;
}

/** 계획 실행 하나(스냅숏 포함). 숫자의 출처 실행(`source_run_id`)으로 쓴다. */
export async function recoveryRun(db: Q): Promise<string> {
  const snapshotId = v7();
  const runId = v7();
  await db.query(
    `INSERT INTO cera.planning_snapshot (snapshot_id, as_of, fact_fingerprint, rule_version, tariff_version, policy_version,
       contains_simulated, created_at)
     VALUES ($1, $2, $3, 'r1', 't1', 'p1', false, $2)`,
    [snapshotId, T0, hashOf(`snap-${snapshotId}`)],
  );
  await db.query(
    `INSERT INTO cera.recovery_run (run_id, snapshot_id, trigger_type, objective_version, run_status, contains_simulated, executed_at)
     VALUES ($1, $2, 'OPERATOR_REQUEST', 'o1', 'FEASIBLE', false, $3)`,
    [runId, snapshotId, T0],
  );
  return runId;
}

/** 메시지 구조화 값 하나(+ 출처 실행). */
export async function structuredValue(db: Q, messageId: string, fieldKey: string, value: number, sourceRunId: string | null) {
  await db.query(
    "INSERT INTO cera.comm_message_structured_field (message_id, field_key, value_number, unit, source_run_id) VALUES ($1, $2, $3, 'TEU', $4)",
    [messageId, fieldKey, value, sourceRunId],
  );
}

/** 승인 시점 구조화 값 사본 하나(메시지 값과 같게). */
export async function approvedCopy(db: Q, approvalId: string, fieldKey: string, value: number, sourceRunId: string | null) {
  await db.query(
    `INSERT INTO cera.message_approval_structured_field (approval_id, field_key, approved_value_number, approved_unit, approved_source_run_id)
     VALUES ($1, $2, $3, 'TEU', $4)`,
    [approvalId, fieldKey, value, sourceRunId],
  );
}

export async function revoke(db: Q, r: Registry, m: OutboundMessage, approvalId: string): Promise<void> {
  await db.query(
    `INSERT INTO cera.message_approval (approval_id, message_id, decision, invalidates_approval_id, invalidation_cause, actor_id, decided_at)
     VALUES ($1, $2, 'REVOKED', $3, 'USER_REVOKED', $4, $5)`,
    [v7(), m.messageId, approvalId, r.humanId, T2],
  );
}

export async function attempt(
  db: Q,
  m: OutboundMessage,
  approvalId: string | null,
  attemptNo: number,
  options: { startedAt?: string; sentContentHash?: string } = {},
): Promise<string> {
  const id = v7();
  await db.query(
    `INSERT INTO cera.send_attempt (send_attempt_id, message_id, approval_id, attempt_no, idempotency_key, sent_content_hash,
       started_at, is_simulated)
     VALUES ($1, $2, $3, $4, $5, $6, $7, false)`,
    [id, m.messageId, approvalId, attemptNo, hashOf(`sak-${m.messageId}-${attemptNo}`), options.sentContentHash ?? m.contentHash, options.startedAt ?? T2],
  );
  return id;
}

export async function rawInput(db: Q, actorId: string | null = null): Promise<string> {
  const id = v7();
  await db.query(
    `INSERT INTO cera.raw_input (raw_input_id, source_type, source_name, payload_ref, payload_hash, source_record_key, received_at,
       collected_by_actor_id, is_simulated)
     VALUES ($1, 'HUMAN_UI', 'cera-ui', $2, $3, $4, $5, $6, false)`,
    [id, cref('RAW_INPUT_PAYLOAD'), hashOf(`raw-${id}`), id, T1, actorId],
  );
  return id;
}

export async function facility(db: Q): Promise<string> {
  const id = v7();
  await db.query("INSERT INTO cera.facility (facility_id, facility_type, facility_name) VALUES ($1, 'WAREHOUSE', 'Test WH')", [id]);
  return id;
}

/** OBSERVATION 사건(링크 없이). 링크는 호출자가 같은 트랜잭션에서 넣는다(커밋 시 I-8 검사). */
export async function observation(db: Q, rawInputId: string, actorId: string, factKey = 'warehouse.capacity_teu'): Promise<string> {
  const id = v7();
  await db.query(
    `INSERT INTO cera.event (event_id, schema_version, raw_input_id, event_class, event_type, fact_kind, fact_key, value_number,
       value_unit, received_at, source_type, extraction_method, input_quality, input_confidence_level, entered_by_actor_id,
       idempotency_key, recorded_at, is_simulated)
     VALUES ($1, 'ev-1', $2, 'OBSERVATION', 'CAPACITY_REPORTED', 'STATE', $3, 120, 'TEU', $4, 'HUMAN_UI', 'DIRECT',
       'STRUCTURED', 'HIGH', $5, $6, $4, false)`,
    [id, rawInputId, factKey, T1, actorId, hashOf(`evk-${id}`)],
  );
  return id;
}

export async function link(db: Q, eventId: string, entityType: string, entityId: string, role: 'SUBJECT' | 'CONTEXT' = 'SUBJECT') {
  await db.query('INSERT INTO cera.event_entity_link (event_id, entity_type, entity_id, link_role) VALUES ($1, $2, $3, $4)', [
    eventId,
    entityType,
    entityId,
    role,
  ]);
}

/** 한 트랜잭션으로 실행하고 커밋까지 한다(지연 트리거는 커밋 때 돈다). */
export async function inTx(pool: pg.Pool, work: (c: pg.PoolClient) => Promise<void>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await work(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
