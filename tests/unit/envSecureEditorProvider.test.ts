import * as vscode from 'vscode';
import { EnvSecureEditorProvider } from '../../src/envSecureEditorProvider';
import { ObfuscationMatcherManager } from '../../src/matchers';
import { createDocument } from '../utils/editorFactory';
import { setConfig } from '../utils/configMock';

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
});
