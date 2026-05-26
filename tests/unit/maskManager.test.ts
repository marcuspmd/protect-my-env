import * as vscode from 'vscode';
import { MaskManager } from '../../src/maskManager';
import { ObfuscationMatcherManager } from '../../src/matchers';
import { createDocument, createEditor } from '../utils/editorFactory';
import { setConfig } from '../utils/configMock';

function createManager(maskAll: boolean = true): MaskManager {
  const matcherManager = new ObfuscationMatcherManager();
  matcherManager.updateConfig(maskAll, ['SECRET'], ['*_TOKEN']);
  return new MaskManager(matcherManager);
}

beforeEach(() => {
  const vs = vscode as any;
  vs.__mock.resetAll();
  setConfig({
    maskCharacter: '*',
    maskLength: 4,
    protectComments: false,
  });
});

describe('MaskManager', () => {
  it('ignores undefined editor and non-env files', () => {
    const manager = createManager();
    manager.applyDecorations(undefined);

    const doc = createDocument('/tmp/file.txt', 'A=1');
    const editor = createEditor(doc);
    manager.applyDecorations(editor as any);

    expect(editor.setDecorations).not.toHaveBeenCalled();
  });

  it('masks pair values in env files', () => {
    const manager = createManager();
    const doc = createDocument('/tmp/.env', 'SECRET=value');
    const editor = createEditor(doc);

    manager.applyDecorations(editor as any);

    expect(editor.setDecorations).toHaveBeenCalledTimes(1);
    const args = editor.setDecorations.mock.calls[0];
    expect(args[1]).toHaveLength(1);
    expect(args[1][0].renderOptions.after.contentText).toBe('****');
  });

  it('respects revealKey and maskKey state', () => {
    const manager = createManager();
    const doc = createDocument('/tmp/.env', 'SECRET=value');
    const editor = createEditor(doc);
    const vs = vscode as any;
    vs.window.visibleTextEditors = [editor];

    expect(manager.isKeyMasked(doc as any, 'SECRET')).toBe(true);

    manager.revealKey(doc as any, 'SECRET');
    expect(manager.isKeyMasked(doc as any, 'SECRET')).toBe(false);

    manager.maskKey(doc as any, 'SECRET');
    expect(manager.isKeyMasked(doc as any, 'SECRET')).toBe(true);
  });

  it('respects revealAll and hideAll', () => {
    const manager = createManager();
    const doc = createDocument('/tmp/.env', 'A=1');
    const editor = createEditor(doc);
    const vs = vscode as any;
    vs.window.visibleTextEditors = [editor];
    vs.window.activeTextEditor = editor;

    manager.revealAll(doc as any);
    expect(manager.isKeyMasked(doc as any, 'A')).toBe(false);

    manager.hideAll(doc as any);
    expect(manager.isKeyMasked(doc as any, 'A')).toBe(true);
  });

  it('masks comments when protectComments is enabled', () => {
    setConfig({
      maskCharacter: '*',
      maskLength: 3,
      protectComments: true,
    });

    const manager = createManager();
    const doc = createDocument('/tmp/.env', '# header\nSECRET=value # note');
    const editor = createEditor(doc);

    manager.applyDecorations(editor as any);

    const decorations = editor.setDecorations.mock.calls[0][1];
    expect(decorations.length).toBeGreaterThanOrEqual(2);
  });

  it('updates context key based on active editor', () => {
    const manager = createManager();
    const envDoc = createDocument('/tmp/.env', 'A=1');
    const envEditor = createEditor(envDoc);

    manager.updateContextKeys(envEditor as any);

    const vs = vscode as any;
    expect(vs.commands.executeCommand).toHaveBeenCalledWith('setContext', 'protectMyEnv.allRevealed', false);
  });

  it('identifies env files correctly', () => {
    const manager = createManager();
    const envDoc = createDocument('/tmp/.env.local', 'A=1');
    const txtDoc = createDocument('/tmp/readme.txt', 'A=1');

    expect(manager.isEnvFile(envDoc as any)).toBe(true);
    expect(manager.isEnvFile(txtDoc as any)).toBe(false);
  });

  it('disposes decoration type', () => {
    const manager = createManager();
    const vs = vscode as any;
    const decorationType = vs.window.createTextEditorDecorationType.mock.results[0].value;

    manager.dispose();

    expect(decorationType.dispose).toHaveBeenCalledTimes(1);
  });
});
