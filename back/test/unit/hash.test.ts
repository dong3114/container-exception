import { describe, expect, it } from 'vitest';
import { canonicalHash, canonicalJson, HashMaterialError, isSha256Hash, sha256Bytes } from '../../src/shared/hash/hash.js';

describe('SHA-256 fingerprint', () => {
  it('uses the sha256:<64 lowercase hex> format with a known test vector', () => {
    // FIPS 180-2 "abc"
    expect(sha256Bytes('abc')).toBe('sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Bytes(new Uint8Array([0x61, 0x62, 0x63]))).toBe(sha256Bytes('abc'));
  });

  it('validates the format', () => {
    expect(isSha256Hash(sha256Bytes('x'))).toBe(true);
    expect(isSha256Hash('sha256:ABCDEF')).toBe(false);
    expect(isSha256Hash(`sha256:${'A'.repeat(64)}`)).toBe(false);
    expect(isSha256Hash(`sha512:${'a'.repeat(64)}`)).toBe(false);
  });
});

describe('RFC 8785 JCS canonical material', () => {
  it('sorts keys and removes whitespace (RFC 8785 behaviour)', () => {
    expect(canonicalJson({ v: 1, k: 'demo', b: [3, 'x', null], a: { z: true, y: 'é€' } })).toBe(
      '{"a":{"y":"é€","z":true},"b":[3,"x",null],"k":"demo","v":1}',
    );
  });

  it('escapes control characters as RFC 8785 requires', () => {
    expect(canonicalJson({ k: 'e', v: 1, s: '\u000f\n"\\' })).toBe('{"k":"e","s":"\\u000f\\n\\"\\\\","v":1}');
  });

  it('gives the same hash regardless of key order, different hash for different values', () => {
    const a = canonicalHash({ k: 'event-idem', v: 1, subject: { entity_type: 'FACILITY', entity_id: 'x' }, fact_key: 'capacity' });
    const b = canonicalHash({ fact_key: 'capacity', subject: { entity_id: 'x', entity_type: 'FACILITY' }, v: 1, k: 'event-idem' });
    const c = canonicalHash({ k: 'event-idem', v: 1, subject: { entity_type: 'FACILITY', entity_id: 'y' }, fact_key: 'capacity' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(isSha256Hash(a)).toBe(true);
  });

  it('keeps array order (sets must be sorted by the caller)', () => {
    expect(canonicalHash({ k: 't', v: 1, ids: ['a', 'b'] })).not.toBe(canonicalHash({ k: 't', v: 1, ids: ['b', 'a'] }));
  });

  it('refuses ambiguous material: decimals as numbers, undefined, bigint, missing kind/version', () => {
    expect(() => canonicalJson({ k: 't', v: 1, amount: 12.5 })).toThrow(HashMaterialError);
    expect(() => canonicalJson({ k: 't', v: 1, x: undefined as unknown as null })).toThrow(/undefined/);
    expect(() => canonicalJson({ k: 't', v: 1, x: 1n as unknown as null })).toThrow(HashMaterialError);
    expect(() => canonicalJson({ k: '', v: 1 })).toThrow(/kind/);
    expect(() => canonicalJson({ k: 't', v: 0 })).toThrow(/version/);
    expect(() => canonicalJson({ k: 't', v: 1, d: new Date() as unknown as null })).toThrow(HashMaterialError);
  });
});
