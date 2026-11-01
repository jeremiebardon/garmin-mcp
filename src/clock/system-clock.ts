import { Injectable } from '@nestjs/common';
import type { Clock } from './clock.js';

// The only place in `src/` that reads the system time.
@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
