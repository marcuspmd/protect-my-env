import { EnvParser } from '../../src/parser';

describe('EnvParser', () => {
  describe('parseLine', () => {
    it('parses empty lines', () => {
      const line = EnvParser.parseLine('   ', 0);
      expect(line.type).toBe('empty');
      expect(line.lineIndex).toBe(0);
    });

    it('parses full line comments', () => {
      const line = EnvParser.parseLine('  # comment', 2);
      expect(line.type).toBe('comment');
      expect(line.commentStartOffset).toBe(2);
      expect(line.commentEndOffset).toBe(11);
    });

    it('parses simple key-value pairs', () => {
      const line = EnvParser.parseLine('API_KEY=secret', 1);
      expect(line.type).toBe('pair');
      expect(line.key).toBe('API_KEY');
      expect(line.value).toBe('secret');
      expect(line.valueStartOffset).toBe(8);
      expect(line.valueEndOffset).toBe(14);
    });

    it('parses quoted values and inline comments', () => {
      const line = EnvParser.parseLine('TOKEN="abc#123"   # note', 0);
      expect(line.type).toBe('pair');
      expect(line.key).toBe('TOKEN');
      expect(line.value).toBe('"abc#123"');
      expect(line.commentStartOffset).toBe(18);
      expect(line.commentEndOffset).toBe(24);
    });

    it('keeps unterminated quotes as value content', () => {
      const line = EnvParser.parseLine("NAME='missing", 0);
      expect(line.type).toBe('pair');
      expect(line.value).toBe("'missing");
    });

    it('parses unquoted values with inline comments', () => {
      const line = EnvParser.parseLine('X=abc   # hello', 0);
      expect(line.type).toBe('pair');
      expect(line.value).toBe('abc');
      expect(line.commentStartOffset).toBe(8);
      expect(line.commentEndOffset).toBe(15);
    });

    it('treats invalid key lines as comments', () => {
      const line = EnvParser.parseLine('A B=1', 0);
      expect(line.type).toBe('comment');
    });

    it('treats lines without equals as comments', () => {
      const line = EnvParser.parseLine('just-text', 0);
      expect(line.type).toBe('comment');
    });
  });

  describe('parse', () => {
    it('parses full document with mixed lines', () => {
      const text = ['# c1', 'A=1', '', 'B=2 # c2'].join('\n');
      const lines = EnvParser.parse(text);

      expect(lines).toHaveLength(4);
      expect(lines[0].type).toBe('comment');
      expect(lines[1].type).toBe('pair');
      expect(lines[2].type).toBe('empty');
      expect(lines[3].type).toBe('pair');
      expect(lines[3].commentStartOffset).toBe(4);
    });
  });
});
