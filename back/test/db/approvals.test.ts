import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import request from 'supertest';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/app/create-api.js';
import { messageContentHash } from '../../src/communication/message-content.js';
import { PlanSupersessionService } from '../../src/communication/plan-supersession.service.js';
import { TransactionRunner } from '../../src/db/transaction.js';
import { T0, attempt, hashOf, registry, type Registry } from './fixtures.js';
import { appPool, expectSqlState, testEnv } from './support.js';

/**
 * T-089 U4 — 발송 승인 · 반려 · 승인 취소 · 무효화를 실제 PostgreSQL · 앱 역할 · HTTP 로.
 * API 인스턴스를 둘 띄운다 — 상태가 PostgreSQL 에만 있으면 어느 인스턴스로 가도 같은 결과여야 한다(LB 대비).
 */
const contentDir = mkdtempSync(join(tmpdir(), 'cera-approvals-'));
let api: INestApplication;
let api2: INestApplication;
let app: pg.Pool;
let http: ReturnType<typeof request>;
let http2: ReturnType<typeof request>;
const ACTOR = 'X-CERA-Actor-Id';

beforeAll(async () => {
  api = await createApiApp(testEnv({ CERA_CONTENT_DIR: contentDir }));
  api2 = await createApiApp(testEnv({ CERA_CONTENT_DIR: contentDir }));
  await api.init();
  await api2.init();
  app = appPool();
  http = request(api.getHttpServer());
  http2 = request(api2.getHttpServer());
});

afterAll(async () => {
  await api.close();
  await api2.close();
  await app.end();
  rmSync(contentDir, { recursive: true, force: true });
});

interface World extends Registry {
  runId: string;
  truckPoolId: string;
}

async function world(): Promise<World> {
  const r = await registry(app);
  const scenarioId = v7();
  const snapshotId = v7();
  const runId = v7();
  const truckPoolId = v7();
  await app.query("INSERT INTO cera.scenario (scenario_id, scenario_name, as_of_base, created_at) VALUES ($1, 'approval scenario', $2, $2)", [scenarioId, T0]);
  await app.query(
    `INSERT INTO cera.planning_snapshot (snapshot_id, as_of, fact_fingerprint, rule_version, tariff_version, policy_version, contains_simulated, created_at, scenario_id)
     VALUES ($1, $2, $3, 'r1', 't1', 'p1', true, $2, $4)`,
    [snapshotId, T0, hashOf(`snap-${snapshotId}`), scenarioId],
  );
  await app.query(
    `INSERT INTO cera.recovery_run (run_id, snapshot_id, trigger_type, trigger_ref, objective_version, run_status, contains_simulated, executed_at)
     VALUES ($1, $2, 'EXCEPTION_DETECTED', 'RP-APV', 'o1', 'FEASIBLE', true, $3)`,
    [runId, snapshotId, T0],
  );
  await app.query("INSERT INTO cera.truck_pool (truck_pool_id, pool_name, ownership, owner_counterparty_id) VALUES ($1, 'Test 셔틀', 'PARTNER', $2)", [
    truckPoolId,
    r.counterpartyId,
  ]);
  return { ...r, runId, truckPoolId };
}

const truckValues = [
  { key: 'quantity', value_number: 2, unit: 'TRUCK', source_path: 'resource_gaps[0].needed' },
  { key: 'date', value_text: '2026-10-13', source_path: 'as_of.date' },
  { key: 'window_from', value_text: '15:00', source_path: 'resource_gaps[0].window.from' },
  { key: 'window_to', value_text: '17:00', source_path: 'resource_gaps[0].window.to' },
];

async function draft(w: World) {
  const res = await http
    .post('/communication/drafts')
    .send({ address_id: w.addressId, intent: 'TRUCK_SLOT', target_id: w.truckPoolId, source_run_id: w.runId, values: truckValues })
    .expect(201);
  return res.body;
}

const approve = (w: World, d: { message: { message_id: string; content_hash: string } }, client = http) =>
  client.post(`/communication/drafts/${d.message.message_id}/approve`).set(ACTOR, w.humanId).send({ content_hash: d.message.content_hash });

