import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { startServer } from '../../src/bootstrap.js';
import { withAdvisoryLock } from '../../src/database/advisory-lock.js';
import { MIGRATIONS_LOCK } from '../../src/database/migrate.js';
import {
  startTestPostgres,
  type TestPostgres,
} from '../support/test-postgres.js';

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '0.0.0' },
  },
};

function postMcp(app: INestApplication) {
  return request(app.getHttpServer())
    .post('/mcp')
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json, text/event-stream')
    .send(initialize);
}

// A promise that the test resolves by hand.
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('startup readiness (e2e)', () => {
  let postgres: TestPostgres;
  let app: INestApplication | undefined;

  beforeAll(async () => {
    postgres = await startTestPostgres();
  }, 120_000);

  afterAll(async () => {
    await postgres?.stop();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.restoreAllMocks();
  });

  it('answers 503 until the migrations are applied, then 200', async () => {
    const databaseUrl = await postgres.createDatabase({ migrated: false });
    const pool = new pg.Pool({ connectionString: databaseUrl });
    const held = deferred();
    const release = deferred();
    // Holding the migration lock keeps the server's runner waiting.
    const holding = withAdvisoryLock(pool, MIGRATIONS_LOCK, async () => {
      held.resolve();
      await release.promise;
    });
    try {
      await held.promise;
      const started = await startServer({
        databaseUrl,
        port: 0,
        host: '127.0.0.1',
      });
      app = started.app;

      await request(app.getHttpServer())
        .get('/health/ready')
        .expect(503)
        .expect({ status: 'not_ready' });
      await postMcp(app).expect(503);
      await request(app.getHttpServer())
        .get('/health/live')
        .expect(200)
        .expect({ status: 'ok' });

      release.resolve();
      await holding;
      await started.ready;

      await request(app.getHttpServer())
        .get('/health/ready')
        .expect(200)
        .expect({ status: 'ready' });
      await postMcp(app).expect(200);
    } finally {
      release.resolve();
      await holding;
      await pool.end();
    }
  });

  it('stays not ready and never reveals the password when it cannot connect', async () => {
    const url = new URL(await postgres.createDatabase({ migrated: false }));
    const password = randomUUID();
    url.password = password;

    const output: string[] = [];
    for (const stream of [process.stdout, process.stderr]) {
      const write = stream.write.bind(stream);
      vi.spyOn(stream, 'write').mockImplementation(((
        chunk: unknown,
        ...rest: unknown[]
      ) => {
        output.push(String(chunk));
        return (write as (...args: unknown[]) => boolean)(chunk, ...rest);
      }) as typeof stream.write);
    }

    const started = await startServer({
      databaseUrl: url.toString(),
      port: 0,
      host: '127.0.0.1',
    });
    app = started.app;

    const error = await started.ready.then(
      () => undefined,
      (err: unknown) => err as Error,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).not.toContain(password);
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503)
      .expect({ status: 'not_ready' });
    await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(output.join('')).not.toContain(password);
  });
});
