import type { INestApplication } from '@nestjs/common';
import type pg from 'pg';
import request from 'supertest';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AgentReconciler } from '../../src/agent-tools/reconciler.js';
import { createApiApp } from '../../src/app/create-api.js';
import { hashPassword } from '../../src/auth/password.js';
import { RegistryService } from '../../src/registry/registry.service.js';
import { T0, actor } from './fixtures.js';
import { appPool, testEnv } from './support.js';

/**
 * T-127 실행 중 등록부 등록 — 관리자가 거래처 · 연락처(주소)를 넣는다. 새 주소는 자동 확인 · 승인되지 않고, 관리자가 따로 승인해야
 * Contact Gate 를 통과한다. 같은 채널 · 같은 정규화 주소는 한 번만. 연락처가 없어 기다리던 Agent 실행은 주인에게 쓸 수 있는 주소가 생기면 깨어난다.
 * 주소는 모두 합성(example.com) — 실제 개인 메일 주소를 쓰지 않는다.
 */
const ACTOR = 'X-CERA-Actor-Id';
let api: INestApplication;
let http: ReturnType<typeof request>;
let db: pg.Pool;
const ids = { admin: '', operator: '', field: '' };
const tag = () => v7().slice(-8);

async function user(role: 'ADMIN' | 'OPERATOR' | 'FIELD_OPERATOR'): Promise<string> {
  const id = await actor(db, 'HUMAN');
  await db.query(`INSERT INTO cera.user_account (user_id, actor_id, login_id, role, password_hash, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, true, $6, $6)`, [v7(), id, `${role.toLowerCase()}-reg-${id.slice(-8)}`, role, await hashPassword('contact-registration-pw-1'), T0]);
  return id;
}

beforeAll(async () => {
  api = await createApiApp(testEnv({}));
  await api.init();
  http = request(api.getHttpServer());
  db = appPool();
  ids.admin = await user('ADMIN');
  ids.operator = await user('OPERATOR');
  ids.field = await user('FIELD_OPERATOR');
});

afterAll(async () => {
  await api.close();
  await db.end();
});