const approvalRows = async (messageId: string) =>
  (
    await app.query(
      `SELECT approval_id, decision, invalidation_cause, invalidates_approval_id, actor_id, approved_content_hash, approved_plan_run_id,
              approved_to_address_id, approved_content_ref, decided_at, expires_at
         FROM cera.message_approval WHERE message_id = $1 ORDER BY decided_at, approval_id`,
      [messageId],
    )
  ).rows;

const statuses = async (messageId: string) =>
  (await app.query('SELECT status FROM cera.message_status_transition WHERE message_id = $1 ORDER BY occurred_at, transition_id', [messageId])).rows.map(
    (r) => r.status,
  );

/** API 로 만든 메시지(MOCK · 가상)에 대한 발송 시도 — 지금 시각으로. 발송 가드(M08 I-9)가 판정한다. */
const sendWith = (d: { message: { message_id: string; content_hash: string } }, approvalId: string) =>
  attempt(app, { messageId: d.message.message_id, contentHash: d.message.content_hash, contentRef: '' }, approvalId, 1, {
    startedAt: new Date().toISOString(),
    isSimulated: true,
  });

/** 응답의 승인 사본으로 msg-content/1 을 다시 계산한다(정본 함수 그대로). */
function recomputeSnapshotHash(snapshot: {
  approved_to_address_id: string;
  subject: string;
  body: string;
  structured_values: { key: string; value_text: string | null; value_number: string | null; unit: string | null }[];
}) {
  return messageContentHash({
    toAddressId: snapshot.approved_to_address_id,
    text: { subject: snapshot.subject, bodyText: snapshot.body },
    fields: snapshot.structured_values.map((v) => ({ fieldKey: v.key, valueText: v.value_text, valueNumber: v.value_number, unit: v.unit })),
  });
}

describe('approve — the exact reviewed content is frozen', () => {
  it('approves a validated draft and freezes subject · body · hash · structured values · plan run · approver · time', async () => {
    const w = await world();
    const d = await draft(w);
    expect(d.approval).toMatchObject({ state: 'NONE', usable_for_send: false, current: null, history: [] });
    expect(d.approval_ready).toBe(true);

    const before = Date.now();
    const res = await approve(w, d).expect(200);
    const a = res.body;
    expect(a.message.status).toBe('APPROVED');
    expect(a.approval).toMatchObject({ state: 'ACTIVE', usable_for_send: true, ended_by: null });
    const snap = a.approval.current;
    expect(snap).toMatchObject({
      state: 'ACTIVE',
      approver_actor_id: w.humanId,
      approver_name: 'test HUMAN',
      approved_content_hash: d.message.content_hash,
      approved_to_address_id: w.addressId,
      approved_plan_run_id: w.runId,
      subject: d.message.subject,
      body: d.message.body,
      copy_verified: true,
    });
    expect(snap.structured_values).toEqual(d.structured_values);
    // content_hash 일치: 사본으로 다시 계산한 msg-content/1 = 승인 지문 = 메시지 지문
    expect(recomputeSnapshotHash(snap)).toBe(d.message.content_hash);
    // 기본 유효 기한 24시간
    const decided = Date.parse(snap.decided_at);
    expect(decided).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(snap.expires_at) - decided).toBe(24 * 60 * 60 * 1000);
    expect(a.approval_ready).toBe(false);
    expect(a.blocked_reasons).toEqual(['ALREADY_APPROVED']);

    // DB: 승인 행 1 · 사본 4 · 전이 · 편의 포인터 · 감사
    const rows = await approvalRows(d.message.message_id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ decision: 'APPROVED', actor_id: w.humanId, approved_plan_run_id: w.runId, approved_to_address_id: w.addressId });
    expect(rows[0].approved_content_ref).toMatch(/^cref:v1:MESSAGE_APPROVAL_CONTENT:/);
    const copies = await app.query(
      `SELECT c.field_key, c.approved_source_run_id, c.approved_source_path FROM cera.message_approval_structured_field c
        WHERE c.approval_id = $1 ORDER BY c.field_key`,
      [rows[0].approval_id],
    );
    expect(copies.rows.map((c) => c.field_key)).toEqual(['date', 'quantity', 'window_from', 'window_to']);
    // source_run_id = approved_plan_run_id
    expect(new Set(copies.rows.map((c) => c.approved_source_run_id))).toEqual(new Set([w.runId]));
    expect(await statuses(d.message.message_id)).toEqual(['DRAFTED', 'PENDING_APPROVAL', 'APPROVED']);
    const msg = await app.query('SELECT current_approval_id FROM cera.comm_message WHERE message_id = $1', [d.message.message_id]);
    expect(msg.rows[0].current_approval_id).toBe(rows[0].approval_id);
    const audit = await app.query("SELECT actor_id, result FROM cera.audit_log WHERE action = 'MESSAGE_APPROVED' AND target_id = $1", [rows[0].approval_id]);
    expect(audit.rows).toEqual([{ actor_id: w.humanId, result: 'SUCCESS' }]);
  });

  it('the same approval request twice → one approval (FR-APV-10)', async () => {
    const w = await world();
    const d = await draft(w);
    const first = await approve(w, d).expect(200);
    const second = await approve(w, d).expect(200);
    expect(second.body.approval.current.approval_id).toBe(first.body.approval.current.approval_id);
    expect((await approvalRows(d.message.message_id)).filter((r) => r.decision === 'APPROVED')).toHaveLength(1);
  });

  it('two approval requests at the same time on two API instances → exactly one approval', async () => {
    const w = await world();
    for (let round = 0; round < 4; round += 1) {
      const d = await draft(w);
      const [a, b] = await Promise.all([approve(w, d, http), approve(w, d, http2)]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(a.body.approval.current.approval_id).toBe(b.body.approval.current.approval_id);
      expect((await approvalRows(d.message.message_id)).filter((r) => r.decision === 'APPROVED')).toHaveLength(1);
      expect((await statuses(d.message.message_id)).filter((s) => s === 'APPROVED')).toHaveLength(1);
    }
  });

  it('the approver is a checked header: missing → 400, a SYSTEM actor → 403; the body cannot claim approval', async () => {
    const w = await world();
    const d = await draft(w);
    const path = `/communication/drafts/${d.message.message_id}/approve`;
    expect((await http.post(path).send({ content_hash: d.message.content_hash }).expect(400)).body.code).toBe('ACTOR_REQUIRED');
    expect((await http.post(path).set(ACTOR, w.systemId).send({ content_hash: d.message.content_hash }).expect(403)).body.code).toBe('ACTOR_NOT_ALLOWED');
    expect((await http.post(path).set(ACTOR, w.humanId).send({ content_hash: d.message.content_hash, approved: true }).expect(400)).body.code).toBe(
      'INVALID_DRAFT_REQUEST',
    );
    expect(await approvalRows(d.message.message_id)).toEqual([]);
  });
});

