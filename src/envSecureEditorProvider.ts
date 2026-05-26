import * as vscode from 'vscode';
import {
  faArrowDownAZ,
  faArrowUpZA,
  faCheck,
  faCopy,
  faEye,
  faEyeSlash,
  faFileLines,
  faFilter,
  faPenToSquare,
  faPlus,
  faSort,
  faTrash,
  faTriangleExclamation,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { ConfigManager } from './config';
import { EnvParser } from './parser';
import { ObfuscationMatcherManager } from './matchers';

interface SerializedIcon {
  width: number;
  height: number;
  path: string;
}

interface FontAwesomeIconDefinition {
  icon: [number, number, string[], string, string | string[]];
}

interface PairViewModel {
  type: 'pair';
  id: string;
  key: string;
  value: string;
  comment: string;
  shouldMask: boolean;
  commentShouldMask: boolean;
  lineIndex: number;
  startCharacter: number;
  endCharacter: number;
  isDuplicate: boolean;
  duplicateCount: number;
}

interface CommentViewModel {
  type: 'comment';
  id: string;
  text: string;
  shouldMask: boolean;
  lineIndex: number;
}

type EnvRowViewModel = PairViewModel | CommentViewModel;

interface EditValueMessage {
  type: 'editValue';
  key: string;
  newValue: string;
  lineIndex: number;
}

interface AddPairMessage {
  type: 'addPair';
  key: string;
  value: string;
}

interface AddAfterMessage {
  type: 'addAfter';
  key: string;
  lineIndex: number;
  newKey: string;
  newValue: string;
}

interface DeletePairMessage {
  type: 'deletePair';
  key: string;
  lineIndex: number;
}

interface OpenAsTextMessage {
  type: 'openAsText';
}

export class EnvSecureEditorProvider implements vscode.CustomTextEditorProvider, vscode.Disposable {
  public static readonly viewType = 'protectMyEnv.secureEnvEditor';

  private readonly panelDisposables = new WeakMap<vscode.WebviewPanel, vscode.Disposable[]>();
  private readonly livePanels = new Set<vscode.WebviewPanel>();

  constructor(private readonly matcherManager: ObfuscationMatcherManager) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
    };

    const render = () => {
      const rows = this.buildRows(document);
      webviewPanel.webview.html = this.getHtml(webviewPanel.webview, rows);
    };

    const disposables: vscode.Disposable[] = [];
    this.livePanels.add(webviewPanel);

    disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() === document.uri.toString()) {
          render();
        }
      })
    );

    disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('protectMyEnv')) {
          render();
        }
      })
    );

    disposables.push(
      webviewPanel.webview.onDidReceiveMessage(async (message: unknown) => {
        try {
          await this.handleMessage(document, message);
        } catch (error) {
          const messageText = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Could not update .env file: ${messageText}`);
        }
      })
    );

    disposables.push(
      webviewPanel.onDidDispose(() => {
        const list = this.panelDisposables.get(webviewPanel) || [];
        for (const disposable of list) {
          disposable.dispose();
        }
        this.panelDisposables.delete(webviewPanel);
        this.livePanels.delete(webviewPanel);
      })
    );

    this.panelDisposables.set(webviewPanel, disposables);

    render();
  }

  public dispose(): void {
    for (const panel of this.livePanels) {
      const disposables = this.panelDisposables.get(panel) || [];
      for (const disposable of disposables) {
        disposable.dispose();
      }
      this.panelDisposables.delete(panel);
    }
    this.livePanels.clear();
  }

  private async handleMessage(document: vscode.TextDocument, message: unknown): Promise<void> {
    if (this.isEditMessage(message)) {
      await this.applyValueEdit(document, message);
      return;
    }

    if (this.isAddPairMessage(message)) {
      await this.addOrUpdatePair(document, message);
      return;
    }

    if (this.isAddAfterMessage(message)) {
      await this.addPairAfter(document, message);
      return;
    }

    if (this.isDeletePairMessage(message)) {
      await this.deletePair(document, message);
      return;
    }

    if (this.isOpenAsTextMessage(message)) {
      await this.openAsTextEditor(document);
    }
  }

  private async applyValueEdit(document: vscode.TextDocument, message: EditValueMessage): Promise<void> {
    const target = this.findPairByKeyAndLine(document, message.key, message.lineIndex);
    if (!target || target.valueStartOffset === undefined || target.valueEndOffset === undefined) {
      vscode.window.showErrorMessage(`Could not locate ${message.key} for editing.`);
      return;
    }

    const currentText = document.getText();
    const lineStartOffset = document.offsetAt(new vscode.Position(target.lineIndex, 0));
    const valueStartOffset = lineStartOffset + target.valueStartOffset;
    const valueEndOffset = lineStartOffset + target.valueEndOffset;
    const nextText = `${currentText.slice(0, valueStartOffset)}${message.newValue}${currentText.slice(valueEndOffset)}`;

    if (await this.replaceDocumentText(document, nextText)) {
      vscode.window.showInformationMessage(`Updated ${message.key}.`);
    }
  }

  private async addOrUpdatePair(document: vscode.TextDocument, message: AddPairMessage): Promise<void> {
    const key = message.key.trim();
    if (!/^[A-Za-z0-9_.-]+$/.test(key)) {
      vscode.window.showErrorMessage('Invalid key. Use only letters, numbers, underscore, dot, or dash.');
      return;
    }

    const value = message.value;
    const currentPairs = this.buildPairs(document);
    const existing = currentPairs.find((pair) => pair.key === key);

    if (existing) {
      await this.applyValueEdit(document, {
        type: 'editValue',
        key,
        newValue: value,
        lineIndex: existing.lineIndex,
      });
      return;
    }

    const currentText = document.getText();
    const needsLeadingBreak = currentText.length > 0 && !currentText.endsWith('\n');
    const insertion = `${needsLeadingBreak ? '\n' : ''}${key}=${value}`;
    const nextText = `${currentText}${insertion}`;

    if (await this.replaceDocumentText(document, nextText)) {
      vscode.window.showInformationMessage(`Added ${key}.`);
    }
  }

  private async addPairAfter(document: vscode.TextDocument, message: AddAfterMessage): Promise<void> {
    const newKey = message.newKey.trim();
    if (!/^[A-Za-z0-9_.-]+$/.test(newKey)) {
      vscode.window.showErrorMessage('Invalid key. Use only letters, numbers, underscore, dot, or dash.');
      return;
    }

    const anchor = this.findPairByKeyAndLine(document, message.key, message.lineIndex);
    if (!anchor) {
      vscode.window.showErrorMessage(`Could not locate ${message.key} to insert after.`);
      return;
    }

    const lineBreak = this.detectLineBreak(document.getText());
    const documentText = document.getText();
    const lineStartOffset = document.offsetAt(new vscode.Position(anchor.lineIndex, 0));
    const lineEndOffset = lineStartOffset + anchor.originalText.length;

    const existingLineBreak = this.getLineBreakAt(documentText, lineEndOffset);
    const insertion = `${newKey}=${message.newValue}`;
    const insertOffset = existingLineBreak ? lineEndOffset + existingLineBreak.length : lineEndOffset;
    const textToInsert = existingLineBreak ? `${insertion}${lineBreak}` : `${lineBreak}${insertion}`;
    const nextText = `${documentText.slice(0, insertOffset)}${textToInsert}${documentText.slice(insertOffset)}`;

    if (await this.replaceDocumentText(document, nextText)) {
      vscode.window.showInformationMessage(`Added ${newKey}.`);
    }
  }

  private async deletePair(document: vscode.TextDocument, message: DeletePairMessage): Promise<void> {
    const target = this.findPairByKeyAndLine(document, message.key, message.lineIndex);
    if (!target) {
      vscode.window.showErrorMessage(`Could not locate ${message.key} for deletion.`);
      return;
    }

    const text = document.getText();
    const lineStartOffset = document.offsetAt(new vscode.Position(target.lineIndex, 0));
    const lineEndOffset = lineStartOffset + target.originalText.length;

    let deleteStartOffset = lineStartOffset;
    let deleteEndOffset = lineEndOffset;

    const followingLineBreak = this.getLineBreakAt(text, lineEndOffset);
    if (followingLineBreak) {
      deleteEndOffset += followingLineBreak.length;
    } else if (lineStartOffset > 0) {
      if (text.charAt(lineStartOffset - 1) === '\n') {
        deleteStartOffset -= 1;
        if (deleteStartOffset > 0 && text.charAt(deleteStartOffset - 1) === '\r') {
          deleteStartOffset -= 1;
        }
      }
    }

    const nextText = `${text.slice(0, deleteStartOffset)}${text.slice(deleteEndOffset)}`;

    if (await this.replaceDocumentText(document, nextText)) {
      vscode.window.showInformationMessage(`Deleted ${message.key}.`);
    }
  }

  private async openAsTextEditor(document: vscode.TextDocument): Promise<void> {
    try {
      await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
      return;
    } catch {
      // Fall through to generic open command for compatibility with older versions.
    }

    await vscode.commands.executeCommand('vscode.open', document.uri, {
      preview: false,
      override: false,
    });
  }

  private async replaceDocumentText(document: vscode.TextDocument, nextText: string): Promise<boolean> {
    const currentText = document.getText();
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      document.uri,
      new vscode.Range(document.positionAt(0), document.positionAt(currentText.length)),
      nextText
    );

    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      vscode.window.showErrorMessage('Could not update .env file.');
    }

    return applied;
  }

  private getLineBreakAt(content: string, offset: number): string | undefined {
    if (content.startsWith('\r\n', offset)) {
      return '\r\n';
    }

    if (content.charAt(offset) === '\n') {
      return '\n';
    }

    return undefined;
  }

  private buildRows(document: vscode.TextDocument): EnvRowViewModel[] {
    const rows: EnvRowViewModel[] = [];
    const parsed = EnvParser.parse(document.getText());
    const protectComments = ConfigManager.getProtectComments();

    for (const line of parsed) {
      if (line.type === 'empty') {
        continue;
      }

      if (line.type === 'comment') {
        rows.push({
          type: 'comment',
          id: `${line.lineIndex}:comment`,
          text: line.originalText.trim(),
          shouldMask: protectComments,
          lineIndex: line.lineIndex,
        });
        continue;
      }

      if (!line.key || line.value === undefined || line.valueStartOffset === undefined || line.valueEndOffset === undefined) {
        continue;
      }

      const start = document.positionAt(document.offsetAt(new vscode.Position(line.lineIndex, 0)) + line.valueStartOffset);
      const end = document.positionAt(document.offsetAt(new vscode.Position(line.lineIndex, 0)) + line.valueEndOffset);
      const shouldMask = this.matcherManager.shouldMask(line.key);

      rows.push({
        type: 'pair',
        id: `${line.lineIndex}:${line.key}`,
        key: line.key,
        value: line.value,
        comment: this.getInlineComment(line),
        shouldMask,
        commentShouldMask: protectComments && shouldMask,
        lineIndex: line.lineIndex,
        startCharacter: start.character,
        endCharacter: end.character,
        isDuplicate: false,
        duplicateCount: 1,
      });
    }

    const keyCounts = new Map<string, number>();
    for (const row of rows) {
      if (row.type === 'pair') {
        keyCounts.set(row.key, (keyCounts.get(row.key) ?? 0) + 1);
      }
    }
    for (const row of rows) {
      if (row.type === 'pair') {
        const count = keyCounts.get(row.key) ?? 1;
        row.duplicateCount = count;
        row.isDuplicate = count > 1;
      }
    }

    return rows;
  }

  private buildPairs(document: vscode.TextDocument): PairViewModel[] {
    return this.buildRows(document).filter((row): row is PairViewModel => row.type === 'pair');
  }

  private getInlineComment(line: ReturnType<typeof EnvParser.parse>[number]): string {
    if (line.commentStartOffset === undefined || line.commentEndOffset === undefined) {
      return '';
    }

    return line.originalText.substring(line.commentStartOffset, line.commentEndOffset).trim();
  }

  private serializeIcon(icon: FontAwesomeIconDefinition): SerializedIcon {
    const [width, height, , , pathData] = icon.icon;
    return {
      width,
      height,
      path: Array.isArray(pathData) ? pathData.join(' ') : pathData,
    };
  }

  private getIcons(): Record<string, SerializedIcon> {
    return {
      add: this.serializeIcon(faPlus),
      cancel: this.serializeIcon(faXmark),
      confirm: this.serializeIcon(faCheck),
      copy: this.serializeIcon(faCopy),
      delete: this.serializeIcon(faTrash),
      edit: this.serializeIcon(faPenToSquare),
      filter: this.serializeIcon(faFilter),
      hide: this.serializeIcon(faEyeSlash),
      openText: this.serializeIcon(faFileLines),
      reveal: this.serializeIcon(faEye),
      sort: this.serializeIcon(faSort),
      sortAsc: this.serializeIcon(faArrowDownAZ),
      sortDesc: this.serializeIcon(faArrowUpZA),
      warning: this.serializeIcon(faTriangleExclamation),
    };
  }

  private getHtml(webview: vscode.Webview, envRows: EnvRowViewModel[]): string {
    const nonce = this.getNonce();
    const maskChar = ConfigManager.getMaskCharacter();
    const maskLength = ConfigManager.getMaskLength();
    const serializedRows = this.serializeForHtml(envRows);
    const serializedIcons = this.serializeForHtml(this.getIcons());

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Protect My Env Viewer</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --muted: var(--vscode-descriptionForeground);
      --line: color-mix(in srgb, var(--fg) 14%, transparent);
      --btn-bg: color-mix(in srgb, var(--fg) 12%, transparent);
      --btn-bg-hover: color-mix(in srgb, var(--fg) 20%, transparent);
      --warn: var(--vscode-editorWarning-foreground);
    }

    body {
      margin: 0;
      font-family: var(--vscode-font-family);
      background: radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--bg) 82%, #2e7d32 18%), var(--bg));
      color: var(--fg);
    }

    .wrap {
      max-width: 980px;
      margin: 0 auto;
      padding: 16px;
    }

    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }

    .title {
      font-size: 14px;
      margin: 0;
      letter-spacing: 0.2px;
    }

    .meta {
      margin: 0;
      font-size: 12px;
      color: var(--muted);
    }

    .banner {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 12px;
      font-size: 12px;
      color: var(--muted);
      background: color-mix(in srgb, var(--bg) 85%, transparent);
    }

    .toolbar {
      display: grid;
      grid-template-columns: minmax(180px, 1fr) auto;
      gap: 10px;
      align-items: end;
      margin-bottom: 10px;
    }

    .toolbar-actions {
      display: flex;
      gap: 8px;
      align-items: end;
    }

    .toolbar-actions button.active {
      background: var(--btn-bg-hover);
      border-color: var(--warn);
      color: var(--warn);
    }

    .field {
      display: grid;
      gap: 4px;
      min-width: 0;
      font-size: 11px;
      color: var(--muted);
    }

    .control-input {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 6px 8px;
      background: color-mix(in srgb, var(--bg) 92%, transparent);
      color: var(--fg);
      font-family: var(--vscode-font-family);
      font-size: 12px;
    }

    .control-input:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }

    table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      border: 1px solid var(--line);
      border-radius: 10px;
      overflow: hidden;
      background: color-mix(in srgb, var(--bg) 92%, transparent);
    }

    .key-column {
      width: 24%;
    }

    .value-column {
      width: 34%;
    }

    .actions-column {
      width: 200px;
    }

    th, td {
      border-bottom: 1px solid var(--line);
      padding: 10px;
      text-align: left;
      font-size: 12px;
      vertical-align: middle;
    }

    tr:last-child td {
      border-bottom: none;
    }

    th {
      color: var(--muted);
      font-weight: 600;
      letter-spacing: 0.2px;
    }

    .sort-header {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 0;
      border-radius: 6px;
      padding: 2px 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }

    .sort-header:hover {
      background: var(--btn-bg);
    }

    .value {
      font-family: var(--vscode-editor-font-family);
      word-break: break-all;
    }

    .comment,
    .comment-row-cell {
      font-family: var(--vscode-editor-font-family);
      color: var(--muted);
      overflow-wrap: anywhere;
      word-break: normal;
    }

    .comment-row-cell {
      font-style: italic;
    }

    button {
      border: 1px solid var(--line);
      background: var(--btn-bg);
      color: var(--fg);
      border-radius: 8px;
      padding: 5px 10px;
      font-size: 12px;
      cursor: pointer;
    }

    button:hover {
      background: var(--btn-bg-hover);
    }

    .text-icon-button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .icon-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      position: relative;
    }

    .icon-button::after {
      content: attr(data-tooltip);
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%) translateY(2px);
      background: var(--vscode-editorHoverWidget-background, #1e1e1e);
      color: var(--vscode-editorHoverWidget-foreground, var(--fg));
      border: 1px solid var(--vscode-editorHoverWidget-border, var(--line));
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 11px;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 120ms ease, transform 120ms ease;
      z-index: 10;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    }

    .icon-button:hover::after,
    .icon-button:focus-visible::after {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    .icon-button.danger {
      color: var(--warn);
    }

    .fa-icon {
      width: 13px;
      height: 13px;
      display: block;
      flex: 0 0 auto;
      fill: currentColor;
    }

    .danger {
      color: var(--warn);
    }

    .key-cell {
      display: flex;
      align-items: center;
      gap: 6px;
      word-break: break-all;
    }

    .duplicate-warning {
      color: var(--warn);
      display: inline-flex;
      align-items: center;
      flex: 0 0 auto;
    }

    .duplicate-warning .fa-icon {
      width: 12px;
      height: 12px;
    }

    .duplicate-warning {
      position: relative;
      cursor: help;
    }

    .duplicate-warning::after {
      content: attr(data-tooltip);
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%) translateY(2px);
      background: var(--vscode-editorHoverWidget-background, #1e1e1e);
      color: var(--vscode-editorHoverWidget-foreground, var(--fg));
      border: 1px solid var(--vscode-editorHoverWidget-border, var(--line));
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 11px;
      font-style: normal;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 120ms ease, transform 120ms ease;
      z-index: 10;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    }

    .duplicate-warning:hover::after,
    .duplicate-warning:focus-visible::after {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    .right {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .actions-header {
      text-align: right;
      white-space: nowrap;
    }

    .actions {
      text-align: right;
      white-space: nowrap;
    }

    .action-buttons {
      display: inline-flex;
      flex-wrap: nowrap;
      gap: 8px;
      align-items: center;
      justify-content: flex-end;
    }

    .inline-input {
      width: 100%;
      min-width: 180px;
      box-sizing: border-box;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 6px 8px;
      background: color-mix(in srgb, var(--bg) 92%, transparent);
      color: var(--fg);
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
    }

    .inline-key {
      max-width: 280px;
    }

    .empty {
      color: var(--muted);
      text-align: center;
    }

    .status {
      min-height: 18px;
      margin: 0 0 8px;
      font-size: 12px;
      color: var(--muted);
    }

    @media (max-width: 640px) {
      .head {
        align-items: flex-start;
        flex-direction: column;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <div>
        <h1 class="title">Protect My Env</h1>
        <p class="meta">Sensitive values are masked by default. Reveal individually or all at once.</p>
      </div>
      <div class="right">
        <button id="open-text" class="text-icon-button" title="Open as text" aria-label="Open as text">
          <span id="open-text-icon"></span>
          <span id="open-text-text">Open as text</span>
        </button>
        <button id="toggle-all" class="text-icon-button" title="Reveal all" aria-label="Reveal all">
          <span id="toggle-all-icon"></span>
          <span id="toggle-all-text">Reveal all</span>
        </button>
      </div>
    </div>
    <div class="banner">
      Opening .env here avoids exposing values before the secure view is ready.
      Use reveal only when needed and for as little time as possible.
    </div>
    <div class="toolbar" aria-label="Env view controls">
      <label class="field" for="search">
        <span>Search</span>
        <input id="search" class="control-input" type="search" placeholder="Search keys and comments" autocomplete="off" />
      </label>
      <div class="toolbar-actions">
        <button id="filter-duplicates" class="text-icon-button" type="button" title="Show duplicates only" aria-label="Show duplicates only" aria-pressed="false">
          <span id="filter-duplicates-icon"></span>
          <span id="filter-duplicates-text">Duplicates</span>
          <span id="filter-duplicates-count"></span>
        </button>
      </div>
    </div>
    <p class="status" id="status"></p>

    <table>
      <colgroup>
        <col class="key-column" />
        <col class="value-column" />
        <col class="comment-column" />
        <col class="actions-column" />
      </colgroup>
      <thead>
        <tr>
          <th id="key-header" aria-sort="none">
            <button id="sort-key" class="sort-header" type="button" title="Sort by key" aria-label="Sort by key">
              <span>Key</span>
              <span id="sort-key-icon"></span>
            </button>
          </th>
          <th>Value</th>
          <th>Comment</th>
          <th class="actions-header">Actions</th>
        </tr>
      </thead>
      <tbody id="rows"></tbody>
    </table>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const data = ${serializedRows};
    const icons = ${serializedIcons};
    const maskChar = ${JSON.stringify(maskChar)};
    const maskLength = ${maskLength};

    const rows = document.getElementById('rows');
    const status = document.getElementById('status');
    const revealAllButton = document.getElementById('toggle-all');
    const revealAllIcon = document.getElementById('toggle-all-icon');
    const revealAllText = document.getElementById('toggle-all-text');
    const openAsTextButton = document.getElementById('open-text');
    const openAsTextIcon = document.getElementById('open-text-icon');
    const openAsTextText = document.getElementById('open-text-text');
    const searchInput = document.getElementById('search');
    const sortKeyButton = document.getElementById('sort-key');
    const sortKeyIcon = document.getElementById('sort-key-icon');
    const keyHeader = document.getElementById('key-header');
    const filterDuplicatesButton = document.getElementById('filter-duplicates');
    const filterDuplicatesIcon = document.getElementById('filter-duplicates-icon');
    const filterDuplicatesText = document.getElementById('filter-duplicates-text');
    const filterDuplicatesCount = document.getElementById('filter-duplicates-count');
    const revealed = new Set();
    const hidden = new Set();
    const hasPairRows = data.some((row) => row.type === 'pair');
    const duplicateTotal = data.reduce((sum, row) => sum + (row.type === 'pair' && row.isDuplicate ? 1 : 0), 0);
    let editingId = null;
    let addingAfterId = hasPairRows ? null : '__empty__';
    let deletingId = null;
    let revealAll = false;
    let searchQuery = '';
    let sortMode = 'file';
    let duplicatesOnly = false;

    function setStatus(text) {
      status.textContent = text || '';
    }

    function renderIcon(iconName) {
      const icon = icons[iconName];
      if (!icon) {
        return '';
      }

      return '<svg class="fa-icon" viewBox="0 0 ' + icon.width + ' ' + icon.height + '" aria-hidden="true" focusable="false"><path d="' + icon.path + '"></path></svg>';
    }

    function syncTextIconButton(buttonElement, iconElement, textElement, iconName, label) {
      if (!buttonElement || !iconElement || !textElement) {
        return;
      }

      iconElement.innerHTML = renderIcon(iconName);
      textElement.textContent = label;
      buttonElement.title = label;
      buttonElement.setAttribute('aria-label', label);
    }

    function isValueRevealed(row) {
      if (hidden.has(row.id)) {
        return false;
      }

      return revealAll || revealed.has(row.id) || !row.shouldMask;
    }

    function isValueMasked(row) {
      return !isValueRevealed(row);
    }

    function isCommentMasked(row) {
      if (row.type === 'pair') {
        return row.commentShouldMask && isValueMasked(row);
      }

      return row.shouldMask && !revealAll;
    }

    function commentText(row) {
      const text = row.type === 'pair' ? row.comment : row.text;
      if (!text) {
        return '';
      }

      return isCommentMasked(row) ? mask(text) : text;
    }

    function mask(value) {
      const len = maskLength === 0 ? value.length : Math.max(maskLength, 1);
      return maskChar.repeat(Math.max(len, 1));
    }

    function iconButton(iconName, label, className, onClick) {
      const element = document.createElement('button');
      element.className = className ? 'icon-button ' + className : 'icon-button';
      element.type = 'button';
      element.title = label;
      element.setAttribute('aria-label', label);
      element.setAttribute('data-tooltip', label);
      element.innerHTML = renderIcon(iconName);
      element.addEventListener('click', onClick);
      return element;
    }

    function createActionsCell() {
      const actionCell = document.createElement('td');
      const actionButtons = document.createElement('div');
      actionCell.className = 'actions';
      actionButtons.className = 'action-buttons';
      actionCell.appendChild(actionButtons);
      return { actionCell, actionButtons };
    }

    function input(value, placeholder, className) {
      const element = document.createElement('input');
      element.className = className ? 'inline-input ' + className : 'inline-input';
      element.value = value;
      element.placeholder = placeholder;
      return element;
    }

    function appendAddRow(anchorRow) {
      const tr = document.createElement('tr');

      const keyCell = document.createElement('td');
      const keyInput = input('', 'KEY_NAME', 'inline-key');
      keyCell.appendChild(keyInput);

      const valueCell = document.createElement('td');
      const valueInput = input('', 'value', '');
      valueCell.appendChild(valueInput);

      const commentCell = document.createElement('td');
      commentCell.className = 'comment';

      const { actionCell, actionButtons } = createActionsCell();
      actionButtons.appendChild(iconButton('confirm', 'Save', '', () => {
        const key = keyInput.value.trim();
        if (!key) {
          setStatus('Key is required.');
          keyInput.focus();
          return;
        }

        setStatus('Saving ' + key + '...');

        if (anchorRow) {
          vscode.postMessage({
            type: 'addAfter',
            key: anchorRow.key,
            lineIndex: anchorRow.lineIndex,
            newKey: key,
            newValue: valueInput.value,
          });
        } else {
          vscode.postMessage({
            type: 'addPair',
            key,
            value: valueInput.value,
          });
        }
      }));

      actionButtons.appendChild(iconButton('cancel', 'Cancel', '', () => {
        addingAfterId = hasPairRows ? null : '__empty__';
        setStatus('');
        render();
      }));

      tr.appendChild(keyCell);
      tr.appendChild(valueCell);
      tr.appendChild(commentCell);
      tr.appendChild(actionCell);
      rows.appendChild(tr);
      keyInput.focus();
    }

    function rowMatchesSearch(row, query) {
      if (!query) {
        return true;
      }

      if (row.type === 'pair') {
        return row.key.toLowerCase().includes(query) || row.comment.toLowerCase().includes(query);
      }

      return row.text.toLowerCase().includes(query);
    }

    function getVisibleRows() {
      const query = searchQuery.trim().toLowerCase();
      let visibleRows = data.filter((row) => rowMatchesSearch(row, query));

      if (duplicatesOnly) {
        visibleRows = visibleRows.filter((row) => row.type === 'pair' && row.isDuplicate);
      }

      if (sortMode === 'key-asc' || sortMode === 'key-desc') {
        visibleRows.sort((left, right) => {
          if (left.type !== 'pair' && right.type !== 'pair') {
            return left.lineIndex - right.lineIndex;
          }

          if (left.type !== 'pair') {
            return 1;
          }

          if (right.type !== 'pair') {
            return -1;
          }

          const direction = sortMode === 'key-asc' ? 1 : -1;
          const keyComparison = left.key.localeCompare(right.key, undefined, {
            numeric: true,
            sensitivity: 'base',
          });

          return keyComparison !== 0
            ? keyComparison * direction
            : left.lineIndex - right.lineIndex;
        });
      }

      return visibleRows;
    }

    function renderEmpty(text) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.className = 'empty';
      td.colSpan = 4;
      td.textContent = text;
      tr.appendChild(td);
      rows.appendChild(tr);
    }

    function renderSortHeader() {
      const iconName = sortMode === 'key-asc'
        ? 'sortAsc'
        : sortMode === 'key-desc'
          ? 'sortDesc'
          : 'sort';
      const label = sortMode === 'key-asc'
        ? 'Sort key descending'
        : sortMode === 'key-desc'
          ? 'Restore file order'
          : 'Sort key ascending';

      sortKeyIcon.innerHTML = renderIcon(iconName);
      sortKeyButton.title = label;
      sortKeyButton.setAttribute('aria-label', label);
      keyHeader.setAttribute('aria-sort', sortMode === 'key-asc' ? 'ascending' : sortMode === 'key-desc' ? 'descending' : 'none');
    }

    function renderCommentRow(row) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      tr.className = 'comment-row';
      td.className = 'comment-row-cell';
      td.colSpan = 4;
      td.textContent = commentText(row);
      tr.appendChild(td);
      rows.appendChild(tr);
    }

    function renderPairRow(row) {
      const isMasked = isValueMasked(row);
      const shown = isMasked ? mask(row.value) : row.value;
      const isEditing = editingId === row.id;
      const isDeleting = deletingId === row.id;

      const tr = document.createElement('tr');

      const keyCell = document.createElement('td');
      const keyWrapper = document.createElement('span');
      keyWrapper.className = 'key-cell';
      const keyText = document.createElement('span');
      keyText.textContent = row.key;
      keyWrapper.appendChild(keyText);
      if (row.isDuplicate) {
        const warning = document.createElement('span');
        warning.className = 'duplicate-warning';
        warning.innerHTML = renderIcon('warning');
        const tip = 'Duplicate key — appears ' + row.duplicateCount + ' times in this file';
        warning.title = tip;
        warning.setAttribute('aria-label', tip);
        warning.setAttribute('data-tooltip', tip);
        warning.setAttribute('tabindex', '0');
        keyWrapper.appendChild(warning);
      }
      keyCell.appendChild(keyWrapper);

      const valueCell = document.createElement('td');
      valueCell.className = 'value';
      let editInput = null;

      if (isEditing) {
        editInput = input(row.value, 'value', '');
        valueCell.appendChild(editInput);
      } else {
        valueCell.textContent = shown;
      }

      const commentCell = document.createElement('td');
      commentCell.className = 'comment';
      commentCell.textContent = commentText(row);

      const { actionCell, actionButtons } = createActionsCell();

      if (isEditing && editInput) {
        actionButtons.appendChild(iconButton('confirm', 'Save', '', () => {
          setStatus('Saving ' + row.key + '...');
          vscode.postMessage({
            type: 'editValue',
            key: row.key,
            newValue: editInput.value,
            lineIndex: row.lineIndex,
          });
        }));

        actionButtons.appendChild(iconButton('cancel', 'Cancel', '', () => {
          editingId = null;
          setStatus('');
          render();
        }));
      } else if (isDeleting) {
        actionButtons.appendChild(iconButton('confirm', 'Confirm delete', 'danger', () => {
          setStatus('Deleting ' + row.key + '...');
          vscode.postMessage({
            type: 'deletePair',
            key: row.key,
            lineIndex: row.lineIndex,
          });
        }));

        actionButtons.appendChild(iconButton('cancel', 'Cancel', '', () => {
          deletingId = null;
          setStatus('');
          render();
        }));
      } else {
        actionButtons.appendChild(iconButton('copy', 'Copy key=value', '', () => {
          navigator.clipboard.writeText(row.key + '=' + row.value).then(() => {
            setStatus('Copied ' + row.key + '=... to clipboard.');
            setTimeout(() => setStatus(''), 2000);
          }).catch(() => {
            setStatus('Failed to copy to clipboard.');
          });
        }));

        actionButtons.appendChild(iconButton(isMasked ? 'reveal' : 'hide', isMasked ? 'Reveal' : 'Hide', '', () => {
          if (isMasked) {
            hidden.delete(row.id);
            revealed.add(row.id);
          } else {
            revealed.delete(row.id);
            hidden.add(row.id);
          }
          render();
        }));

        actionButtons.appendChild(iconButton('edit', 'Edit', '', () => {
          editingId = row.id;
          deletingId = null;
          addingAfterId = null;
          setStatus('');
          render();
        }));

        actionButtons.appendChild(iconButton('add', 'Add after', '', () => {
          addingAfterId = row.id;
          editingId = null;
          deletingId = null;
          setStatus('');
          render();
        }));

        actionButtons.appendChild(iconButton('delete', 'Delete', 'danger', () => {
          deletingId = row.id;
          editingId = null;
          addingAfterId = null;
          setStatus('');
          render();
        }));
      }

      tr.appendChild(keyCell);
      tr.appendChild(valueCell);
      tr.appendChild(commentCell);
      tr.appendChild(actionCell);
      rows.appendChild(tr);

      if (addingAfterId === row.id) {
        appendAddRow(row);
      }
    }

    function render() {
      rows.innerHTML = '';
      const revealAllLabel = revealAll ? 'Hide all' : 'Reveal all';
      syncTextIconButton(openAsTextButton, openAsTextIcon, openAsTextText, 'openText', 'Open as text');
      syncTextIconButton(revealAllButton, revealAllIcon, revealAllText, revealAll ? 'hide' : 'reveal', revealAllLabel);
      renderSortHeader();
      renderDuplicateFilter();

      if (data.length === 0) {
        renderEmpty('No env values yet.');
        appendAddRow(null);
        return;
      }

      const visibleRows = getVisibleRows();

      if (visibleRows.length === 0) {
        if (duplicatesOnly) {
          renderEmpty(duplicateTotal === 0 ? 'No duplicate keys detected.' : 'No duplicate keys match this search.');
        } else {
          renderEmpty('No env values or comments match this search.');
        }
        return;
      }

      for (const row of visibleRows) {
        if (row.type === 'pair') {
          renderPairRow(row);
        } else {
          renderCommentRow(row);
        }
      }

      if (!hasPairRows && addingAfterId === '__empty__' && searchQuery.trim() === '') {
        appendAddRow(null);
      }

      if (editingId || addingAfterId) {
        const activeInput = rows.querySelector('input');
        if (activeInput) {
          activeInput.focus();
        }
      }
    }

    function renderDuplicateFilter() {
      filterDuplicatesIcon.innerHTML = renderIcon(duplicatesOnly ? 'warning' : 'filter');
      const label = duplicatesOnly ? 'Show all' : 'Duplicates';
      filterDuplicatesText.textContent = label;
      filterDuplicatesCount.textContent = duplicateTotal > 0 ? ' (' + duplicateTotal + ')' : '';
      filterDuplicatesButton.setAttribute('aria-pressed', duplicatesOnly ? 'true' : 'false');
      filterDuplicatesButton.classList.toggle('active', duplicatesOnly);
      filterDuplicatesButton.disabled = duplicateTotal === 0;
      filterDuplicatesButton.title = duplicateTotal === 0
        ? 'No duplicate keys'
        : (duplicatesOnly ? 'Show all entries' : 'Show duplicates only');
    }

    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value;
      render();
    });

    sortKeyButton.addEventListener('click', () => {
      sortMode = sortMode === 'key-asc'
        ? 'key-desc'
        : sortMode === 'key-desc'
          ? 'file'
          : 'key-asc';
      render();
    });

    revealAllButton.addEventListener('click', () => {
      revealAll = !revealAll;
      hidden.clear();
      if (!revealAll) {
        revealed.clear();
      }
      render();
    });

    openAsTextButton.addEventListener('click', () => {
      vscode.postMessage({ type: 'openAsText' });
    });

    filterDuplicatesButton.addEventListener('click', () => {
      if (duplicateTotal === 0) {
        return;
      }
      duplicatesOnly = !duplicatesOnly;
      render();
    });

    render();
  </script>
</body>
</html>`;
  }

  private serializeForHtml(value: unknown): string {
    return JSON.stringify(value)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');
  }

  private getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
      nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
  }

  private isEditMessage(message: unknown): message is {
    type: 'editValue';
    key: string;
    newValue: string;
    lineIndex: number;
  } {
    if (!message || typeof message !== 'object') {
      return false;
    }

    const candidate = message as Partial<Record<string, unknown>>;
    return candidate.type === 'editValue'
      && typeof candidate.key === 'string'
      && typeof candidate.newValue === 'string'
      && typeof candidate.lineIndex === 'number';
  }

  private isAddPairMessage(message: unknown): message is AddPairMessage {
    if (!message || typeof message !== 'object') {
      return false;
    }

    const candidate = message as Partial<Record<string, unknown>>;
    return candidate.type === 'addPair'
      && typeof candidate.key === 'string'
      && typeof candidate.value === 'string';
  }

  private isOpenAsTextMessage(message: unknown): message is OpenAsTextMessage {
    if (!message || typeof message !== 'object') {
      return false;
    }

    const candidate = message as Partial<Record<string, unknown>>;
    return candidate.type === 'openAsText';
  }

  private isAddAfterMessage(message: unknown): message is AddAfterMessage {
    if (!message || typeof message !== 'object') {
      return false;
    }

    const candidate = message as Partial<Record<string, unknown>>;
    return candidate.type === 'addAfter'
      && typeof candidate.key === 'string'
      && typeof candidate.lineIndex === 'number'
      && typeof candidate.newKey === 'string'
      && typeof candidate.newValue === 'string';
  }

  private isDeletePairMessage(message: unknown): message is DeletePairMessage {
    if (!message || typeof message !== 'object') {
      return false;
    }

    const candidate = message as Partial<Record<string, unknown>>;
    return candidate.type === 'deletePair'
      && typeof candidate.key === 'string'
      && typeof candidate.lineIndex === 'number';
  }

  private findPairByKeyAndLine(document: vscode.TextDocument, key: string, lineIndex: number): ReturnType<typeof EnvParser.parse>[number] | undefined {
    const parsed = EnvParser.parse(document.getText());
    return parsed.find((line) => line.type === 'pair' && line.key === key && line.lineIndex === lineIndex);
  }

  private detectLineBreak(content: string): string {
    return content.includes('\r\n') ? '\r\n' : '\n';
  }
}

