import type pg from 'pg';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  T0,
  T1,
  T2,
  T3,
  actor,
  approve,
  approvedCopy,
  attempt,
  cref,
  facility,
  hashOf,
  inTx,
  link,
  observation,
  outboundMessage,
  rawInput,
  recoveryRun,
  registry,
  revoke,
  structuredValue,
  thread,
  transition,
} from './fixtures.js';
import { appPool, expectSqlState, ownerPool } from './support.js';

/**
 * Phase B — PostgreSQL 고유 안전장치(M07~M09 트리거 · 부분 유일 · CHECK).
 * 앱 역할(cera_app)로 넣고 바꾼다. 앱 역할에 권한이 없는 경로는 소유 역할로 트리거(B층)만 따로 확인한다.
 */
let app: pg.Pool;
let owner: pg.Pool;

beforeAll(() => {
  app = appPool();
  owner = ownerPool();
});

afterAll(async () => {
  await app.end();
  await owner.end();
});

describe('append-only (B layer: trigger, even for the owner role)', () => {
  it('UPDATE/DELETE on append-only tables are rejected by trigger (CE001) and by privilege for the app (42501)', async () => {
    const humanId = await actor(app, 'HUMAN');
    const auditId = v7();
    await app.query(
      `INSERT INTO cera.audit_log (audit_id, occurred_at, actor_id, action, target_type, target_id, result, is_simulated)
       VALUES ($1, $2, $3, 'TEST_ACTION', 'TEST_TARGET', 'x', 'SUCCESS', false)`,
      [auditId, T0, humanId],
    );
    await expectSqlState(app.query("UPDATE cera.audit_log SET result = 'FAILURE' WHERE audit_id = $1", [auditId]), '42501');
    await expectSqlState(owner.query("UPDATE cera.audit_log SET result = 'FAILURE' WHERE audit_id = $1", [auditId]), 'CE001');
    await expectSqlState(owner.query('DELETE FROM cera.audit_log WHERE audit_id = $1', [auditId]), 'CE001');
  });

  it('controlled tables reject DELETE (CE001) and TRUNCATE is rejected on non-rebuildable tables', async () => {
    const r = await registry(app);
    const t = await thread(app, r);
    await expectSqlState(owner.query('DELETE FROM cera.comm_thread WHERE thread_id = $1', [t.threadId]), 'CE001');
    await expectSqlState(owner.query('TRUNCATE cera.raw_input CASCADE'), 'CE001');
    await expectSqlState(app.query('TRUNCATE cera.raw_input'), '42501');
  });
});

describe('column guards and one-time fill', () => {
  it('comm_message: only current_status · current_approval_id · sent_at may change (CE002)', async () => {
    const r = await registry(app);
    const m = await outboundMessage(app, r, await thread(app, r));
    await expectSqlState(
      app.query('UPDATE cera.comm_message SET content_hash = $2 WHERE message_id = $1', [m.messageId, hashOf('other')]),
      'CE002',
    );
    await expectSqlState(
      app.query('UPDATE cera.comm_message SET message_content_ref = $2 WHERE message_id = $1', [m.messageId, cref('COMM_MESSAGE_CONTENT')]),
      'CE002',
    );
  });

  it('comm_message.sent_at: NULL → value once; any later write (even the same value) is rejected (CE003)', async () => {
    const r = await registry(app);
    const m = await outboundMessage(app, r, await thread(app, r));
    await app.query('UPDATE cera.comm_message SET sent_at = $2 WHERE message_id = $1', [m.messageId, T2]);
    await expectSqlState(app.query('UPDATE cera.comm_message SET sent_at = $2 WHERE message_id = $1', [m.messageId, T3]), 'CE003');
    await expectSqlState(app.query('UPDATE cera.comm_message SET sent_at = $2 WHERE message_id = $1', [m.messageId, T2]), 'CE003');
    await expectSqlState(app.query('UPDATE cera.comm_message SET sent_at = NULL WHERE message_id = $1', [m.messageId]), 'CE003');
  });

  it('comm_thread.external_thread_id: NULL → value once (CE003); unique per channel type (U-5)', async () => {
    const r = await registry(app);
    const t1 = await thread(app, r);
    const t2 = await thread(app, r);
    const ext = `mock-thread-${v7()}`;
    await app.query('UPDATE cera.comm_thread SET external_thread_id = $2 WHERE thread_id = $1', [t1.threadId, ext]);
    await expectSqlState(
      app.query('UPDATE cera.comm_thread SET external_thread_id = $2 WHERE thread_id = $1', [t1.threadId, `${ext}-x`]),
      'CE003',
    );
    await expectSqlState(app.query('UPDATE cera.comm_thread SET external_thread_id = $2 WHERE thread_id = $1', [t2.threadId, ext]), '23505');
    await app.query("UPDATE cera.comm_thread SET thread_status = 'WAITING_REPLY' WHERE thread_id = $1", [t1.threadId]);
  });

  it('question_item: target coordinate is immutable, only question_status changes', async () => {
    const r = await registry(app);
    const t = await thread(app, r);
    const id = v7();
    await app.query(
      `INSERT INTO cera.question_item (question_item_id, thread_id, ask_id, question_type, question_text, expected_value_type, question_status, is_simulated)
       VALUES ($1, $2, 'ask-1', 'CAPACITY', 'How many slots?', 'NUMBER', 'DRAFTED', false)`,
      [id, t.threadId],
    );
    await app.query("UPDATE cera.question_item SET question_status = 'SENT' WHERE question_item_id = $1", [id]);
    await expectSqlState(app.query("UPDATE cera.question_item SET question_text = 'x' WHERE question_item_id = $1", [id]), 'CE002');
  });
});

