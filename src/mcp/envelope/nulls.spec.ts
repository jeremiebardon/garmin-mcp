import { DomainMissError } from './errors.js';
import { nulls } from './nulls.js';
import {
  REASON_CODES,
  type ReasonCode,
  reasonCodeSchema,
} from './reason-codes.js';

describe('REASON_CODES', () => {
  it('is exactly the 14 codes, in order', () => {
    expect(REASON_CODES).toEqual([
      'no_fit',
      'fit_unavailable',
      'fit_decode_failed',
      'no_hr',
      'hr_coverage_low',
      'recovery_too_short',
      'pause_in_window',
      'not_continuous_run',
      'too_short',
      'not_running',
      'treadmill',
      'no_race',
      'not_synced',
      'missing_day',
    ]);
    expect(reasonCodeSchema.options).toEqual([...REASON_CODES]);
  });
});

describe('nulls', () => {
  it('adds a nulls map for null fields and keeps null as null', () => {
    const result = nulls({ a: 1, b: null }, { b: 'no_hr' });
    expect(result).toEqual({ a: 1, b: null, nulls: { b: 'no_hr' } });
    expect(result.b).toBeNull();
  });

  it('omits nulls when no field is null', () => {
    const result = nulls({ a: 1, b: 0 }, {});
    expect(result).toEqual({ a: 1, b: 0 });
    expect('nulls' in result).toBe(false);
  });

  it('throws for a null field with no reason', () => {
    expect(() => nulls({ a: null }, {})).toThrow();
  });

  it('throws for a reason on a non-null field', () => {
    expect(() => nulls({ a: 1 }, { a: 'no_hr' })).toThrow();
  });

  it('throws for a reason that is not in the closed list', () => {
    expect(() => nulls({ a: null }, { a: 'zero' as ReasonCode })).toThrow();
  });
});

describe('DomainMissError', () => {
  const valid = {
    code: 'activity_not_found' as const,
    message: 'No such Activity.',
    hint: 'Call list_activities.',
  };

  it('carries code, message and hint', () => {
    const error = new DomainMissError(valid);
    expect(error).toMatchObject(valid);
  });

  it('throws a plain Error for an unknown code', () => {
    expect(
      () => new DomainMissError({ ...valid, code: 'foo' as never }),
    ).toThrow(Error);
  });

  it('throws for an empty message or hint', () => {
    expect(() => new DomainMissError({ ...valid, message: '' })).toThrow();
    expect(() => new DomainMissError({ ...valid, hint: '' })).toThrow();
  });
});
