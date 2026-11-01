import { SetMetadata } from '@nestjs/common';
import {
  MCP_TOOL_METADATA,
  type McpToolOptions,
} from '../interfaces/mcp-metadata.interface.js';

export const McpTool = (options: McpToolOptions): MethodDecorator =>
  SetMetadata(MCP_TOOL_METADATA, options);
