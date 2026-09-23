import { describe, expect, it } from 'vitest';
import { FakeClock, SystemClock } from '../../src/shared/time/clock.js';
import { Instant } from '../../src/shared/time/instant.js';

describe('Instant', () => {
  it('parses ISO 8601 with Z or an offset to the same instant', () => {
    const a = Instant.parseIso('2026-09-22T18:04:14.246+09:00');
    const b = Instant.parseIso('2026-09-22T09:04:14.246Z');
    expect(a.equals(b)).toBe(true);
    expect(a.toIsoUtc()).toBe('2026-09-22T09:04:14.246Z');
  });

  it('refuses timestamps without an offset (no silent timezone guessing)', () => {
    expect(() => Instant.parseIso('2026-09-22T09:04:14')).toThrow(/offset/);
    expect(() => Instant.parseIso('2026-09-22 09:04:14')).toThrow();
    expect(() => Instant.parseIso('not a date')).toThrow();
  });

  it('truncates below milliseconds to match timestamptz(3)', () => {
    expect(Instant.parseIso('2026-09-22T00:00:00.123999Z').toIsoUtc()).toBe('2026-09-22T00:00:00.123Z');
    expect(Instant.parseIso('2026-09-22T00:00Z').toIsoUtc()).toBe('2026-09-22T00:00:00.000Z');
  });

  it('formats Asia/Seoul (+09:00) for API output, including across the date line', () => {
    expect(Instant.parseIso('2026-09-22T20:30:00Z').toSeoulIso()).toBe('2026-09-23T05:30:00.000+09:00');
    expect(JSON.stringify({ at: Instant.parseIso('2026-09-22T00:00:00Z') })).toBe('{"at":"2026-09-22T09:00:00.000+09:00"}');
  });

  it('reads node-postgres timestamptz strings', () => {
    expect(Instant.fromDb('2026-09-22 09:04:14.246+00').toIsoUtc()).toBe('2026-09-22T09:04:14.246Z');
    expect(Instant.fromDb('2026-09-22 09:04:14+00').toIsoUtc()).toBe('2026-09-22T09:04:14.000Z');
    expect(Instant.fromDb('2026-09-22 18:04:14.5+09').toIsoUtc()).toBe('2026-09-22T09:04:14.500Z');
  });

  it('compares and adds', () => {
    const t = Instant.parseIso('2026-09-22T00:00:00Z');
    expect(t.plusMs(1).isAfter(t)).toBe(true);
    expect(t.isBefore(t.plusMs(1))).toBe(true);
    expect(t.compareTo(t)).toBe(0);
    expect(() => Instant.ofEpochMs(1.5)).toThrow();
  });
});

describe('Clock', () => {
  it('FakeClock stays still until moved', () => {
    const clock = new FakeClock('2026-09-22T09:00:00+09:00');
    expect(clock.now().toSeoulIso()).toBe('2026-09-22T09:00:00.000+09:00');
    expect(clock.now().equals(clock.now())).toBe(true);
    clock.advanceMs(30 * 60 * 1000);
    expect(clock.now().toSeoulIso()).toBe('2026-09-22T09:30:00.000+09:00');
    clock.set('2026-01-01T00:00:00Z');
    expect(clock.now().toIsoUtc()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('SystemClock returns the current time as an Instant', () => {
    const before = Date.now();
    const now = new SystemClock().now();
    expect(now).toBeInstanceOf(Instant);
    expect(now.epochMs).toBeGreaterThanOrEqual(before);
    expect(now.epochMs - before).toBeLessThan(1000);
  });
});
