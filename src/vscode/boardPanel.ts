// The extension's own board (REQ5), in an editor tab: a column per board
// column of the backlog's settings, a card per task, filtered as the Backlog
// view is, and a card dropped on another column set to that column's status
// by `eidos backlog set`. Its header follows the app's three rows: the board
// and its title with New Task, then the search, then the filters.
import * as vscode from 'vscode';
import path from 'node:path';
import { boardColumns } from '../core/model.ts';
import { boardState } from '../core/board.ts';
import type { BoardState, BoardToExtension } from '../webview/protocol.ts';
import type { EidosProject } from './project.ts';
import type { Projects } from './projects.ts';
import { webviewHtml, webviewOptions } from './webviewHtml.ts';

export class BoardPanel implements vscode.Disposable {
  private static readonly open = new Map<EidosProject, BoardPanel>();
  private readonly panel: vscode.WebviewPanel;
  private readonly project: EidosProject;
  private readonly disposables: vscode.Disposable[] = [];
  private busy = false;

  static show(project: EidosProject, projects: Projects, extensionUri: vscode.Uri): void {
    const existing = BoardPanel.open.get(project);
    if (existing) {
      existing.panel.reveal();
      return;
    }
    BoardPanel.open.set(project, new BoardPanel(project, projects, extensionUri));
  }

  private constructor(project: EidosProject, projects: Projects, extensionUri: vscode.Uri) {
    this.project = project;
    const title = projects.all.length > 1 ? `Board · ${project.name}` : 'Board';
    this.panel = vscode.window.createWebviewPanel('eidos.board', title, vscode.ViewColumn.Active, { ...webviewOptions(extensionUri), retainContextWhenHidden: true });
    this.panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'board.svg');
    this.panel.webview.html = webviewHtml(this.panel.webview, extensionUri, 'board', title);
    this.panel.webview.onDidReceiveMessage((message: BoardToExtension) => void this.receive(message), null, this.disposables);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    project.onDidChange(() => this.post(), null, this.disposables);
    project.onDidFilter(() => this.post(), null, this.disposables);
  }

  private state(): BoardState {
    return boardState({ project: this.project.name, index: this.project.index, failure: this.project.failure, filter: this.project.filter, busy: this.busy, now: new Date() });
  }

  private post(): void {
    void this.panel.webview.postMessage(this.state());
  }

  private async receive(message: BoardToExtension): Promise<void> {
    if (message.type === 'ready' || message.type === 'refresh') {
      if (message.type === 'refresh') await this.project.read();
      this.post();
      return;
    }
    if (message.type === 'open') {
      const task = this.project.index?.task(message.id);
      if (task) await vscode.window.showTextDocument(vscode.Uri.file(path.join(this.project.root, task.file)), { viewColumn: vscode.ViewColumn.Beside, preview: true });
      return;
    }
    if (message.type === 'newTask') {
      await vscode.commands.executeCommand('eidos.newTask', { project: this.project, board: this.state().board });
      return;
    }
    if (message.type === 'search') {
      this.project.setFilter({ search: message.text });
      return;
    }
    if (message.type === 'filter') {
      this.project.setFilter({ [message.name]: message.value });
      return;
    }
    if (message.type === 'assignedToMe') {
      this.project.setFilter({ assignedToMe: message.value });
      return;
    }
    if (message.type === 'move') await this.move(message.id, message.column);
  }

  // A column showing several statuses takes the card in its first; a card already in one of them stays as it is
  private async move(id: string, columnName: string): Promise<void> {
    const index = this.project.index;
    const task = index?.task(id);
    const settings = index?.snapshot.backlog?.settings;
    if (!task || !settings || !index) return;
    const column = boardColumns(settings, this.state().board).find((candidate) => candidate.name === columnName);
    const status = column?.statuses[0];
    if (!column || !status || column.statuses.includes(task.status)) {
      this.post();
      return;
    }
    this.busy = true;
    this.post();
    try {
      await this.project.write(['backlog', 'set', task.id, '--status', status], index.absolute(task.file));
    } finally {
      this.busy = false;
      this.post();
    }
  }

  dispose(): void {
    BoardPanel.open.delete(this.project);
    for (const disposable of this.disposables) disposable.dispose();
    this.panel.dispose();
  }
}