describe('T-127 runtime registry registration', () => {
  it('only an ADMIN registers counterparties and contacts; the new address is not eligible until an ADMIN approves it; everything is audited', async () => {
    const name = `ODCY 등록 ${tag()} (합성)`;
    for (const who of [ids.operator, ids.field]) expect((await http.post('/registry/counterparties').set(ACTOR, who).send({ display_name: name, source_role: 'ODCY' })).status).toBe(403);
    const cp = (await http.post('/registry/counterparties').set(ACTOR, ids.admin).send({ display_name: name, source_role: 'ODCY' }).expect(201)).body;
    expect(cp).toMatchObject({ display_name: name, source_role: 'ODCY', is_active: true, contacts: [] });
    // 같은 역할 · 같은 이름(대소문자 · 공백 무시)은 한 번만
    expect((await http.post('/registry/counterparties').set(ACTOR, ids.admin).send({ display_name: `  ${name.toUpperCase()} `, source_role: 'ODCY' }).expect(409)).body.code).toBe('COUNTERPARTY_ALREADY_REGISTERED');
    expect((await http.post('/registry/counterparties').set(ACTOR, ids.admin).send({ display_name: name })).status).toBe(400);

    const address = `Ops-${tag()}@Example.com`;
    expect((await http.post(`/registry/counterparties/${cp.counterparty_id}/contacts`).set(ACTOR, ids.operator).send({ person_name: '배차 담당', channel_type: 'MOCK', address })).status).toBe(403);
    const withContact = (await http.post(`/registry/counterparties/${cp.counterparty_id}/contacts`).set(ACTOR, ids.admin).send({ person_name: '배차 담당', team: '운영팀', channel_type: 'MOCK', address: `  ${address} ` }).expect(201)).body;
    const a = withContact.contacts[0].addresses[0];
    // 정규화(앞뒤 공백 · 소문자) · 자동 승인 없음
    expect(a).toMatchObject({ normalized_address: address.toLowerCase(), email_verification_status: 'UNVERIFIED', relationship_status: 'PENDING', communication_status: 'ACTIVE', eligible: false });
    // 같은 채널 · 같은 주소는 다른 거래처에도 다시 등록되지 않는다
    const other = (await http.post('/registry/counterparties').set(ACTOR, ids.admin).send({ display_name: `다른 ODCY ${tag()}`, source_role: 'ODCY' }).expect(201)).body;
    expect((await http.post(`/registry/counterparties/${other.counterparty_id}/contacts`).set(ACTOR, ids.admin).send({ person_name: '다른 담당', channel_type: 'MOCK', address: address.toUpperCase() }).expect(409)).body.code).toBe('ADDRESS_ALREADY_REGISTERED');
    expect((await http.post(`/registry/counterparties/${other.counterparty_id}/contacts`).set(ACTOR, ids.admin).send({ person_name: '다른 담당', channel_type: 'MOCK', address: 'not-an-address' }).expect(400)).body.code).toBe('INVALID_ADDRESS');
    expect((await http.post(`/registry/counterparties/${other.counterparty_id}/contacts`).set(ACTOR, ids.admin).send({ person_name: '다른 담당', channel_type: 'PORTAL', address: `p-${tag()}@example.com` })).status).toBe(400);

    const before = (await http.get(`/registry/addresses/${a.address_id}/eligibility`).expect(200)).body;
    expect(before.eligible).toBe(false);
    expect((await http.post(`/registry/addresses/${a.address_id}/approve`).set(ACTOR, ids.operator)).status).toBe(403);
    const after = (await http.post(`/registry/addresses/${a.address_id}/approve`).set(ACTOR, ids.admin).expect(200)).body;
    expect(after.eligible).toBe(true);
    const row = (await db.query('SELECT email_verification_status, relationship_status, approved_by_actor_id, verified_at IS NOT NULL AS verified FROM cera.contact_channel_address WHERE address_id = $1', [a.address_id])).rows[0];
    expect(row).toEqual({ email_verification_status: 'VERIFIED', relationship_status: 'APPROVED', approved_by_actor_id: ids.admin, verified: true });
    // 다시 승인해도 기록은 하나
    await http.post(`/registry/addresses/${a.address_id}/approve`).set(ACTOR, ids.admin).expect(200);
    const audits = (await db.query('SELECT action, actor_id FROM cera.audit_log WHERE target_id = ANY($1::text[]) ORDER BY action', [[cp.counterparty_id, a.address_id]])).rows;
    expect(audits).toEqual([
      { action: 'CONTACT_ADDRESS_APPROVED', actor_id: ids.admin },
      { action: 'CONTACT_CREATED', actor_id: ids.admin },
      { action: 'COUNTERPARTY_CREATED', actor_id: ids.admin },
    ]);
  });

  it('a run waiting for a contact wakes only when the gap owner gets an address this run can use (Mock vs Real); the graph re-reads the registry', async () => {
    const registry = api.get(RegistryService);
    const facilityId = v7();
    const cp = (await http.post('/registry/counterparties').set(ACTOR, ids.admin).send({ display_name: `깨우기 ODCY ${tag()}`, source_role: 'ODCY' }).expect(201)).body;
    const resumed: { id: string; reason: string }[] = [];
    let simulated = true;
    const reconciler = new AgentReconciler(
      { dueRetries: async () => [], waitingOnRecords: async () => [{ agentRunId: 'run-1', waitingReason: 'CONTACT_REGISTRATION_REQUIRED', pendingRefType: 'FACILITY', pendingRefId: facilityId }], recoveryRunOf: async () => 'recovery-1' } as never,
      { resume: async (id: string, reason: string) => (resumed.push({ id, reason }), { already: false }) } as never,
      {} as never,
      {} as never,
      { informationGaps: async () => ({ gaps: [{ subject_id: facilityId, state: 'MISSING', owner_counterparty_id: cp.counterparty_id }] }), run: async () => ({ containsSimulated: simulated }) } as never,
      {} as never,
      { now: () => ({ toDb: () => T0 }) } as never,
      { CERA_AGENT_RECONCILE_ENABLED: true } as never,
      { subscribe: () => undefined } as never,
      registry,
      { latestForAgentRun: async () => null } as never,
    );
    // 주소 없음 → 깨우지 않는다
    expect((await reconciler.runOnce()).woken).toBe(0);
    // 등록만 했다(승인 전) → 아직 쓸 수 없다
    const res = await http.post(`/registry/counterparties/${cp.counterparty_id}/contacts`).set(ACTOR, ids.admin).send({ person_name: '수용 담당', channel_type: 'MOCK', address: `wake-${tag()}@example.com` });
    expect(res.body.code ?? null).toBeNull();
    const withContact = res.body;
    expect((await reconciler.runOnce()).woken).toBe(0);
    await http.post(`/registry/addresses/${withContact.contacts[0].addresses[0].address_id}/approve`).set(ACTOR, ids.admin).expect(200);
    // 실제 실행은 가상(MOCK) 주소를 쓰지 않는다 → 깨우지 않는다
    simulated = false;
    expect((await reconciler.runOnce()).woken).toBe(0);
    // 시나리오 실행 + 승인된 MOCK 주소 → 깨운다(그래프가 등록부를 다시 읽고 초안 · 또는 CONTACT_SELECTION_REQUIRED)
    simulated = true;
    expect((await reconciler.runOnce()).woken).toBe(1);
    expect(resumed).toEqual([{ id: 'run-1', reason: 'REGISTRY_CHANGED' }]);
  });

  it('T-129: a CONTACT_SELECTION_REQUIRED wait whose owner no longer has two usable addresses is woken so the graph re-decides (here: none left → it will wait for registration)', async () => {
    const registry = api.get(RegistryService);
    const resumed: string[] = [];
    const facilityId = v7();
    const reconciler = new AgentReconciler(
      { dueRetries: async () => [], waitingOnRecords: async () => [{ agentRunId: 'run-2', waitingReason: 'CONTACT_SELECTION_REQUIRED', pendingRefType: 'FACILITY', pendingRefId: facilityId }], recoveryRunOf: async () => 'recovery-2' } as never,
      { resume: async (id: string) => (resumed.push(id), { already: false }) } as never,
      {} as never,
      {} as never,
      { informationGaps: async () => ({ gaps: [{ subject_id: facilityId, state: 'MISSING', owner_counterparty_id: v7() }] }), run: async () => ({ containsSimulated: true }) } as never,
      {} as never,
      { now: () => ({ toDb: () => T0 }) } as never,
      { CERA_AGENT_RECONCILE_ENABLED: true } as never,
      { subscribe: () => undefined } as never,
      registry,
      { latestForAgentRun: async () => null } as never,
    );
    expect((await reconciler.runOnce()).woken).toBe(1);
    expect(resumed).toEqual(['run-2']);
  });
});
