import * as vscode from 'vscode';

export function setConfig(values: Record<string, unknown>): void {
  const vs = vscode as unknown as { __mock: { getConfigMock: { get: { mockImplementation: (cb: (key: string, fallback: unknown) => unknown) => void } } } };

  vs.__mock.getConfigMock.get.mockImplementation((key: string, fallback: unknown) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return values[key];
    }

    return fallback;
  });
}
