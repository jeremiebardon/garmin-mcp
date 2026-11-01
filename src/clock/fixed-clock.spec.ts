import { FixedClock } from './fixed-clock.js';

describe('FixedClock', () => {
  const instant = new Date('2026-03-14T06:30:00.000Z');

  it('returns the instant it was given', () => {
    expect(new FixedClock(instant).now()).toEqual(instant);
  });

  it('moves to the instant passed to set()', () => {
    const clock = new FixedClock(instant);
    const later = new Date('2026-03-15T07:00:00.000Z');
    clock.set(later);
    expect(clock.now()).toEqual(later);
  });

  it('is not changed by mutating a returned Date', () => {
    const clock = new FixedClock(instant);
    clock.now().setUTCFullYear(1999);
    expect(clock.now()).toEqual(instant);
  });
});