describe('approve — re-validation right before approval', () => {
  it('Contact Gate failure → 403 RECIPIENT_NOT_ELIGIBLE, nothing recorded', async () => {
    const w = await world();
    const d = await draft(w);
    await app.query("UPDATE cera.contact_channel_address SET communication_status = 'PAUSED' WHERE address_id = $1", [w.addressId]);
    const res = await approve(w, d).expect(403);
    expect(res.body.code).toBe('RECIPIENT_NOT_ELIGIBLE');
    expect(await approvalRows(d.message.message_id)).toEqual([]);
    const view = await http.get(`/communication/drafts/${d.message.message_id}`).expect(200);
    expect(view.body.blocked_reasons).toContain('RECIPIENT_NOT_ELIGIBLE');
  });

  it('number check failure → 422 NUMBER_CHECK_FAILED (a revised text with a number outside the values)', async () => {
    const w = await world();
    const d = await draft(w);
    const bad = await http
      .post(`/communication/drafts/${d.message.message_id}/revisions`)
      .send({ subject: d.message.subject, body: `${d.message.body}\n트럭 3대도 가능할까요?` })
      .expect(201);
    expect(bad.body.message.status).toBe('DRAFTED');
    expect(bad.body.blocked_reasons).toContain('BLOCKED_NUMBER_CHECK');
    expect((await approve(w, bad.body).expect(422)).body.code).toBe('NUMBER_CHECK_FAILED');
    expect(await approvalRows(bad.body.message.message_id)).toEqual([]);
  });

  it('the number check is recomputed at approval: a registry rename that exposes a digit blocks a PENDING draft', async () => {
    const w = await world();
    await app.query("UPDATE cera.counterparty SET display_name = 'Test Trucking 7' WHERE counterparty_id = $1", [w.counterpartyId]);
    const d = await draft(w);
    expect(d.message.status).toBe('PENDING_APPROVAL');
    // 인사말의 거래처 이름 안 7 은 고정 문구라 검사에서 빠졌다. 이름이 바뀌면 본문의 7 은 구조화 값에 없는 숫자다.
    await app.query("UPDATE cera.counterparty SET display_name = 'Test Trucking' WHERE counterparty_id = $1", [w.counterpartyId]);
    expect((await approve(w, d).expect(422)).body.code).toBe('NUMBER_CHECK_FAILED');
  });

  it('an old revision cannot be approved (MESSAGE_SUPERSEDED) and a stale content hash is refused (CONTENT_CHANGED)', async () => {
    const w = await world();
    const d = await draft(w);
    const stale = await approve(w, { message: { ...d.message, content_hash: hashOf('what the operator saw earlier') } }).expect(409);
    expect(stale.body.code).toBe('CONTENT_CHANGED');
    const revised = await http
      .post(`/communication/drafts/${d.message.message_id}/revisions`)
      .send({ subject: d.message.subject, body: `${d.message.body}\n감사합니다.` })
      .expect(201);
    expect((await approve(w, d).expect(409)).body.code).toBe('MESSAGE_SUPERSEDED');
    const old = await http.get(`/communication/drafts/${d.message.message_id}`).expect(200);
    expect(old.body.message.status).toBe('CLOSED');
    expect(old.body.revision.next_message_id).toBe(revised.body.message.message_id);
    expect(old.body.blocked_reasons).toContain('MESSAGE_SUPERSEDED');
    await approve(w, revised.body).expect(200);
  });
});

