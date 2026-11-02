// Serialises work across processes with a named Postgres advisory lock. The
// migration runner is its first user; Sync, the CLI and recompute will reuse it.
import type { Pool } from 'pg';

export async function withAdvisoryLock<T>(
  pool: Pool,
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    // Session-level lock: it waits while another session holds the same name.
    await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [
      name,
    ]);
    try {
      return await fn();
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [
        name,
      ]);
    }
  } finally {
    client.release();
  }
}
