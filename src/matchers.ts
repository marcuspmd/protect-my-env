export interface RuleMatcher {
  match(key: string): boolean;
}

/**
 * Matches a key exactly (case-insensitive for user convenience).
 */
export class ExactMatcher implements RuleMatcher {
  private readonly targetKey: string;

  constructor(targetKey: string) {
    this.targetKey = targetKey.trim().toLowerCase();
  }

  public match(key: string): boolean {
    return key.trim().toLowerCase() === this.targetKey;
  }
}

/**
 * Matches a key using glob-like wildcards (e.g., *_SECRET, *_KEY).
 * Case-insensitive.
 */
export class GlobMatcher implements RuleMatcher {
  private readonly regex: RegExp;

  constructor(pattern: string) {
    const escaped = pattern
      .trim()
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex chars except * and ?
      .replace(/\*/g, '.*')                  // convert * to .*
      .replace(/\?/g, '.');                  // convert ? to .
    
    this.regex = new RegExp(`^${escaped}$`, 'i');
  }

  public match(key: string): boolean {
    return this.regex.test(key.trim());
  }
}

/**
 * Manages all active matchers and checks keys against them.
 */
export class ObfuscationMatcherManager {
  private matchers: RuleMatcher[] = [];
  private obfuscateAll: boolean = true;

  /**
   * Configures the matchers based on configuration settings.
   */
  public updateConfig(obfuscateAll: boolean, rules: string[], patterns: string[]): void {
    this.obfuscateAll = obfuscateAll;
    this.matchers = [];

    // Add exact rules
    for (const rule of rules) {
      if (rule.trim().length > 0) {
        this.matchers.push(new ExactMatcher(rule));
      }
    }

    // Add glob patterns
    for (const pattern of patterns) {
      if (pattern.trim().length > 0) {
        this.matchers.push(new GlobMatcher(pattern));
      }
    }
  }

  /**
   * Returns true if the key should be masked based on active rules.
   */
  public shouldMask(key: string): boolean {
    if (this.obfuscateAll) {
      return true;
    }

    return this.matchers.some((matcher) => matcher.match(key));
  }
}
