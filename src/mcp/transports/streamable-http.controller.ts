import {
  Controller,
  Delete,
  Get,
  MethodNotAllowedException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { ReadinessGuard } from '../../health/readiness.guard.js';
import { McpOriginGuard } from '../mcp-origin.guard.js';
import { McpServerService } from '../services/mcp-server.service.js';

@Controller('mcp')
@UseGuards(McpOriginGuard, ReadinessGuard)
export class StreamableHttpController {
  constructor(private readonly mcpServer: McpServerService) {}

  @Post()
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    const server = this.mcpServer.create();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  @Get()
  get(): never {
    throw new MethodNotAllowedException();
  }

  @Delete()
  remove(): never {
    throw new MethodNotAllowedException();
  }
}
