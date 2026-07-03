import * as vscode from 'vscode';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

class Logger {
  private channel: vscode.OutputChannel | null = null;

  private ensureChannel(): vscode.OutputChannel {
    if (!this.channel) {
      this.channel = vscode.window.createOutputChannel('Boop');
    }
    return this.channel;
  }

  private log(level: LogLevel, message: string): void {
    const timestamp = new Date().toISOString();
    this.ensureChannel().appendLine(`[${timestamp}] [${level}] ${message}`);
  }

  debug(message: string): void {
    this.log('DEBUG', message);
  }

  info(message: string): void {
    this.log('INFO', message);
  }

  warn(message: string): void {
    this.log('WARN', message);
  }

  error(message: string, err?: unknown): void {
    const detail = err instanceof Error ? `: ${err.message}` : '';
    this.log('ERROR', `${message}${detail}`);
  }

  show(): void {
    this.ensureChannel().show();
  }

  dispose(): void {
    this.channel?.dispose();
    this.channel = null;
  }
}

export const logger = new Logger();
