import { Module } from '@nestjs/common';
import { ClockModule } from './clock/clock.module.js';
import { HealthModule } from './health/health.module.js';
import { McpModule } from './mcp/mcp.module.js';

@Module({
  imports: [ClockModule, HealthModule, McpModule],
})
export class AppModule {}