describe('change after approval → the old approval can no longer be used', () => {
  it('body edited after approval: old approval INVALIDATED(CONTENT_CHANGED), new revision needs approval, old approval cannot send', async () => {
    const w = await world();
    const d = await draft(w);
    const approved = await approve(w, d).expect(200);
    const oldApprovalId = approved.body.approval.current.approval_id;

    const revised = await http
      .post(`/communication/drafts/${d.message.message_id}/revisions`)
      .send({ subject: d.message.subject, body: `${d.message.body}\n회신 부탁드립니다.` })
      .expect(201);
    const n = revised.body;
    expect(n.message.status).toBe('PENDING_APPROVAL');
    expect(n.message.content_hash).not.toBe(d.message.content_hash);
    expect(n.approval.state).toBe('NONE');
    expect(n.revision).toEqual({ previous_message_id: d.message.message_id, next_message_id: null, previous_approval_invalidated: 'CONTENT_CHANGED' });

    const old = (await http.get(`/communication/drafts/${d.message.message_id}`).expect(200)).body;
    expect(old.message.status).toBe('CLOSED');
    expect(old.approval).toMatchObject({ state: 'INVALIDATED', usable_for_send: false });
    expect(old.approval.ended_by).toMatchObject({ decision: 'INVALIDATED', invalidation_cause: 'CONTENT_CHANGED', invalidates_approval_id: oldApprovalId, actor_type: 'SYSTEM' });
    const msg = await app.query('SELECT current_approval_id FROM cera.comm_message WHERE message_id = $1', [d.message.message_id]);
    expect(msg.rows[0].current_approval_id).toBeNull();

    // 발송 가드(I-9): 옛 승인으로는 옛 메시지도 새 메시지도 보낼 수 없다
    await expectSqlState(sendWith(d, oldApprovalId), 'CE005');
    await expectSqlState(sendWith(n, oldApprovalId), 'CE005');

    const re = await approve(w, n).expect(200);
    expect(re.body.approval).toMatchObject({ state: 'ACTIVE', usable_for_send: true });
    expect(re.body.approval.current.approved_content_hash).toBe(n.message.content_hash);
  });

  it('structured value changed after approval: old approval invalidated, the changed value loses its plan source, re-approval freezes the new value', async () => {
    const w = await world();
    const d = await draft(w);
    await approve(w, d).expect(200);
    const values = d.structured_values.map((v: { key: string; value_number: string | null; value_text: string | null; unit: string | null }) => ({
      key: v.key,
      value_number: v.key === 'quantity' ? 3 : v.value_number === null ? null : Number(v.value_number),
      value_text: v.value_text,
      unit: v.unit,
    }));

    // 값만 바꾸고 본문을 그대로 두면 본문의 "2대"가 구조화 값 밖이다 → 승인 대기에 오르지 못한다
    const mismatch = await http
      .post(`/communication/drafts/${d.message.message_id}/revisions`)
      .send({ subject: d.message.subject, body: d.message.body, values })
      .expect(201);
    expect(mismatch.body.message.status).toBe('DRAFTED');
    expect(mismatch.body.blocked_reasons).toContain('BLOCKED_NUMBER_CHECK');
    const old = (await http.get(`/communication/drafts/${d.message.message_id}`).expect(200)).body;
    expect(old.approval).toMatchObject({ state: 'INVALIDATED', usable_for_send: false });

    const fixed = await http
      .post(`/communication/drafts/${mismatch.body.message.message_id}/revisions`)
      .send({ subject: d.message.subject.replace('2대', '3대'), body: d.message.body.replace('2대', '3대'), values })
      .expect(201);
    const f = fixed.body;
    expect(f.message.status).toBe('PENDING_APPROVAL');
    const quantity = f.structured_values.find((v: { key: string }) => v.key === 'quantity');
    expect(quantity).toEqual({ key: 'quantity', value_number: '3', value_text: null, unit: 'TRUCK', source_run_id: null, source_path: null });
    expect(f.structured_values.find((v: { key: string }) => v.key === 'date').source_run_id).toBe(w.runId);

    const re = (await approve(w, f).expect(200)).body;
    expect(re.approval.current.structured_values.find((v: { key: string }) => v.key === 'quantity').value_number).toBe('3');
    expect(re.approval.current.approved_plan_run_id).toBe(w.runId);
    expect(recomputeSnapshotHash(re.approval.current)).toBe(f.message.content_hash);
  });

  it('values that define the question (date · window) cannot be revised — 422 QUESTION_TARGET_CHANGED', async () => {
    const w = await world();
    const d = await draft(w);
    const values = truckValues.map(({ source_path: _s, ...v }) => (v.key === 'date' ? { ...v, value_text: '2026-10-14' } : v));
    const res = await http.post(`/communication/drafts/${d.message.message_id}/revisions`).send({ subject: d.message.subject, body: d.message.body, values }).expect(422);
    expect(res.body.code).toBe('QUESTION_TARGET_CHANGED');
  });

  it('plan replaced after approval: new run invalidates the unsent approval (PLAN_SUPERSEDED); re-approval and other drafts of the old run are refused', async () => {
    const w = await world();
    const d = await draft(w);
    const pending = await draft(w);
    const approved = (await approve(w, d).expect(200)).body;

    const newRunId = v7();
    const tx = api.get(TransactionRunner);
    // 새 실행 등록(같은 스냅샷 · previous_run_id = 옛 실행)과 무효화가 한 트랜잭션(T-069 12절 T3)
    const invalidated = await tx.run(async (t) => {
      await t.execute(
        sql`INSERT INTO cera.recovery_run (run_id, snapshot_id, trigger_type, trigger_ref, previous_run_id, objective_version, run_status, contains_simulated, executed_at)
            SELECT ${newRunId}::uuid, snapshot_id, 'OPERATOR_REQUEST', 'RP-APV-2', run_id, 'o1', 'FEASIBLE', contains_simulated, now()
              FROM cera.recovery_run WHERE run_id = ${w.runId}::uuid`,
      );
      return api.get(PlanSupersessionService).invalidateForNewRun(t, newRunId, w.systemId);
    });
    expect(invalidated).toEqual([approved.approval.current.approval_id]);

    const after = (await http.get(`/communication/drafts/${d.message.message_id}`).expect(200)).body;
    expect(after.approval).toMatchObject({ state: 'INVALIDATED', usable_for_send: false });
    expect(after.approval.ended_by).toMatchObject({ invalidation_cause: 'PLAN_SUPERSEDED', actor_type: 'SYSTEM' });
    expect(after.blocked_reasons).toContain('PLAN_SUPERSEDED');
    expect((await approve(w, d).expect(409)).body.code).toBe('PLAN_SUPERSEDED');
    expect((await approve(w, pending).expect(409)).body.code).toBe('PLAN_SUPERSEDED');
    // DB 도 막는다(M12): 교체된 실행을 근거로 한 승인 행은 들어가지 않는다
    await expectSqlState(
      app.query(
        `INSERT INTO cera.message_approval (approval_id, message_id, decision, actor_id, decided_at, approved_content_ref, approved_content_hash,
           approved_to_address_id, approved_plan_run_id)
         VALUES ($1, $2, 'APPROVED', $3, now(), $4, $5, $6, $7)`,
        [v7(), pending.message.message_id, w.humanId, `cref:v1:MESSAGE_APPROVAL_CONTENT:${v7()}`, pending.message.content_hash, w.addressId, w.runId],
      ),
      'CE005',
    );
    // 다시 불러도 더 무효화할 것이 없다(멱등)
    expect(await tx.run((t) => api.get(PlanSupersessionService).invalidateForNewRun(t, newRunId, w.systemId))).toEqual([]);
  });

  it('an expired approval cannot be used; the same content can be approved again', async () => {
    const w = await world();
    const d = await draft(w);
    // 만료된 승인 — 사본까지 메시지와 같게(M08 커밋 검사 통과), 결정 · 만료 시각은 과거
    const client = await app.connect();
    const expiredId = v7();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO cera.message_approval (approval_id, message_id, decision, actor_id, decided_at, expires_at, approved_content_ref,
           approved_content_hash, approved_to_address_id, approved_plan_run_id)
         VALUES ($1, $2, 'APPROVED', $3, now() - interval '2 days', now() - interval '1 day', $4, $5, $6, $7)`,
        [expiredId, d.message.message_id, w.humanId, `cref:v1:MESSAGE_APPROVAL_CONTENT:${v7()}`, d.message.content_hash, w.addressId, w.runId],
      );
      await client.query(
        `INSERT INTO cera.message_approval_structured_field (approval_id, field_key, approved_value_text, approved_value_number, approved_unit,
           approved_source_run_id, approved_source_question_item_id, approved_source_path)
         SELECT $1, field_key, value_text, value_number, unit, source_run_id, source_question_item_id, source_path
           FROM cera.comm_message_structured_field WHERE message_id = $2`,
        [expiredId, d.message.message_id],
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const view = (await http.get(`/communication/drafts/${d.message.message_id}`).expect(200)).body;
    expect(view.approval).toMatchObject({ state: 'EXPIRED', usable_for_send: false });
    expect(view.approval_ready).toBe(true);
    await expectSqlState(sendWith(d, expiredId), 'CE005');
    const re = (await approve(w, d).expect(200)).body;
    expect(re.approval).toMatchObject({ state: 'ACTIVE', usable_for_send: true });
  });
});

describe('reject and revoke', () => {
  it('reject: reason required, PENDING_APPROVAL → REJECTED, cannot then be approved; a revision makes a new draft', async () => {
    const w = await world();
    const d = await draft(w);
    const path = `/communication/drafts/${d.message.message_id}/reject`;
    expect((await http.post(path).set(ACTOR, w.humanId).send({ content_hash: d.message.content_hash }).expect(400)).body.code).toBe('INVALID_DRAFT_REQUEST');
    const res = await http.post(path).set(ACTOR, w.humanId).send({ reason: '시간대가 맞지 않음', content_hash: d.message.content_hash }).expect(200);
    expect(res.body.message.status).toBe('REJECTED');
    expect(res.body.approval.state).toBe('REJECTED');
    expect(res.body.approval.rejection).toMatchObject({ decision: 'REJECTED', reason: '시간대가 맞지 않음', actor_name: 'test HUMAN' });
    expect(res.body.blocked_reasons).toContain('NOT_PENDING_APPROVAL');
    await http.post(path).set(ACTOR, w.humanId).send({ reason: '다시', content_hash: d.message.content_hash }).expect(200); // 멱등
    expect((await approvalRows(d.message.message_id)).map((r) => r.decision)).toEqual(['REJECTED']);
    expect((await approve(w, d).expect(409)).body.code).toBe('NOT_PENDING_APPROVAL');

    const revised = await http
      .post(`/communication/drafts/${d.message.message_id}/revisions`)
      .send({ subject: d.message.subject, body: `${d.message.body}\n(수정)` })
      .expect(201);
    expect(revised.body.message.status).toBe('PENDING_APPROVAL');
    await approve(w, revised.body).expect(200);
  });

  it('revoke: a new REVOKED row, the approval cannot send, status stays APPROVED, and the same content can be re-approved', async () => {
    const w = await world();
    const d = await draft(w);
    const approvalId = (await approve(w, d).expect(200)).body.approval.current.approval_id;
    const path = `/communication/approvals/${approvalId}/revoke`;
    expect((await http.post(path).send({}).expect(400)).body.code).toBe('ACTOR_REQUIRED');
    const revoked = (await http.post(path).set(ACTOR, w.humanId).send({ reason: '거래처 사정' }).expect(200)).body;
    expect(revoked.message.status).toBe('APPROVED');
    expect(revoked.approval).toMatchObject({ state: 'REVOKED', usable_for_send: false });
    expect(revoked.approval.ended_by).toMatchObject({ decision: 'REVOKED', invalidation_cause: 'USER_REVOKED', reason: '거래처 사정', actor_type: 'HUMAN' });
    expect(revoked.approval_ready).toBe(true);
    await http.post(path).set(ACTOR, w.humanId).send({}).expect(200); // 멱등
    await expectSqlState(sendWith(d, approvalId), 'CE005');

    const re = (await approve(w, d).expect(200)).body;
    expect(re.approval.current.approval_id).not.toBe(approvalId);
    expect(re.approval).toMatchObject({ state: 'ACTIVE', usable_for_send: true });
    expect(re.approval.history.map((h: { decision: string }) => h.decision)).toEqual(['APPROVED', 'REVOKED', 'APPROVED']);
    expect(await statuses(d.message.message_id)).toEqual(['DRAFTED', 'PENDING_APPROVAL', 'APPROVED', 'APPROVED']);
  });

  it('an approval already used for sending cannot be revoked (ALREADY_SENT)', async () => {
    const w = await world();
    const d = await draft(w);
    const approvalId = (await approve(w, d).expect(200)).body.approval.current.approval_id;
    await sendWith(d, approvalId); // 유효한 승인으로 발송 시도가 시작됐다(결과 미기록 = 나가는 중)
    const res = await http.post(`/communication/approvals/${approvalId}/revoke`).set(ACTOR, w.humanId).send({}).expect(409);
    expect(res.body.code).toBe('ALREADY_SENT');
  });

  it('approvers lists active human operators only', async () => {
    const w = await world();
    const res = await http.get('/communication/approvers').expect(200);
    const ids = res.body.approvers.map((a: { actor_id: string }) => a.actor_id);
    expect(ids).toContain(w.humanId);
    expect(ids).not.toContain(w.systemId);
  });
});

describe('M12 — the database keeps the message-level approval rules even without the API', () => {
  const insertApproved = (d: { message: { message_id: string; content_hash: string } }, w: World, hash = d.message.content_hash) =>
    app.query(
      `INSERT INTO cera.message_approval (approval_id, message_id, decision, actor_id, decided_at, approved_content_ref, approved_content_hash,
         approved_to_address_id)
       VALUES ($1, $2, 'APPROVED', $3, now(), $4, $5, $6)`,
      [v7(), d.message.message_id, w.humanId, `cref:v1:MESSAGE_APPROVAL_CONTENT:${v7()}`, hash, w.addressId],
    );

  it('a second live approval, an approval of other content, and an approval of a non-pending message are refused (CE005)', async () => {
    const w = await world();
    const d = await draft(w);
    await approve(w, d).expect(200);
    await expectSqlState(insertApproved(d, w), 'CE005'); // 살아 있는 승인이 이미 있다

    const other = await draft(w);
    await expectSqlState(insertApproved(other, w, hashOf('other')), 'CE005'); // 지문 ≠ 메시지 지문

    const blocked = await http
      .post(`/communication/drafts/${other.message.message_id}/revisions`)
      .send({ subject: other.message.subject, body: `${other.message.body} 9` })
      .expect(201);
    expect(blocked.body.message.status).toBe('DRAFTED');
    await expectSqlState(insertApproved(blocked.body, w), 'CE005'); // 승인 대기가 아니다
  });

  it('a rejection needs a message awaiting approval (CE005)', async () => {
    const w = await world();
    const d = await draft(w);
    await approve(w, d).expect(200);
    await expectSqlState(
      app.query(
        `INSERT INTO cera.message_approval (approval_id, message_id, decision, actor_id, decided_at, reason) VALUES ($1, $2, 'REJECTED', $3, now(), 'late')`,
        [v7(), d.message.message_id, w.humanId],
      ),
      'CE005',
    );
  });
});
