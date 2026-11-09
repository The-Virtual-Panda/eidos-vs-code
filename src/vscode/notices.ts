// What the extension tells the developer: a notice shown once per reason
// (REQ20, REQ21), and a log in the Eidos output channel of every command run.
import * as vscode from 'vscode';
import type { CliHost } from '../core/cli.ts';

export type Level = 'info' | 'warning' | 'error';

export class Notices implements CliHost, vscode.Disposable {
  readonly channel = vscode.window.createOutputChannel('Eidos', { log: true });
  private readonly said = new Set<string>();

  log(line: string): void {
    this.channel.info(line);
  }

  notifyOnce(key: string, message: string, level: Level = 'warning'): void {
    if (this.said.has(key)) return;
    this.said.add(key);
    this.show(message, level);
  }

  show(message: string, level: Level = 'info'): void {
    this.log(message);
    if (level === 'error') void vscode.window.showErrorMessage(message, 'Show Output').then((choice) => this.reveal(choice));
    else if (level === 'warning') void vscode.window.showWarningMessage(message, 'Show Output').then((choice) => this.reveal(choice));
    else void vscode.window.showInformationMessage(message);
  }

  private reveal(choice: string | undefined): void {
    if (choice) this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
  }
}
