// The Properties form (REQ4): a blueprint's or a task's frontmatter as fields
// typed by the framework's Properties table or the backlog's settings, and
// the command each change runs. What the CLI writes (an id, a stamped date)
// is read-only; every other change is the command a person would run.
import type { Blueprint, PropertyDeclaration, PropertyValue, Task } from './shapes.ts';
import { boardOf, boardStatuses, boardTypes, checklistProgress, statusColor } from './model.ts';
import type { ProjectIndex } from './model.ts';

export type FieldKind = 'text' | 'textarea' | 'select' | 'chips' | 'date' | 'number' | 'checkbox' | 'readonly' | 'links';

export interface FieldOption {
  value: string;
  label: string;
}

export interface LinkChip {
  id: string;
  label: string;
  missing?: boolean;
}

export interface Field {
  name: string;
  label: string;
  kind: FieldKind;
  value: string | string[] | boolean | null;
  options?: FieldOption[];
  // a select may hold no value (cleared)
  clearable?: boolean;
  // chips that link to blueprints or tasks
  links?: LinkChip[];
  // chips added from a picker the extension opens (users, blueprints), rather than typed
  picker?: 'users' | 'blueprints' | 'options';
  hint?: string;
  color?: string;
}

export interface ServingTask {
  id: string;
  title: string;
  status: string;
  color: string;
}

export interface Form {
  kind: 'blueprint' | 'task';
  id: string;
  title: string;
  subtitle: string;
  file: string;
  fields: Field[];
  // a blueprint's: the tasks that serve it
  tasks?: ServingTask[];
  progress?: { done: number; total: number };
}

