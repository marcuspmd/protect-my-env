import * as vscode from 'vscode';
import { activate, deactivate } from '../../src/extension';
import { setConfig } from '../utils/configMock';
import { createDocument, createEditor } from '../utils/editorFactory';

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
    expect(vs.commands.registerCommand).toHaveBeenCalledTimes(5);
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

  it('executes revealAll/hideAll only for env active editor', () => {
    const context = { subscriptions: [] as Array<{ dispose: () => void }> };
    activate(context as any);

    const vs = vscode as any;
    const handlers = vs.__mock.commandHandlers as Map<string, (...args: unknown[]) => unknown>;
    const revealAll = handlers.get('protectMyEnv.revealAll');
    const hideAll = handlers.get('protectMyEnv.hideAll');

    const envDoc = createDocument('/tmp/.env', 'SECRET=value');
    const envEditor = createEditor(envDoc);
    vs.window.visibleTextEditors = [envEditor];
    vs.window.activeTextEditor = envEditor;

    revealAll?.();
    hideAll?.();

    expect(envEditor.setDecorations).toHaveBeenCalled();

    envEditor.setDecorations.mockClear();
    const txtDoc = createDocument('/tmp/file.txt', 'SECRET=value');
    const txtEditor = createEditor(txtDoc);
    vs.window.activeTextEditor = txtEditor;
    vs.window.visibleTextEditors = [txtEditor];

    revealAll?.();
    hideAll?.();

    expect(txtEditor.setDecorations).not.toHaveBeenCalled();
  });

  it('runs addRule command and shows confirmation message', async () => {
    const context = { subscriptions: [] as Array<{ dispose: () => void }> };
    activate(context as any);

    const vs = vscode as any;
    const handlers = vs.__mock.commandHandlers as Map<string, (...args: unknown[]) => unknown>;
    const addRule = handlers.get('protectMyEnv.addRule');

    await addRule?.('NEW_SECRET');

    expect(vs.__mock.getConfigMock.update).toHaveBeenCalledTimes(1);
    expect(vs.window.showInformationMessage).toHaveBeenCalledWith('Added rule to hide NEW_SECRET.');
  });

  it('executes editor and workspace listeners for both matching and non-matching branches', () => {
    const vs = vscode as any;
    const envDoc = createDocument('/tmp/.env', 'A=1');
    const envEditor = createEditor(envDoc);
    const otherDoc = createDocument('/tmp/other.env', 'B=2');
    const otherEditor = createEditor(otherDoc);

    vs.window.activeTextEditor = envEditor;
    vs.window.visibleTextEditors = [envEditor];

    const context = { subscriptions: [] as Array<{ dispose: () => void }> };
    activate(context as any);

    const activeEditorListener = vs.window.onDidChangeActiveTextEditor.mock.calls[0][0];
    const visibleEditorsListener = vs.window.onDidChangeVisibleTextEditors.mock.calls[0][0];
    const openDocumentListener = vs.workspace.onDidOpenTextDocument.mock.calls[0][0];
    const closeDocumentListener = vs.workspace.onDidCloseTextDocument.mock.calls[0][0];
    const changeDocumentListener = vs.workspace.onDidChangeTextDocument.mock.calls[0][0];
    const changeConfigListener = vs.workspace.onDidChangeConfiguration.mock.calls[0][0];

    activeEditorListener(envEditor);
    visibleEditorsListener([envEditor, otherEditor]);

    openDocumentListener(envDoc);
    openDocumentListener(otherDoc);

    closeDocumentListener(envDoc);

    changeDocumentListener({ document: envDoc });
    changeDocumentListener({ document: otherDoc });

    changeConfigListener({ affectsConfiguration: () => false });
    changeConfigListener({ affectsConfiguration: (scope: string) => scope === 'protectMyEnv' });

    expect(vs.commands.executeCommand).toHaveBeenCalledWith('setContext', 'protectMyEnv.allRevealed', false);
    expect(envEditor.setDecorations).toHaveBeenCalled();
  });

  it('executes registered code lens provider callback', () => {
    const context = { subscriptions: [] as Array<{ dispose: () => void }> };
    activate(context as any);

    const vs = vscode as any;
    const provider = vs.languages.registerCodeLensProvider.mock.calls[0][1];
    const envDoc = createDocument('/tmp/.env', 'SECRET=value');

    const result = provider.provideCodeLenses(envDoc, {} as any);

    expect(result).toHaveLength(1);
    expect(result[0].command.command).toBe('protectMyEnv.reveal');
  });

  it('deactivate is a no-op', () => {
    expect(() => deactivate()).not.toThrow();
  });
});
