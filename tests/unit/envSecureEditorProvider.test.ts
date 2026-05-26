import * as vscode from 'vscode';
import { EnvSecureEditorProvider } from '../../src/envSecureEditorProvider';
import { ObfuscationMatcherManager } from '../../src/matchers';
import { EnvParser } from '../../src/parser';
import { createDocument } from '../utils/editorFactory';
import { setConfig } from '../utils/configMock';

function createWebviewPanelMock() {
  let messageHandler: ((message: unknown) => Promise<void> | void) | undefined;
  let disposeHandler: (() => void) | undefined;
  const messageDisposable = { dispose: jest.fn() };
  const disposeDisposable = { dispose: jest.fn() };

  return {
    panel: {
      webview: {
        options: {},
        html: '',
        cspSource: 'vscode-resource:',
        onDidReceiveMessage: jest.fn((handler: (message: unknown) => Promise<void> | void) => {
          messageHandler = handler;
          return messageDisposable;
        }),
      },
      onDidDispose: jest.fn((handler: () => void) => {
        disposeHandler = handler;
        return disposeDisposable;
      }),
    },
    messageDisposable,
    disposeDisposable,
    invokeMessage(message: unknown): Promise<void> | void {
      return messageHandler?.(message);
    },
    invokeDispose(): void {
      disposeHandler?.();
    },
  };
}

function createProvider(): EnvSecureEditorProvider {
  const matcherManager = new ObfuscationMatcherManager();
  matcherManager.updateConfig(true, [], []);
  return new EnvSecureEditorProvider(matcherManager);
}

async function sendMessage(provider: EnvSecureEditorProvider, document: unknown, message: unknown): Promise<void> {
  await (provider as any).handleMessage(document, message);
}

function getReplacementText(): string {
  const vs = vscode as any;
  const edit = vs.workspace.applyEdit.mock.calls[0][0];
  return edit.replace.mock.calls[0][2];
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

describe('EnvSecureEditorProvider document edits', () => {
  it('edits an existing env value inline', async () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', 'API_KEY=old\nTOKEN=abc');

    await sendMessage(provider, doc, {
      type: 'editValue',
      key: 'API_KEY',
      newValue: 'new',
      lineIndex: 0,
    });

    expect((vscode as any).workspace.applyEdit).toHaveBeenCalledTimes(1);
    expect(getReplacementText()).toBe('API_KEY=new\nTOKEN=abc');
  });

  it('adds a new env after the selected line', async () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', 'API_KEY=old\nTOKEN=abc');

    await sendMessage(provider, doc, {
      type: 'addAfter',
      key: 'API_KEY',
      lineIndex: 0,
      newKey: 'DATABASE_URL',
      newValue: 'postgres://localhost',
    });

    expect((vscode as any).workspace.applyEdit).toHaveBeenCalledTimes(1);
    expect(getReplacementText()).toBe('API_KEY=old\nDATABASE_URL=postgres://localhost\nTOKEN=abc');
  });

  it('deletes the selected env line', async () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', 'API_KEY=old\nTOKEN=abc');

    await sendMessage(provider, doc, {
      type: 'deletePair',
      key: 'TOKEN',
      lineIndex: 1,
    });

    expect((vscode as any).workspace.applyEdit).toHaveBeenCalledTimes(1);
    expect(getReplacementText()).toBe('API_KEY=old');
  });

  it('deletes first line and keeps CRLF without removing extra chars', async () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', 'A=1\r\nB=2');

    await sendMessage(provider, doc, {
      type: 'deletePair',
      key: 'A',
      lineIndex: 0,
    });

    expect((vscode as any).workspace.applyEdit).toHaveBeenCalledTimes(1);
    expect(getReplacementText()).toBe('B=2');
  });

  it('adds new key without extra line break when document already ends with newline', async () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', 'A=1\n');

    await sendMessage(provider, doc, {
      type: 'addPair',
      key: 'B',
      value: '2',
    });

    expect(getReplacementText()).toBe('A=1\nB=2');
  });

  it('deletes last line in CRLF file and removes previous CRLF', async () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', 'A=1\r\nB=2');

    await sendMessage(provider, doc, {
      type: 'deletePair',
      key: 'B',
      lineIndex: 1,
    });

    expect(getReplacementText()).toBe('A=1');
  });
});

