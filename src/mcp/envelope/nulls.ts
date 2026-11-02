import { z } from 'zod';
import { type ReasonCode, reasonCodeSchema } from './reason-codes.js';

export const nullsSchema = z.record(z.string(), reasonCodeSchema);

export type NullsMap = Record<string, ReasonCode>;

/**
 * Returns the fields unchanged plus a sibling `nulls` map {field: reason}.
 * The map keys are exactly the fields whose value is null; no `nulls` key when none is.
 */
export function nulls<T extends Record<string, unknown>>(
  fields: T,
  reasons: { [K in keyof T]?: ReasonCode },
): T & { nulls?: NullsMap } {
  const map: NullsMap = {};
  for (const [field, value] of Object.entries(fields)) {
    if (value !== null) continue;
    const reason = (reasons as Record<string, unknown>)[field];
    if (reason === undefined) {
      throw new Error(`Field ${field} is null but has no reason code.`);
    }
    map[field] = reasonCodeSchema.parse(reason);
  }
  for (const field of Object.keys(reasons)) {
    if (fields[field] !== null) {
      throw new Error(`Field ${field} has a reason code but is not null.`);
    }
  }
  return Object.keys(map).length > 0
    ? { ...fields, nulls: map }
    : { ...fields };
}
