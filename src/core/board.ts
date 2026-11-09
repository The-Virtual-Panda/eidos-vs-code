// What the board draws (REQ5), from the project as last read and the backlog's shared filters: the board's
// columns, a card per task the filters keep, and the header's choices. The board panel posts it to its webview.
import { boardColumns, boardTypes, checklistProgress, filterTasks, findBoard, hiddenAsDone, priorityColor, statusColor, themeColorFor } from './model.ts';
import type { BacklogFilter, ProjectIndex } from './model.ts';
import type { BacklogSettings, Task, TaskType, User } from './shapes.ts';
import type { BoardCard, BoardState } from '../webview/protocol.ts';

export interface BoardInput {
  project: string;
  index: ProjectIndex | null;
  failure: string | null;
  filter: BacklogFilter;
  busy: boolean;
  now: Date;
}

export function boardState(input: BoardInput): BoardState {
  const { index, filter } = input;
  const empty: BoardState = {
    project: input.project,
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
    busy: input.busy,
    message: null,
  };
  if (!index) return { ...empty, message: input.failure ?? 'Reading the project…' };
  const backlog = index.snapshot.backlog;
  if (!backlog) return { ...empty, message: 'The Backlog plugin is off for this project.' };

  const settings = backlog.settings;
  const board = findBoard(settings, filter.board) ?? settings.boards[0] ?? null;
  const boardName = board?.name ?? null;
  const shown = filterTasks(settings, backlog.tasks, { ...filter, board: boardName }, index.snapshot.me);
  const users = new Map(index.snapshot.users.map((user) => [user.alias, user]));
  const types = new Map(settings.types.map((type) => [type.name, type]));

  const columns = boardColumns(settings, boardName).map((column) => {
    const statuses = new Set(column.statuses);
    const cards = shown.filter((task) => statuses.has(task.status) && !hiddenAsDone(settings, task, input.now)).map((task) => card(task, users, types, settings));
    return { name: column.name, statuses: column.statuses, color: statusColor(settings, column.statuses[0] ?? ''), cards };
  });

  const choices = (values: string[]) => values.map((value) => ({ value, label: value }));
  const typeNames = boardTypes(settings, boardName);
  let typeOptions: Array<{ value: string; label: string }> = [];
  if (typeNames.length > 1) typeOptions = typeNames.map((name) => ({ value: name, label: types.get(name)?.title ?? name }));
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
      type: { value: filter.type, options: typeOptions },
      priority: { value: filter.priority, options: choices(settings.priorities) },
      assignedToMe: filter.assignedToMe,
      canFilterMe: index.snapshot.me !== null,
    },
  };
}

function initials(user: User | undefined, alias: string): string {
  const name = user?.name ?? alias;
  const words = name.split(/\s+/).filter((word) => /^[\p{L}\p{N}]/u.test(word));
  if (words.length >= 2) return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function card(task: Task, users: Map<string, User>, types: Map<string, TaskType>, settings: BacklogSettings): BoardCard {
  const progress = checklistProgress(task);
  const typeName = task.type || 'default';
  const type = types.get(typeName);
  const showType = typeName !== 'default';
  let typeColor: string | null = null;
  if (showType && type?.color) typeColor = themeColorFor(type.color);
  return {
    id: task.id,
    title: task.title,
    type: showType ? (type?.title ?? typeName) : null,
    typeColor,
    priority: task.priority,
    priorityColor: task.priority ? priorityColor(settings, task.priority) : null,
    assignees: task.assignee.map((alias) => ({ alias, initials: initials(users.get(alias), alias), name: users.get(alias)?.name ?? alias })),
    progress: progress.total > 0 ? progress : null,
    blueprints: task.blueprints.map((served) => served.title ?? served.id),
    blocked: task.blocked ?? false,
    done: settings.status_categories[task.status] === 'done',
  };
}
