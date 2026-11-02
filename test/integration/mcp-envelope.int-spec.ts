import { Injectable } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { McpTool } from '../../src/mcp/decorators/mcp-tool.decorator.js';
import {
  DomainMissError,
  TRACE_ID_PROVIDER,
  nulls,
  nullsSchema,
  sizeGuardShape,
} from '../../src/mcp/envelope/index.js';
import { McpModule } from '../../src/mcp/mcp.module.js';
import { McpServerService } from '../../src/mcp/services/mcp-server.service.js';

const SECRET = '<synthetic secret 9000000001>';

@Injectable()
class EnvelopeTools {
  readonly handled: unknown[] = [];

  @McpTool({
    name: 'missing',
    description: 'Throws a domain miss.',
    inputSchema: z.object({}),
    outputSchema: z.object({ id: z.number() }),
  })
  missing(): { id: number } {
    throw new DomainMissError({
      code: 'activity_not_found',
      message: 'No Activity 42.',
      hint: 'Call list_activities.',
    });
  }

  @McpTool({
    name: 'empty',
    description: 'Returns an empty main array.',
    inputSchema: z.object({}),
    outputSchema: z.object({ rows: z.array(z.number()) }),
  })
  empty() {
    return { rows: [] };
  }

  @McpTool({
    name: 'nullish',
    description: 'Returns a null field with a reason.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      hrBpm: z.number().nullable(),
      nulls: nullsSchema.optional(),
    }),
  })
  nullish() {
    return nulls({ hrBpm: null }, { hrBpm: 'no_hr' });
  }

  @McpTool({
    name: 'boom',
    description: 'Throws an unexpected error.',
    inputSchema: z.object({}),
    outputSchema: z.object({ id: z.number() }),
  })
  boom(): { id: number } {
    throw new Error(SECRET);
  }

  @McpTool({
    name: 'leaky',
    description: 'Returns values that violate the output schema.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      restingHrBpm: z.number(),
      position: z.object({ lat: z.number() }),
    }),
  })
  leaky() {
    return {
      restingHrBpm: 'sentinel-999',
      position: { lat: 'sentinel-45.123' },
    };
  }

  @McpTool({
    name: 'guarded',
    description: 'Input-checked tool.',
    inputSchema: z.object({ n: z.number() }),
    outputSchema: z.object({ n: z.number() }),
  })
  guarded({ n }: { n: number }) {
    this.handled.push(n);
    return { n };
  }

  @McpTool({
    name: 'big',
    description: 'Returns far more than the size limit.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      rows: z.array(z.object({ id: z.number(), note: z.string() })),
      current: z.object({ label: z.string() }),
      ...sizeGuardShape,
    }),
    mainArray: 'rows',
  })
  big() {
    return {
      rows: Array.from({ length: 400 }, (_, id) => ({
        id,
        note: 'n'.repeat(100),
      })),
      current: { label: 'now' },
    };
  }

  @McpTool({
    name: 'big_no_main',
    description: 'Over the limit, no main array declared.',
    inputSchema: z.object({}),
    outputSchema: z.object({ blob: z.string() }),
  })
  bigNoMain() {
    return { blob: 'b'.repeat(30_000) };
  }

  @McpTool({
    name: 'big_empty_main',
    description: 'Over the limit with an empty main array.',
    inputSchema: z.object({}),
    outputSchema: z.object({ rows: z.array(z.number()), blob: z.string() }),
    mainArray: 'rows',
  })
  bigEmptyMain() {
    return { rows: [], blob: 'b'.repeat(30_000) };
  }

  @McpTool({
    name: 'big_undeclared',
    description: 'Truncation would need truncated and hint in the schema.',
    inputSchema: z.object({}),
    outputSchema: z.object({ rows: z.array(z.string()) }),
    mainArray: 'rows',
  })
  bigUndeclared() {
    return { rows: Array.from({ length: 1000 }, () => 'r'.repeat(100)) };
  }
}

