import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { READINESS_GATE } from '../../src/health/readiness-gate.js';
import { EchoSource, EchoTool } from '../support/echo.tool.js';

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

// Without `ready`, the default readiness gate stays in place.
async function start(ready?: boolean) {
  const builder = Test.createTestingModule({
    imports: [AppModule],
    providers: [EchoSource, EchoTool],
  });
  if (ready !== undefined) {
    builder.overrideProvider(READINESS_GATE).useValue({ isReady: () => ready });
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { app, port };
}

function postMcp(app: INestApplication, origin?: string) {
  const req = request(app.getHttpServer())
    .post('/mcp')
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json, text/event-stream');
  if (origin !== undefined) req.set('Origin', origin);
  return req.send(initialize);
}

describe('MCP over Streamable HTTP (e2e)', () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    ({ app, port } = await start());
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets an SDK client list the test-only tool', async () => {
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${port}/mcp`),
      ),
    );
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(['echo']);
    await client.close();
  });

  it.each([
    ['no Origin', undefined],
    ['localhost', 'http://localhost:6274'],
    ['127.0.0.1', 'http://127.0.0.1:3000'],
    ['[::1]', 'http://[::1]:8080'],
    ['localhost without a port', 'http://localhost'],
  ])('accepts %s', async (_name, origin) => {
    await postMcp(app, origin).expect(200);
  });

  it.each([
    'http://evil.example',
    'https://localhost:3000',
    'http://localhost.evil.com:3000',
    'http://127.0.0.1.evil.com',
    'null',
  ])('rejects Origin %s with 403', async (origin) => {
    await postMcp(app, origin).expect(403);
  });

  it('answers 405 to GET and DELETE', async () => {
    await request(app.getHttpServer()).get('/mcp').expect(405);
    await request(app.getHttpServer()).delete('/mcp').expect(405);
  });

  it('checks the Origin on GET too', async () => {
    await request(app.getHttpServer())
      .get('/mcp')
      .set('Origin', 'http://evil.example')
      .expect(403);
  });
});

describe('health (e2e)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app.close();
  });

  it('is live and ready by default', async () => {
    ({ app } = await start());
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect({ status: 'ok' });
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect({ status: 'ready' });
  });

  it('answers 503 while the gate is not ready, but 403 for a forbidden Origin', async () => {
    ({ app } = await start(false));
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect({ status: 'ok' });
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503)
      .expect({ status: 'not_ready' });
    await postMcp(app).expect(503);
    await postMcp(app, 'http://localhost:3000').expect(503);
    await postMcp(app, 'http://evil.example').expect(403);
  });
});
