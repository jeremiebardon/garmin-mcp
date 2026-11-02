import { z } from 'zod';

export const DOMAIN_MISS_CODES = [
  'activity_not_found',
  'race_not_found',
] as const;

export type DomainMissCode = (typeof DOMAIN_MISS_CODES)[number];

export const domainMissCodeSchema = z.enum(DOMAIN_MISS_CODES);

export const INTERNAL_ERROR_CODE = 'internal_error';

export const ERROR_CODES = [...DOMAIN_MISS_CODES, INTERNAL_ERROR_CODE] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class DomainMissError extends Error {
  readonly code: DomainMissCode;
  readonly hint: string;

  constructor(details: {
    code: DomainMissCode;
    message: string;
    hint: string;
  }) {
    if (!domainMissCodeSchema.safeParse(details.code).success) {
      throw new Error('Invalid domain miss code.');
    }
    if (!details.message || !details.hint) {
      throw new Error('A domain miss needs a non-empty message and hint.');
    }
    super(details.message);
    this.name = 'DomainMissError';
    this.code = details.code;
    this.hint = details.hint;
  }
}

/** Output failed the tool's schema. Carries the field paths only, never values. */
export class OutputValidationError extends Error {
  constructor(toolName: string, error: z.ZodError) {
    const paths = [
      ...new Set(error.issues.map((issue) => issue.path.join('.') || '(root)')),
    ];
    super(`Invalid output for tool ${toolName} at: ${paths.join(', ')}`);
    this.name = 'OutputValidationError';
  }
}

export type ErrorResult = {
  isError: true;
  content: [{ type: 'text'; text: string }];
};

function errorResult(error: Record<string, string>): ErrorResult {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error }) }],
  };
}

/** The one place that maps a thrown error to an error result. */
export function toErrorResult(
  toolName: string,
  error: unknown,
  traceId: string,
): ErrorResult {
  if (error instanceof DomainMissError) {
    return errorResult({
      code: error.code,
      message: error.message,
      hint: error.hint,
    });
  }
  const message =
    error instanceof OutputValidationError
      ? error.message
      : `Unexpected failure in tool ${toolName}.`;
  return errorResult({ code: INTERNAL_ERROR_CODE, message, traceId });
}