describe('actor.actor_type is immutable after insert (docs/24 22.2 — the approval guard trusts it)', () => {
  it('the app role cannot turn a SYSTEM or AI actor into HUMAN to bypass the human approval guard (CE002)', async () => {
    const systemId = await actor(app, 'SYSTEM');
    const aiId = await actor(app, 'AI_AGENT');
    await expectSqlState(app.query("UPDATE cera.actor SET actor_type = 'HUMAN' WHERE actor_id = $1", [systemId]), 'CE002');
    await expectSqlState(app.query("UPDATE cera.actor SET actor_type = 'HUMAN' WHERE actor_id = $1", [aiId]), 'CE002');
    const humanId = await actor(app, 'HUMAN');
    await expectSqlState(app.query("UPDATE cera.actor SET actor_type = 'SYSTEM' WHERE actor_id = $1", [humanId]), 'CE002');
    const { rows } = await app.query('SELECT actor_type FROM cera.actor WHERE actor_id = ANY($1) ORDER BY actor_type', [[systemId, aiId, humanId]]);
    expect(rows.map((x) => x.actor_type)).toEqual(['AI_AGENT', 'HUMAN', 'SYSTEM']);
  });

  it('display_name and is_active still change (normal master maintenance)', async () => {
    const id = await actor(app, 'HUMAN');
    await app.query("UPDATE cera.actor SET display_name = 'Renamed operator', is_active = false WHERE actor_id = $1", [id]);
    const { rows } = await app.query('SELECT actor_type, display_name, is_active FROM cera.actor WHERE actor_id = $1', [id]);
    expect(rows).toEqual([{ actor_type: 'HUMAN', display_name: 'Renamed operator', is_active: false }]);
  });
});

describe('plan-based approval (docs/22 15.5 · docs/19 FR-COM-10 · FR-APV-06)', () => {
  const draft = async () => {
    const r = await registry(app);
    const m = await outboundMessage(app, r, await thread(app, r));
    return { r, m };
  };

  it('values without source_run_id only: plan-independent approval commits without approved_plan_run_id', async () => {
    const { r, m } = await draft();
    await structuredValue(app, m.messageId, 'slot_count', 3, null);
    await inTx(app, async (c) => {
      const approvalId = await approve(c, r, m);
      await approvedCopy(c, approvalId, 'slot_count', 3, null);
    });
  });

  it('values from one run: approved_plan_run_id is required (CE005) and must equal that run (CE006)', async () => {
    const { r, m } = await draft();
    const run1 = await recoveryRun(app);
    const run2 = await recoveryRun(app);
    await structuredValue(app, m.messageId, 'teu', 4, run1);
    await expectSqlState(approve(app, r, m), 'CE005');
    await expect(
      inTx(app, async (c) => {
        const approvalId = await approve(c, r, m, { planRunId: run2 });
        await approvedCopy(c, approvalId, 'teu', 4, run1);
      }),
    ).rejects.toMatchObject({ code: 'CE006' });
    await inTx(app, async (c) => {
      const approvalId = await approve(c, r, m, { planRunId: run1 });
      await approvedCopy(c, approvalId, 'teu', 4, run1);
    });
  });

  it('values from two different runs cannot be approved together (CE006)', async () => {
    const { r, m } = await draft();
    const run1 = await recoveryRun(app);
    const run2 = await recoveryRun(app);
    await structuredValue(app, m.messageId, 'teu', 4, run1);
    await structuredValue(app, m.messageId, 'slots', 2, run2);
    for (const planRunId of [run1, run2]) {
      await expect(
        inTx(app, async (c) => {
          const approvalId = await approve(c, r, m, { planRunId });
          await approvedCopy(c, approvalId, 'teu', 4, run1);
          await approvedCopy(c, approvalId, 'slots', 2, run2);
        }),
      ).rejects.toMatchObject({ code: 'CE006' });
    }
  });

  it('a plan value from another run added after the approval (same transaction) is caught at commit (CE006)', async () => {
    const { r, m } = await draft();
    const run1 = await recoveryRun(app);
    const run2 = await recoveryRun(app);
    await structuredValue(app, m.messageId, 'teu', 4, run1);
    await expect(
      inTx(app, async (c) => {
        const approvalId = await approve(c, r, m, { planRunId: run1 });
        await approvedCopy(c, approvalId, 'teu', 4, run1);
        // 값은 DRAFTED 에만 붙는다(M08). 전이 순서는 DB 가 강제하지 않으므로 되돌린 경우에도 커밋 검사가 잡는지 본다.
        await transition(c, m.messageId, 'DRAFTED', r.systemId);
        await structuredValue(c, m.messageId, 'slots', 2, run2);
        await approvedCopy(c, approvalId, 'slots', 2, run2);
      }),
    ).rejects.toMatchObject({ code: 'CE006' });
  });
});

