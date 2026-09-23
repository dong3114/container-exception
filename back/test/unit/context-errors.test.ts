import { describe, expect, it } from 'vitest';
import {
  contextFromHeaders,
  currentContext,
  newJobContext,
  outboundHeaders,
  parseTraceparent,
  runWithContext,
  setCorrelationId,
} from '../../src/shared/context/request-context.js';
import { BusinessRuleError, SystemError, ValidationError } from '../../src/shared/errors/cera-error.js';
import { isUuidV7 } from '../../src/shared/id/uuid.js';

const TRACE = '4bf92f3577b34da6a3ce929d0e0e4736';

describe('request / trace / correlation context', () => {
  it('keeps a valid W3C traceparent and rejects invalid or all-zero ones', () => {
    expect(parseTraceparent(`00-${TRACE}-00f067aa0ba902b7-01`)).toBe(TRACE);
    expect(parseTraceparent(`00-${'0'.repeat(32)}-00f067aa0ba902b7-01`)).toBeNull();
    expect(parseTraceparent('garbage')).toBeNull();
    expect(parseTraceparent(undefined)).toBeNull();
  });

  it('builds a context from headers; business correlation id is never invented', () => {
    const ctx = contextFromHeaders({ traceparent: `00-${TRACE}-00f067aa0ba902b7-01` });
    expect(ctx.traceId).toBe(TRACE);
    expect(isUuidV7(ctx.requestId)).toBe(true);
    expect(ctx.correlationId).toBeNull();
    expect(contextFromHeaders({ 'x-cera-correlation-id': 'thread:0199' }).correlationId).toBe('thread:0199');
    expect(contextFromHeaders({ 'x-cera-correlation-id': 'bad value with spaces' }).correlationId).toBeNull();
  });

  it('trace id and correlation id stay separate and propagate to outbound headers', () => {
    const ctx = newJobContext();
    runWithContext(ctx, () => {
      setCorrelationId('run:0199');
      const h = outboundHeaders();
      expect(h['x-request-id']).toBe(ctx.requestId);
      expect(h.traceparent).toMatch(new RegExp(`^00-${ctx.traceId}-[0-9a-f]{16}-01$`));
      expect(h['x-cera-correlation-id']).toBe('run:0199');
      expect(ctx.traceId).not.toBe('run:0199');
    });
    expect(currentContext()).toBeUndefined();
    expect(outboundHeaders()).toEqual({});
  });

  it('context survives awaits inside the same run', async () => {
    const ctx = newJobContext();
    await runWithContext(ctx, async () => {
      await new Promise((r) => setTimeout(r, 5));
      expect(currentContext()?.requestId).toBe(ctx.requestId);
    });
  });
});

describe('error kinds', () => {
  it('separates business, validation and system errors with HTTP status and code', () => {
    const b = new BusinessRuleError('APPROVAL_EXPIRED', 'Approval has expired');
    const v = new ValidationError('INVALID_KRW', 'amount must be a decimal integer string', ['amount']);
    const s = new SystemError('DB_UNAVAILABLE', 'Database unavailable');
    expect([b.kind, b.httpStatus]).toEqual(['BUSINESS', 409]);
    expect([v.kind, v.httpStatus, v.fields]).toEqual(['VALIDATION', 400, ['amount']]);
    expect([s.kind, s.httpStatus]).toEqual(['SYSTEM', 500]);
    expect(() => new BusinessRuleError('bad-code', 'x')).toThrow(/UPPER_SNAKE/);
  });
});
