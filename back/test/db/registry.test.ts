import type { INestApplication } from '@nestjs/common';
import type pg from 'pg';
import request from 'supertest';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/app/create-api.js';
import { T0, registry } from './fixtures.js';
import { appPool, expectSqlState, testEnv } from './support.js';

/**
 * T-087 U2 — 등록부 조회 · 발송 자격 endpoint(R-01~03) · 등록부 불변 열 가드(M-11). 실제 PostgreSQL, 앱 역할.
 * 행은 시험마다 새 UUIDv7 로 만든다(시드에 기대지 않는다).
 */
let api: INestApplication;
let app: pg.Pool;

beforeAll(async () => {
  api = await createApiApp(testEnv());
  await api.init();
  app = appPool();
});

afterAll(async () => {
  await api.close();
  await app.end();
});

async function blockedAddress(contactId: string): Promise<string> {
  const addressId = v7();
  await app.query(
    `INSERT INTO cera.contact_channel_address (address_id, contact_id, channel_type, normalized_address,
       email_verification_status, relationship_status, communication_status)
     VALUES ($1, $2, 'MOCK', $3, 'UNVERIFIED', 'PENDING', 'PAUSED')`,
    [addressId, contactId, `blocked-${addressId}@example.invalid`],
  );
  return addressId;
}

describe('GET /registry/addresses/:addressId/eligibility (R-02)', () => {
  it('an eligible MOCK address: six passed conditions, no reasons, simulated, +09:00 evaluation time', async () => {
    const r = await registry(app);
    const res = await request(api.getHttpServer()).get(`/registry/addresses/${r.addressId}/eligibility`).expect(200);
    expect(res.body).toMatchObject({
      address: { address_id: r.addressId, channel_type: 'MOCK', email_verification_status: 'VERIFIED', is_simulated: true },
      contact: { contact_id: r.contactId, is_active: true },
      counterparty: { counterparty_id: r.counterpartyId, is_active: true },
      eligible: true,
      reasons: [],
      dev_safety_applied: false,
    });
    expect(res.body.conditions).toHaveLength(6);
    expect(res.body.evaluated_at).toMatch(/\+09:00$/);
  });

  it('a blocked address names every reason, separated from the dev safety layer', async () => {
    const r = await registry(app);
    const addressId = await blockedAddress(r.contactId);
    await app.query('UPDATE cera.counterparty_contact SET is_active = false WHERE contact_id = $1', [r.contactId]);
    const res = await request(api.getHttpServer()).get(`/registry/addresses/${addressId}/eligibility`).expect(200);
    expect(res.body.eligible).toBe(false);
    expect(res.body.reasons).toEqual([
      { code: 'CONTACT_INACTIVE', layer: 'PRODUCT_RULE' },
      { code: 'NOT_ACTIVE', layer: 'PRODUCT_RULE' },
      { code: 'NOT_VERIFIED', layer: 'PRODUCT_RULE' },
      { code: 'NOT_APPROVED', layer: 'PRODUCT_RULE' },
    ]);
  });

  it('unknown id → 404 ADDRESS_NOT_FOUND, malformed id → 400 INVALID_ID, both in the common error body', async () => {
    const missing = await request(api.getHttpServer()).get(`/registry/addresses/${v7()}/eligibility`).expect(404);
    expect(missing.body).toMatchObject({ code: 'ADDRESS_NOT_FOUND', message: expect.any(String) });
    expect(missing.body.request_id).toBe(missing.headers['x-request-id']);
    const bad = await request(api.getHttpServer()).get('/registry/addresses/not-a-uuid/eligibility').expect(400);
    expect(Object.keys(bad.body).sort()).toEqual(['code', 'message', 'request_id']);
    expect(bad.body.code).toBe('INVALID_ID');
  });

  it('the allowlist applies to a real-channel address outside production (fail-closed when empty)', async () => {
    const r = await registry(app);
    const addressId = v7();
    await app.query(
      `INSERT INTO cera.contact_channel_address (address_id, contact_id, channel_type, normalized_address, email_verification_status,
         relationship_status, communication_status, verified_at, approved_by_actor_id, approved_at)
       VALUES ($1, $2, 'GMAIL', $3, 'VERIFIED', 'APPROVED', 'ACTIVE', $4, $5, $4)`,
      [addressId, r.contactId, `real-${addressId}@example.invalid`, T0, r.humanId],
    );
    const res = await request(api.getHttpServer()).get(`/registry/addresses/${addressId}/eligibility`).expect(200);
    expect(res.body).toMatchObject({ eligible: false, dev_safety_applied: true, reasons: [{ code: 'NOT_IN_TEST_ALLOWLIST', layer: 'DEV_SAFETY' }] });
    expect(res.body.address.is_simulated).toBe(false);
  });
});

