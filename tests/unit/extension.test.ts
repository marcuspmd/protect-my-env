import * as vscode from 'vscode';
import { activate, deactivate } from '../../src/extension';
import { setConfig } from '../utils/configMock';
import { createDocument } from '../utils/editorFactory';

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
  it('registers the secure editor and configuration listener on activate', () => {
    const context = { subscriptions: [] as Array<{ dispose: () => void }> };

    activate(context as any);

    const vs = vscode as any;
    expect(vs.window.registerCustomEditorProvider).toHaveBeenCalledTimes(1);
    expect(vs.window.registerCustomEditorProvider).toHaveBeenCalledWith(
      'protectMyEnv.secureEnvEditor',
      expect.anything(),
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    );
    expect(vs.languages.registerCodeLensProvider).not.toHaveBeenCalled();
    expect(vs.commands.registerCommand).not.toHaveBeenCalled();
    expect(vs.window.onDidChangeActiveTextEditor).not.toHaveBeenCalled();
    expect(vs.window.onDidChangeVisibleTextEditors).not.toHaveBeenCalled();
    expect(vs.workspace.onDidOpenTextDocument).not.toHaveBeenCalled();
    expect(vs.workspace.onDidCloseTextDocument).not.toHaveBeenCalled();
    expect(vs.workspace.onDidChangeTextDocument).not.toHaveBeenCalled();
    expect(vs.workspace.onDidChangeConfiguration).toHaveBeenCalledTimes(1);
    expect(context.subscriptions).toHaveLength(3);
  });

  it('updates the secure editor matcher config when settings change', () => {
    const context = { subscriptions: [] as Array<{ dispose: () => void }> };
    activate(context as any);

    const vs = vscode as any;
    const changeConfigListener = vs.workspace.onDidChangeConfiguration.mock.calls[0][0];
    const provider = vs.window.registerCustomEditorProvider.mock.calls[0][1];
    const doc = createDocument('/tmp/.env', 'PUBLIC=value\nAPI_TOKEN=token');

    let rows = (provider as any).buildRows(doc);
    expect(rows.find((row: any) => row.key === 'PUBLIC').shouldMask).toBe(true);
    expect(rows.find((row: any) => row.key === 'API_TOKEN').shouldMask).toBe(true);

    setConfig({
      obfuscationMode: 'pattern',
      rules: ['PUBLIC'],
      patterns: [],
      maskCharacter: '*',
      maskLength: 4,
      protectComments: false,
    });
    changeConfigListener({ affectsConfiguration: (scope: string) => scope === 'protectMyEnv' });

    rows = (provider as any).buildRows(doc);
    expect(rows.find((row: any) => row.key === 'PUBLIC').shouldMask).toBe(true);
    expect(rows.find((row: any) => row.key === 'API_TOKEN').shouldMask).toBe(false);
  });

  it('ignores unrelated configuration changes', () => {
    const context = { subscriptions: [] as Array<{ dispose: () => void }> };
    activate(context as any);

    const vs = vscode as any;
    const changeConfigListener = vs.workspace.onDidChangeConfiguration.mock.calls[0][0];
    const provider = vs.window.registerCustomEditorProvider.mock.calls[0][1];
    const doc = createDocument('/tmp/.env', 'PUBLIC=value');

    setConfig({
      obfuscationMode: 'pattern',
      rules: [],
      patterns: [],
      maskCharacter: '*',
      maskLength: 4,
      protectComments: false,
    });
    changeConfigListener({ affectsConfiguration: () => false });

    const rows = (provider as any).buildRows(doc);
    expect(rows.find((row: any) => row.key === 'PUBLIC').shouldMask).toBe(true);
  });

  it('deactivate is a no-op', () => {
    expect(() => deactivate()).not.toThrow();
  });
});
