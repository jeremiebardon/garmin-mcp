import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { HealthModule } from '../health/health.module.js';
import { PLACEHOLDER_TRACE_ID, TRACE_ID_PROVIDER } from './envelope/index.js';
import { McpOriginGuard } from './mcp-origin.guard.js';
import { McpRegistryService } from './services/mcp-registry.service.js';
import { McpServerService } from './services/mcp-server.service.js';
import { StreamableHttpController } from './transports/streamable-http.controller.js';

@Module({
  imports: [DiscoveryModule, HealthModule],
  controllers: [StreamableHttpController],
  providers: [
    McpRegistryService,
    McpServerService,
    McpOriginGuard,
    {
      provide: TRACE_ID_PROVIDER,
      useValue: { getTraceId: () => PLACEHOLDER_TRACE_ID },
    },
  ],
  exports: [McpServerService],
})
export class McpModule {}
