// A project as the extension last read it (REQ13): the framework, the
// blueprints, the backlog, and the check, indexed by id and by file, with the
// orders the views draw them in. Everything here is read from the CLI's --json.
import path from 'node:path';
import type { Backlog, BacklogSettings, Blueprint, Board, Column, Finding, Framework, Task, User } from './shapes.ts';

export interface Snapshot {
  root: string;
  framework: Framework;
  blueprints: Blueprint[];
  backlog: Backlog | null;
  users: User[];
  me: string | null;
}

export type Entity = { kind: 'blueprint'; blueprint: Blueprint } | { kind: 'task'; task: Task };

export class ProjectIndex {
  readonly snapshot: Snapshot;
  private readonly byId = new Map<string, Entity>();
  private readonly byFile = new Map<string, Entity>();
  private readonly tasksByBlueprint = new Map<string, Task[]>();

  constructor(snapshot: Snapshot) {
    this.snapshot = snapshot;
    for (const blueprint of snapshot.blueprints) {
      const entity: Entity = { kind: 'blueprint', blueprint };
      this.byId.set(blueprint.id.toUpperCase(), entity);
      this.byFile.set(fileKey(path.join(snapshot.root, blueprint.path)), entity);
    }
    for (const task of snapshot.backlog?.tasks ?? []) {
      const entity: Entity = { kind: 'task', task };
      this.byId.set(task.id.toUpperCase(), entity);
      for (const alias of task.aliases ?? []) {
        if (!this.byId.has(alias.toUpperCase())) this.byId.set(alias.toUpperCase(), entity);
      }
      this.byFile.set(fileKey(path.join(snapshot.root, task.file)), entity);
      for (const served of task.blueprints) {
        const list = this.tasksByBlueprint.get(served.id) ?? [];
        list.push(task);
        this.tasksByBlueprint.set(served.id, list);
      }
    }
  }

  get root(): string {
    return this.snapshot.root;
  }

  find(id: string): Entity | undefined {
    return this.byId.get(id.toUpperCase());
  }

  atFile(file: string): Entity | undefined {
    return this.byFile.get(fileKey(file));
  }

  tasksServing(blueprintId: string): Task[] {
    return this.tasksByBlueprint.get(blueprintId) ?? [];
  }

  absolute(relative: string): string {
    return path.join(this.snapshot.root, relative);
  }

  blueprint(id: string): Blueprint | undefined {
    const entity = this.find(id);
    if (entity?.kind !== 'blueprint') return undefined;
    return entity.blueprint;
  }

  task(id: string): Task | undefined {
    const entity = this.find(id);
    if (entity?.kind !== 'task') return undefined;
    return entity.task;
  }
}

// macOS and Windows file systems are case-insensitive, and VS Code may hand a drive letter in either case
function fileKey(file: string): string {
  const normalized = path.normalize(file);
  if (process.platform === 'linux') return normalized;
  return normalized.toLowerCase();
}

// ── The Core view ──────────────────────────────────────────────────────────

export interface CoreDoc {
  title: string;
  file: string;
}

export interface CoreCategory {
  name: string;
  categories: CoreCategory[];
  blueprints: Blueprint[];
}

export interface CoreCollection {
  name: string;
  count: number;
  categories: CoreCategory[];
  blueprints: Blueprint[];
}

// The top-level docs, then each collection in the framework's order with its categories in the grouping's order, blueprints by title
export function coreOutline(snapshot: Snapshot): { docs: CoreDoc[]; collections: CoreCollection[] } {
  const frameworkDir = path.dirname(path.join(snapshot.root, snapshot.framework.file));
  const docs = snapshot.framework.top_level.map((doc) => ({ title: doc.title, file: path.resolve(frameworkDir, doc.path) }));

  const byCollection = new Map<string, Blueprint[]>();
  for (const blueprint of snapshot.blueprints) {
    const list = byCollection.get(blueprint.collection) ?? [];
    list.push(blueprint);
    byCollection.set(blueprint.collection, list);
  }

  const collections: CoreCollection[] = [];
  const seen = new Set<string>();
  for (const folder of snapshot.framework.folders) {
    const blueprints = byCollection.get(folder.name);
    if (!folder.variants && !blueprints) continue;
    seen.add(folder.name);
    const groupOrder = folder.grouping?.groups.map((group) => group.name) ?? [];
    collections.push(outlineCollection(folder.name, blueprints ?? [], groupOrder));
  }
  for (const [name, blueprints] of byCollection) {
    if (!seen.has(name)) collections.push(outlineCollection(name, blueprints, []));
  }
  return { docs, collections };
}

