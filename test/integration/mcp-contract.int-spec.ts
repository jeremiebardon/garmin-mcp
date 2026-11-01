import { Test, type TestingModule } from '@nestjs/testing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { AppModule } from '../../src/app.module.js';
import { McpServerService } from '../../src/mcp/services/mcp-server.service.js';
import { EchoSource, EchoTool } from '../support/echo.tool.js';

// Update on purpose: npx vitest run --project integration -u test/integration/mcp-contract.int-spec.ts
describe('MCP contract (integration)', () => {
  let moduleRef: TestingModule;
  let client: Client;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      providers: [EchoSource, EchoTool],
    }).compile();
    await moduleRef.init();
    const server = moduleRef.get(McpServerService).create();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterAll(async () => {
    await client.close();
    await moduleRef.close();
  });

  it('matches the committed contract snapshot', async () => {
    const { tools } = await client.listTools();
    const contract = tools
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations,
      }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const serialised = JSON.stringify(contract, null, 2) + '\n';
    await expect(serialised).toMatchFileSnapshot(
      './__snapshots__/mcp-contract.json',
    );
  });
});
