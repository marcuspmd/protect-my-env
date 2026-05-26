import * as vscode from 'vscode';
import { ConfigManager } from '../../src/config';
import { setConfig } from '../utils/configMock';

beforeEach(() => {
  const vs = vscode as any;
  vs.__mock.resetAll();
});

describe('ConfigManager', () => {
  it('returns all mode by default', () => {
    setConfig({});
    expect(ConfigManager.getObfuscationMode()).toBe('all');
  });

  it('returns pattern mode when configured', () => {
    setConfig({ obfuscationMode: 'pattern' });
    expect(ConfigManager.getObfuscationMode()).toBe('pattern');
  });

  it('returns fallback values for basic settings', () => {
    setConfig({});
    expect(ConfigManager.getPatterns()).toEqual([]);
    expect(ConfigManager.getRules()).toEqual([]);
    expect(ConfigManager.getMaskCharacter()).toBe('•');
    expect(ConfigManager.getMaskLength()).toBe(8);
    expect(ConfigManager.getProtectComments()).toBe(false);
  });

  it('adds rule to workspace target when folder is open', async () => {
    setConfig({ rules: ['EXISTING'] });
    const vs = vscode as any;
    vs.workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];

    await ConfigManager.addRule('NEW_RULE');

    expect(vs.__mock.getConfigMock.update).toHaveBeenCalledWith(
      'rules',
      ['EXISTING', 'NEW_RULE'],
      vscode.ConfigurationTarget.Workspace
    );
  });

  it('adds rule to global target when no workspace folder exists', async () => {
    setConfig({ rules: [] });
    const vs = vscode as any;
    vs.workspace.workspaceFolders = [];

    await ConfigManager.addRule('A_RULE');

    expect(vs.__mock.getConfigMock.update).toHaveBeenCalledWith(
      'rules',
      ['A_RULE'],
      vscode.ConfigurationTarget.Global
    );
  });

  it('does not update when rule already exists', async () => {
    setConfig({ rules: ['DUPLICATE'] });
    const vs = vscode as any;

    await ConfigManager.addRule('DUPLICATE');

    expect(vs.__mock.getConfigMock.update).not.toHaveBeenCalled();
  });
});
