import { Inject, Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  TRACE_ID_PROVIDER,
  applySizeGuard,
  toErrorResult,
  type TraceIdProvider,
} from '../envelope/index.js';
import { McpRegistryService } from './mcp-registry.service.js';

const INSTRUCTIONS = [
  "- The Athlete's numbers come only from the data tools.",
  "- Never compute, estimate or extrapolate a training metric yourself. If a tool doesn't return it, say so.",
  '- Check freshness.stale before giving date-sensitive advice.',
  '- Resolve relative dates against freshness.today.',
  "- Never declare a Race without the Athlete's explicit confirmation.",
].join('\n');

@Injectable()
export class McpServerService {
  constructor(
    private readonly registry: McpRegistryService,
    @Inject(TRACE_ID_PROVIDER) private readonly traceIds: TraceIdProvider,
  ) {}

  create(): McpServer {
    const server = new McpServer(
      { name: 'garmin-mcp', version: '0.0.1' },
      { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
    );
    for (const { options, handler } of this.registry.getTools()) {
      server.registerTool(
        options.name,
        {
          description: options.description,
          inputSchema: options.inputSchema,
          outputSchema: options.outputSchema,
          annotations: options.annotations,
        },
        async (input) => {
          try {
            const output = await handler(input);
            const { content: structuredContent } = applySizeGuard(
              output,
              options,
            );
            return {
              structuredContent,
              content: [
                { type: 'text', text: JSON.stringify(structuredContent) },
              ],
            };
          } catch (error) {
            return toErrorResult(
              options.name,
              error,
              this.traceIds.getTraceId(),
            );
          }
        },
      );
    }
    return server;
  }
}
