import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Creates or updates .gitignore and .copilotignore rules in the workspace root
 * to prevent AI indexing and accidental git commits of secret files.
 */
export async function createIgnoreFiles(): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage('No workspace open to create ignore files.');
    return;
  }

  const rootPath = workspaceFolders[0].uri.fsPath;
  let updatedGitignore = false;
  let updatedCopilotignore = false;

  // 1. Update .gitignore
  const gitignorePath = path.join(rootPath, '.gitignore');
  const gitignoreRules = [
    '',
    '# Protect My Env: Environment files',
    '.env',
    '.env.*',
    '.env.local',
    '',
  ].join('\n');

  try {
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      // Simple check to see if .env is already ignored
      if (!content.split('\n').some(line => line.trim() === '.env')) {
        fs.appendFileSync(gitignorePath, gitignoreRules, 'utf8');
        updatedGitignore = true;
      }
    } else {
      fs.writeFileSync(gitignorePath, gitignoreRules.trim() + '\n', 'utf8');
      updatedGitignore = true;
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to update .gitignore: ${errMsg}`);
  }

  // 2. Update .copilotignore
  const copilotignorePath = path.join(rootPath, '.copilotignore');
  const copilotignoreRules = [
    '',
    '# Protect My Env: Prevent Copilot and other AI agents from indexing secrets',
    '**/.env',
    '**/.env.*',
    '**/.env.local',
    '',
  ].join('\n');

  try {
    if (fs.existsSync(copilotignorePath)) {
      const content = fs.readFileSync(copilotignorePath, 'utf8');
      if (!content.split('\n').some(line => line.trim() === '**/.env')) {
        fs.appendFileSync(copilotignorePath, copilotignoreRules, 'utf8');
        updatedCopilotignore = true;
      }
    } else {
      fs.writeFileSync(copilotignorePath, copilotignoreRules.trim() + '\n', 'utf8');
      updatedCopilotignore = true;
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to update .copilotignore: ${errMsg}`);
  }

  if (updatedGitignore || updatedCopilotignore) {
    let msg = 'Security settings updated:';
    if (updatedGitignore) {
      msg += ' Added .env to .gitignore.';
    }
    if (updatedCopilotignore) {
      msg += ' Created/Updated .copilotignore to block AI indexing.';
    }
    vscode.window.showInformationMessage(msg);
  } else {
    vscode.window.showInformationMessage('Environment ignore rules are already configured in .gitignore and .copilotignore.');
  }
}
