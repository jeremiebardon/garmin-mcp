import { z } from 'zod';

// Mirrors the "Reason codes" table in docs/spec/mcp-surface.md: change both together.
export const REASON_CODES = [
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
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

export const reasonCodeSchema = z.enum(REASON_CODES);
