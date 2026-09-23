import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadDotEnvIfPresent } from '../config/env.js';
import { createPool } from './database.js';

/**
 * 검토·커밋된 SQL migration 을 **명시적으로** 적용한다(ADR-034 결정 5).
 * - 소유 역할(MIGRATION_DATABASE_URL)로만 돈다. 앱 기동 때 자동으로 돌지 않는다
 * - `drizzle-kit push` 는 쓰지 않는다
 */
export const MIGRATIONS_FOLDER = 'drizzle/migrations';
export const MIGRATIONS_SCHEMA = 'cera_meta';
export const MIGRATIONS_TABLE = 'drizzle_migrations';

async function main(): Promise<void> {
  loadDotEnvIfPresent();
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error('MIGRATION_DATABASE_URL is required (migration owner role)');
  if (!existsSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'))) {
    console.log('No migrations to apply yet (P0 schema arrives in U1).');
    return;
  }
  const pool = createPool({ connectionString: url, applicationName: 'cera-migrate', max: 1 });
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: MIGRATIONS_SCHEMA,
      migrationsTable: MIGRATIONS_TABLE,
    });
    console.log('Migrations applied.');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
