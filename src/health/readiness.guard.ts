import {
  type CanActivate,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { READINESS_GATE, type ReadinessGate } from './readiness-gate.js';

@Injectable()
export class ReadinessGuard implements CanActivate {
  constructor(@Inject(READINESS_GATE) private readonly gate: ReadinessGate) {}

  async canActivate(): Promise<boolean> {
    if (!(await this.gate.isReady())) {
      throw new ServiceUnavailableException();
    }
    return true;
  }
}
