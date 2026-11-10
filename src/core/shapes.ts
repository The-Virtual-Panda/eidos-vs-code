// The parts of the eidos CLI's --json the extension reads, and a reader per
// command that says whether an output has them (REQ21: an output that does
// not read as expected fails with the version the extension reads). A reader
// checks only what the extension uses, so a field the CLI adds never trips it.

export interface PropertyDeclaration {
  name: string;
  type: string;
  required?: boolean;
  applies_to?: 'all' | string[];
  options?: string[];
  meaning?: string;
  eidosmd?: { new?: string; filter?: boolean };
}

export interface Variant {
  name: string;
  default?: boolean;
  description?: string;
}

export interface Folder {
  name: string;
  owned_by?: string;
  description?: string;
  variants?: Variant[];
  grouping?: { label?: string; groups: Array<{ name: string; description?: string }> };
}

export interface Framework {
  root: string;
  file: string;
  eidos_version: string;
  top_level: Array<{ title: string; path: string; description?: string }>;
  folders: Folder[];
  properties: { core: PropertyDeclaration[]; custom: PropertyDeclaration[] };
}

export type PropertyValue = string | number | boolean | null | PropertyValue[] | { [key: string]: PropertyValue };

export interface Blueprint {
  id: string;
  title: string;
  summary: string | null;
  collection: string;
  group: string | null;
  variant: string | null;
  path: string;
  properties: Record<string, PropertyValue>;
}

export interface ChecklistItem {
  n: number;
  done: boolean;
  text: string;
}

export interface TaskSection {
  key: string;
  title: string;
  type: string;
  text: string;
  items: ChecklistItem[];
  present: boolean;
}

export interface Task {
  id: string;
  name: string;
  aliases: string[];
  file: string;
  // the task's page in the Eidos MD app, `/p/backlog/tasks/<name>`
  href?: string;
  title: string;
  type: string;
  board: string | null;
  status: string;
  column: string | null;
  open: boolean;
  assignee: string[];
  milestone: string | null;
  priority: string | null;
  parent: string | null;
  blocked?: boolean;
  created: string | null;
  updated: string | null;
  blueprints: Array<{ id: string; title: string | null; path: string | null; missing: boolean }>;
  properties: Record<string, PropertyValue>;
  sections: TaskSection[];
}

export interface SectionDeclaration {
  key: string;
  title: string;
  type: string;
  meaning?: string;
}

export interface TaskType {
  name: string;
  title: string;
  color?: string;
  icon?: string;
  sections: SectionDeclaration[];
}

export interface Column {
  name: string;
  statuses: string[];
}

export interface Board {
  name: string;
  title: string;
  statuses?: string[] | null;
  types?: string[] | null;
  properties?: string[] | null;
  columns?: Column[] | null;
  default_status?: string | null;
}

export interface BacklogSettings {
  statuses: string[];
  columns: Column[];
  default_status: string;
  priorities: string[];
  milestones: Array<{ name: string; date: string | null }>;
  properties: PropertyDeclaration[];
  builtin_properties: Array<{ name: string }>;
  types: TaskType[];
  status_colors: Record<string, string>;
  status_categories: Record<string, string>;
  priority_colors: Record<string, string>;
  hide_done_days: number | null;
  boards: Board[];
}

export interface Backlog {
  folder: string;
  settings: BacklogSettings;
  tasks: Task[];
}

export interface Finding {
  level: 'error' | 'warning';
  code: string;
  path: string | null;
  message: string;
  line?: number;
  fix?: string;
}

export interface CheckResult {
  ok: boolean;
  findings: Finding[];
}

export interface User {
  name: string;
  alias: string;
  email?: string | null;
  agent?: boolean;
}

export interface Users {
  users: User[];
  acting: string | null;
}

export interface Whoami {
  name: string | null;
  email: string | null;
}

export type Reader<T> = (value: unknown) => T | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || value === undefined || typeof value === 'string';
}

export const readFramework: Reader<Framework> = (value) => {
  if (!isRecord(value)) return null;
  if (!isString(value['root']) || !Array.isArray(value['folders'])) return null;
  const properties = value['properties'];
  if (!isRecord(properties) || !Array.isArray(properties['core']) || !Array.isArray(properties['custom'])) return null;
  const foldersRead = value['folders'].every((folder) => isRecord(folder) && isString(folder['name']));
  if (!foldersRead) return null;
  if (!Array.isArray(value['top_level'])) value['top_level'] = [];
  return value as unknown as Framework;
};

function readsAsBlueprint(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isString(value['id']) || !isString(value['title']) || !isString(value['path']) || !isString(value['collection'])) return false;
  return isRecord(value['properties']) && isNullableString(value['group']);
}

export const readBlueprints: Reader<Blueprint[]> = (value) => {
  if (!Array.isArray(value)) return null;
  if (!value.every(readsAsBlueprint)) return null;
  return value as Blueprint[];
};

function readsAsTask(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isString(value['id']) || !isString(value['title']) || !isString(value['file']) || !isString(value['status'])) return false;
  if (!isStringList(value['assignee']) || !Array.isArray(value['blueprints']) || !Array.isArray(value['sections'])) return false;
  return isRecord(value['properties']);
}

export const readBacklog: Reader<Backlog> = (value) => {
  if (!isRecord(value) || !isString(value['folder']) || !Array.isArray(value['tasks'])) return null;
  const settings = value['settings'];
  if (!isRecord(settings)) return null;
  if (!isStringList(settings['statuses']) || !Array.isArray(settings['columns']) || !Array.isArray(settings['types'])) return null;
  if (!value['tasks'].every(readsAsTask)) return null;
  return value as unknown as Backlog;
};

// `eidos backlog --search --json` and the like, whose tasks the extension reads only for their ids
export const readTaskIds: Reader<string[]> = (value) => {
  if (!isRecord(value) || !Array.isArray(value['tasks'])) return null;
  const ids: string[] = [];
  for (const task of value['tasks']) {
    if (!isRecord(task) || !isString(task['id'])) return null;
    ids.push(task['id']);
  }
  return ids;
};

export const readBlueprintIds: Reader<string[]> = (value) => {
  if (!Array.isArray(value)) return null;
  const ids: string[] = [];
  for (const blueprint of value) {
    if (!isRecord(blueprint) || !isString(blueprint['id'])) return null;
    ids.push(blueprint['id']);
  }
  return ids;
};

export const readCheck: Reader<CheckResult> = (value) => {
  if (!isRecord(value) || !Array.isArray(value['findings'])) return null;
  const findingsRead = value['findings'].every((finding) => isRecord(finding) && isString(finding['code']) && isString(finding['message']) && isNullableString(finding['path']));
  if (!findingsRead) return null;
  return value as unknown as CheckResult;
};

export const readUsers: Reader<Users> = (value) => {
  if (!isRecord(value) || !Array.isArray(value['users'])) return null;
  const usersRead = value['users'].every((user) => isRecord(user) && isString(user['alias']));
  if (!usersRead) return null;
  return { users: value['users'] as User[], acting: isString(value['acting']) ? value['acting'] : null };
};

export const readWhoami: Reader<Whoami> = (value) => {
  if (!isRecord(value)) return null;
  return { name: isString(value['name']) ? value['name'] : null, email: isString(value['email']) ? value['email'] : null };
};

// a task as `eidos backlog add --json` prints it (`show --json`'s shape)
export const readTask: Reader<Task> = (value) => {
  if (!readsAsTask(value)) return null;
  return value as Task;
};