function byTitle(left: Blueprint, right: Blueprint): number {
  return left.title.localeCompare(right.title, undefined, { sensitivity: 'base', numeric: true });
}

function outlineCollection(name: string, blueprints: Blueprint[], groupOrder: string[]): CoreCollection {
  const top: CoreCategory = { name, categories: [], blueprints: [] };
  for (const blueprint of blueprints) {
    let node = top;
    const groups = blueprint.group ? blueprint.group.split('/').filter((part) => part.length > 0) : [];
    for (const group of groups) {
      let child = node.categories.find((category) => category.name === group);
      if (!child) {
        child = { name: group, categories: [], blueprints: [] };
        node.categories.push(child);
      }
      node = child;
    }
    node.blueprints.push(blueprint);
  }
  sortCategory(top, groupOrder);
  return { name, count: blueprints.length, categories: top.categories, blueprints: top.blueprints };
}

function sortCategory(category: CoreCategory, order: string[]): void {
  category.blueprints.sort(byTitle);
  category.categories.sort((left, right) => {
    const leftPlace = order.indexOf(left.name);
    const rightPlace = order.indexOf(right.name);
    if (leftPlace !== rightPlace) {
      if (leftPlace === -1) return 1;
      if (rightPlace === -1) return -1;
      return leftPlace - rightPlace;
    }
    return left.name.localeCompare(right.name, undefined, { numeric: true });
  });
  for (const child of category.categories) sortCategory(child, []);
}

// ── The backlog: filters, statuses, columns ────────────────────────────────

export interface BacklogFilter {
  board: string | null;
  milestone: string | null;
  assignee: string | null;
  assignedToMe: boolean;
  search: string;
  // the ids `eidos backlog --search` kept, or null while no search is set
  searchIds: Set<string> | null;
  // the board's own filters, beyond those the Backlog view shares (REQ5)
  type: string | null;
  priority: string | null;
}

export function emptyFilter(): BacklogFilter {
  return { board: null, milestone: null, assignee: null, assignedToMe: false, search: '', searchIds: null, type: null, priority: null };
}

export function boardOf(settings: BacklogSettings, task: Task): string | null {
  if (task.board) return task.board;
  return settings.boards[0]?.name ?? null;
}

export function findBoard(settings: BacklogSettings, name: string | null): Board | null {
  if (!name) return null;
  const lowered = name.toLowerCase();
  return settings.boards.find((board) => board.name.toLowerCase() === lowered || board.title.toLowerCase() === lowered) ?? null;
}

export function filterTasks(settings: BacklogSettings, tasks: Task[], filter: BacklogFilter, me: string | null): Task[] {
  const board = findBoard(settings, filter.board);
  return tasks.filter((task) => {
    if (board && boardOf(settings, task) !== board.name) return false;
    if (filter.milestone !== null && task.milestone !== filter.milestone) return false;
    if (filter.assignee !== null && !task.assignee.includes(filter.assignee)) return false;
    if (filter.assignedToMe && (me === null || !task.assignee.includes(me))) return false;
    if (filter.type !== null && (task.type || 'default') !== filter.type) return false;
    if (filter.priority !== null && task.priority !== filter.priority) return false;
    if (filter.searchIds !== null && !filter.searchIds.has(task.id)) return false;
    return true;
  });
}

// A board's columns: its own, else the project's narrowed to the statuses the board uses
export function boardColumns(settings: BacklogSettings, boardName: string | null): Column[] {
  const board = findBoard(settings, boardName);
  if (board?.columns && board.columns.length > 0) return board.columns;
  if (!board?.statuses) return settings.columns;
  const uses = new Set(board.statuses);
  return settings.columns.map((column) => ({ name: column.name, statuses: column.statuses.filter((status) => uses.has(status)) })).filter((column) => column.statuses.length > 0);
}

export function boardStatuses(settings: BacklogSettings, boardName: string | null): string[] {
  const board = findBoard(settings, boardName);
  if (!board?.statuses) return settings.statuses;
  return board.statuses;
}

export function boardTypes(settings: BacklogSettings, boardName: string | null): string[] {
  const all = settings.types.map((type) => type.name);
  const board = findBoard(settings, boardName);
  if (!board?.types) return all;
  return board.types;
}

