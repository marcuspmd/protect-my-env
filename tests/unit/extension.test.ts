import * as vscode from 'vscode';
import * as ignoreFilesModule from '../../src/ignoreFiles';
import { activate, deactivate } from '../../src/extension';
import { setConfig } from '../utils/configMock';

beforeEach(() => {
  const vs = vscode as any;
  vs.__mock.resetAll();
  setConfig({
    obfuscationMode: 'all',
    rules: ['SECRET'],
    patterns: ['*_TOKEN'],
    maskCharacter: '*',
    maskLength: 4,
    protectComments: false,
  });
});

describe('extension activate/deactivate', () => {
  it('registers providers, commands and listeners on activate', () => {
    const context = { subscriptions: [] as Array<{ dispose: () => void }> };

    activate(context as any);

    const vs = vscode as any;
    expect(vs.languages.registerCodeLensProvider).toHaveBeenCalledTimes(1);
    expect(vs.window.registerCustomEditorProvider).toHaveBeenCalledTimes(1);
    expect(vs.commands.registerCommand).toHaveBeenCalledTimes(6);
    expect(vs.window.onDidChangeActiveTextEditor).toHaveBeenCalledTimes(1);
    expect(vs.window.onDidChangeVisibleTextEditors).toHaveBeenCalledTimes(1);
    expect(vs.workspace.onDidOpenTextDocument).toHaveBeenCalledTimes(1);
    expect(vs.workspace.onDidCloseTextDocument).toHaveBeenCalledTimes(1);
    expect(vs.workspace.onDidChangeTextDocument).toHaveBeenCalledTimes(1);
    expect(vs.workspace.onDidChangeConfiguration).toHaveBeenCalledTimes(1);
    expect(context.subscriptions.length).toBeGreaterThanOrEqual(12);
  });

  it('runs reveal and hide command handlers', () => {
    const context = { subscriptions: [] as Array<{ dispose: () => void }> };
    activate(context as any);

    const vs = vscode as any;
    const handlers = vs.__mock.commandHandlers as Map<string, (...args: unknown[]) => unknown>;
    const reveal = handlers.get('protectMyEnv.reveal');
    const hide = handlers.get('protectMyEnv.mask');

    expect(typeof reveal).toBe('function');
    expect(typeof hide).toBe('function');

    const doc = {
      fileName: '.env',
      uri: { toString: () => 'file:///.env' },
      getText: () => 'SECRET=value',
      offsetAt: () => 0,
      positionAt: () => ({ line: 0, character: 0 }),
    };

    expect(() => reveal?.(doc, 'SECRET')).not.toThrow();
    expect(() => hide?.(doc, 'SECRET')).not.toThrow();
  });

  it('runs createIgnoreFiles command', async () => {
    const context = { subscriptions: [] as Array<{ dispose: () => void }> };
    const spy = jest.spyOn(ignoreFilesModule, 'createIgnoreFiles').mockResolvedValue(undefined);

    activate(context as any);

    const vs = vscode as any;
    const handlers = vs.__mock.commandHandlers as Map<string, (...args: unknown[]) => unknown>;
    const command = handlers.get('protectMyEnv.createIgnoreFiles');

    await command?.();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('deactivate is a no-op', () => {
    expect(() => deactivate()).not.toThrow();
  });
});
