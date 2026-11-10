// The Core and Backlog views (REQ2): each collection's blueprints by category,
// and the tasks grouped by status in board order under the shared filters.
// An item opens its file in VS Code's own markdown editor (REQ3).
import * as vscode from 'vscode';
import path from 'node:path';
import { coreOutline, filterTasks, findBoard, groupByStatus, statusColor } from '../core/model.ts';
import type { CoreCategory } from '../core/model.ts';
import type { Blueprint, Task } from '../core/shapes.ts';
import type { EidosProject } from './project.ts';
import type { Projects } from './projects.ts';

type CoreNode =
  | { kind: 'project'; project: EidosProject }
  | { kind: 'doc'; project: EidosProject; title: string; file: string }
  | { kind: 'collection' | 'category'; project: EidosProject; name: string; count: number | null; category: CoreCategory; key: string }
  | { kind: 'blueprint'; project: EidosProject; blueprint: Blueprint }
  | { kind: 'message'; text: string; tooltip?: string };

function openCommand(file: string): vscode.Command {
  return { command: 'vscode.open', title: 'Open', arguments: [vscode.Uri.file(file)] };
}

export class CoreTree implements vscode.TreeDataProvider<CoreNode> {
  private readonly changed = new vscode.EventEmitter<CoreNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly projects: Projects;

  constructor(projects: Projects) {
    this.projects = projects;
    projects.onDidChangeProjects(() => this.changed.fire(undefined));
    projects.onDidChangeProject(() => this.changed.fire(undefined));
  }

  getChildren(node?: CoreNode): CoreNode[] {
    if (!node) {
      // empty, so the view's welcome says how to get an eidos (package.json viewsWelcome)
      if (this.projects.cli.status !== 'ready') return [];
      if (this.projects.all.length === 1 && this.projects.all[0]) return this.projectChildren(this.projects.all[0]);
      return this.projects.all.map((project) => ({ kind: 'project', project }));
    }
    if (node.kind === 'project') return this.projectChildren(node.project);
    if (node.kind === 'collection' || node.kind === 'category') {
      const categories: CoreNode[] = node.category.categories.map((category) => ({
        kind: 'category',
        project: node.project,
        name: category.name,
        count: null,
        category,
        key: `${node.key}/${category.name}`,
      }));
      const blueprints: CoreNode[] = node.category.blueprints.map((blueprint) => ({ kind: 'blueprint', project: node.project, blueprint }));
      return [...categories, ...blueprints];
    }
    return [];
  }

  private projectChildren(project: EidosProject): CoreNode[] {
    const index = project.index;
    if (!index) {
      if (project.failure) return [{ kind: 'message', text: 'This project could not be opened', tooltip: project.failure }];
      return [{ kind: 'message', text: 'Reading the project…' }];
    }
    const outline = coreOutline(index.snapshot);
    const docs: CoreNode[] = outline.docs.map((doc) => ({ kind: 'doc', project, title: doc.title, file: doc.file }));
    const collections: CoreNode[] = outline.collections.map((collection) => ({
      kind: 'collection',
      project,
      name: collection.name,
      count: collection.count,
      category: { name: collection.name, categories: collection.categories, blueprints: collection.blueprints },
      key: `${project.root}:${collection.name}`,
    }));
    return [...docs, ...collections];
  }

  getTreeItem(node: CoreNode): vscode.TreeItem {
    if (node.kind === 'message') {
      const item = new vscode.TreeItem(node.text);
      item.tooltip = node.tooltip;
      item.iconPath = new vscode.ThemeIcon('info');
      return item;
    }
    if (node.kind === 'project') {
      const item = new vscode.TreeItem(node.project.name, vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = new vscode.ThemeIcon('layers', new vscode.ThemeColor('eidos.accent'));
      item.id = `project:${node.project.root}`;
      return item;
    }
    if (node.kind === 'doc') {
      const item = new vscode.TreeItem(node.title, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon('book');
      item.resourceUri = vscode.Uri.file(node.file);
      item.command = openCommand(node.file);
      item.id = `doc:${node.file}`;
      return item;
    }
    if (node.kind !== 'blueprint') {
      const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.Collapsed);
      if (node.count !== null) item.description = String(node.count);
      item.iconPath = vscode.ThemeIcon.Folder;
      item.id = `${node.kind}:${node.key}`;
      return item;
    }
    const blueprint = node.blueprint;
    const file = path.join(node.project.root, blueprint.path);
    const item = new vscode.TreeItem(blueprint.title, vscode.TreeItemCollapsibleState.None);
    item.description = blueprint.id;
    item.tooltip = new vscode.MarkdownString(`**${blueprint.id}** ${escape(blueprint.title)}\n\n${escape(blueprint.summary ?? '')}`);
    item.iconPath = new vscode.ThemeIcon('file-text');
    item.resourceUri = vscode.Uri.file(file);
    item.command = openCommand(file);
    item.contextValue = 'blueprint';
    item.id = `blueprint:${node.project.root}:${blueprint.id}`;
    return item;
  }
}

type BacklogNode =
  | { kind: 'project'; project: EidosProject }
  | { kind: 'filters'; project: EidosProject; text: string }
  | { kind: 'status'; project: EidosProject; status: string; tasks: Task[] }
  | { kind: 'task'; project: EidosProject; task: Task }
  | { kind: 'message'; text: string; tooltip?: string };

export class BacklogTree implements vscode.TreeDataProvider<BacklogNode> {
  private readonly changed = new vscode.EventEmitter<BacklogNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly projects: Projects;