describe('EnvSecureEditorProvider webview', () => {
  it('builds rows for env values and comments', () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', '# App config\nTOKEN=abc # auth token\nAPI_KEY=old');
    const rows = (provider as any).buildRows(doc);

    expect(rows).toEqual([
      expect.objectContaining({
        type: 'comment',
        text: '# App config',
        lineIndex: 0,
      }),
      expect.objectContaining({
        type: 'pair',
        key: 'TOKEN',
        comment: '# auth token',
        lineIndex: 1,
      }),
      expect.objectContaining({
        type: 'pair',
        key: 'API_KEY',
        comment: '',
        lineIndex: 2,
      }),
    ]);
  });

  it('ignores invalid pair-like lines when building rows', () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', 'A B=1\n# comment\nTOKEN=abc');
    const rows = (provider as any).buildRows(doc);

    const pairRows = rows.filter((row: any) => row.type === 'pair');
    expect(pairRows).toHaveLength(1);
    expect(pairRows[0].key).toBe('TOKEN');
  });

  it('skips empty lines when building rows', () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', '\nTOKEN=abc');
    const rows = (provider as any).buildRows(doc);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({ type: 'pair', key: 'TOKEN' }));
  });

  it('skips malformed pair entries returned by parser', () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', 'IGNORED');
    const parseSpy = jest.spyOn(EnvParser, 'parse').mockReturnValue([
      { type: 'pair', lineIndex: 0, originalText: 'BROKEN' } as any,
    ]);

    const rows = (provider as any).buildRows(doc);

    expect(rows).toEqual([]);
    parseSpy.mockRestore();
  });

  it('renders search, header sorting, comments, and icon action hooks', () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', '# App config\nTOKEN=abc # auth token\nAPI_KEY=old');
    const rows = (provider as any).buildRows(doc);
    const html = (provider as any).getHtml({ cspSource: 'vscode-resource:' }, rows);

    expect(html).toContain('id="search"');
    expect(html).toContain('placeholder="Search keys and comments"');
    expect(html).toContain('id="sort-key"');
    expect(html).toContain('aria-sort="none"');
    expect(html).toContain('<th>Comment</th>');
    expect(html).toContain('class="actions-header"');
    expect(html).toContain("actionButtons.className = 'action-buttons';");
    expect(html).toContain("td.colSpan = 4;");
    expect(html).toContain('class="fa-icon"');
    expect(html).toContain('element.title = label;');
    expect(html).toContain('syncTextIconButton');
    expect(html).toContain("iconButton('edit', 'Edit'");
    expect(html).toContain('sortKeyButton.addEventListener');
  });

  it('marks duplicate keys with warnings in rows', () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', 'TOKEN=abc\nTOKEN=xyz');
    const rows = (provider as any).buildRows(doc);
    const pairRows = rows.filter((row: any) => row.type === 'pair');

    expect(pairRows).toHaveLength(2);
    expect(pairRows[0].isDuplicate).toBe(true);
    expect(pairRows[1].isDuplicate).toBe(true);
    expect(pairRows[0].duplicateCount).toBe(2);
  });

  it('serializes html-sensitive characters safely', () => {
    const provider = createProvider();
    const value = (provider as any).serializeForHtml('<tag>&value>');

    expect(value).toContain('\\u003c');
    expect(value).toContain('\\u003e');
    expect(value).toContain('\\u0026');
  });

  it('generates nonce with expected size and alphanumeric charset', () => {
    const provider = createProvider();
    const nonce = (provider as any).getNonce();

    expect(nonce).toHaveLength(32);
    expect(/^[A-Za-z0-9]+$/.test(nonce)).toBe(true);
  });

  it('returns line breaks correctly at offsets', () => {
    const provider = createProvider();

    expect((provider as any).getLineBreakAt('A\r\nB', 1)).toBe('\r\n');
    expect((provider as any).getLineBreakAt('A\nB', 1)).toBe('\n');
    expect((provider as any).getLineBreakAt('AB', 1)).toBeUndefined();
  });

  it('detects line break mode from content', () => {
    const provider = createProvider();

    expect((provider as any).detectLineBreak('A\r\nB')).toBe('\r\n');
    expect((provider as any).detectLineBreak('A\nB')).toBe('\n');
  });

  it('finds pair by key and line', () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', 'A=1\nB=2');

    const found = (provider as any).findPairByKeyAndLine(doc, 'B', 1);
    const notFound = (provider as any).findPairByKeyAndLine(doc, 'C', 2);

    expect(found).toEqual(expect.objectContaining({ key: 'B', lineIndex: 1 }));
    expect(notFound).toBeUndefined();
  });

  it('serializes icon path when icon data path is a string', () => {
    const provider = createProvider();
    const serialized = (provider as any).serializeIcon({
      icon: [16, 16, [], 'x', 'M0 0'],
    });

    expect(serialized).toEqual({ width: 16, height: 16, path: 'M0 0' });
  });

  it('serializes icon path arrays by joining path segments', () => {
    const provider = createProvider();
    const serialized = (provider as any).serializeIcon({
      icon: [16, 16, [], 'x', ['M0 0', 'L1 1']],
    });

    expect(serialized).toEqual({ width: 16, height: 16, path: 'M0 0 L1 1' });
  });

  it('falls back duplicateCount to 1 when map lookup is undefined', () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', 'TOKEN=abc\nTOKEN=xyz');
    const originalGet = Map.prototype.get;
    const getSpy = jest.spyOn(Map.prototype, 'get').mockImplementation(function () {
      return undefined;
    });

    const rows = (provider as any).buildRows(doc);
    const pairRows = rows.filter((row: any) => row.type === 'pair');

    expect(pairRows[0].duplicateCount).toBe(1);
    expect(pairRows[0].isDuplicate).toBe(false);

    getSpy.mockRestore();
    Map.prototype.get = originalGet;
  });
});

