import type { INestApplication } from '@nestjs/common';
import type pg from 'pg';
import request from 'supertest';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RecoveryContextService } from '../../src/agent-tools/context.service.js';
import { createApiApp } from '../../src/app/create-api.js';
import { hashPassword } from '../../src/auth/password.js';
import { PlanFollowUpService } from '../../src/planning/follow-up.service.js';
import { RegistryService } from '../../src/registry/registry.service.js';
import { T0, actor, hashOf } from './fixtures.js';
import { appPool, testEnv } from './support.js';

/**
 * 운영 준비 — 받는 사람은 등록부가 정한다: 시설 = 운영 거래처(`facility.operator_counterparty_id`), 트럭 풀 = 소유 운송사.
 * "같은 역할의 첫 거래처"로 보내지 않는다(ODCY B 문의가 ODCY A 회사로 가던 결함). 운영 거래처가 없으면 아무에게도 묻지 않고,
 * 적격 주소가 여럿이면 고르지 않는다. 운영 거래처 지정은 ADMIN 만 · 감사.
 */
const ACTOR = 'X-CERA-Actor-Id';
let api: INestApplication;
let http: ReturnType<typeof request>;
let db: pg.Pool;
const ids = { admin: '', operator: '', field: '' };

async function user(role: 'ADMIN' | 'OPERATOR' | 'FIELD_OPERATOR'): Promise<string> {
  const id = await actor(db, 'HUMAN');
  await db.query(`INSERT INTO cera.user_account (user_id, actor_id, login_id, role, password_hash, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, true, $6, $6)`, [v7(), id, `${role.toLowerCase()}-cr-${id.slice(-8)}`, role, await hashPassword('contact-routing-pw-1'), T0]);
  return id;
}
async function counterparty(role: 'ODCY' | 'WAREHOUSE', name: string, addresses: number): Promise<{ cp: string; addrs: string[] }> {
  const cp = v7();
  await db.query("INSERT INTO cera.counterparty (counterparty_id, display_name, source_role) VALUES ($1, $2, $3)", [cp, name, role]);
  const addrs: string[] = [];
  for (let k = 0; k < addresses; k++) {
    const contact = v7();
    const addr = v7();
    await db.query('INSERT INTO cera.counterparty_contact (contact_id, counterparty_id, person_name) VALUES ($1, $2, $3)', [contact, cp, `${name} 담당 ${k}`]);
    await db.query(
      `INSERT INTO cera.contact_channel_address (address_id, contact_id, channel_type, normalized_address, email_verification_status, relationship_status, communication_status, verified_at, approved_by_actor_id, approved_at)
       VALUES ($1, $2, 'MOCK', $3, 'VERIFIED', 'APPROVED', 'ACTIVE', $4, $5, $4)`,
      [addr, contact, `ops-${addr.slice(-8)}@example.invalid`, T0, ids.operator],
    );
    addrs.push(addr);
  }
  return { cp, addrs };
}
async function facility(type: 'ODCY' | 'WAREHOUSE', name: string): Promise<string> {
  const id = v7();
  await db.query('INSERT INTO cera.facility (facility_id, facility_type, facility_name) VALUES ($1, $2, $3)', [id, type, name]);
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

describe('contact routing (operational readiness) — the registry decides the recipient, never "the first counterparty of a role"', () => {
  it('only an ADMIN sets a facility operator; the role must match; the change is audited', async () => {
    const odcy = await facility('ODCY', `라우팅 ODCY ${v7().slice(-4)}`);
    const x = await counterparty('ODCY', 'ODCY X (합성)', 1);
    const wh = await counterparty('WAREHOUSE', '창고 X (합성)', 1);
    for (const who of [ids.operator, ids.field]) expect((await http.patch(`/registry/facilities/${odcy}/operator`).set(ACTOR, who).send({ counterparty_id: x.cp })).status).toBe(403);
    expect((await http.patch(`/registry/facilities/${odcy}/operator`).set(ACTOR, ids.admin).send({ counterparty_id: wh.cp }).expect(422)).body.code).toBe('ROLE_MISMATCH');
    const set = (await http.patch(`/registry/facilities/${odcy}/operator`).set(ACTOR, ids.admin).send({ counterparty_id: x.cp }).expect(200)).body;
    expect(set).toMatchObject({ facility_id: odcy, operator_counterparty_id: x.cp });
    expect((await db.query("SELECT actor_id FROM cera.audit_log WHERE action = 'FACILITY_OPERATOR_SET' AND target_id = $1", [odcy])).rows).toEqual([{ actor_id: ids.admin }]);
    expect((await http.patch(`/registry/facilities/${odcy}/operator`).set(ACTOR, ids.admin).send({ counterparty_id: null }).expect(200)).body.operator_counterparty_id).toBeNull();
  });

  it('gaps carry the facility operator as their owner (null when none); follow-ups go to that operator only, never to another ODCY company', async () => {
    const fx = await facility('ODCY', `라우팅 X ${v7().slice(-4)}`);
    const fy = await facility('ODCY', `라우팅 Y ${v7().slice(-4)}`);
    const fz = await facility('ODCY', `라우팅 Z ${v7().slice(-4)}`); // 운영 거래처 없음
    const x = await counterparty('ODCY', 'ODCY X (합성)', 1);
    const y = await counterparty('ODCY', 'ODCY Y (합성)', 2); // 적격 주소 둘
    await http.patch(`/registry/facilities/${fx}/operator`).set(ACTOR, ids.admin).send({ counterparty_id: x.cp }).expect(200);
    await http.patch(`/registry/facilities/${fy}/operator`).set(ACTOR, ids.admin).send({ counterparty_id: y.cp }).expect(200);

    // 공백의 주인 = 운영 거래처(시뮬레이션 실행 하나로 본다)
    const scenarioId = v7();
    const snapshotId = v7();
    const runId = v7();
    await db.query("INSERT INTO cera.scenario (scenario_id, scenario_name, as_of_base, created_at) VALUES ($1, 'routing', $2, $2)", [scenarioId, T0]);
    await db.query(`INSERT INTO cera.planning_snapshot (snapshot_id, as_of, fact_fingerprint, rule_version, tariff_version, policy_version, contains_simulated, created_at, scenario_id) VALUES ($1, $2, $3, 'r1', 't1', 'p1', true, $2, $4)`, [snapshotId, T0, hashOf(`snap-${snapshotId}`), scenarioId]);
    await db.query(`INSERT INTO cera.recovery_run (run_id, snapshot_id, trigger_type, trigger_ref, objective_version, run_status, contains_simulated, executed_at) VALUES ($1, $2, 'EXCEPTION_DETECTED', 'ROUTING', 'o1', 'FEASIBLE', true, $3)`, [runId, snapshotId, T0]);
    const gaps = (await api.get(RecoveryContextService).informationGaps(runId)).gaps;
    const owner = (f: string) => gaps.find((g) => g.subject_id === f)?.owner_counterparty_id;
    expect([owner(fx), owner(fy), owner(fz)]).toEqual([x.cp, y.cp, null]);

    // 후속 초안의 받는 사람(같은 규칙): X = 그 주소 하나 · Y = 둘이라 사람이 고른다 · Z = 아무도 아님(다른 ODCY 회사로 보내지 않는다)
    const svc = api.get(PlanFollowUpService) as unknown as { addressFor: (a: unknown, cps: unknown, sim: boolean) => Promise<unknown> };
    const cps = (await api.get(RegistryService).listCounterparties()).counterparties;
    const act = (facilityId: string) => ({ action_key: `ODCY_RECEIVE:${facilityId}:2026-10-13`, kind: 'ODCY_RECEIVE', intent: 'FACILITY_CAPACITY', facility_id: facilityId, date: '2026-10-13', quantity: 2 });
    expect(await svc.addressFor(act(fx), cps, true)).toEqual({ address: x.addrs[0] });
    expect(await svc.addressFor(act(fy), cps, true)).toEqual({ blocked: 'CONTACT_SELECTION_REQUIRED' });
    expect(await svc.addressFor(act(fz), cps, true)).toEqual({ blocked: 'NO_ELIGIBLE_CONTACT' });
    // 실제 실행에는 가상(MOCK) 주소가 적격이 아니다
    expect(await svc.addressFor(act(fx), cps, false)).toEqual({ blocked: 'NO_ELIGIBLE_CONTACT' });
  });
});