  constructor(projects: Projects) {
    this.projects = projects;
    projects.onDidChangeProjects(() => this.changed.fire(undefined));
    projects.onDidChangeProject(() => this.changed.fire(undefined));
    projects.onDidFilterProject(() => this.changed.fire(undefined));
  }

  getChildren(node?: BacklogNode): BacklogNode[] {
    if (!node) {
      if (this.projects.cli.status !== 'ready') return [];
      if (this.projects.all.length === 1 && this.projects.all[0]) return this.projectChildren(this.projects.all[0]);
      return this.projects.all.map((project) => ({ kind: 'project', project }));
    }
    if (node.kind === 'project') return this.projectChildren(node.project);
    if (node.kind === 'status') return node.tasks.map((task) => ({ kind: 'task', project: node.project, task }));
    return [];
  }

  private projectChildren(project: EidosProject): BacklogNode[] {
    const index = project.index;
    if (!index) {
      if (project.failure) return [{ kind: 'message', text: 'This project could not be opened', tooltip: project.failure }];
      return [{ kind: 'message', text: 'Reading the project…' }];
    }
    const backlog = index.snapshot.backlog;
    if (!backlog) return [{ kind: 'message', text: 'The Backlog plugin is off for this project', tooltip: 'Turn it on with `eidos plugin enable backlog`, or in Eidos MD.' }];
    const settings = backlog.settings;
    const tasks = filterTasks(settings, backlog.tasks, project.filter, index.snapshot.me);
    const nodes: BacklogNode[] = [];
    const filterText = describeFilter(project);
    if (filterText) nodes.push({ kind: 'filters', project, text: filterText });
    for (const group of groupByStatus(settings, tasks, findBoard(settings, project.filter.board)?.name ?? null)) {
      nodes.push({ kind: 'status', project, status: group.status, tasks: group.tasks });
    }
    return nodes;
  }

  getTreeItem(node: BacklogNode): vscode.TreeItem {
    if (node.kind === 'message') {
      const item = new vscode.TreeItem(node.text);
      item.tooltip = node.tooltip;
      item.iconPath = new vscode.ThemeIcon('info');
      return item;
    }
    if (node.kind === 'project') {
      const item = new vscode.TreeItem(node.project.name, vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = new vscode.ThemeIcon('layers', new vscode.ThemeColor('eidos.accent'));
      item.id = `backlog-project:${node.project.root}`;
      return item;
    }
    if (node.kind === 'filters') {
      const item = new vscode.TreeItem(node.text);
      item.iconPath = new vscode.ThemeIcon('filter');
      item.tooltip = 'Change the filters, or clear them from the view’s menu';
      item.command = { command: 'eidos.filterBacklog', title: 'Filter Backlog', arguments: [node.project] };
      item.contextValue = 'filters';
      return item;
    }
    if (node.kind === 'status') {
      const settings = node.project.index?.snapshot.backlog?.settings;
      const open = settings?.status_categories[node.status] !== 'done';
      const state = open && node.tasks.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
      const item = new vscode.TreeItem(node.status, node.tasks.length > 0 ? state : vscode.TreeItemCollapsibleState.None);
      item.description = String(node.tasks.length);
      if (settings) item.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(statusColor(settings, node.status)));
      item.id = `status:${node.project.root}:${node.status}`;
      return item;
    }
    const task = node.task;
    const file = path.join(node.project.root, task.file);
    const item = new vscode.TreeItem(task.title, vscode.TreeItemCollapsibleState.None);
    item.description = task.id;
    const assignees = task.assignee.map((alias) => `@${alias}`).join(' ');
    item.tooltip = new vscode.MarkdownString([`**${task.id}** ${escape(task.title)}`, [task.status, task.priority, assignees].filter((part) => part).join(' · ')].join('\n\n'));
    item.iconPath = new vscode.ThemeIcon(task.parent ? 'list-tree' : 'tasklist');
    item.resourceUri = vscode.Uri.file(file);
    item.command = openCommand(file);
    item.contextValue = 'task';
    item.id = `task:${node.project.root}:${task.id}`;
    return item;
  }
}

export function describeFilter(project: EidosProject): string {
  const filter = project.filter;
  const parts: string[] = [];
  if (filter.assignedToMe) parts.push('Assigned to me');
  if (filter.board) parts.push(`Board: ${filter.board}`);
  if (filter.milestone !== null) parts.push(`Milestone: ${filter.milestone}`);
  if (filter.assignee) parts.push(`@${filter.assignee}`);
  if (filter.type) parts.push(`Type: ${filter.type}`);
  if (filter.priority) parts.push(`Priority: ${filter.priority}`);
  if (filter.search) parts.push(`“${filter.search}”`);
  return parts.join(' · ');
}

function escape(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, '\\$&');
}