describe('EnvSecureEditorProvider guards and error paths', () => {
  it('ignores unknown messages and rejects invalid guard candidates', async () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', 'A=1');

    await expect(sendMessage(provider, doc, { type: 'noop' })).resolves.toBeUndefined();

    expect((provider as any).isEditMessage(null)).toBe(false);
    expect((provider as any).isEditMessage({ type: 'editValue', key: 'A', newValue: '2' })).toBe(false);
    expect((provider as any).isAddPairMessage('bad')).toBe(false);
    expect((provider as any).isOpenAsTextMessage(undefined)).toBe(false);
    expect((provider as any).isAddAfterMessage({ type: 'addAfter', key: 'A' })).toBe(false);
    expect((provider as any).isDeletePairMessage({ type: 'deletePair', key: 'A' })).toBe(false);
    expect((provider as any).isAddAfterMessage(null)).toBe(false);
    expect((provider as any).isDeletePairMessage(null)).toBe(false);
  });

  it('shows error when editing key that does not exist', async () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', 'A=1');

    await sendMessage(provider, doc, {
      type: 'editValue',
      key: 'NOT_FOUND',
      newValue: 'x',
      lineIndex: 0,
    });

    expect((vscode as any).window.showErrorMessage).toHaveBeenCalledWith('Could not locate NOT_FOUND for editing.');
  });

  it('validates key format for add and add-after operations', async () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', 'A=1');

    await sendMessage(provider, doc, {
      type: 'addPair',
      key: 'INVALID KEY',
      value: '2',
    });

    await sendMessage(provider, doc, {
      type: 'addAfter',
      key: 'A',
      lineIndex: 0,
      newKey: 'INVALID KEY',
      newValue: '2',
    });

    expect((vscode as any).window.showErrorMessage).toHaveBeenCalledWith(
      'Invalid key. Use only letters, numbers, underscore, dot, or dash.'
    );
  });

  it('shows error when add-after anchor or delete target are not found', async () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', 'A=1');

    await sendMessage(provider, doc, {
      type: 'addAfter',
      key: 'MISSING',
      lineIndex: 3,
      newKey: 'B',
      newValue: '2',
    });

    await sendMessage(provider, doc, {
      type: 'deletePair',
      key: 'MISSING',
      lineIndex: 3,
    });

    expect((vscode as any).window.showErrorMessage).toHaveBeenCalledWith('Could not locate MISSING to insert after.');
    expect((vscode as any).window.showErrorMessage).toHaveBeenCalledWith('Could not locate MISSING for deletion.');
  });

  it('adds new key at end when document does not end with line break', async () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', 'A=1');

    await sendMessage(provider, doc, {
      type: 'addPair',
      key: 'B',
      value: '2',
    });

    expect((vscode as any).workspace.applyEdit).toHaveBeenCalledTimes(1);
    expect(getReplacementText()).toBe('A=1\nB=2');
  });

  it('adds pair after last line preserving CRLF style', async () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', 'A=1\r\nB=2');

    await sendMessage(provider, doc, {
      type: 'addAfter',
      key: 'B',
      lineIndex: 1,
      newKey: 'C',
      newValue: '3',
    });

    expect((vscode as any).workspace.applyEdit).toHaveBeenCalledTimes(1);
    expect(getReplacementText()).toBe('A=1\r\nB=2\r\nC=3');
  });

  it('updates existing key through addPair flow', async () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', 'A=1');

    await sendMessage(provider, doc, {
      type: 'addPair',
      key: 'A',
      value: '9',
    });

    expect((vscode as any).workspace.applyEdit).toHaveBeenCalledTimes(1);
    expect(getReplacementText()).toBe('A=9');
  });

  it('shows error when workspace edit is not applied', async () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', 'A=1');
    const vs = vscode as any;
    vs.workspace.applyEdit.mockResolvedValueOnce(false);

    await sendMessage(provider, doc, {
      type: 'editValue',
      key: 'A',
      newValue: '2',
      lineIndex: 0,
    });

    expect(vs.window.showErrorMessage).toHaveBeenCalledWith('Could not update .env file.');
  });

  it('uses openWith and falls back to open command on failure', async () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', 'A=1');
    const vs = vscode as any;

    await sendMessage(provider, doc, { type: 'openAsText' });
    expect(vs.commands.executeCommand).toHaveBeenCalledWith('vscode.openWith', doc.uri, 'default');

    vs.commands.executeCommand.mockReset();
    vs.commands.executeCommand.mockRejectedValueOnce(new Error('no openWith'));
    await sendMessage(provider, doc, { type: 'openAsText' });

    expect(vs.commands.executeCommand).toHaveBeenNthCalledWith(1, 'vscode.openWith', doc.uri, 'default');
    expect(vs.commands.executeCommand).toHaveBeenNthCalledWith(2, 'vscode.open', doc.uri, {
      preview: false,
      override: false,
    });
  });
});

