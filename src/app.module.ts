import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { McpModule } from './mcp/mcp.module.js';

@Module({
  imports: [HealthModule, McpModule],
})
export class AppModule {}
