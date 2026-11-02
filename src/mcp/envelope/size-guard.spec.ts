import { z } from 'zod';
import { SIZE_LIMIT, applySizeGuard, sizeGuardShape } from './size-guard.js';

const outputSchema = z.object({
  rows: z.array(z.object({ id: z.number(), note: z.string() })),
  current: z.object({ label: z.string() }),
  ...sizeGuardShape,
});

const row = (id: number) => ({ id, note: 'x'.repeat(100) });
const size = (value: unknown) => JSON.stringify(value).length;

describe('applySizeGuard', () => {
  it('returns content under the limit unchanged', () => {
    const content = { rows: [row(1)], current: { label: 'a' } };
    const result = applySizeGuard(content, { mainArray: 'rows', outputSchema });
    expect(result.truncated).toBe(false);
    expect(result.content).toBe(content);
  });

  it('keeps content of exactly 25,000 characters', () => {
    const base = { rows: [] as unknown[], current: { label: '' } };
    const label = 'y'.repeat(SIZE_LIMIT - size(base));
    const content = { rows: [], current: { label } };
    expect(size(content)).toBe(SIZE_LIMIT);
    const result = applySizeGuard(content, { mainArray: 'rows', outputSchema });
    expect(result.truncated).toBe(false);
    expect(result.content).toBe(content);
  });

  it('truncates the longest prefix that fits', () => {
    const rows = Array.from({ length: 500 }, (_, i) => row(i));
    const content = { rows, current: { label: 'now' } };
    const snapshot = structuredClone(content);
    const { content: out, truncated } = applySizeGuard(content, {
      mainArray: 'rows',
      outputSchema,
    });
    expect(truncated).toBe(true);
    expect(out.truncated).toBe(true);
    expect(typeof out.hint).toBe('string');
    expect(out.hint).not.toBe('');
    expect(size(out)).toBeLessThanOrEqual(SIZE_LIMIT);
    const kept = out.rows as unknown[];
    expect(kept.length).toBeGreaterThan(0);
    expect(kept).toEqual(rows.slice(0, kept.length));
    const oneMore = { ...out, rows: rows.slice(0, kept.length + 1) };
    expect(size(oneMore)).toBeGreaterThan(SIZE_LIMIT);
    expect(out.current).toEqual(content.current);
    expect(content).toEqual(snapshot);
  });

  it('fails when no mainArray is declared', () => {
    const content = { rows: [], current: { label: 'y'.repeat(SIZE_LIMIT) } };
    expect(() => applySizeGuard(content, { outputSchema })).toThrow();
  });

  it('fails when mainArray names a non-array field', () => {
    const content = { rows: [], current: { label: 'y'.repeat(SIZE_LIMIT) } };
    expect(() =>
      applySizeGuard(content, { mainArray: 'current', outputSchema }),
    ).toThrow();
  });

  it('fails when still over the limit with the main array empty', () => {
    const content = {
      rows: [row(1)],
      current: { label: 'y'.repeat(SIZE_LIMIT) },
    };
    expect(() =>
      applySizeGuard(content, { mainArray: 'rows', outputSchema }),
    ).toThrow();
  });

  it('fails when the truncated content does not fit the output schema', () => {
    const strict = z.object({
      rows: z.array(z.object({ id: z.number(), note: z.string() })),
      current: z.object({ label: z.string() }),
    });
    const rows = Array.from({ length: 500 }, (_, i) => row(i));
    expect(() =>
      applySizeGuard(
        { rows, current: { label: 'now' } },
        { mainArray: 'rows', outputSchema: strict },
      ),
    ).toThrow();
  });
});