describe('EnvSecureEditorProvider resolve lifecycle', () => {
  it('registers listeners, re-renders on events, handles message errors, and disposes panel resources', async () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', 'A=1');
    const panelMock = createWebviewPanelMock();
    const vs = vscode as any;

    await provider.resolveCustomTextEditor(doc as any, panelMock.panel as any, {} as any);

    expect(panelMock.panel.webview.options).toEqual({ enableScripts: true });
    expect(panelMock.panel.webview.html).toContain('Protect My Env Viewer');

    const onChangeDoc = vs.workspace.onDidChangeTextDocument.mock.calls[0][0];
    const onChangeConfig = vs.workspace.onDidChangeConfiguration.mock.calls[0][0];

    onChangeDoc({ document: doc });
    expect(panelMock.panel.webview.html).toContain('Protect My Env Viewer');

    onChangeConfig({ affectsConfiguration: () => true });
    expect(panelMock.panel.webview.html).toContain('Protect My Env Viewer');

    jest.spyOn(provider as any, 'handleMessage').mockRejectedValueOnce('boom');
    await panelMock.invokeMessage({ type: 'openAsText' });
    expect(vs.window.showErrorMessage).toHaveBeenCalledWith('Could not update .env file: boom');

    panelMock.invokeDispose();
    panelMock.invokeDispose();
    expect(panelMock.messageDisposable.dispose).toHaveBeenCalled();
    expect(panelMock.disposeDisposable.dispose).toHaveBeenCalled();
  });

  it('handles Error instances in message handling path', async () => {
    const provider = createProvider();
    const doc = createDocument('/tmp/.env', 'A=1');
    const panelMock = createWebviewPanelMock();
    const vs = vscode as any;

    await provider.resolveCustomTextEditor(doc as any, panelMock.panel as any, {} as any);

    jest.spyOn(provider as any, 'handleMessage').mockRejectedValueOnce(new Error('boom-error'));
    await panelMock.invokeMessage({ type: 'openAsText' });

    expect(vs.window.showErrorMessage).toHaveBeenCalledWith('Could not update .env file: boom-error');
  });

  it('dispose cleans all live panel disposables', async () => {
    const provider = createProvider();
    const panelOne = createWebviewPanelMock();
    const panelTwo = createWebviewPanelMock();
    const doc = createDocument('/tmp/.env', 'A=1');

    await provider.resolveCustomTextEditor(doc as any, panelOne.panel as any, {} as any);
    await provider.resolveCustomTextEditor(doc as any, panelTwo.panel as any, {} as any);

    provider.dispose();

    expect(panelOne.messageDisposable.dispose).toHaveBeenCalled();
    expect(panelOne.disposeDisposable.dispose).toHaveBeenCalled();
    expect(panelTwo.messageDisposable.dispose).toHaveBeenCalled();
    expect(panelTwo.disposeDisposable.dispose).toHaveBeenCalled();
  });

  it('dispose tolerates live panel without disposables entry', () => {
    const provider = createProvider();
    const fakePanel = {} as any;

    (provider as any).livePanels.add(fakePanel);

    expect(() => provider.dispose()).not.toThrow();
  });
});
