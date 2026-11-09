// The extension's own board (REQ5), in an editor tab: a column per board
// column of the backlog's settings, a card per task, filtered as the Backlog
// view is, and a card dropped on another column set to that column's status
// by `eidos backlog set`. Its header follows the app's three rows: the board
// and its title with New Task, then the search, then the filters.
import * as vscode from 'vscode';
import path from 'node:path';
import { boardColumns, boardTypes, checklistProgress, filterTasks, findBoard, hiddenAsDone, priorityColor, statusColor, themeColorFor } from '../core/model.ts';
import type { BoardCard, BoardState, BoardToExtension } from '../webview/protocol.ts';
import type { BacklogSettings, Task, User } from '../core/shapes.ts';
import type { EidosProject } from './project.ts';
import type { Projects } from './projects.ts';
import { webviewHtml, webviewOptions } from './webviewHtml.ts';

export class BoardPanel implements vscode.Disposable {
  private static readonly open = new Map<EidosProject, BoardPanel>();
  private readonly panel: vscode.WebviewPanel;
  private readonly project: EidosProject;
  private readonly disposables: vscode.Disposable[] = [];
  private busy = false;
  private message: string | null = null;

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
    const index = this.project.index;
    const filter = this.project.filter;
    const empty: BoardState = {
      project: this.project.name,
      boards: [],
      board: null,
      title: 'Board',
      open: 0,
      columns: [],
      search: filter.search,
      filters: {
        milestone: { value: null, options: [] },
        assignee: { value: null, options: [] },
        type: { value: null, options: [] },
        priority: { value: null, options: [] },
        assignedToMe: false,
        canFilterMe: false,
      },
      busy: this.busy,
      message: null,
    };
    if (!index) return { ...empty, message: this.project.failure ?? 'Reading the project…' };
    const backlog = index.snapshot.backlog;
    if (!backlog) return { ...empty, message: 'The Backlog plugin is off for this project.' };

    const settings = backlog.settings;
    const board = findBoard(settings, filter.board) ?? settings.boards[0] ?? null;
    const boardName = board?.name ?? null;
    const shown = filterTasks(settings, backlog.tasks, { ...filter, board: boardName }, index.snapshot.me);
    const now = new Date();
    const users = new Map(index.snapshot.users.map((user) => [user.alias, user]));
    const types = new Map(settings.types.map((type) => [type.name, type]));

    const columns = boardColumns(settings, boardName).map((column) => {
      const statuses = new Set(column.statuses);
      const cards = shown.filter((task) => statuses.has(task.status) && !hiddenAsDone(settings, task, now)).map((task) => card(task, users, types, settings));
      return { name: column.name, statuses: column.statuses, color: statusColor(settings, column.statuses[0] ?? ''), cards };
    });

    const choices = (values: string[]) => values.map((value) => ({ value, label: value }));
    const typeNames = boardTypes(settings, boardName);
    return {
      ...empty,
      boards: settings.boards.map((candidate) => ({ value: candidate.name, label: candidate.title })),
      board: boardName,
      title: board?.title ?? 'Board',
      open: shown.filter((task) => task.open).length,
      columns,
      filters: {
        milestone: { value: filter.milestone, options: choices(settings.milestones.map((milestone) => milestone.name)) },
        assignee: { value: filter.assignee, options: index.snapshot.users.map((user) => ({ value: user.alias, label: `@${user.alias}` })) },
        type: { value: filter.type, options: typeNames.length > 1 ? typeNames.map((name) => ({ value: name, label: types.get(name)?.title ?? name })) : [] },
        priority: { value: filter.priority, options: choices(settings.priorities) },
        assignedToMe: filter.assignedToMe,
        canFilterMe: index.snapshot.me !== null,
      },
      message: this.message,
    };
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

function initials(user: User | undefined, alias: string): string {
  const name = user?.name ?? alias;
  const words = name.split(/\s+/).filter((word) => /^[\p{L}\p{N}]/u.test(word));
  if (words.length >= 2) return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function card(task: Task, users: Map<string, User>, types: Map<string, { title: string; color?: string }>, settings: BacklogSettings): BoardCard {
  const progress = checklistProgress(task);
  const type = types.get(task.type || 'default');
  const showType = (task.type || 'default') !== 'default';
  return {
    id: task.id,
    title: task.title,
    type: showType ? (type?.title ?? task.type) : null,
    typeColor: showType && type?.color ? themeColorFor(type.color) : null,
    priority: task.priority,
    priorityColor: task.priority ? priorityColor(settings, task.priority) : null,
    assignees: task.assignee.map((alias) => ({ alias, initials: initials(users.get(alias), alias), name: users.get(alias)?.name ?? alias })),
    progress: progress.total > 0 ? progress : null,
    blueprints: task.blueprints.map((served) => served.title ?? served.id),
    blocked: task.blocked ?? false,
    done: settings.status_categories[task.status] === 'done',
  };
}
