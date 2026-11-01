import { Injectable } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { McpTool } from '../../src/mcp/decorators/mcp-tool.decorator.js';
import { McpModule } from '../../src/mcp/mcp.module.js';
import { McpServerService } from '../../src/mcp/services/mcp-server.service.js';
import { EchoSource, EchoTool } from '../support/echo.tool.js';

@Injectable()
class BrokenTool {
  @McpTool({
    name: 'broken',
    description: 'Returns an object that violates its own output schema.',
    inputSchema: z.object({}),
    outputSchema: z.object({ count: z.number() }),
  })
  broken() {
    return { count: 'not a number' };
  }
}

describe('MCP registry (integration)', () => {
  let moduleRef: TestingModule;
  let client: Client;

  async function connect(providers: any[]) {
    moduleRef = await Test.createTestingModule({
      imports: [McpModule],
      providers,
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
  }

  afterEach(async () => {
    await client.close();
    await moduleRef.close();
  });

  it('lists nothing when no tool is registered', async () => {
    await connect([]);
    expect((await client.listTools()).tools).toEqual([]);
  });

  it('sends the server instructions', async () => {
    await connect([]);
    const instructions = client.getInstructions();
    expect(instructions?.split('\n')).toHaveLength(5);
    expect(instructions).toContain('Never declare a Race');
    expect(instructions).toContain('freshness.stale');
  });

  it('lists the discovered tool with its schemas and annotations', async () => {
    await connect([EchoSource, EchoTool]);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(1);
    const [tool] = tools;
    expect(tool.name).toBe('echo');
    expect(tool.description).toBe(
      'Echoes a message together with a value from an injected provider.',
    );
    expect(tool.annotations).toEqual({ readOnlyHint: true });
    expect(tool.inputSchema).toMatchObject({
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    });
    expect(tool.outputSchema).toMatchObject({
      type: 'object',
      properties: { message: { type: 'string' }, source: { type: 'string' } },
      required: ['message', 'source'],
    });
  });

  it('returns structuredContent and one compact text block', async () => {
    await connect([EchoSource, EchoTool]);
    const result = await client.callTool({
      name: 'echo',
      arguments: { message: 'hi' },
    });
    expect(result.isError).toBeFalsy();
    // The injected dependency is reachable through `this`.
    expect(result.structuredContent).toEqual({
      message: 'hi',
      source: 'from-injected-provider',
    });
    const content = result.content as { type: string; text: string }[];
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe('text');
    expect(content[0].text).toBe(JSON.stringify(result.structuredContent));
  });

  it('rejects input that violates the input schema without calling the handler', async () => {
    await connect([EchoSource, EchoTool]);
    const result = await client.callTool({
      name: 'echo',
      arguments: { message: 42 },
    });
    expect(result.isError).toBe(true);
    expect(moduleRef.get(EchoSource).handled).toEqual([]);
  });

  it('returns an error result without structuredContent for invalid output', async () => {
    await connect([BrokenTool]);
    const result = await client.callTool({ name: 'broken', arguments: {} });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
  });
});
