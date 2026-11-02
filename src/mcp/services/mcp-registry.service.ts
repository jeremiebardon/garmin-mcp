import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { OutputValidationError } from '../envelope/index.js';
import {
  MCP_TOOL_METADATA,
  type McpToolOptions,
} from '../interfaces/mcp-metadata.interface.js';

export interface RegisteredMcpTool {
  options: McpToolOptions;
  handler: (input: unknown) => Promise<Record<string, unknown>>;
}

@Injectable()
export class McpRegistryService implements OnModuleInit {
  private tools?: RegisteredMcpTool[];

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
  ) {}

  onModuleInit(): void {
    this.getTools();
  }

  getTools(): RegisteredMcpTool[] {
    this.tools ??= this.discover();
    return this.tools;
  }

  private discover(): RegisteredMcpTool[] {
    const tools: RegisteredMcpTool[] = [];
    for (const { instance } of this.discovery.getProviders()) {
      if (!instance || typeof instance !== 'object') continue;
      const prototype = Object.getPrototypeOf(instance);
      for (const methodName of this.metadataScanner.getAllMethodNames(
        prototype,
      )) {
        const options: McpToolOptions | undefined = Reflect.getMetadata(
          MCP_TOOL_METADATA,
          prototype[methodName],
        );
        if (!options) continue;
        const method = instance[methodName].bind(instance);
        tools.push({
          options,
          handler: async (input) => {
            const output = await method(input);
            const parsed = options.outputSchema.safeParse(output);
            if (!parsed.success) {
              throw new OutputValidationError(options.name, parsed.error);
            }
            return output;
          },
        });
      }
    }
    return tools;
  }
}
