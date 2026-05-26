import * as vscode from 'vscode';
import { ObfuscationMatcherManager } from './matchers';
import { ConfigManager } from './config';
import { EnvSecureEditorProvider } from './envSecureEditorProvider';

function updateMatcherConfig(matcherManager: ObfuscationMatcherManager): void {
  matcherManager.updateConfig(
    ConfigManager.getObfuscationMode() === 'all',
    ConfigManager.getRules(),
    ConfigManager.getPatterns()
  );
}

export function activate(context: vscode.ExtensionContext): void {
  const matcherManager = new ObfuscationMatcherManager();
  updateMatcherConfig(matcherManager);

  const secureEditorProvider = new EnvSecureEditorProvider(matcherManager);
  context.subscriptions.push(secureEditorProvider);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      EnvSecureEditorProvider.viewType,
      secureEditorProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('protectMyEnv')) {
        updateMatcherConfig(matcherManager);
      }
    })
  );
}

export function deactivate(): void {}