describe('GET /registry/counterparties (R-01)', () => {
  it('groups counterparty → contacts → addresses and gives each address its verdict', async () => {
    const r = await registry(app);
    const blocked = await blockedAddress(r.contactId);
    const res = await request(api.getHttpServer()).get('/registry/counterparties').expect(200);
    expect(res.body.evaluated_at).toMatch(/\+09:00$/);
    const cp = res.body.counterparties.find((c: { counterparty_id: string }) => c.counterparty_id === r.counterpartyId);
    expect(cp).toMatchObject({ display_name: 'Test Trucking', source_role: 'TRUCKING', is_active: true });
    const addresses = cp.contacts.flatMap((c: { addresses: unknown[] }) => c.addresses);
    expect(addresses.find((a: { address_id: string }) => a.address_id === r.addressId)).toMatchObject({ eligible: true, reasons: [] });
    expect(addresses.find((a: { address_id: string }) => a.address_id === blocked)).toMatchObject({
      eligible: false,
      reasons: [
        { code: 'NOT_ACTIVE', layer: 'PRODUCT_RULE' },
        { code: 'NOT_VERIFIED', layer: 'PRODUCT_RULE' },
        { code: 'NOT_APPROVED', layer: 'PRODUCT_RULE' },
      ],
    });
  });
});

describe('OpenAPI carries the registry contract (R-03)', () => {
  it('both paths with typed response schemas and the gate enums', async () => {
    const res = await request(api.getHttpServer()).get('/openapi.json').expect(200);
    expect(Object.keys(res.body.paths)).toEqual(expect.arrayContaining(['/registry/counterparties', '/registry/addresses/{addressId}/eligibility']));
    const schemas = res.body.components.schemas;
    expect(schemas.ContactEligibilityDto.required).toEqual(expect.arrayContaining(['eligible', 'conditions', 'reasons', 'evaluated_at']));
    expect(schemas.GateReasonDto.properties.code.enum).toEqual([
      'COUNTERPARTY_INACTIVE',
      'CONTACT_INACTIVE',
      'NOT_ACTIVE',
      'NOT_VERIFIED',
      'NOT_APPROVED',
      'NOT_IN_TEST_ALLOWLIST',
    ]);
    expect(res.body.paths['/registry/addresses/{addressId}/eligibility'].get.responses['404']).toBeDefined();
  });
});

describe('registry immutable columns (M11 — docs/24 12.1 exception)', () => {
  it('the app role cannot redirect an address or move it to another contact or channel (CE002)', async () => {
    const r = await registry(app);
    const other = await registry(app);
    await expectSqlState(
      app.query("UPDATE cera.contact_channel_address SET normalized_address = 'attacker@example.invalid' WHERE address_id = $1", [r.addressId]),
      'CE002',
    );
    await expectSqlState(app.query('UPDATE cera.contact_channel_address SET contact_id = $2 WHERE address_id = $1', [r.addressId, other.contactId]), 'CE002');
    await expectSqlState(app.query("UPDATE cera.contact_channel_address SET channel_type = 'GMAIL' WHERE address_id = $1", [r.addressId]), 'CE002');
    await expectSqlState(
      app.query('UPDATE cera.counterparty_contact SET counterparty_id = $2 WHERE contact_id = $1', [r.contactId, other.counterpartyId]),
      'CE002',
    );
  });

  it('status and name columns still change (normal registry maintenance)', async () => {
    const r = await registry(app);
    await app.query(
      "UPDATE cera.contact_channel_address SET communication_status = 'PAUSED', email_verification_status = 'EXPIRED' WHERE address_id = $1",
      [r.addressId],
    );
    await app.query("UPDATE cera.counterparty_contact SET person_name = 'Night desk', team = 'Night', is_active = false WHERE contact_id = $1", [r.contactId]);
    const { rows } = await app.query('SELECT communication_status, email_verification_status FROM cera.contact_channel_address WHERE address_id = $1', [
      r.addressId,
    ]);
    expect(rows).toEqual([{ communication_status: 'PAUSED', email_verification_status: 'EXPIRED' }]);
  });
});
