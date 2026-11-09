// The Properties form in the webview (REQ4): draws the fields the extension
// sends and posts each change back; the extension runs the command.
import type { Field, Form } from '../core/form.ts';
import type { PropertiesState, PropertiesToExtension } from './protocol.ts';
import { el, setColor, vscodeApi } from './dom.ts';

const vscode = vscodeApi<PropertiesToExtension>();
const app = document.getElementById('app');
let lastForm: string | null = null;

window.addEventListener('message', (event: MessageEvent<PropertiesState>) => render(event.data));
vscode.postMessage({ type: 'ready' });

function render(state: PropertiesState): void {
  if (!app) return;
  if (state.kind === 'empty') {
    lastForm = null;
    app.replaceChildren(el('p', 'empty', state.text));
    return;
  }
  const key = `${state.form.kind}:${state.form.id}`;
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset['field'] : undefined;
  app.replaceChildren(drawForm(state.form, state.busy));
  if (lastForm === key && focused) {
    const again = app.querySelector<HTMLElement>(`[data-field="${CSS.escape(focused)}"]`);
    again?.focus();
  }
  lastForm = key;
}

function drawForm(form: Form, busy: boolean): HTMLElement {
  const root = el('div', busy ? 'form busy' : 'form');
  const head = el('header', 'head');
  const idLine = el('div', 'id-line');
  idLine.append(el('span', 'eidos-id', form.id), el('span', 'subtitle', form.subtitle));
  head.append(idLine);
  if (form.progress && form.progress.total > 0) {
    const progress = el('div', 'progress');
    const bar = el('progress');
    bar.max = form.progress.total;
    bar.value = form.progress.done;
    progress.append(bar, el('span', 'muted', `${form.progress.done} of ${form.progress.total} checked`));
    head.append(progress);
  }
  root.append(head);

  for (const field of form.fields) {
    if (field.name === 'id') continue;
    root.append(drawField(field, busy));
  }

  if (form.tasks) {
    const section = el('section', 'tasks');
    section.append(el('h3', 'label', 'Tasks'));
    if (form.tasks.length === 0) section.append(el('p', 'muted', 'No task serves this blueprint yet.'));
    const list = el('ul', 'task-list');
    for (const task of form.tasks) {
      const item = el('li');
      const link = el('button', 'link task-link');
      link.type = 'button';
      const dot = el('span', 'dot');
      setColor(dot, task.color);
      link.append(dot, el('span', 'eidos-id', task.id), el('span', 'task-title', task.title));
      link.title = `${task.id} · ${task.status}`;
      link.addEventListener('click', () => vscode.postMessage({ type: 'open', id: task.id }));
      item.append(link);
      list.append(item);
    }
    section.append(list);
    const add = el('button', 'secondary', '+ New Task for this blueprint');
    add.type = 'button';
    add.disabled = busy;
    add.addEventListener('click', () => vscode.postMessage({ type: 'newTask' }));
    section.append(add);
    root.append(section);
  }

  const actions = el('footer', 'actions');
  if (form.kind === 'task') {
    const board = el('button', 'secondary', 'Open on Board');
    board.type = 'button';
    board.addEventListener('click', () => vscode.postMessage({ type: 'openBoard' }));
    actions.append(board);
  }
  const eidos = el('button', 'accent', 'Open in Eidos');
  eidos.type = 'button';
  eidos.addEventListener('click', () => vscode.postMessage({ type: 'openInEidos' }));
  actions.append(eidos);
  root.append(actions);
  return root;
}

