import * as vscode from 'vscode';
import { EnvParser } from './parser';
import { ObfuscationMatcherManager } from './matchers';
import { ConfigManager } from './config';

export class MaskManager implements vscode.Disposable {
  private readonly decorationType: vscode.TextEditorDecorationType;
  private readonly revealedKeys: Map<string, Set<string>> = new Map();
  private readonly revealAllDocs: Set<string> = new Set();

  constructor(private readonly matcherManager: ObfuscationMatcherManager) {
    // Hack: Inject 'display: none' via the textDecoration property to hide the original text
    this.decorationType = vscode.window.createTextEditorDecorationType({
      textDecoration: 'none; display: none;',
    });
  }

  /**
   * Applies mask decorations to the given text editor if it is a .env file.
   */
  public applyDecorations(editor: vscode.TextEditor | undefined): void {
    if (!editor) {
      return;
    }

    const document = editor.document;
    if (!this.isEnvFile(document)) {
      return;
    }

    const uriStr = document.uri.toString();
    const isRevealAll = this.revealAllDocs.has(uriStr);

    // If "Reveal All" is toggled for this document, remove all masks
    if (isRevealAll) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const docRevealedKeys = this.revealedKeys.get(uriStr) || new Set<string>();
    const parsedLines = EnvParser.parse(document.getText());
    const decorationOptions: vscode.DecorationOptions[] = [];

    const maskChar = ConfigManager.getMaskCharacter();
    const maskLenSetting = ConfigManager.getMaskLength();
    const protectComments = ConfigManager.getProtectComments();

    for (const line of parsedLines) {
      // 1. Mask full-line comments (or lines treated as comments) if protectComments is enabled
      if (line.type === 'comment' && protectComments && line.commentStartOffset !== undefined && line.commentEndOffset !== undefined) {
        const startPos = document.positionAt(document.offsetAt(new vscode.Position(line.lineIndex, 0)) + line.commentStartOffset);
        const endPos = document.positionAt(document.offsetAt(new vscode.Position(line.lineIndex, 0)) + line.commentEndOffset);
        const range = new vscode.Range(startPos, endPos);

        const commentText = line.originalText.substring(line.commentStartOffset, line.commentEndOffset);
        const visualLength = maskLenSetting === 0 ? commentText.length : maskLenSetting;
        const maskText = maskChar.repeat(visualLength > 0 ? visualLength : 1);

        decorationOptions.push({
          range,
          renderOptions: {
            after: {
              contentText: maskText,
              color: new vscode.ThemeColor('editorGhostText.foreground'),
              fontStyle: 'italic',
            },
          },
        });
        continue;
      }

      // 2. Mask key-value variables
      if (line.type === 'pair' && line.key && line.value && line.valueStartOffset !== undefined && line.valueEndOffset !== undefined) {
        // Check if this key should be masked under current config
        const matchesRules = this.matcherManager.shouldMask(line.key);
        const isRevealed = docRevealedKeys.has(line.key);

        if (matchesRules && !isRevealed) {
          const startPos = document.positionAt(document.offsetAt(new vscode.Position(line.lineIndex, 0)) + line.valueStartOffset);
          const endPos = document.positionAt(document.offsetAt(new vscode.Position(line.lineIndex, 0)) + line.valueEndOffset);
          const range = new vscode.Range(startPos, endPos);

          const visualLength = maskLenSetting === 0 ? line.value.length : maskLenSetting;
          const maskText = maskChar.repeat(visualLength > 0 ? visualLength : 1);

          decorationOptions.push({
            range,
            renderOptions: {
              after: {
                contentText: maskText,
                color: new vscode.ThemeColor('editorGhostText.foreground'),
                fontStyle: 'normal',
              },
            },
          });

          // Also mask its inline comment if present and protectComments is enabled
          if (protectComments && line.commentStartOffset !== undefined && line.commentEndOffset !== undefined) {
            const commentStartPos = document.positionAt(document.offsetAt(new vscode.Position(line.lineIndex, 0)) + line.commentStartOffset);
            const commentEndPos = document.positionAt(document.offsetAt(new vscode.Position(line.lineIndex, 0)) + line.commentEndOffset);
            const commentRange = new vscode.Range(commentStartPos, commentEndPos);

            const commentText = line.originalText.substring(line.commentStartOffset, line.commentEndOffset);
            const commentVisualLength = maskLenSetting === 0 ? commentText.length : maskLenSetting;
            const commentMaskText = maskChar.repeat(commentVisualLength > 0 ? commentVisualLength : 1);

            decorationOptions.push({
              range: commentRange,
              renderOptions: {
                after: {
                  contentText: commentMaskText,
                  color: new vscode.ThemeColor('editorGhostText.foreground'),
                  fontStyle: 'italic',
                },
              },
            });
          }
        }
      }
    }

    editor.setDecorations(this.decorationType, decorationOptions);
  }

