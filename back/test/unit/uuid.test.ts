import { v4 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { assertUuidV7, FixedIdGenerator, isUuidV7, UuidV7Generator } from '../../src/shared/id/uuid.js';

/** 시드·fixture 에 쓰는 고정 UUIDv7 값의 예(docs/24 4절 — 결정적 생성기를 만들지 않는다). */
const FIXTURE_IDS = ['01995f5c-6a00-7000-8000-000000000001', '01995f5c-6a00-7000-8000-000000000002'];

describe('UUIDv7', () => {
  it('generates valid, lowercase UUIDv7 values', () => {
    const gen = new UuidV7Generator();
    for (let i = 0; i < 100; i += 1) expect(isUuidV7(gen.newId())).toBe(true);
  });

  it('generated ids sort in creation order (event_id tie-break needs a total order)', () => {
    const gen = new UuidV7Generator();
    const list = Array.from({ length: 500 }, () => gen.newId());
    expect([...list].sort()).toEqual(list);
    expect(new Set(list).size).toBe(list.length);
  });

  it('rejects v4, uppercase and malformed values', () => {
    expect(isUuidV7(v4())).toBe(false);
    expect(isUuidV7(FIXTURE_IDS[0]!.toUpperCase())).toBe(false);
    expect(isUuidV7('not-a-uuid')).toBe(false);
    expect(isUuidV7(42)).toBe(false);
    expect(() => assertUuidV7('0199a8d0-8f00-4000-8000-000000000000')).toThrow(TypeError);
  });

  it('fixture ids are fixed valid UUIDv7 values', () => {
    FIXTURE_IDS.forEach((id) => expect(isUuidV7(id)).toBe(true));
    const gen = new FixedIdGenerator(FIXTURE_IDS);
    expect(gen.newId()).toBe(FIXTURE_IDS[0]);
    expect(gen.newId()).toBe(FIXTURE_IDS[1]);
    expect(() => gen.newId()).toThrow(/exhausted/);
    expect(() => new FixedIdGenerator([v4()])).toThrow(TypeError);
  });
});
