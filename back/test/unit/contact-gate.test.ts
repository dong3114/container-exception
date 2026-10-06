import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type DevSafetyPolicy, type GateInput, GATE_CONDITIONS, evaluateContactGate } from '../../src/registry/contact-gate.js';

/** T-069 14.2 G-01~05 + T-087 Plan 8절 G-a · G-b. 판정은 순수 함수 — DB · 네트워크 없이. */
const open = (): GateInput => ({
  counterparty: { isActive: true },
  contact: { isActive: true },
  address: {
    channelType: 'MOCK',
    normalizedAddress: 'dispatch@k-trucking.example.invalid',
    emailVerificationStatus: 'VERIFIED',
    relationshipStatus: 'APPROVED',
    communicationStatus: 'ACTIVE',
  },
});
const local: DevSafetyPolicy = { appEnv: 'local', allowlist: [] };
const codes = (input: GateInput, safety: DevSafetyPolicy = local) => evaluateContactGate(input, safety).reasons.map((r) => r.code);
const withAddress = (patch: Partial<GateInput['address']>): GateInput => ({ ...open(), address: { ...open().address, ...patch } });

describe('Contact Gate — product rule (FR-ELG-01 · FR-ELG-04)', () => {
  it('a fully registered, verified, approved, active MOCK address is eligible', () => {
    const result = evaluateContactGate(open(), local);
    expect(result).toMatchObject({ eligible: true, reasons: [], devSafetyApplied: false });
    expect(result.conditions.every((c) => c.passed)).toBe(true);
  });

  it('G-01 an unverified address is blocked with NOT_VERIFIED (every non-VERIFIED status)', () => {
    for (const status of ['UNVERIFIED', 'PENDING', 'FAILED', 'EXPIRED']) {
      expect(codes(withAddress({ emailVerificationStatus: status }))).toEqual(['NOT_VERIFIED']);
    }
  });

  it('G-02 an address whose business relationship is not approved is blocked with NOT_APPROVED', () => {
    expect(codes(withAddress({ relationshipStatus: 'PENDING' }))).toEqual(['NOT_APPROVED']);
    expect(codes(withAddress({ relationshipStatus: 'REJECTED' }))).toEqual(['NOT_APPROVED']);
  });

  it('G-03 paused or inactive communication is blocked with one NOT_ACTIVE (conditions ③ and ⑥ share the column)', () => {
    const paused = evaluateContactGate(withAddress({ communicationStatus: 'PAUSED' }), local);
    expect(paused.reasons.map((r) => r.code)).toEqual(['NOT_ACTIVE']);
    expect(paused.conditions.find((c) => c.condition === 'ADDRESS_ACTIVE')?.passed).toBe(true);
    expect(paused.conditions.find((c) => c.condition === 'COMMUNICATION_ACTIVE')?.passed).toBe(false);
    const inactive = evaluateContactGate(withAddress({ communicationStatus: 'INACTIVE' }), local);
    expect(inactive.reasons.map((r) => r.code)).toEqual(['NOT_ACTIVE']);
    expect(inactive.conditions.filter((c) => !c.passed).map((c) => c.condition)).toEqual(['ADDRESS_ACTIVE', 'COMMUNICATION_ACTIVE']);
  });

  it('G-04 an inactive counterparty or contact blocks the address (COUNTERPARTY_INACTIVE · CONTACT_INACTIVE)', () => {
    expect(codes({ ...open(), counterparty: { isActive: false } })).toEqual(['COUNTERPARTY_INACTIVE']);
    expect(codes({ ...open(), contact: { isActive: false } })).toEqual(['CONTACT_INACTIVE']);
  });

  it('G-a every failing condition is reported, and all six conditions are always returned in order', () => {
    const result = evaluateContactGate(
      { counterparty: { isActive: false }, contact: { isActive: true }, address: { ...open().address, emailVerificationStatus: 'UNVERIFIED', relationshipStatus: 'PENDING' } },
      local,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual([
      { code: 'COUNTERPARTY_INACTIVE', layer: 'PRODUCT_RULE' },
      { code: 'NOT_VERIFIED', layer: 'PRODUCT_RULE' },
      { code: 'NOT_APPROVED', layer: 'PRODUCT_RULE' },
    ]);
    expect(result.conditions.map((c) => c.condition)).toEqual([...GATE_CONDITIONS]);
  });
});

describe('Development safety allowlist (G-05 · docs/18 G.5 · FR-ELG-05)', () => {
  const gmail = (address = 'qa@cera-test.example.invalid') => withAddress({ channelType: 'GMAIL', normalizedAddress: address });

  it('a real channel outside production must be on the allowlist (DEV_SAFETY layer)', () => {
    const result = evaluateContactGate(gmail(), { appEnv: 'staging', allowlist: ['someone-else@cera-test.example.invalid'] });
    expect(result).toMatchObject({ eligible: false, devSafetyApplied: true, reasons: [{ code: 'NOT_IN_TEST_ALLOWLIST', layer: 'DEV_SAFETY' }] });
    expect(evaluateContactGate(gmail(), { appEnv: 'staging', allowlist: ['qa@cera-test.example.invalid'] }).eligible).toBe(true);
    expect(evaluateContactGate(withAddress({ channelType: 'PORTAL' }), { appEnv: 'test', allowlist: [] }).devSafetyApplied).toBe(true);
  });

  it('an empty allowlist blocks every real-channel address (fail-closed)', () => {
    for (const appEnv of ['local', 'test', 'staging'] as const) {
      expect(codes(gmail(), { appEnv, allowlist: [] })).toEqual(['NOT_IN_TEST_ALLOWLIST']);
    }
  });

  it('matching ignores case and surrounding spaces of the stored address', () => {
    expect(evaluateContactGate(gmail('  QA@Cera-Test.example.invalid '), { appEnv: 'local', allowlist: ['qa@cera-test.example.invalid'] }).eligible).toBe(true);
  });

  it('MOCK never leaves the system and production relies on the product gate only — no allowlist check', () => {
    expect(evaluateContactGate(open(), { appEnv: 'local', allowlist: [] })).toMatchObject({ eligible: true, devSafetyApplied: false });
    expect(evaluateContactGate(gmail(), { appEnv: 'production', allowlist: [] })).toMatchObject({ eligible: true, devSafetyApplied: false });
  });

  it('being on the allowlist never replaces the product gate (the two layers do not stand in for each other)', () => {
    const unverified = withAddress({ channelType: 'GMAIL', normalizedAddress: 'qa@cera-test.example.invalid', emailVerificationStatus: 'UNVERIFIED' });
    expect(codes(unverified, { appEnv: 'local', allowlist: ['qa@cera-test.example.invalid'] })).toEqual(['NOT_VERIFIED']);
  });
});

describe('G-b the gate is deterministic backend logic (ADR-029 · FR-ELG-02)', () => {
  it('imports nothing — no database, network, framework or LLM client', () => {
    const source = readFileSync('src/registry/contact-gate.ts', 'utf8');
    expect(source.match(/^\s*import\s/gm) ?? []).toEqual([]);
  });

  it('the same input always gives the same verdict', () => {
    const input = withAddress({ relationshipStatus: 'PENDING' });
    expect(evaluateContactGate(input, local)).toEqual(evaluateContactGate(input, local));
  });
});