  /**
   * Checks if a key is currently masked in a document.
   */
  public isKeyMasked(document: vscode.TextDocument, key: string): boolean {
    const uriStr = document.uri.toString();
    if (this.revealAllDocs.has(uriStr)) {
      return false;
    }

    const docRevealedKeys = this.revealedKeys.get(uriStr);
    if (docRevealedKeys && docRevealedKeys.has(key)) {
      return false;
    }

    return this.matcherManager.shouldMask(key);
  }

  /**
   * Toggles the visibility of a single key in the given document.
   */
  public revealKey(document: vscode.TextDocument, key: string): void {
    const uriStr = document.uri.toString();
    if (!this.revealedKeys.has(uriStr)) {
      this.revealedKeys.set(uriStr, new Set());
    }
    this.revealedKeys.get(uriStr)!.add(key);
    this.refreshEditorsForDoc(document);
  }

  /**
   * Re-masks a single key in the given document.
   */
  public maskKey(document: vscode.TextDocument, key: string): void {
    const uriStr = document.uri.toString();
    const docRevealedKeys = this.revealedKeys.get(uriStr);
    if (docRevealedKeys) {
      docRevealedKeys.delete(key);
    }
    this.refreshEditorsForDoc(document);
  }

  /**
   * Reveals all keys in the given document.
   */
  public revealAll(document: vscode.TextDocument): void {
    const uriStr = document.uri.toString();
    this.revealAllDocs.add(uriStr);
    this.updateContextKeys(vscode.window.activeTextEditor);
    this.refreshEditorsForDoc(document);
  }

  /**
   * Re-masks all keys in the given document.
   */
  public hideAll(document: vscode.TextDocument): void {
    const uriStr = document.uri.toString();
    this.revealAllDocs.delete(uriStr);
    this.revealedKeys.set(uriStr, new Set()); // Clear individual reveals on hide all
    this.updateContextKeys(vscode.window.activeTextEditor);
    this.refreshEditorsForDoc(document);
  }

  /**
   * Updates VS Code context keys used in menu command visibility.
   */
  public updateContextKeys(editor: vscode.TextEditor | undefined): void {
    if (editor && this.isEnvFile(editor.document)) {
      const isRevealed = this.revealAllDocs.has(editor.document.uri.toString());
      vscode.commands.executeCommand('setContext', 'protectMyEnv.allRevealed', isRevealed);
    } else {
      vscode.commands.executeCommand('setContext', 'protectMyEnv.allRevealed', false);
    }
  }

  /**
   * Helper to re-apply decorations across all visible editors editing this document.
   */
  private refreshEditorsForDoc(document: vscode.TextDocument): void {
    for (const visibleEditor of vscode.window.visibleTextEditors) {
      if (visibleEditor.document.uri.toString() === document.uri.toString()) {
        this.applyDecorations(visibleEditor);
      }
    }
  }

  /**
   * Identifies if a document is a .env file based on its filename.
   */
  public isEnvFile(document: vscode.TextDocument): boolean {
    const filename = document.fileName.toLowerCase();
    // Match .env, .env.development, etc.
    return filename.endsWith('.env') || filename.includes('.env.');
  }

  public dispose(): void {
    this.decorationType.dispose();
  }
}
