import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';

export const MCP_TOOL_METADATA = 'mcp:tool';

export interface McpToolOptions {
  name: string;
  description: string;
  inputSchema: z.ZodObject;
  outputSchema: z.ZodObject;
  annotations?: ToolAnnotations;
}
