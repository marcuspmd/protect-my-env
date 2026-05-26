import { EnvCodeLensProvider } from '../../src/codeLensProvider';
import { MaskManager } from '../../src/maskManager';
import { ObfuscationMatcherManager } from '../../src/matchers';
import { createDocument } from '../utils/editorFactory';

describe('EnvCodeLensProvider', () => {
  function setup() {
    const matcher = new ObfuscationMatcherManager();
    matcher.updateConfig(false, ['SECRET'], []);
    const maskManager = new MaskManager(matcher);
    const provider = new EnvCodeLensProvider(maskManager, (key) => key === 'SECRET');
    return { provider, maskManager };
  }

  it('returns empty array for non-env files', () => {
    const { provider } = setup();
    const doc = createDocument('/tmp/file.txt', 'SECRET=value');

    const result = provider.provideCodeLenses(doc as any, {} as any);

    expect(result).toEqual([]);
  });

  it('shows reveal lens when key is masked', () => {
    const { provider } = setup();
    const doc = createDocument('/tmp/.env', 'SECRET=value');

    const result = provider.provideCodeLenses(doc as any, {} as any);

    expect(result).toHaveLength(1);
    expect(result[0].command?.title).toBe('👁️ Reveal SECRET');
    expect(result[0].command?.command).toBe('protectMyEnv.reveal');
  });

  it('shows hide lens when key is revealed', () => {
    const { provider, maskManager } = setup();
    const doc = createDocument('/tmp/.env', 'SECRET=value');

    maskManager.revealKey(doc as any, 'SECRET');
    const result = provider.provideCodeLenses(doc as any, {} as any);

    expect(result[0].command?.title).toBe('🙈 Hide SECRET');
    expect(result[0].command?.command).toBe('protectMyEnv.mask');
  });

  it('shows add rule lens when key does not match config', () => {
    const matcher = new ObfuscationMatcherManager();
    matcher.updateConfig(false, [], []);
    const maskManager = new MaskManager(matcher);
    const provider = new EnvCodeLensProvider(maskManager, () => false);
    const doc = createDocument('/tmp/.env', 'PUBLIC=value');

    const result = provider.provideCodeLenses(doc as any, {} as any);

    expect(result).toHaveLength(1);
    expect(result[0].command?.title).toBe('➕ Hide PUBLIC');
    expect(result[0].command?.command).toBe('protectMyEnv.addRule');
  });

  it('fires refresh event', () => {
    const { provider } = setup();
    const listener = jest.fn();
    provider.onDidChangeCodeLenses(listener);

    provider.triggerRefresh();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
