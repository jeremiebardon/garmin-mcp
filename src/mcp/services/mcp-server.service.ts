import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpRegistryService } from './mcp-registry.service.js';

@Injectable()
export class McpServerService {
  constructor(private readonly registry: McpRegistryService) {}

  create(): McpServer {
    const server = new McpServer(
      { name: 'garmin-mcp', version: '0.0.1' },
      { capabilities: { tools: {} } },
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
          const structuredContent = await handler(input);
          return {
            structuredContent,
            content: [
              { type: 'text', text: JSON.stringify(structuredContent) },
            ],
          };
        },
      );
    }
    return server;
  }
}
