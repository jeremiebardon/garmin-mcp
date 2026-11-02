import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { withAdvisoryLock } from './advisory-lock.js';

export const MIGRATIONS_LOCK = 'migrations';

// Resolved next to this module, so it is `src/database/migrations` under
// Vitest and `dist/database/migrations` once built.
const migrationsFolder = fileURLToPath(
  new URL('./migrations', import.meta.url),
);

export async function runMigrations(pool: Pool): Promise<void> {
  await withAdvisoryLock(pool, MIGRATIONS_LOCK, () =>
    migrate(drizzle(pool), { migrationsFolder }),
  );
}
