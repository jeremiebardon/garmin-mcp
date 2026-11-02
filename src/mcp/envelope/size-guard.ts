import { z } from 'zod';

export const SIZE_LIMIT = 25_000;

// Optional envelope fields for the guard: tools spread this into their outputSchema.
export const sizeGuardShape = {
  truncated: z.literal(true).optional(),
  hint: z.string().optional(),
};

export interface SizeGuardOptions {
  mainArray?: string;
  outputSchema: z.ZodObject;
}

export interface SizeGuardResult {
  content: Record<string, unknown>;
  truncated: boolean;
}

const length = (value: unknown): number => JSON.stringify(value).length;

/**
 * Keeps the content as is up to SIZE_LIMIT characters of compact JSON. Above it, drops
 * trailing items of the main array until the result, with `truncated` and `hint`, fits.
 * Throws rather than ever cutting silently.
 */
export function applySizeGuard(
  content: Record<string, unknown>,
  { mainArray, outputSchema }: SizeGuardOptions,
): SizeGuardResult {
  if (length(content) <= SIZE_LIMIT) return { content, truncated: false };
  if (!mainArray) {
    throw new Error('Output is over the size limit and declares no mainArray.');
  }
  const items = content[mainArray];
  if (!Array.isArray(items)) {
    throw new Error(`mainArray ${mainArray} is not an array in the output.`);
  }
  const hint = `The ${mainArray} list was cut to fit the response size limit. Narrow the request with a shorter date range, a smaller limit or the cursor.`;
  const withPrefix = (count: number): Record<string, unknown> => ({
    ...content,
    [mainArray]: items.slice(0, count),
    truncated: true,
    hint,
  });
  if (length(withPrefix(0)) > SIZE_LIMIT) {
    throw new Error('Output is over the size limit with an empty main array.');
  }
  // Length grows with the prefix size: binary search the longest prefix that fits.
  let low = 0;
  let high = items.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (length(withPrefix(mid)) <= SIZE_LIMIT) low = mid;
    else high = mid - 1;
  }
  // Strict, like the JSON Schema clients validate against (additionalProperties: false).
  const truncatedContent = withPrefix(low);
  if (!outputSchema.strict().safeParse(truncatedContent).success) {
    throw new Error('Truncated output fails the tool output schema.');
  }
  return { content: truncatedContent, truncated: true };
}
