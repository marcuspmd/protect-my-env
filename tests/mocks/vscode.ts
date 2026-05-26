type Listener<T> = (e: T) => unknown;

export class Position {
  constructor(public line: number, public character: number) {}
}

export class Range {
  public start: Position;
  public end: Position;

  constructor(startLine: number | Position, startCharacter: number | Position, endLine?: number, endCharacter?: number) {
    if (startLine instanceof Position && startCharacter instanceof Position) {
      this.start = startLine;
      this.end = startCharacter;
      return;
    }

    this.start = new Position(startLine as number, startCharacter as number);
    this.end = new Position(endLine as number, endCharacter as number);
  }
}

export class ThemeColor {
  constructor(public id: string) {}
}

export class WorkspaceEdit {
  public replace = jest.fn();
  public insert = jest.fn();
}

export class CodeLens {
  constructor(public range: Range, public command?: { title: string; command: string; arguments?: unknown[] }) {}
}

export class EventEmitter<T> {
  private listeners: Array<Listener<T>> = [];

  public event = (listener: Listener<T>) => {
    this.listeners.push(listener);
    return { dispose: jest.fn() };
  };

  public fire(data: T): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }

  public dispose(): void {
    this.listeners = [];
  }
}

const createDisposable = () => ({ dispose: jest.fn() });

const commandHandlers = new Map<string, (...args: unknown[]) => unknown>();

export const commands = {
  registerCommand: jest.fn((name: string, callback: (...args: unknown[]) => unknown) => {
    commandHandlers.set(name, callback);
    return createDisposable();
  }),
  executeCommand: jest.fn(),
};

export const window = {
  activeTextEditor: undefined as unknown,
  visibleTextEditors: [] as unknown[],
  createTextEditorDecorationType: jest.fn(() => createDisposable()),
  registerCustomEditorProvider: jest.fn(() => createDisposable()),
  showInformationMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  onDidChangeActiveTextEditor: jest.fn(() => createDisposable()),
  onDidChangeVisibleTextEditors: jest.fn(() => createDisposable()),
};

const getConfigMock = {
  get: jest.fn(),
  update: jest.fn(async () => undefined),
};

export const workspace = {
  workspaceFolders: [] as unknown[],
  getConfiguration: jest.fn(() => getConfigMock),
  applyEdit: jest.fn(async () => true),
  onDidOpenTextDocument: jest.fn(() => createDisposable()),
  onDidCloseTextDocument: jest.fn(() => createDisposable()),
  onDidChangeTextDocument: jest.fn(() => createDisposable()),
  onDidChangeConfiguration: jest.fn(() => createDisposable()),
};

export const languages = {
  registerCodeLensProvider: jest.fn(() => createDisposable()),
};

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
};

export const __mock = {
  commandHandlers,
  getConfigMock,
  resetAll(): void {
    commandHandlers.clear();
    getConfigMock.get.mockReset();
    getConfigMock.update.mockReset();

    commands.registerCommand.mockClear();
    commands.executeCommand.mockClear();

    window.createTextEditorDecorationType.mockClear();
    window.registerCustomEditorProvider.mockClear();
    window.showInformationMessage.mockClear();
    window.showWarningMessage.mockClear();
    window.showErrorMessage.mockClear();
    window.onDidChangeActiveTextEditor.mockClear();
    window.onDidChangeVisibleTextEditors.mockClear();
    window.activeTextEditor = undefined;
    window.visibleTextEditors = [];

    workspace.getConfiguration.mockClear();
    workspace.applyEdit.mockClear();
    workspace.onDidOpenTextDocument.mockClear();
    workspace.onDidCloseTextDocument.mockClear();
    workspace.onDidChangeTextDocument.mockClear();
    workspace.onDidChangeConfiguration.mockClear();
    workspace.workspaceFolders = [];

    languages.registerCodeLensProvider.mockClear();
  },
};
