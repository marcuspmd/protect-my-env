import { ExactMatcher, GlobMatcher, ObfuscationMatcherManager } from '../../src/matchers';

describe('ExactMatcher', () => {
  it('matches with case-insensitive trim', () => {
    const matcher = new ExactMatcher('  Api_Key  ');
    expect(matcher.match('api_key')).toBe(true);
    expect(matcher.match(' API_KEY ')).toBe(true);
    expect(matcher.match('other')).toBe(false);
  });
});

describe('GlobMatcher', () => {
  it('matches star wildcard', () => {
    const matcher = new GlobMatcher('*_SECRET');
    expect(matcher.match('DB_SECRET')).toBe(true);
    expect(matcher.match('db_secret')).toBe(true);
    expect(matcher.match('SECRET_DB')).toBe(false);
  });

  it('matches question wildcard', () => {
    const matcher = new GlobMatcher('KEY_?');
    expect(matcher.match('KEY_A')).toBe(true);
    expect(matcher.match('KEY_AB')).toBe(false);
  });

  it('escapes regex characters from pattern', () => {
    const matcher = new GlobMatcher('A+B');
    expect(matcher.match('A+B')).toBe(true);
    expect(matcher.match('AAAB')).toBe(false);
  });
});

describe('ObfuscationMatcherManager', () => {
  it('masks everything in all mode', () => {
    const manager = new ObfuscationMatcherManager();
    manager.updateConfig(true, [], []);
    expect(manager.shouldMask('ANY_KEY')).toBe(true);
  });

  it('uses rules and patterns in pattern mode', () => {
    const manager = new ObfuscationMatcherManager();
    manager.updateConfig(false, ['PASSWORD'], ['*_TOKEN']);

    expect(manager.shouldMask('PASSWORD')).toBe(true);
    expect(manager.shouldMask('API_TOKEN')).toBe(true);
    expect(manager.shouldMask('PUBLIC_VALUE')).toBe(false);
  });

  it('ignores empty rules and patterns', () => {
    const manager = new ObfuscationMatcherManager();
    manager.updateConfig(false, [' ', ''], ['']);
    expect(manager.shouldMask('ANY')).toBe(false);
  });
});
