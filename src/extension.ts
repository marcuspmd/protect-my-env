import * as vscode from 'vscode';
import { ObfuscationMatcherManager } from './matchers';
import { MaskManager } from './maskManager';
import { EnvCodeLensProvider } from './codeLensProvider';
import { ConfigManager } from './config';
import { createIgnoreFiles } from './ignoreFiles';

export function activate(context: vscode.ExtensionContext): void {
  console.log('Protect My Env extension is now active!');

  // 1. Initialize Managers
  const matcherManager = new ObfuscationMatcherManager();
  
  // Load initial configurations
  matcherManager.updateConfig(
    ConfigManager.getObfuscationMode() === 'all',
    ConfigManager.getRules(),
    ConfigManager.getPatterns()
  );

  const maskManager = new MaskManager(matcherManager);
  context.subscriptions.push(maskManager);

  const codeLensProvider = new EnvCodeLensProvider(maskManager, (key: string) => matcherManager.shouldMask(key));

  // 2. Register CodeLens Provider for dotenv and properties files, as well as .env wildcard patterns
  const dotenvSelector: vscode.DocumentSelector = [
    { language: 'dotenv' },
    { language: 'properties' },
    { pattern: '**/.*env*' },
    { pattern: '**/*env*' },
  ];

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(dotenvSelector, codeLensProvider)
  );

  // 3. Register Commands

  // Reveal a single environment variable value
  context.subscriptions.push(
    vscode.commands.registerCommand('protectMyEnv.reveal', (document: vscode.TextDocument, key: string) => {
      maskManager.revealKey(document, key);
      codeLensProvider.triggerRefresh();
    })
  );

  // Re-hide a single environment variable value
  context.subscriptions.push(
    vscode.commands.registerCommand('protectMyEnv.mask', (document: vscode.TextDocument, key: string) => {
      maskManager.maskKey(document, key);
      codeLensProvider.triggerRefresh();
    })
  );

  // Reveal all environment variables in the active editor
  context.subscriptions.push(
    vscode.commands.registerCommand('protectMyEnv.revealAll', () => {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && maskManager.isEnvFile(activeEditor.document)) {
        maskManager.revealAll(activeEditor.document);
        codeLensProvider.triggerRefresh();
      }
    })
  );

  // Mask all environment variables in the active editor
  context.subscriptions.push(
    vscode.commands.registerCommand('protectMyEnv.hideAll', () => {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && maskManager.isEnvFile(activeEditor.document)) {
        maskManager.hideAll(activeEditor.document);
        codeLensProvider.triggerRefresh();
      }
    })
  );

  // Add key to hide rule configurations
  context.subscriptions.push(
    vscode.commands.registerCommand('protectMyEnv.addRule', async (key: string) => {
      await ConfigManager.addRule(key);
      vscode.window.showInformationMessage(`Added rule to hide ${key}.`);
      // Configuration change listener below will handle updating matcher and re-decorating.
    })
  );

  // Create .gitignore and .copilotignore rules
  context.subscriptions.push(
    vscode.commands.registerCommand('protectMyEnv.createIgnoreFiles', async () => {
      await createIgnoreFiles();
    })
  );

  // 4. Editor Event Listeners

  // Update decorations when switching editors
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      maskManager.updateContextKeys(editor);
      maskManager.applyDecorations(editor);
    })
  );

  // Update decorations when document text changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && event.document.uri.toString() === activeEditor.document.uri.toString()) {
        maskManager.applyDecorations(activeEditor);
        codeLensProvider.triggerRefresh();
      }
    })
  );

  // Re-apply configurations when VS Code settings are changed
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('protectMyEnv')) {
        // Update matcher rules
        matcherManager.updateConfig(
          ConfigManager.getObfuscationMode() === 'all',
          ConfigManager.getRules(),
          ConfigManager.getPatterns()
        );

        // Refresh all active editors
        for (const visibleEditor of vscode.window.visibleTextEditors) {
          maskManager.applyDecorations(visibleEditor);
        }

        // Refresh CodeLenses
        codeLensProvider.triggerRefresh();
      }
    })
  );

  // 5. Initial Activation Run
  const activeEditor = vscode.window.activeTextEditor;
  maskManager.updateContextKeys(activeEditor);
  for (const visibleEditor of vscode.window.visibleTextEditors) {
    maskManager.applyDecorations(visibleEditor);
  }
}

export function deactivate(): void {}
