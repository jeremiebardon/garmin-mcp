import { Injectable } from '@nestjs/common';
import type { ReadinessGate } from './readiness-gate.js';

// Starts open so a plain AppModule is ready; the production bootstrap closes it
// before listening and opens it once the migrations are applied.
@Injectable()
export class StartupReadinessGate implements ReadinessGate {
  private ready = true;

  isReady(): boolean {
    return this.ready;
  }

  close(): void {
    this.ready = false;
  }

  open(): void {
    this.ready = true;
  }
}