function label(name: string): string {
  const words = name.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function asText(value: PropertyValue | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function asList(value: PropertyValue | undefined): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.map((item) => asText(item) ?? '').filter((item) => item.length > 0);
  const text = asText(value);
  if (!text) return [];
  return [text];
}

function appliesTo(declaration: PropertyDeclaration, collection: string): boolean {
  const scope = declaration.applies_to;
  if (scope === undefined || scope === 'all') return true;
  return scope.some((name) => name.toLowerCase() === collection.toLowerCase());
}

// A property the CLI stamps itself (`eidosmd.new`, the dates a blueprint is created and changed on) is shown, never set from the form
function writtenByTool(declaration: PropertyDeclaration): boolean {
  return declaration.eidosmd?.new !== undefined;
}

function options(values: string[]): FieldOption[] {
  return values.map((value) => ({ value, label: value }));
}

function fieldFor(declaration: PropertyDeclaration, value: PropertyValue | undefined): Field {
  const name = declaration.name;
  const type = declaration.type.toLowerCase();
  const base = { name, label: label(name), hint: declaration.meaning };
  if (writtenByTool(declaration)) return { ...base, kind: 'readonly', value: asText(value) };
  if (type === 'list') {
    if (declaration.options) return { ...base, kind: 'chips', value: asList(value), options: options(declaration.options), picker: 'options' };
    return { ...base, kind: 'chips', value: asList(value) };
  }
  if (declaration.options) return { ...base, kind: 'select', value: asText(value), options: options(declaration.options), clearable: !declaration.required };
  if (type === 'date') return { ...base, kind: 'date', value: asText(value) };
  if (type === 'number') return { ...base, kind: 'number', value: asText(value) };
  if (type === 'checkbox') return { ...base, kind: 'checkbox', value: value === true || value === 'true' };
  if (type === 'object' || type === 'date & time') return { ...base, kind: 'readonly', value: asText(value) };
  return { ...base, kind: 'text', value: asText(value) };
}

export function blueprintForm(index: ProjectIndex, blueprint: Blueprint): Form {
  const framework = index.snapshot.framework;
  const folder = framework.folders.find((candidate) => candidate.name === blueprint.collection);
  const variants = folder?.variants ?? [];
  const fields: Field[] = [];

  // a new title renames the blueprint, which stays in the app and `eidos move`
  fields.push({ name: 'id', label: 'Id', kind: 'readonly', value: blueprint.id });
  fields.push({ name: 'summary', label: 'Summary', kind: 'textarea', value: blueprint.summary ?? '' });
  if (variants.length > 1) {
    const defaultVariant = variants.find((variant) => variant.default)?.name;
    fields.push({
      name: 'variant',
      label: 'Variant',
      kind: 'select',
      value: asText(blueprint.properties['variant']),
      options: variants.map((variant) => ({ value: variant.name, label: variant.name === defaultVariant ? `${variant.name} (default)` : variant.name })),
      clearable: true,
    });
  }

  for (const declaration of framework.properties.custom) {
    if (!appliesTo(declaration, blueprint.collection)) continue;
    fields.push(fieldFor(declaration, blueprint.properties[declaration.name]));
  }

  const tasks = index.tasksServing(blueprint.id).map((task) => ({ id: task.id, title: task.title, status: task.status, color: statusColor(index.snapshot.backlog?.settings ?? emptySettings, task.status) }));
  const variantName = asText(blueprint.properties['variant']) ?? variants.find((variant) => variant.default)?.name ?? null;
  const subtitle = [label(blueprint.collection), variantName, blueprint.group].filter((part) => part).join(' · ');
  const form: Form = { kind: 'blueprint', id: blueprint.id, title: blueprint.title, subtitle, file: blueprint.path, fields };
  if (index.snapshot.backlog) form.tasks = tasks;
  return form;
}

const emptySettings = {
  statuses: [],
  columns: [],
  default_status: '',
  priorities: [],
  milestones: [],
  properties: [],
  builtin_properties: [],
  types: [],
  status_colors: {},
  status_categories: {},
  priority_colors: {},
  hide_done_days: null,
  boards: [],
};

// The format's own task properties the form shows, in the page's default order
const builtinOrder = ['type', 'status', 'priority', 'milestone', 'assignee', 'blueprints', 'parent'];

export function taskForm(index: ProjectIndex, task: Task): Form {
  const backlog = index.snapshot.backlog;
  const settings = backlog?.settings ?? emptySettings;
  const board = boardOf(settings, task);
  const named = settings.builtin_properties.map((property) => property.name).filter((name) => builtinOrder.includes(name));
  const order = [...named, ...builtinOrder.filter((name) => !named.includes(name))];
  const fields: Field[] = [
    { name: 'id', label: 'Id', kind: 'readonly', value: task.id },
    { name: 'title', label: 'Title', kind: 'text', value: task.title },
  ];

  for (const name of order) {
    if (name === 'type') {
      const types = boardTypes(settings, board);
      if (types.length <= 1 && (task.type || 'default') === types[0]) continue;
      const titles = new Map(settings.types.map((type) => [type.name, type.title]));
      fields.push({ name, label: 'Type', kind: 'select', value: task.type || 'default', options: types.map((type) => ({ value: type, label: titles.get(type) ?? type })) });
    } else if (name === 'status') {
      fields.push({ name, label: 'Status', kind: 'select', value: task.status, options: options(boardStatuses(settings, board)), color: statusColor(settings, task.status) });
    } else if (name === 'priority') {
      fields.push({ name, label: 'Priority', kind: 'select', value: task.priority, options: options(settings.priorities), clearable: true });
    } else if (name === 'milestone') {
      if (settings.milestones.length === 0 && !task.milestone) continue;
      fields.push({ name, label: 'Milestone', kind: 'select', value: task.milestone, options: options(settings.milestones.map((milestone) => milestone.name)), clearable: true });
    } else if (name === 'assignee') {
      fields.push({ name, label: 'Assignee', kind: 'chips', value: task.assignee, picker: 'users' });
    } else if (name === 'blueprints') {
      const links = task.blueprints.map((served) => ({ id: served.id, label: served.title ?? served.id, missing: served.missing }));
      fields.push({ name, label: 'Blueprints', kind: 'links', value: task.blueprints.map((served) => served.id), links, picker: 'blueprints' });
    } else if (name === 'parent') {
      if (!task.parent) continue;
      const parent = index.task(task.parent);
      fields.push({ name, label: 'Parent', kind: 'links', value: [task.parent], links: [{ id: task.parent, label: parent ? `${task.parent} ${parent.title}` : task.parent, missing: !parent }] });
    }
  }

  for (const declaration of settings.properties) {
    const scope = declaration.applies_to;
    const applies = scope === undefined || scope === 'all' || scope.includes(task.type || 'default');
    if (!applies) continue;
    fields.push(fieldFor(declaration, task.properties[declaration.name]));
  }

  fields.push({ name: 'created', label: 'Created', kind: 'readonly', value: task.created });
  fields.push({ name: 'updated', label: 'Updated', kind: 'readonly', value: task.updated });

  const typeTitle = settings.types.find((type) => type.name === (task.type || 'default'))?.title ?? 'Task';
  const boardTitle = settings.boards.find((candidate) => candidate.name === board)?.title;
  const subtitle = [typeTitle, boardTitle].filter((part) => part).join(' · ');
  return { kind: 'task', id: task.id, title: task.title, subtitle, file: task.file, fields, progress: checklistProgress(task) };
}

// ── The command a change runs ──────────────────────────────────────────────

export type FieldValue = string | string[] | boolean | null;

function joinList(value: FieldValue): string {
  if (Array.isArray(value)) return value.join(',');
  if (value === null) return '';
  return String(value);
}

function isEmpty(value: FieldValue): boolean {
  if (value === null || value === '') return true;
  return Array.isArray(value) && value.length === 0;
}

// `eidos property set @<id> <property> <value>`, or `unset` for a value taken away
export function blueprintChange(id: string, field: string, value: FieldValue): string[] {
  if (isEmpty(value)) return ['property', 'unset', `@${id}`, field];
  return ['property', 'set', `@${id}`, field, joinList(value)];
}

const taskFlags: Record<string, string> = {
  title: '--title',
  type: '--type',
  status: '--status',
  priority: '--priority',
  milestone: '--milestone',
  parent: '--parent',
};

// `eidos backlog set <task> --<field> <value>`: one change, a list given whole as it replaces
export function taskChange(id: string, field: string, value: FieldValue): string[] {
  const flag = taskFlags[field];
  if (flag) return ['backlog', 'set', id, flag, joinList(value)];
  if (field === 'assignee' || field === 'blueprints') {
    const repeated = field === 'assignee' ? '--assignee' : '--for';
    const values = Array.isArray(value) ? value : [];
    if (values.length === 0) return ['backlog', 'set', id, repeated, ''];
    return ['backlog', 'set', id, ...values.flatMap((item) => [repeated, item])];
  }
  if (typeof value === 'boolean') return ['backlog', 'set', id, '--property', `${field}=${value ? 'on' : 'off'}`];
  return ['backlog', 'set', id, '--property', `${field}=${joinList(value)}`];
}
