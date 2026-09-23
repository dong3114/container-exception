import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

/**
 * PostgreSQL 연결(docs/24 5절 · 12.2).
 * - 드라이버: node-postgres(`pg`) Pool
 * - 세션 TimeZone = UTC(연결마다 `-c TimeZone=UTC`) — DB 가 돌려주는 시각 문자열이 서버 설정에 따라 달라지지 않게
 * - 실행 앱은 앱 역할(cera_app)로만 붙는다. 소유 역할 연결은 migration 명령만 쓴다
 */
export type DbSchema = typeof schema;
export type Database = NodePgDatabase<DbSchema> & { $client: pg.Pool };
export type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export const PG_POOL = Symbol('CERA_PG_POOL');
export const DATABASE = Symbol('CERA_DATABASE');

export interface PoolOptions {
  connectionString: string;
  applicationName: string;
  max?: number;
  statementTimeoutMs?: number;
}

export function createPool(options: PoolOptions): pg.Pool {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    application_name: options.applicationName,
    max: options.max ?? 10,
    options: '-c TimeZone=UTC',
    statement_timeout: options.statementTimeoutMs ?? 30_000,
    connectionTimeoutMillis: 5_000,
  });
  // 유휴 연결 오류로 프로세스가 죽지 않게 한다(재연결은 다음 checkout 때).
  pool.on('error', () => undefined);
  return pool;
}

export function createDatabase(pool: pg.Pool): Database {
  return drizzle({ client: pool, schema }) as Database;
}
