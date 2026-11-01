import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import pg from 'pg';
import { AppModule } from './app.module.js';
import { runMigrations } from './database/migrate.js';
import { READINESS_GATE } from './health/readiness-gate.js';
import type { StartupReadinessGate } from './health/startup-readiness-gate.js';

export interface StartServerOptions {
  databaseUrl: string;
  port: number | string;
  host: string;
}

export interface StartedServer {
  app: INestApplication;
  // Resolves once the migrations are applied and the gate is open.
  ready: Promise<void>;
}

// Listens straight away so `/health/live` answers, but keeps the readiness gate
// closed (503 on `/health/ready` and `/mcp`) until the migrations are applied.
export async function startServer({
  databaseUrl,
  port,
  host,
}: StartServerOptions): Promise<StartedServer> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const gate = app.get<StartupReadinessGate>(READINESS_GATE);
  gate.close();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const scrub = credentialScrubber(databaseUrl);
  // An idle client that loses its connection must not crash the process.
  pool.on('error', (err) => {
    new Logger('Database').error(`Pool error: ${scrub(err.message)}`);
  });
  app.getHttpServer().on('close', () => void pool.end());

  await app.listen(port, host);

  const ready = runMigrations(pool).then(
    () => gate.open(),
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Database startup failed: ${scrub(message)}`);
    },
  );
  return { app, ready };
}

// Removes the URL and its password from driver messages before they surface.
function credentialScrubber(databaseUrl: string): (message: string) => string {
  const secrets = [databaseUrl];
  try {
    const { password } = new URL(databaseUrl);
    if (password) secrets.push(password, decodeURIComponent(password));
  } catch {
    // Not a URL: the whole string is the only secret.
  }
  return (message) =>
    secrets
      .filter(Boolean)
      .reduce((text, secret) => text.split(secret).join('***'), message);
}
