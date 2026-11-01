import { pgSchema } from 'drizzle-orm/pg-core';

// ADR 0001: the Garmin store lives in its own schema. No tables yet.
export const garmin = pgSchema('garmin');
