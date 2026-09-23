import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from '../../src/config/env.js';

const base = { APP_ENV: 'local', DATABASE_URL: 'postgres://cera_app:pw@127.0.0.1:55442/cera' };

describe('parseEnv', () => {
  it('applies defaults for optional values', () => {
    const env = parseEnv(base);
    expect(env).toMatchObject({ APP_ENV: 'local', API_PORT: 3100, LOG_LEVEL: 'log', DB_POOL_MAX: 10, DB_STATEMENT_TIMEOUT_MS: 30_000 });
    expect(env.MIGRATION_DATABASE_URL).toBeUndefined();
  });

  it('coerces numeric strings', () => {
    expect(parseEnv({ ...base, API_PORT: '8080', DB_POOL_MAX: '3' })).toMatchObject({ API_PORT: 8080, DB_POOL_MAX: 3 });
  });

  it('rejects a missing DATABASE_URL and unknown APP_ENV, naming the keys', () => {
    try {
      parseEnv({ APP_ENV: 'prod' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EnvValidationError);
      const text = (e as EnvValidationError).issues.join('\n');
      expect(text).toContain('APP_ENV');
      expect(text).toContain('DATABASE_URL');
    }
  });

  it('rejects non-postgres URLs without echoing the value (it may contain a password)', () => {
    const secret = 'hunter2-secret';
    expect(() => parseEnv({ ...base, DATABASE_URL: `mysql://u:${secret}@h/db` })).toThrowError(/DATABASE_URL/);
    try {
      parseEnv({ ...base, DATABASE_URL: `mysql://u:${secret}@h/db` });
    } catch (e) {
      expect((e as Error).message).not.toContain(secret);
    }
  });

  it('rejects out-of-range ports and invalid log levels', () => {
    expect(() => parseEnv({ ...base, API_PORT: '70000' })).toThrow(EnvValidationError);
    expect(() => parseEnv({ ...base, LOG_LEVEL: 'trace' })).toThrow(EnvValidationError);
  });
});