describe('message status transitions and INBOUND / OUTBOUND rules', () => {
  it('a transition row updates the comm_message.current_status cache', async () => {
    const r = await registry(app);
    const m = await outboundMessage(app, r, await thread(app, r));
    await transition(app, m.messageId, 'PENDING_APPROVAL', r.humanId);
    const { rows } = await app.query<{ current_status: string }>('SELECT current_status FROM cera.comm_message WHERE message_id = $1', [
      m.messageId,
    ]);
    expect(rows[0]?.current_status).toBe('PENDING_APPROVAL');
  });

  it('OUTBOUND requires drafted_by and current_status; INBOUND requires both NULL and has no transitions', async () => {
    const r = await registry(app);
    const t = await thread(app, r);
    const insertMessage = (direction: string, draftedBy: string | null, status: string | null) =>
      app.query(
        `INSERT INTO cera.comm_message (message_id, thread_id, direction, message_kind, channel_type, to_address_id, message_content_ref,
           content_hash, current_status, drafted_by, created_at, received_at, is_simulated)
         VALUES ($1, $2, $3, 'BUSINESS', 'MOCK', $4, $5, $6, $7, $8, $9, $9, false)`,
        [v7(), t.threadId, direction, r.addressId, cref('COMM_MESSAGE_CONTENT'), hashOf(v7()), status, draftedBy, T1],
      );
    await expectSqlState(insertMessage('OUTBOUND', null, 'DRAFTED'), '23514');
    await expectSqlState(insertMessage('OUTBOUND', 'TEMPLATE', null), '23514');
    await expectSqlState(insertMessage('INBOUND', 'HUMAN', null), '23514');
    await expectSqlState(insertMessage('INBOUND', null, 'DRAFTED'), '23514');

    const inboundId = v7();
    await app.query(
      `INSERT INTO cera.comm_message (message_id, thread_id, direction, message_kind, channel_type, external_message_id, from_address,
         content_hash, created_at, received_at, is_simulated)
       VALUES ($1, $2, 'INBOUND', 'BUSINESS', 'MOCK', $3, 'reply@example.invalid', $4, $5, $5, false)`,
      [inboundId, t.threadId, `mock-msg-${inboundId}`, hashOf(inboundId), T1],
    );
    await expectSqlState(transition(app, inboundId, 'REPLIED', r.systemId), 'CE005');
  });

  it('a simulated thread can only use the MOCK channel (J.3)', async () => {
    const r = await registry(app);
    const scenarioId = v7();
    await app.query("INSERT INTO cera.scenario (scenario_id, scenario_name, as_of_base, created_at) VALUES ($1, 'sim', $2, $2)", [
      scenarioId,
      T0,
    ]);
    await expectSqlState(
      app.query(
        `INSERT INTO cera.comm_thread (thread_id, channel_type, counterparty_id, purpose, thread_status, opened_at, last_activity_at,
           is_simulated, scenario_id)
         VALUES ($1, 'GMAIL', $2, 'GENERAL', 'OPEN', $3, $3, true, $4)`,
        [v7(), r.counterpartyId, T0, scenarioId],
      ),
      '23514',
    );
  });
});

