import * as vscode from 'vscode';
import { ObfuscationMatcherManager } from './matchers';
import { MaskManager } from './maskManager';
import { EnvCodeLensProvider } from './codeLensProvider';
import { ConfigManager } from './config';
import { EnvSecureEditorProvider } from './envSecureEditorProvider';

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

  // 4. Editor Event Listeners

  // Update decorations when switching editors
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      maskManager.updateContextKeys(editor);
      maskManager.applyDecorations(editor);
    })
  );

  // Update decorations as soon as editor windows become visible to reduce rendering delay
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors((editors) => {
      for (const editor of editors) {
        maskManager.warmupDocument(editor.document);
        maskManager.applyDecorations(editor);
      }
    })
  );

  // Parse env files eagerly when opened to reduce initial reveal flashes.
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      maskManager.warmupDocument(document);

      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document.uri.toString() === document.uri.toString()) {
          maskManager.applyDecorations(editor);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      maskManager.clearDocumentCache(document);
    })
  );

  // Update decorations when document text changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      maskManager.warmupDocument(event.document);

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
    maskManager.warmupDocument(visibleEditor.document);
    maskManager.applyDecorations(visibleEditor);
  }
}

export function deactivate(): void {}