describe('MCP response envelope (integration)', () => {
  let moduleRef: TestingModule;
  let client: Client;

  async function connect(traceId?: string) {
    const builder = Test.createTestingModule({
      imports: [McpModule],
      providers: [EnvelopeTools],
    });
    if (traceId) {
      builder.overrideProvider(TRACE_ID_PROVIDER).useValue({
        getTraceId: () => traceId,
      });
    }
    moduleRef = await builder.compile();
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

  async function call(name: string) {
    const result = await client.callTool({ name, arguments: {} });
    const content = result.content as { type: string; text: string }[];
    return { result, content, error: JSON.parse(content[0].text).error };
  }

  afterEach(async () => {
    await client.close();
    await moduleRef.close();
  });

  it('maps a domain miss to an error result with code, message and hint', async () => {
    await connect();
    const { result, content, error } = await call('missing');
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(content).toHaveLength(1);
    expect(JSON.parse(content[0].text)).toEqual({
      error: {
        code: 'activity_not_found',
        message: 'No Activity 42.',
        hint: 'Call list_activities.',
      },
    });
    expect(error.code).toBe('activity_not_found');
  });

  it('never turns an empty result into an error', async () => {
    await connect();
    const { result, content } = await call('empty');
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ rows: [] });
    expect(content[0].text).toBe('{"rows":[]}');
  });

  it('returns null fields with their reasons as a normal result', async () => {
    await connect();
    const { result } = await call('nullish');
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      hrBpm: null,
      nulls: { hrBpm: 'no_hr' },
    });
  });

  it('hides an unexpected error and uses the overridden trace id', async () => {
    await connect('abc123');
    const { result, content, error } = await call('boom');
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(content).toHaveLength(1);
    expect(error).toEqual({
      code: 'internal_error',
      message: 'Unexpected failure in tool boom.',
      traceId: 'abc123',
    });
    expect(content[0].text).not.toContain(SECRET);
    expect(content[0].text).not.toContain('9000000001');
  });

  it('uses the placeholder trace id by default', async () => {
    await connect();
    const { error } = await call('boom');
    expect(error.traceId).toBe('00000000000000000000000000000000');
  });

  it('names the tool and failing paths but echoes no value on invalid output', async () => {
    await connect();
    const { result, content, error } = await call('leaky');
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(error.code).toBe('internal_error');
    expect(error.message).toBe(
      'Invalid output for tool leaky at: restingHrBpm, position.lat',
    );
    expect(content[0].text).not.toContain('sentinel');
  });

  it('still rejects bad input without calling the handler', async () => {
    await connect();
    const result = await client.callTool({
      name: 'guarded',
      arguments: { n: 'x' },
    });
    expect(result.isError).toBe(true);
    expect(moduleRef.get(EnvelopeTools).handled).toEqual([]);
  });

  it('truncates the main array end to end', async () => {
    await connect();
    const { result, content } = await call('big');
    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as {
      rows: unknown[];
      truncated?: boolean;
      hint?: string;
      current: unknown;
    };
    expect(structured.truncated).toBe(true);
    expect(structured.hint).toContain('rows');
    expect(structured.rows.length).toBeGreaterThan(0);
    expect(structured.rows.length).toBeLessThan(400);
    expect(structured.current).toEqual({ label: 'now' });
    expect(content).toHaveLength(1);
    expect(content[0].text).toBe(JSON.stringify(structured));
    expect(content[0].text.length).toBeLessThanOrEqual(25_000);
  });

  it.each(['big_no_main', 'big_empty_main', 'big_undeclared'])(
    'gives internal_error instead of a silent cut for %s',
    async (name) => {
      await connect();
      const { result, error } = await call(name);
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
      expect(error.code).toBe('internal_error');
      expect(error.message).toBe(`Unexpected failure in tool ${name}.`);
    },
  );
});
