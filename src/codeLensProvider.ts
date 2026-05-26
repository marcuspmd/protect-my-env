import * as vscode from 'vscode';
import { EnvParser } from './parser';
import { MaskManager } from './maskManager';

export class EnvCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor(
    private readonly maskManager: MaskManager,
    private readonly shouldMaskConfigChecker: (key: string) => boolean
  ) {}

  /**
   * Refreshes the CodeLenses in active editors.
   */
  public triggerRefresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  /**
   * Provides CodeLens actions above each environment variable line.
   */
  public provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    if (!this.maskManager.isEnvFile(document)) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];
    const parsedLines = EnvParser.parse(document.getText());

    for (const line of parsedLines) {
      if (line.type !== 'pair' || !line.key || line.valueStartOffset === undefined) {
        continue;
      }

      // Place the CodeLens at the start of the key-value variable line
      const range = new vscode.Range(line.lineIndex, 0, line.lineIndex, 0);

      const shouldMaskByConfig = this.shouldMaskConfigChecker(line.key);
      const isCurrentlyMasked = this.maskManager.isKeyMasked(document, line.key);

      if (shouldMaskByConfig) {
        if (isCurrentlyMasked) {
          codeLenses.push(
            new vscode.CodeLens(range, {
              title: `👁️ Reveal ${line.key}`,
              command: 'protectMyEnv.reveal',
              arguments: [document, line.key],
            })
          );
        } else {
          codeLenses.push(
            new vscode.CodeLens(range, {
              title: `🙈 Hide ${line.key}`,
              command: 'protectMyEnv.mask',
              arguments: [document, line.key],
            })
          );
        }
      } else {
        // If the variable is currently visible because it doesn't match patterns,
        // offer an action to add it to rules so it gets hidden
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `➕ Hide ${line.key}`,
            command: 'protectMyEnv.addRule',
            arguments: [line.key],
          })
        );
      }
    }

    return codeLenses;
  }
}
