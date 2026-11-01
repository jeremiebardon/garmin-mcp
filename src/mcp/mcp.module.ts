import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { HealthModule } from '../health/health.module.js';
import { McpOriginGuard } from './mcp-origin.guard.js';
import { McpRegistryService } from './services/mcp-registry.service.js';
import { McpServerService } from './services/mcp-server.service.js';
import { StreamableHttpController } from './transports/streamable-http.controller.js';

@Module({
  imports: [DiscoveryModule, HealthModule],
  controllers: [StreamableHttpController],
  providers: [McpRegistryService, McpServerService, McpOriginGuard],
  exports: [McpServerService],
})
export class McpModule {}
