import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { READINESS_GATE, type ReadinessGate } from './readiness-gate.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(READINESS_GATE) private readonly gate: ReadinessGate) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    if (await this.gate.isReady()) {
      return { status: 'ready' };
    }
    res.status(503);
    return { status: 'not_ready' };
  }
}
