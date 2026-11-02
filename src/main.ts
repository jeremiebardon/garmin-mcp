import { Logger } from '@nestjs/common';
import { startServer } from './bootstrap.js';
import { readDatabaseUrl } from './config/database.config.js';

async function bootstrap() {
  const { ready } = await startServer({
    databaseUrl: readDatabaseUrl(),
    port: process.env.PORT ?? 3000,
    host: process.env.HOST ?? '127.0.0.1',
  });
  await ready;
}

try {
  await bootstrap();
} catch (err) {
  // Every error raised on the way here is free of the URL and its password.
  new Logger('Bootstrap').error(err instanceof Error ? err.message : err);
  process.exit(1);
}
