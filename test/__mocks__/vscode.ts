// Minimal vscode mock for unit tests (no VS Code extension host available)
export const window = {
  createOutputChannel: (_name: string) => ({
    appendLine: () => {},
    show: () => {},
    dispose: () => {},
  }),
};

export const workspace = {
  getConfiguration: () => ({
    get: (_key: string, defaultValue: unknown) => defaultValue,
  }),
  workspaceFolders: undefined,
  findFiles: async () => [],
  createFileSystemWatcher: () => ({
    onDidCreate: () => ({ dispose: () => {} }),
    onDidDelete: () => ({ dispose: () => {} }),
    onDidChange: () => ({ dispose: () => {} }),
    dispose: () => {},
  }),
};

export const commands = {
  registerCommand: (_cmd: string, _handler: unknown) => ({ dispose: () => {} }),
  executeCommand: async () => {},
};

export const ProgressLocation = { Notification: 15, Window: 10, SourceControl: 1 };

export const Uri = {
  file: (path: string) => ({ fsPath: path, scheme: 'file', path }),
};

export const Position = class {
  constructor(
    public readonly line: number,
    public readonly character: number,
  ) {}
};

export const Selection = class {
  constructor(
    public readonly anchor: unknown,
    public readonly active: unknown,
  ) {}
};

export const Range = class {
  constructor(
    public readonly start: unknown,
    public readonly end: unknown,
  ) {}
};

export const RelativePattern = class {
  constructor(
    public readonly base: unknown,
    public readonly pattern: string,
  ) {}
};