function drawField(field: Field, busy: boolean): HTMLElement {
  const row = el('div', `field field-${field.kind}`);
  const id = `field-${field.name}`;
  const label = el('label', 'label', field.label);
  label.htmlFor = id;
  if (field.hint) label.title = field.hint;
  row.append(label);

  const set = (value: string | string[] | boolean | null) => vscode.postMessage({ type: 'set', field: field.name, value });

  if (field.kind === 'readonly') {
    const value = el('div', 'readonly', typeof field.value === 'string' ? field.value : '—');
    value.id = id;
    row.append(value);
    return row;
  }

  if (field.kind === 'select') {
    const wrap = el('div', 'select-wrap');
    if (field.color) {
      const dot = el('span', 'dot');
      setColor(dot, field.color);
      wrap.append(dot);
    }
    const select = el('select');
    select.id = id;
    select.dataset['field'] = field.name;
    select.disabled = busy;
    const current = typeof field.value === 'string' ? field.value : '';
    const values = new Set((field.options ?? []).map((option) => option.value));
    if (field.clearable || current === '') select.append(new Option('—', '', false, current === ''));
    if (current !== '' && !values.has(current)) select.append(new Option(`${current} (not declared)`, current, false, true));
    for (const option of field.options ?? []) select.append(new Option(option.label, option.value, false, option.value === current));
    select.addEventListener('change', () => set(select.value === '' ? null : select.value));
    wrap.append(select);
    row.append(wrap);
    return row;
  }

  if (field.kind === 'chips' || field.kind === 'links') {
    const chips = el('div', 'chips');
    chips.id = id;
    const values = Array.isArray(field.value) ? field.value : [];
    const links = field.links ?? values.map((value) => ({ id: value, label: field.name === 'assignee' ? `@${value}` : value, missing: false }));
    for (const link of links) {
      const chip = el('span', link.missing ? 'chip missing' : 'chip');
      if (field.kind === 'links') {
        const open = el('button', 'link', link.label);
        open.type = 'button';
        open.title = link.missing ? `${link.id} is not in the project` : link.id;
        open.addEventListener('click', () => vscode.postMessage({ type: 'open', id: link.id }));
        chip.append(open);
      } else {
        chip.append(el('span', '', link.label));
      }
      if (field.picker) {
        const remove = el('button', 'remove', '×');
        remove.type = 'button';
        remove.disabled = busy;
        remove.setAttribute('aria-label', `Remove ${link.label}`);
        remove.addEventListener('click', () => vscode.postMessage({ type: 'remove', field: field.name, value: link.id }));
        chip.append(remove);
      }
      chips.append(chip);
    }
    if (field.picker || field.kind === 'chips') {
      const add = el('button', 'add', '+');
      add.type = 'button';
      add.disabled = busy;
      add.dataset['field'] = field.name;
      add.setAttribute('aria-label', `Add to ${field.label}`);
      add.addEventListener('click', () => vscode.postMessage({ type: 'pick', field: field.name }));
      chips.append(add);
    }
    row.append(chips);
    return row;
  }

  if (field.kind === 'checkbox') {
    const box = el('input');
    box.type = 'checkbox';
    box.id = id;
    box.dataset['field'] = field.name;
    box.checked = field.value === true;
    box.disabled = busy;
    box.addEventListener('change', () => set(box.checked));
    row.append(box);
    return row;
  }

  const initial = typeof field.value === 'string' ? field.value : '';
  let input: HTMLInputElement | HTMLTextAreaElement;
  if (field.kind === 'textarea') {
    const area = el('textarea');
    area.rows = 3;
    input = area;
  } else {
    const line = el('input');
    if (field.kind === 'date') line.type = 'date';
    else if (field.kind === 'number') line.type = 'number';
    else line.type = 'text';
    input = line;
  }
  input.id = id;
  input.dataset['field'] = field.name;
  input.value = initial;
  input.disabled = busy;
  // a text field writes when it is left or Enter is pressed, never on each key
  const commit = () => {
    if (input.value === initial) return;
    set(input.value === '' ? null : input.value);
  };
  input.addEventListener('change', commit);
  onKey(input, (event) => {
    if (event.key === 'Enter' && !(input instanceof HTMLTextAreaElement && event.shiftKey)) {
      event.preventDefault();
      input.blur();
    }
    if (event.key === 'Escape') {
      input.value = initial;
      input.blur();
    }
  });
  row.append(input);
  return row;
}

function onKey(target: HTMLElement, handler: (event: KeyboardEvent) => void): void {
  target.addEventListener('keydown', handler);
}
