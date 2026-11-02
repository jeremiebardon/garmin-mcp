import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { McpTool } from '../../src/mcp/decorators/mcp-tool.decorator.js';

// Test-only tool: the production AppModule registers no tool.
@Injectable()
export class EchoSource {
  readonly value = 'from-injected-provider';
  readonly handled: string[] = [];
}

@Injectable()
export class EchoTool {
  constructor(private readonly source: EchoSource) {}

  @McpTool({
    name: 'echo',
    description:
      'Echoes a message together with a value from an injected provider.',
    inputSchema: z.object({ message: z.string() }),
    outputSchema: z.object({ message: z.string(), source: z.string() }),
    annotations: { readOnlyHint: true },
  })
  echo({ message }: { message: string }) {
    this.source.handled.push(message);
    return { message, source: this.source.value };
  }
}
