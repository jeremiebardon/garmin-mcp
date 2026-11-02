import pg from 'pg';
import { withAdvisoryLock } from '../../src/database/advisory-lock.js';
import { runMigrations } from '../../src/database/migrate.js';
import {
  startTestPostgres,
  type TestPostgres,
} from '../support/test-postgres.js';

// A promise that the test resolves by hand.
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('advisory lock (integration)', () => {
  let postgres: TestPostgres;
  let pool: pg.Pool;

  beforeAll(async () => {
    postgres = await startTestPostgres();
  }, 120_000);

  afterAll(async () => {
    await postgres?.stop();
  });

  beforeEach(async () => {
    pool = new pg.Pool({
      connectionString: await postgres.createDatabase({ migrated: false }),
    });
  });

  afterEach(async () => {
    await pool.end();
  });

  it('makes a second holder of the same name wait for the first', async () => {
    const events: string[] = [];
    const entered = deferred();
    const release = deferred();
    const first = withAdvisoryLock(pool, 'x', async () => {
      events.push('first:start');
      entered.resolve();
      await release.promise;
      events.push('first:end');
    });
    await entered.promise;
    const second = withAdvisoryLock(pool, 'x', async () => {
      events.push('second:start');
    });
    // Give the second call time to reach Postgres and block there.
    await new Promise((r) => setTimeout(r, 300));
    expect(events).toEqual(['first:start']);
    release.resolve();
    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('does not make a different name wait', async () => {
    const entered = deferred();
    const release = deferred();
    const first = withAdvisoryLock(pool, 'x', async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    const other = await withAdvisoryLock(pool, 'y', async () => 'ran');
    expect(other).toBe('ran');
    release.resolve();
    await first;
  });

  it('releases the lock after the callback throws', async () => {
    await expect(
      withAdvisoryLock(pool, 'x', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await withAdvisoryLock(pool, 'x', async () => 'again')).toBe(
      'again',
    );
    const { rows } = await pool.query(
      "SELECT count(*)::int AS held FROM pg_locks WHERE locktype = 'advisory'",
    );
    expect(rows[0].held).toBe(0);
  });

  it('runs the migrations twice without error and creates the garmin schema', async () => {
    const migrated = new pg.Pool({
      connectionString: await postgres.createDatabase({ migrated: true }),
    });
    try {
      await runMigrations(migrated);
      await runMigrations(migrated);
      const { rows } = await migrated.query(
        "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'garmin'",
      );
      expect(rows).toHaveLength(1);
    } finally {
      await migrated.end();
    }
  });
});
