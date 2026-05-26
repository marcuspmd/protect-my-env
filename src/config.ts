import * as vscode from 'vscode';

export class ConfigManager {
  /**
   * Retrieves the extension configuration workspace object.
   */
  public static getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('protectMyEnv');
  }

  /**
   * Gets the active obfuscation mode ('all' | 'pattern').
   */
  public static getObfuscationMode(): 'all' | 'pattern' {
    const mode = this.getConfiguration().get<string>('obfuscationMode', 'all');
    return mode === 'pattern' ? 'pattern' : 'all';
  }

  /**
   * Gets the list of glob patterns configured.
   */
  public static getPatterns(): string[] {
    return this.getConfiguration().get<string[]>('patterns', []);
  }

  /**
   * Gets the list of exact rule keys configured.
   */
  public static getRules(): string[] {
    return this.getConfiguration().get<string[]>('rules', []);
  }

  /**
   * Gets the character used for masking.
   */
  public static getMaskCharacter(): string {
    return this.getConfiguration().get<string>('maskCharacter', '•');
  }

  /**
   * Gets the length of the visual mask.
   */
  public static getMaskLength(): number {
    return this.getConfiguration().get<number>('maskLength', 8);
  }

  /**
   * Gets whether to protect comments in .env files.
   */
  public static getProtectComments(): boolean {
    return this.getConfiguration().get<boolean>('protectComments', false);
  }

  /**
   * Dynamically adds a key to the rules list, persisting it.
   */
  public static async addRule(key: string): Promise<void> {
    const config = this.getConfiguration();
    const currentRules = this.getRules();
    
    // Normalize key to uppercase/trim as .env keys are case-sensitive
    const normalizedKey = key.trim();
    if (currentRules.includes(normalizedKey)) {
      return;
    }

    const updatedRules = [...currentRules, normalizedKey];
    
    // Choose Workspace target if a project is loaded, otherwise Global
    const target = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;

    await config.update('rules', updatedRules, target);
  }
}
