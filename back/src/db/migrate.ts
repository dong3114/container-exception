import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadDotEnvIfPresent } from '../config/env.js';
import { createPool } from './database.js';

/**
 * 검토·커밋된 SQL migration(M01~M10)을 **명시적으로** 적용한다(ADR-034 결정 5).
 * - 소유 역할(MIGRATION_DATABASE_URL)로만 돈다. 앱 기동 때 자동으로 돌지 않는다
 * - `drizzle-kit push` 는 쓰지 않는다
 * - 이미 적용된 migration 은 이력 표(cera_meta.drizzle_migrations)를 보고 건너뛴다 — 반복 실행해도 안전하다
 */
export const MIGRATIONS_FOLDER = 'drizzle/migrations';
export const MIGRATIONS_SCHEMA = 'cera_meta';
export const MIGRATIONS_TABLE = 'drizzle_migrations';

export async function applyMigrations(ownerConnectionString: string, migrationsFolder = MIGRATIONS_FOLDER): Promise<void> {
  if (!existsSync(join(migrationsFolder, 'meta', '_journal.json'))) {
    throw new Error(`No migration journal under ${migrationsFolder}`);
  }
  const pool = createPool({ connectionString: ownerConnectionString, applicationName: 'cera-migrate', max: 1 });
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder,
      migrationsSchema: MIGRATIONS_SCHEMA,
      migrationsTable: MIGRATIONS_TABLE,
    });
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  loadDotEnvIfPresent();
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error('MIGRATION_DATABASE_URL is required (migration owner role)');
  await applyMigrations(url);
  console.log('Migrations applied.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
