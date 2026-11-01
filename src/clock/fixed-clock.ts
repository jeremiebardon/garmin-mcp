import type { Clock } from './clock.js';

// A clock that stands still until `set()` moves it, for tests.
export class FixedClock implements Clock {
  private instant: number;

  constructor(instant: Date) {
    this.instant = instant.getTime();
  }

  now(): Date {
    return new Date(this.instant);
  }

  set(instant: Date): void {
    this.instant = instant.getTime();
  }
}
