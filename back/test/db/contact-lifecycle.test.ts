import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type pg from 'pg';
import request from 'supertest';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RecoveryContextService } from '../../src/agent-tools/context.service.js';
import { AgentReconciler } from '../../src/agent-tools/reconciler.js';
import { createApiApp } from '../../src/app/create-api.js';
import { hashPassword } from '../../src/auth/password.js';
import { OutboxDispatcher } from '../../src/communication/outbox-dispatcher.js';
import { ContactSelectionRepository } from '../../src/registry/contact-selection.repository.js';
import { RegistryService } from '../../src/registry/registry.service.js';
import { T0, actor, hashOf } from './fixtures.js';
import { appPool, testEnv } from './support.js';

/**
 * T-129 연락처 수명주기 · 수동 선택 — 주소를 지우지 않고 앞으로만 쓰지 않는다(중지 · 다시 사용 · 거절 · 담당자 비활성),
 * 적격 주소가 둘 이상이면 CERA 가 고르지 않고 사람이 이 한 건의 받는 주소를 고른다(실행 · 주체 범위, DB 에 남는다).
 * 선택도 승인도 자격을 영구히 보장하지 않는다 — 발송 직전에 Contact Gate 를 다시 본다. 주소는 모두 합성(example.invalid).
 */
const ACTOR = 'X-CERA-Actor-Id';
const contentDir = mkdtempSync(join(tmpdir(), 'cera-lifecycle-content-'));
const env = () => testEnv({ CERA_CONTENT_DIR: contentDir });
let api: INestApplication;
let http: ReturnType<typeof request>;
let db: pg.Pool;
const ids = { admin: '', operator: '', field: '', agent: '' };
const tag = () => v7().slice(-8);

async function user(role: 'ADMIN' | 'OPERATOR' | 'FIELD_OPERATOR'): Promise<string> {
  const id = await actor(db, 'HUMAN');
  await db.query(`INSERT INTO cera.user_account (user_id, actor_id, login_id, role, password_hash, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, true, $6, $6)`, [v7(), id, `${role.toLowerCase()}-lc-${id.slice(-8)}`, role, await hashPassword('contact-lifecycle-pw-1'), T0]);
  return id;
}

/** 승인된 MOCK 주소 n 개를 가진 거래처(담당자 하나에 주소 하나씩) */
async function counterparty(role: 'ODCY' | 'TRUCKING', n: number): Promise<{ cp: string; contacts: string[]; addrs: string[] }> {
  const cp = v7();
  await db.query('INSERT INTO cera.counterparty (counterparty_id, display_name, source_role) VALUES ($1, $2, $3)', [cp, `수명주기 ${role} ${tag()}`, role]);
  const contacts: string[] = [];
  const addrs: string[] = [];
  for (let k = 0; k < n; k++) {
    const contact = v7();
    const addr = v7();
    await db.query('INSERT INTO cera.counterparty_contact (contact_id, counterparty_id, person_name) VALUES ($1, $2, $3)', [contact, cp, `담당 ${k}`]);
    await db.query(
      `INSERT INTO cera.contact_channel_address (address_id, contact_id, channel_type, normalized_address, email_verification_status, relationship_status, communication_status, verified_at, approved_by_actor_id, approved_at)
       VALUES ($1, $2, 'MOCK', $3, 'VERIFIED', 'APPROVED', 'ACTIVE', $4, $5, $4)`,
      [addr, contact, `lc-${addr.slice(-8)}@example.invalid`, T0, ids.admin],
    );
    contacts.push(contact);
    addrs.push(addr);
  }
  return { cp, contacts, addrs };
}

async function odcyOperatedBy(cp: string): Promise<string> {
  const f = v7();
  await db.query("INSERT INTO cera.facility (facility_id, facility_type, facility_name) VALUES ($1, 'ODCY', $2)", [f, `수명주기 ODCY ${tag()}`]);
  await db.query('UPDATE cera.facility SET operator_counterparty_id = $2 WHERE facility_id = $1', [f, cp]);
  return f;
}