// Statuses in board order: each column's left to right, then the backlog statuses (those in no column) in the project's order
export function statusOrder(settings: BacklogSettings, boardName: string | null): string[] {
  const ordered: string[] = [];
  for (const column of boardColumns(settings, boardName)) {
    for (const status of column.statuses) {
      if (!ordered.includes(status)) ordered.push(status);
    }
  }
  for (const status of boardStatuses(settings, boardName)) {
    if (!ordered.includes(status)) ordered.push(status);
  }
  return ordered;
}

export interface StatusGroup {
  status: string;
  tasks: Task[];
}

export function groupByStatus(settings: BacklogSettings, tasks: Task[], boardName: string | null): StatusGroup[] {
  const order = statusOrder(settings, boardName);
  const groups = new Map<string, Task[]>(order.map((status) => [status, []]));
  for (const task of tasks) {
    const list = groups.get(task.status) ?? [];
    list.push(task);
    groups.set(task.status, list);
  }
  return [...groups].map(([status, list]) => ({ status, tasks: list }));
}

// Whether a done task is too old for the board to draw (the backlog's hide_done_days), measured from today
export function hiddenAsDone(settings: BacklogSettings, task: Task, now: Date): boolean {
  const days = settings.hide_done_days;
  if (days === null || days === undefined || !task.updated) return false;
  if (settings.status_categories[task.status] !== 'done') return false;
  const updated = Date.parse(task.updated);
  if (Number.isNaN(updated)) return false;
  return now.getTime() - updated > days * 24 * 60 * 60 * 1000;
}

// The colour a status draws in, as a theme colour name both a tree icon and a webview can use
export function statusColor(settings: BacklogSettings, status: string): string {
  const named = settings.status_colors[status];
  if (named) return themeColorFor(named);
  const category = settings.status_categories[status];
  if (category === 'done') return 'charts.green';
  if (category === 'in_progress') return 'charts.yellow';
  return 'charts.foreground';
}

const colorNames: Record<string, string> = {
  red: 'charts.red',
  orange: 'charts.orange',
  yellow: 'charts.yellow',
  green: 'charts.green',
  teal: 'terminal.ansiCyan',
  cyan: 'terminal.ansiCyan',
  blue: 'charts.blue',
  purple: 'charts.purple',
  pink: 'terminal.ansiMagenta',
  magenta: 'terminal.ansiMagenta',
  gray: 'charts.foreground',
  grey: 'charts.foreground',
};

export function themeColorFor(name: string): string {
  return colorNames[name.toLowerCase()] ?? 'charts.foreground';
}

// Who "Assigned to me" means: the user this machine acts as, else the user whose name or email is the seat's
export function whoAmI(users: User[], acting: string | null, seat: { name: string | null; email: string | null }): string | null {
  if (acting) return acting;
  const email = seat.email?.toLowerCase();
  const byEmail = users.find((user) => email && user.email?.toLowerCase() === email);
  if (byEmail) return byEmail.alias;
  const name = seat.name?.toLowerCase();
  const byName = users.find((user) => name && user.name.toLowerCase() === name);
  return byName?.alias ?? null;
}

export function checklistProgress(task: Task): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const section of task.sections) {
    if (section.type !== 'checklist') continue;
    total += section.items.length;
    done += section.items.filter((item) => item.done).length;
  }
  return { done, total };
}

// Findings keyed by the file each names; one about the project itself lands on the framework document
export function findingsByFile(root: string, frameworkFile: string, findings: Finding[]): Map<string, Finding[]> {
  const byFile = new Map<string, Finding[]>();
  for (const finding of findings) {
    const file = path.join(root, finding.path ?? frameworkFile);
    const list = byFile.get(file) ?? [];
    list.push(finding);
    byFile.set(file, list);
  }
  return byFile;
}

// A priority's colour: the one the settings name, else Jira's look from its place (red above the middle, orange at it, blue below)
export function priorityColor(settings: BacklogSettings, priority: string): string {
  const named = settings.priority_colors[priority];
  if (named) return themeColorFor(named);
  const place = settings.priorities.indexOf(priority);
  if (place === -1) return 'charts.foreground';
  const middle = (settings.priorities.length - 1) / 2;
  if (place < middle) return 'charts.red';
  if (place === middle) return 'charts.orange';
  return 'charts.blue';
}
