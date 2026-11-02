import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { READINESS_GATE } from './readiness-gate.js';
import { ReadinessGuard } from './readiness.guard.js';

@Module({
  controllers: [HealthController],
  providers: [
    { provide: READINESS_GATE, useValue: { isReady: () => true } },
    ReadinessGuard,
  ],
  exports: [READINESS_GATE, ReadinessGuard],
})
export class HealthModule {}