async function simulatedRun(): Promise<string> {
  const scenarioId = v7();
  const snapshotId = v7();
  const runId = v7();
  await db.query("INSERT INTO cera.scenario (scenario_id, scenario_name, as_of_base, created_at) VALUES ($1, 'lifecycle', $2, $2)", [scenarioId, T0]);
  await db.query(`INSERT INTO cera.planning_snapshot (snapshot_id, as_of, fact_fingerprint, rule_version, tariff_version, policy_version, contains_simulated, created_at, scenario_id) VALUES ($1, $2, $3, 'r1', 't1', 'p1', true, $2, $4)`, [snapshotId, T0, hashOf(`snap-${snapshotId}`), scenarioId]);
  await db.query(`INSERT INTO cera.recovery_run (run_id, snapshot_id, trigger_type, trigger_ref, objective_version, run_status, contains_simulated, executed_at) VALUES ($1, $2, 'EXCEPTION_DETECTED', 'LIFECYCLE', 'o1', 'FEASIBLE', true, $3)`, [runId, snapshotId, T0]);
  return runId;
}

/** 연락처 때문에 사람을 기다리는 Agent 실행(실행은 CREATED 로만 만들어진다 — M19 전이 그대로) */
async function waitingRun(recoveryRunId: string, reason: string, facilityId: string): Promise<string> {
  const id = v7();
  await db.query(`INSERT INTO cera.agent_run (agent_run_id, recovery_run_id, goal, status, created_by_actor_id, agent_actor_id, started_at, is_simulated) VALUES ($1, $2, 'close gaps', 'CREATED', $3, $4, $5, true)`, [id, recoveryRunId, ids.operator, ids.agent, T0]);
  await db.query("UPDATE cera.agent_run SET status = 'RUNNING', updated_at = $2 WHERE agent_run_id = $1", [id, T0]);
  await db.query("UPDATE cera.agent_run SET status = 'WAITING_HUMAN', waiting_reason = $2, pending_ref_type = 'FACILITY', pending_ref_id = $3, updated_at = $4 WHERE agent_run_id = $1", [id, reason, facilityId, T0]);
  return id;
}

/** DB 상태만 보는 재조정(깨우기는 기록만 — Python Runtime 없이) */
function reconcilerFor(app: INestApplication, agentRunId: string, recoveryRunId: string, reason: () => string, facilityId: string, resumed: { id: string; reason: string }[]): AgentReconciler {
  return new AgentReconciler(
    { dueRetries: async () => [], waitingOnRecords: async () => [{ agentRunId, waitingReason: reason(), pendingRefType: 'FACILITY', pendingRefId: facilityId }], recoveryRunOf: async () => recoveryRunId } as never,
    { resume: async (id: string, why: string) => (resumed.push({ id, reason: why }), { already: false }) } as never,
    {} as never,
    {} as never,
    app.get(RecoveryContextService),
    {} as never,
    { now: () => ({ toDb: () => T0 }) } as never,
    { CERA_AGENT_RECONCILE_ENABLED: true } as never,
    { subscribe: () => undefined } as never,
    app.get(RegistryService),
    app.get(ContactSelectionRepository),
  );
}

beforeAll(async () => {
  api = await createApiApp(env());
  await api.init();
  http = request(api.getHttpServer());
  db = appPool();
  ids.admin = await user('ADMIN');
  ids.operator = await user('OPERATOR');
  ids.field = await user('FIELD_OPERATOR');
  ids.agent = await actor(db, 'AI_AGENT');
  await actor(db, 'SYSTEM'); // 초안 · 발송 상태 전이의 시스템 행위자
});

afterAll(async () => {
  await api.close();
  await db.end();
  rmSync(contentDir, { recursive: true, force: true });
});