describe('message approval guards', () => {
  it('an AI or SYSTEM actor cannot approve (CE005)', async () => {
    const r = await registry(app);
    const m = await outboundMessage(app, r, await thread(app, r));
    await expectSqlState(approve(app, r, m, { actorId: await actor(app, 'AI_AGENT') }), 'CE005');
    await expectSqlState(approve(app, r, m, { actorId: r.systemId }), 'CE005');
  });

  it('APPROVED structured value copies must equal the message values at commit (CE006)', async () => {
    const r = await registry(app);
    const m = await outboundMessage(app, r, await thread(app, r));
    await app.query(
      "INSERT INTO cera.comm_message_structured_field (message_id, field_key, value_number, unit) VALUES ($1, 'slot_count', 3, 'COUNT')",
      [m.messageId],
    );
    await expect(
      inTx(app, async (c) => {
        await approve(c, r, m); // 사본 없음
      }),
    ).rejects.toMatchObject({ code: 'CE006' });

    await inTx(app, async (c) => {
      const approvalId = await approve(c, r, m);
      await c.query(
        `INSERT INTO cera.message_approval_structured_field (approval_id, field_key, approved_value_number, approved_unit)
         VALUES ($1, 'slot_count', 3, 'COUNT')`,
        [approvalId],
      );
    });
  });

  it('a structured value added after an APPROVED decision breaks the copies at commit (CE006)', async () => {
    const r = await registry(app);
    const m = await outboundMessage(app, r, await thread(app, r));
    await approve(app, r, m); // 구조화 값 0건 — 사본 0건과 같다
    await expect(
      inTx(app, async (c) => {
        await transition(c, m.messageId, 'DRAFTED', r.systemId); // 되돌린 경우(위 시험과 같은 이유)
        await c.query("INSERT INTO cera.comm_message_structured_field (message_id, field_key, value_text) VALUES ($1, 'late', 'x')", [
          m.messageId,
        ]);
      }),
    ).rejects.toMatchObject({ code: 'CE006' });
  });

  it('current_status cache cannot be updated directly — only through a transition row (CE002)', async () => {
    const r = await registry(app);
    const m = await outboundMessage(app, r, await thread(app, r));
    await expectSqlState(app.query("UPDATE cera.comm_message SET current_status = 'APPROVED' WHERE message_id = $1", [m.messageId]), 'CE002');
    await transition(app, m.messageId, 'PENDING_APPROVAL', r.humanId);
  });

  it('structured fields are added only while the message is DRAFTED', async () => {
    const r = await registry(app);
    const m = await outboundMessage(app, r, await thread(app, r));
    await transition(app, m.messageId, 'PENDING_APPROVAL', r.humanId);
    await expectSqlState(
      app.query("INSERT INTO cera.comm_message_structured_field (message_id, field_key, value_text) VALUES ($1, 'note', 'x')", [m.messageId]),
      'CE005',
    );
  });
});

