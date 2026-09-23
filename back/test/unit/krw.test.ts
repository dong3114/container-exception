import { describe, expect, it } from 'vitest';
import { isDecimalIntegerString, Krw, KrwError } from '../../src/shared/money/krw.js';

describe('Krw (bigint won)', () => {
  it('parses decimal integer strings only', () => {
    expect(Krw.parse('4820000').amount).toBe(4_820_000n);
    expect(Krw.parse('0').amount).toBe(0n);
    for (const bad of ['1.0', '01', '+1', '1e3', ' 1', '1 ', '', '-0', '0x10', '١٢']) {
      expect(() => Krw.parse(bad), bad).toThrow(KrwError);
    }
  });

  it('never accepts a JS number (no implicit conversion)', () => {
    expect(() => Krw.parse(4820000 as unknown as string)).toThrow(KrwError);
    expect(() => Krw.of(4820000 as unknown as bigint)).toThrow(/no implicit number conversion/);
  });

  it('rejects negatives unless the domain rule allows them', () => {
    expect(() => Krw.parse('-1')).toThrow(/Negative/);
    expect(Krw.parse('-1', { allowNegative: true }).isNegative()).toBe(true);
    expect(() => Krw.of(-5n)).toThrow(KrwError);
  });

  it('serialises to a decimal integer string for the API, beyond 2^53 without loss', () => {
    const huge = Krw.parse('9223372036854775807');
    expect(huge.toApi()).toBe('9223372036854775807');
    expect(JSON.stringify({ total: huge })).toBe('{"total":"9223372036854775807"}');
    expect(huge.toDb()).toBe(9_223_372_036_854_775_807n);
  });

  it('reads DB values in bigint or string mode', () => {
    expect(Krw.fromDb(15000n).toApi()).toBe('15000');
    expect(Krw.fromDb('15000').toApi()).toBe('15000');
    expect(Krw.fromDb(-3n).toApi()).toBe('-3');
  });

  it('adds and subtracts in bigint', () => {
    const a = Krw.parse('9007199254740993'); // 2^53 + 1 — number would round
    expect(a.plus(Krw.parse('1')).toApi()).toBe('9007199254740994');
    expect(a.minus(Krw.parse('3')).equals(Krw.parse('9007199254740990'))).toBe(true);
  });

  it('only converts to number explicitly and inside the safe range', () => {
    expect(Krw.parse('15000').toSafeNumber()).toBe(15000);
    expect(() => Krw.parse('9007199254740993').toSafeNumber()).toThrow(/safe integer/);
  });

  it('isDecimalIntegerString guards API inputs', () => {
    expect(isDecimalIntegerString('123')).toBe(true);
    expect(isDecimalIntegerString('-123')).toBe(true);
    expect(isDecimalIntegerString(123)).toBe(false);
    expect(isDecimalIntegerString('12.0')).toBe(false);
  });
});