describe('T-129 contact lifecycle — keep the record, stop future use', () => {
  it('A · B · H: one usable address is used; a paused / retired / rejected address or an inactive contact is excluded; only an ADMIN changes the registry; every change is audited', async () => {
    const registry = api.get(RegistryService);
    const x = await counterparty('ODCY', 1);
    expect(await registry.usableAddresses(x.cp, true)).toEqual([x.addrs[0]]); // A
    // H: OPERATOR · FIELD_OPERATOR 는 등록부를 바꾸지 못한다
    for (const who of [ids.operator, ids.field]) {
      expect((await http.patch(`/registry/addresses/${x.addrs[0]}/status`).set(ACTOR, who).send({ communication_status: 'PAUSED', reason_code: 'OTHER' })).status).toBe(403);
      expect((await http.post(`/registry/addresses/${x.addrs[0]}/reject`).set(ACTOR, who).send({ reason_code: 'COUNTERPARTY_REQUEST' })).status).toBe(403);
      expect((await http.patch(`/registry/contacts/${x.contacts[0]}`).set(ACTOR, who).send({ is_active: false, reason_code: 'PERSON_LEFT' })).status).toBe(403);
    }
    expect((await http.patch(`/registry/addresses/${x.addrs[0]}/status`).set(ACTOR, ids.admin).send({ communication_status: 'GONE', reason_code: 'OTHER' }).expect(400)).body.code).toBe('INVALID_REGISTRY_REQUEST');
    // B: 중지 → 제외(행은 그대로) → 다시 사용 → 포함
    const paused = (await http.patch(`/registry/addresses/${x.addrs[0]}/status`).set(ACTOR, ids.admin).send({ communication_status: 'PAUSED', reason_code: 'ADDRESS_UNUSED' }).expect(200)).body;
    expect(paused).toMatchObject({ eligible: false, address: { communication_status: 'PAUSED' } });
    expect(paused.reasons.map((r: { code: string }) => r.code)).toContain('NOT_ACTIVE');
    expect(await registry.usableAddresses(x.cp, true)).toEqual([]);
    expect((await http.patch(`/registry/addresses/${x.addrs[0]}/status`).set(ACTOR, ids.admin).send({ communication_status: 'ACTIVE', reason_code: 'ENTERED_IN_ERROR' }).expect(200)).body.eligible).toBe(true);
    // 담당자 비활성(퇴사) → 그 담당자의 주소는 모두 막힌다 → 다시 활성
    const off = (await http.patch(`/registry/contacts/${x.contacts[0]}`).set(ACTOR, ids.admin).send({ is_active: false, reason_code: 'PERSON_LEFT' }).expect(200)).body;
    expect(off.contacts[0]).toMatchObject({ is_active: false });
    expect((await http.get(`/registry/addresses/${x.addrs[0]}/eligibility`).expect(200)).body.reasons.map((r: { code: string }) => r.code)).toEqual(['CONTACT_INACTIVE']);
    expect(await registry.usableAddresses(x.cp, true)).toEqual([]);
    await http.patch(`/registry/contacts/${x.contacts[0]}`).set(ACTOR, ids.admin).send({ is_active: true, reason_code: 'ENTERED_IN_ERROR' }).expect(200);
    expect(await registry.usableAddresses(x.cp, true)).toEqual([x.addrs[0]]);
    // 거절: 되돌리지 않는다(다시 사용 · 다시 승인 모두 409)
    const rejected = (await http.post(`/registry/addresses/${x.addrs[0]}/reject`).set(ACTOR, ids.admin).send({ reason_code: 'COUNTERPARTY_REQUEST' }).expect(200)).body;
    expect(rejected).toMatchObject({ eligible: false, address: { relationship_status: 'REJECTED' } });
    expect((await http.patch(`/registry/addresses/${x.addrs[0]}/status`).set(ACTOR, ids.admin).send({ communication_status: 'ACTIVE', reason_code: 'OTHER' }).expect(409)).body.code).toBe('ADDRESS_REJECTED');
    expect((await http.post(`/registry/addresses/${x.addrs[0]}/approve`).set(ACTOR, ids.admin).expect(409)).body.code).toBe('ADDRESS_REJECTED');
    // 행은 지워지지 않았다 · 감사(사유 코드 · 전후 상태)
    expect((await db.query('SELECT count(*)::int AS n FROM cera.contact_channel_address WHERE address_id = $1', [x.addrs[0]])).rows[0].n).toBe(1);
    const audit = (await db.query("SELECT action, actor_id, before_ref, after_ref FROM cera.audit_log WHERE target_id = ANY($1::text[]) ORDER BY occurred_at, audit_id", [[x.addrs[0], x.contacts[0]]])).rows;
    expect(audit.map((a) => a.action)).toEqual(['CONTACT_ADDRESS_STATUS_CHANGED', 'CONTACT_ADDRESS_STATUS_CHANGED', 'CONTACT_STATUS_CHANGED', 'CONTACT_STATUS_CHANGED', 'CONTACT_ADDRESS_REJECTED']);
    expect(audit.every((a) => a.actor_id === ids.admin)).toBe(true);
    expect(audit[0]).toMatchObject({ before_ref: 'communication_status=ACTIVE', after_ref: 'communication_status=PAUSED;reason=ADDRESS_UNUSED' });
    expect(audit[4]).toMatchObject({ before_ref: 'relationship_status=APPROVED', after_ref: 'relationship_status=REJECTED;reason=COUNTERPARTY_REQUEST' });
  });

  it('C · D · E · F · G · I · J · N: a run waiting for a choice wakes only on a usable human choice in its scope; wrong company / role / unusable address are refused; the choice survives an API restart', async () => {
    const y = await counterparty('ODCY', 2); // 같은 시설 운영사에 적격 주소 둘
    const other = await counterparty('ODCY', 1); // 다른 ODCY 회사
    const trucking = await counterparty('TRUCKING', 1);
    const facilityId = await odcyOperatedBy(y.cp);
    const recoveryRunId = await simulatedRun();
    const gap = (await api.get(RecoveryContextService).informationGaps(recoveryRunId)).gaps.find((g) => g.subject_id === facilityId)!;
    expect(gap).toMatchObject({ owner_counterparty_id: y.cp, state: 'MISSING', selected_address_id: null });
    const runId = await waitingRun(recoveryRunId, 'CONTACT_SELECTION_REQUIRED', facilityId);
    const resumed: { id: string; reason: string }[] = [];
    let reason = 'CONTACT_SELECTION_REQUIRED';
    const reconciler = reconcilerFor(api, runId, recoveryRunId, () => reason, facilityId, resumed);
    // D: 둘 다 쓸 수 있고 아무도 고르지 않았다 → 계속 기다린다(첫 주소를 고르지 않는다)
    expect((await reconciler.runOnce()).woken).toBe(0);

    const select = (who: string, body: object) => http.post(`/agent-runs/${runId}/contact-selection`).set(ACTOR, who).send(body);
    // I: FIELD_OPERATOR 는 고르지 못한다 · F: 다른 회사의 주소 · G: 다른 역할 · 막힌 주소 · 형식
    expect((await select(ids.field, { address_id: y.addrs[1] })).status).toBe(403);
    expect((await select(ids.operator, { address_id: other.addrs[0] }).expect(422)).body.code).toBe('WRONG_COUNTERPARTY');
    expect((await select(ids.operator, { address_id: trucking.addrs[0] }).expect(422)).body.code).toBe('WRONG_COUNTERPARTY');
    expect((await select(ids.operator, { address_id: 'not-a-uuid' }).expect(400)).body.code).toBe('INVALID_SELECTION_REQUEST');
    await http.patch(`/registry/addresses/${y.addrs[0]}/status`).set(ACTOR, ids.admin).send({ communication_status: 'PAUSED', reason_code: 'OTHER' }).expect(200);
    expect((await select(ids.operator, { address_id: y.addrs[0] }).expect(403)).body.code).toBe('RECIPIENT_NOT_ELIGIBLE');
    // 하나만 남으면 고를 필요가 없다 → 깨워 그래프가 다시 판정(하나면 초안)
    expect((await reconciler.runOnce()).woken).toBe(1);
    expect(resumed.pop()).toEqual({ id: runId, reason: 'REGISTRY_CHANGED' });
    await http.patch(`/registry/addresses/${y.addrs[0]}/status`).set(ACTOR, ids.admin).send({ communication_status: 'ACTIVE', reason_code: 'ENTERED_IN_ERROR' }).expect(200);
    expect((await reconciler.runOnce()).woken).toBe(0);
    // E: OPERATOR 가 고른다(이 실행 · 이 시설만) → 기록 · 감사 → 재조정이 CONTACT_SELECTED 로 깨운다
    const chosen = (await select(ids.operator, { address_id: y.addrs[1], note: '전화로 담당 확인' }).expect(201)).body;
    expect(chosen).toMatchObject({ scope_type: 'AGENT_RUN', agent_run_id: runId, plan_id: null, subject_type: 'FACILITY', subject_id: facilityId, address_id: y.addrs[1], selected_by_actor_id: ids.operator, note: '전화로 담당 확인' });
    expect((await db.query("SELECT actor_id, after_ref FROM cera.audit_log WHERE action = 'CONTACT_SELECTED' AND target_id = $1", [chosen.selection_id])).rows).toEqual([{ actor_id: ids.operator, after_ref: `agent_run=${runId};address=${y.addrs[1]}` }]);
    expect((await reconciler.runOnce()).woken).toBe(1);
    expect(resumed.pop()).toEqual({ id: runId, reason: 'CONTACT_SELECTED' });
    // 선택 기록은 고치거나 지울 수 없다
    await expect(db.query('UPDATE cera.contact_selection SET address_id = $2 WHERE selection_id = $1', [chosen.selection_id, y.addrs[0]])).rejects.toThrow();
    await expect(db.query('DELETE FROM cera.contact_selection WHERE selection_id = $1', [chosen.selection_id])).rejects.toThrow();

    // J: API 를 다시 띄워도 선택은 DB 에 있다 — 새 앱의 재조정이 같은 판정을 한다
    await api.close();
    api = await createApiApp(env());
    await api.init();
    http = request(api.getHttpServer());
    const after: { id: string; reason: string }[] = [];
    expect((await reconcilerFor(api, runId, recoveryRunId, () => reason, facilityId, after).runOnce()).woken).toBe(1);
    expect(after).toEqual([{ id: runId, reason: 'CONTACT_SELECTED' }]);

    // 고른 주소가 뒤에 중지되면 그 선택은 쓰지 않는다(다른 주소 둘 중 하나로 대신 보내지 않는다 — 아직 둘이면 기다림)
    await http.patch(`/registry/addresses/${y.addrs[1]}/status`).set(ACTOR, ids.admin).send({ communication_status: 'INACTIVE', reason_code: 'PERSON_LEFT' }).expect(200);
    const z = (await http.post(`/registry/counterparties/${y.cp}/contacts`).set(ACTOR, ids.admin).send({ person_name: '새 담당', channel_type: 'MOCK', address: `lc-new-${tag()}@example.invalid` }).expect(201)).body;
    const zAddr = z.contacts.find((c: { person_name: string }) => c.person_name === '새 담당').addresses[0].address_id;
    await http.post(`/registry/addresses/${zAddr}/approve`).set(ACTOR, ids.admin).expect(200);
    const fresh: { id: string; reason: string }[] = [];
    expect((await reconcilerFor(api, runId, recoveryRunId, () => reason, facilityId, fresh).runOnce()).woken).toBe(0);

    // C · N: 쓸 수 있는 주소가 하나도 없다 → 등록 대기로 다시 판정(깨움) · 등록 대기는 주소가 생길 때까지 깨우지 않는다 · 다른 회사로 가지 않는다
    for (const a of [y.addrs[0], zAddr]) await http.patch(`/registry/addresses/${a}/status`).set(ACTOR, ids.admin).send({ communication_status: 'PAUSED', reason_code: 'OTHER' }).expect(200);
    expect(await api.get(RegistryService).usableAddresses(y.cp, true)).toEqual([]);
    expect((await reconcilerFor(api, runId, recoveryRunId, () => reason, facilityId, fresh).runOnce()).woken).toBe(1);
    expect(fresh.pop()).toEqual({ id: runId, reason: 'REGISTRY_CHANGED' });
    reason = 'CONTACT_REGISTRATION_REQUIRED';
    expect((await reconcilerFor(api, runId, recoveryRunId, () => reason, facilityId, fresh).runOnce()).woken).toBe(0);
    expect((await api.get(RecoveryContextService).informationGaps(recoveryRunId)).gaps.find((g) => g.subject_id === facilityId)?.owner_counterparty_id).toBe(y.cp);
  });

  it('only a run that is actually waiting for a choice accepts one; the gap must still be open', async () => {
    const y = await counterparty('ODCY', 2);
    const facilityId = await odcyOperatedBy(y.cp);
    const recoveryRunId = await simulatedRun();
    const runId = await waitingRun(recoveryRunId, 'CONTACT_REGISTRATION_REQUIRED', facilityId);
    expect((await http.post(`/agent-runs/${runId}/contact-selection`).set(ACTOR, ids.operator).send({ address_id: y.addrs[0] }).expect(409)).body.code).toBe('NOT_WAITING_FOR_CONTACT_SELECTION');
    expect((await http.post(`/agent-runs/${v7()}/contact-selection`).set(ACTOR, ids.operator).send({ address_id: y.addrs[0] }).expect(404)).body.code).toBe('NOT_FOUND');
  });

  it('K · L: approval does not keep an address eligible — a send request or a queued send to a paused address is blocked; mail already sent keeps its recipient', async () => {
    const y = await counterparty('ODCY', 1);
    const facilityId = await odcyOperatedBy(y.cp);
    const recoveryRunId = await simulatedRun();
    const draft = async () => {
      const res = await http.post('/communication/drafts').set(ACTOR, ids.operator).send({ address_id: y.addrs[0], intent: 'FACILITY_CAPACITY', target_id: facilityId, values: [{ key: 'quantity', value_number: 2, unit: 'CONTAINER' }, { key: 'date', value_text: '2026-10-01' }], source_run_id: recoveryRunId });
      if (res.status !== 201) throw new Error(JSON.stringify(res.body));
      const made = res.body;
      const id = made.message.message_id as string;
      const hash = made.message.content_hash as string;
      await http.post(`/communication/drafts/${id}/approve`).set(ACTOR, ids.operator).send({ content_hash: hash }).expect(200);
      return { id, hash };
    };
    // L: 하나는 보낸다
    const sent = await draft();
    await http.post(`/communication/drafts/${sent.id}/send`).set(ACTOR, ids.operator).send({ content_hash: sent.hash }).expect(200);
    await api.get(OutboxDispatcher).processMessage(sent.id);
    const before = (await db.query('SELECT to_address_id, current_status, content_hash, sent_at FROM cera.comm_message WHERE message_id = $1', [sent.id])).rows[0];
    expect(before).toMatchObject({ to_address_id: y.addrs[0], current_status: 'SENT' });
    // K-1: 승인됐지만 아직 발송 요청 전 → 주소 중지 → 발송 요청 거부
    const approved = await draft();
    // K-2: 발송 요청까지 했다(대기열) → 주소 중지 → Worker 가 내보내지 않는다(대기 해제 · 사유 기록)
    const queued = await draft();
    await http.post(`/communication/drafts/${queued.id}/send`).set(ACTOR, ids.operator).send({ content_hash: queued.hash }).expect(200);
    await http.patch(`/registry/addresses/${y.addrs[0]}/status`).set(ACTOR, ids.admin).send({ communication_status: 'INACTIVE', reason_code: 'ADDRESS_UNUSED' }).expect(200);
    const blocked = await http.post(`/communication/drafts/${approved.id}/send`).set(ACTOR, ids.operator).send({ content_hash: approved.hash }).expect(403);
    expect(blocked.body.code).toBe('RECIPIENT_NOT_ELIGIBLE');
    expect(await api.get(OutboxDispatcher).processMessage(queued.id)).toBe('DEQUEUED');
    expect((await db.query('SELECT current_status FROM cera.comm_message WHERE message_id = $1', [queued.id])).rows[0].current_status).toBe('APPROVED');
    expect((await db.query("SELECT count(*)::int AS n FROM cera.send_attempt WHERE message_id = ANY($1::uuid[])", [[approved.id, queued.id]])).rows[0].n).toBe(0);
    // L: 보낸 메일의 받는 사람 · 상태 · 지문 · 발송 시각은 그대로
    expect((await db.query('SELECT to_address_id, current_status, content_hash, sent_at FROM cera.comm_message WHERE message_id = $1', [sent.id])).rows[0]).toEqual(before);
  });
});