describe('send_attempt — idempotency, U-6 · U-7 and UNKNOWN reconciliation', () => {
  async function approvedMessage() {
    const r = await registry(app);
    const m = await outboundMessage(app, r, await thread(app, r));
    const approvalId = await approve(app, r, m);
    return { r, m, approvalId };
  }

  it('a BUSINESS attempt needs a valid approval (I-9 · I-3)', async () => {
    const { r, m, approvalId } = await approvedMessage();
    await expectSqlState(attempt(app, m, null, 1), 'CE005');
    await expectSqlState(attempt(app, m, approvalId, 1, { sentContentHash: hashOf('tampered') }), 'CE005');
    await revoke(app, r, m, approvalId);
    await expectSqlState(attempt(app, m, approvalId, 1), 'CE005');
    // 살아 있는 승인은 메시지당 하나(M12) — 취소한 뒤에야 새(만료되는) 승인을 붙일 수 있다
    const expiring = await approve(app, r, m, { expiresAt: T2 });
    await expectSqlState(attempt(app, m, expiring, 1, { startedAt: T2 }), 'CE005');
  });

  it('an approval of other content is refused at the approval itself (M12) — the send guard never sees it (docs/22 15.7.2)', async () => {
    const r = await registry(app);
    const m = await outboundMessage(app, r, await thread(app, r));
    await expectSqlState(approve(app, r, m, { contentHash: hashOf('other content') }), 'CE005');
  });

  it('an attempt starts without a result and attempt_no is previous max + 1', async () => {
    const { m, approvalId } = await approvedMessage();
    await expectSqlState(attempt(app, m, approvalId, 2), 'CE005');
    await expectSqlState(
      app.query(
        `INSERT INTO cera.send_attempt (send_attempt_id, message_id, approval_id, attempt_no, idempotency_key, sent_content_hash, started_at,
           finished_at, result, provider_message_id, is_simulated)
         VALUES ($1, $2, $3, 1, $4, $5, $6, $6, 'SUCCESS', 'p-1', false)`,
        [v7(), m.messageId, approvalId, hashOf(v7()), m.contentHash, T2],
      ),
      'CE005',
    );
  });

  it('UNKNOWN blocks a new attempt (U-7) until reconciliation proves not-sent; then retry and SUCCESS once', async () => {
    const { m, approvalId } = await approvedMessage();
    const first = await attempt(app, m, approvalId, 1);
    await expectSqlState(attempt(app, m, approvalId, 2), '23505'); // 결과 NULL 시도가 있다

    await app.query("UPDATE cera.send_attempt SET result = 'UNKNOWN', finished_at = $2, error_code = 'TIMEOUT' WHERE send_attempt_id = $1", [
      first,
      T3,
    ]);
    await expectSqlState(attempt(app, m, approvalId, 2), '23505'); // UNKNOWN 이 남아 있다

    // 화해 증거 없는 전이는 거부
    await expectSqlState(app.query("UPDATE cera.send_attempt SET result = 'PERMANENT_FAILURE' WHERE send_attempt_id = $1", [first]), 'CE004');
    await expectSqlState(
      app.query("UPDATE cera.send_attempt SET result = 'RETRYABLE_FAILURE', error_code = 'OTHER' WHERE send_attempt_id = $1", [first]),
      'CE004',
    );
    await expectSqlState(
      app.query("UPDATE cera.send_attempt SET result = 'SUCCESS', error_code = NULL WHERE send_attempt_id = $1", [first]),
      'CE004',
    );
    await expectSqlState(
      app.query(
        "UPDATE cera.send_attempt SET result = 'RETRYABLE_FAILURE', error_code = 'RECONCILED_NOT_SENT', finished_at = $2 WHERE send_attempt_id = $1",
        [first, T2],
      ),
      'CE004',
    );

    await app.query(
      "UPDATE cera.send_attempt SET result = 'RETRYABLE_FAILURE', error_code = 'RECONCILED_NOT_SENT' WHERE send_attempt_id = $1",
      [first],
    );
    const second = await attempt(app, m, approvalId, 2, { startedAt: T3 });
    await app.query(
      "UPDATE cera.send_attempt SET result = 'SUCCESS', finished_at = $2, provider_message_id = 'mock-p-1' WHERE send_attempt_id = $1",
      [second, T3],
    );
    await expectSqlState(attempt(app, m, approvalId, 3, { startedAt: T3 }), 'CE005'); // 성공 뒤 새 시도 금지
    await expectSqlState(app.query("UPDATE cera.send_attempt SET result = 'UNKNOWN' WHERE send_attempt_id = $1", [second]), 'CE004');
    await expectSqlState(
      app.query("UPDATE cera.send_attempt SET error_message = 'x' WHERE send_attempt_id = $1", [first]),
      'CE004',
    );
  });

  it('UNKNOWN → SUCCESS with provider_message_id is the other allowed reconciliation', async () => {
    const { m, approvalId } = await approvedMessage();
    const first = await attempt(app, m, approvalId, 1);
    await app.query("UPDATE cera.send_attempt SET result = 'UNKNOWN', finished_at = $2 WHERE send_attempt_id = $1", [first, T3]);
    await app.query("UPDATE cera.send_attempt SET result = 'SUCCESS', provider_message_id = 'mock-found' WHERE send_attempt_id = $1", [first]);
  });

  it('U-6 alone rejects a second SUCCESS for the same message (index checked with triggers disabled by the owner)', async () => {
    const { m, approvalId } = await approvedMessage();
    const first = await attempt(app, m, approvalId, 1);
    await app.query("UPDATE cera.send_attempt SET result = 'RETRYABLE_FAILURE', finished_at = $2, error_code = 'X' WHERE send_attempt_id = $1", [
      first,
      T3,
    ]);
    const second = await attempt(app, m, approvalId, 2, { startedAt: T3 });
    await app.query("UPDATE cera.send_attempt SET result = 'SUCCESS', finished_at = $2, provider_message_id = 'p-2' WHERE send_attempt_id = $1", [
      second,
      T3,
    ]);
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await client.query('ALTER TABLE cera.send_attempt DISABLE TRIGGER USER');
      await expectSqlState(
        client.query("UPDATE cera.send_attempt SET result = 'SUCCESS', error_code = NULL, provider_message_id = 'p-1' WHERE send_attempt_id = $1", [
          first,
        ]),
        '23505',
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});

describe('event links (deferred) and polymorphic guard', () => {
  it('an event needs exactly one SUBJECT link at commit (I-8)', async () => {
    const humanId = await actor(app, 'HUMAN');
    const raw = await rawInput(app, humanId);
    await expect(inTx(app, async (c) => void (await observation(c, raw, humanId)))).rejects.toMatchObject({ code: 'CE006' });

    const facilityId = await facility(app);
    await inTx(app, async (c) => {
      const e = await observation(c, raw, humanId);
      await link(c, e, 'FACILITY', facilityId);
    });
  });

  it('a second SUBJECT is rejected by the partial unique index (U-1)', async () => {
    const humanId = await actor(app, 'HUMAN');
    const raw = await rawInput(app, humanId);
    const f1 = await facility(app);
    const f2 = await facility(app);
    await expect(
      inTx(app, async (c) => {
        const e = await observation(c, raw, humanId);
        await link(c, e, 'FACILITY', f1);
        await link(c, e, 'FACILITY', f2);
      }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('links to unknown or Slice-1-less entity types are rejected (CE005)', async () => {
    const humanId = await actor(app, 'HUMAN');
    const raw = await rawInput(app, humanId);
    await expect(
      inTx(app, async (c) => {
        const e = await observation(c, raw, humanId);
        await link(c, e, 'CONTAINER', v7());
      }),
    ).rejects.toMatchObject({ code: 'CE005' });
    await expect(
      inTx(app, async (c) => {
        const e = await observation(c, raw, humanId);
        await link(c, e, 'FACILITY', v7());
      }),
    ).rejects.toMatchObject({ code: 'CE005' });
  });

  it('a VERIFICATION needs a TARGET at the same coordinate (I-21 · I-26)', async () => {
    const humanId = await actor(app, 'HUMAN');
    const raw = await rawInput(app, humanId);
    const facilityId = await facility(app);
    let observed = '';
    await inTx(app, async (c) => {
      observed = await observation(c, raw, humanId);
      await link(c, observed, 'FACILITY', facilityId);
    });
    const verify = async (c: pg.PoolClient, subject: string, withTarget: boolean) => {
      const id = v7();
      const cmd = await rawInput(c, humanId);
      await c.query(
        `INSERT INTO cera.event (event_id, schema_version, raw_input_id, event_class, event_type, received_at, source_type, extraction_method,
           input_quality, input_confidence_level, entered_by_actor_id, verification_action, verification_method, idempotency_key,
           recorded_at, is_simulated)
         VALUES ($1, 'ev-1', $2, 'VERIFICATION', 'FACT_VERIFIED', $3, 'HUMAN_UI', 'DIRECT', 'STRUCTURED', 'HIGH', $4, 'CONFIRM',
           'DIRECT_REVIEW', $5, $3, false)`,
        [id, cmd, T2, humanId, hashOf(`evk-${id}`)],
      );
      await link(c, id, 'FACILITY', subject);
      if (withTarget) {
        await c.query("INSERT INTO cera.event_verification_target (verification_event_id, target_event_id, target_role) VALUES ($1, $2, 'TARGET')", [
          id,
          observed,
        ]);
      }
    };
    await expect(inTx(app, (c) => verify(c, facilityId, false))).rejects.toMatchObject({ code: 'CE006' });
    const otherFacility = await facility(app);
    await expect(inTx(app, (c) => verify(c, otherFacility, true))).rejects.toMatchObject({ code: 'CE006' });
    await inTx(app, (c) => verify(c, facilityId, true));
  });

  it('verification request handling is recorded by a HUMAN actor only', async () => {
    const systemId = await actor(app, 'SYSTEM');
    await expectSqlState(
      app.query(
        `INSERT INTO cera.verification_request_handling (handling_id, request_key, handling_type, actor_id, handled_at, is_simulated)
         VALUES ($1, $2, 'ACKNOWLEDGED', $3, $4, false)`,
        [v7(), hashOf('vrk'), systemId, T1],
      ),
      'CE005',
    );
  });
});
