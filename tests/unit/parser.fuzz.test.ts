import fc from 'fast-check';
import { EnvParser } from '../../src/parser';

describe('EnvParser fuzz', () => {
  it('parseLine never throws for arbitrary input', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 0, max: 1_000_000 }), (line, index) => {
        expect(() => EnvParser.parseLine(line, index)).not.toThrow();
      }),
      { numRuns: 1000 }
    );
  });

  it('parse returns exactly one parsed record per input line', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const parsed = EnvParser.parse(text);
        const lineCount = text.split(/\r?\n/).length;

        expect(parsed).toHaveLength(lineCount);
      }),
      { numRuns: 500 }
    );
  });

  it('pair offsets are always ordered and within line bounds', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 0, max: 1_000_000 }), (line, index) => {
        const parsed = EnvParser.parseLine(line, index);

        if (parsed.type !== 'pair') {
          return;
        }

        expect(parsed.valueStartOffset).toBeDefined();
        expect(parsed.valueEndOffset).toBeDefined();

        const start = parsed.valueStartOffset as number;
        const end = parsed.valueEndOffset as number;

        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeGreaterThanOrEqual(start);
        expect(end).toBeLessThanOrEqual(line.length);

        if (parsed.commentStartOffset !== undefined) {
          expect(parsed.commentStartOffset).toBeGreaterThanOrEqual(end);
          expect(parsed.commentStartOffset).toBeLessThanOrEqual(line.length);
        }

        if (parsed.commentEndOffset !== undefined) {
          expect(parsed.commentEndOffset).toBeGreaterThanOrEqual(parsed.commentStartOffset ?? 0);
          expect(parsed.commentEndOffset).toBeLessThanOrEqual(line.length);
        }
      }),
      { numRuns: 1000 }
    );
  });
});
