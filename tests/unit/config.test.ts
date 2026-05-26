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

});
