// The board in the webview (REQ5): three header rows (the board, its title,
// and New Task; the search; the filters), then a column per board column
// whose cards drag to another column. The extension runs every change.
import type { BoardCard, BoardChoice, BoardColumn, BoardState, BoardToExtension } from './protocol.ts';
import { el, setColor, vscodeApi } from './dom.ts';

const vscode = vscodeApi<BoardToExtension>();
const app = document.getElementById('app');
let searchTimer: number | undefined;
let dragged: string | null = null;

window.addEventListener('message', (event: MessageEvent<BoardState>) => render(event.data));
vscode.postMessage({ type: 'ready' });

function render(state: BoardState): void {
  if (!app) return;
  const searchHadFocus = document.activeElement?.id === 'board-search';
  const caret = searchHadFocus && document.activeElement instanceof HTMLInputElement ? document.activeElement.selectionStart : null;
  app.replaceChildren(header(state), body(state));
  if (searchHadFocus) {
    const search = document.getElementById('board-search');
    if (search instanceof HTMLInputElement) {
      search.focus();
      if (caret !== null) search.setSelectionRange(caret, caret);
    }
  }
}

function header(state: BoardState): HTMLElement {
  const head = el('header', 'board-head');

  const first = el('div', 'row row-title');
  if (state.boards.length > 1) {
    const boards = el('select', 'board-select');
    boards.setAttribute('aria-label', 'Board');
    for (const board of state.boards) boards.append(new Option(board.label, board.value, false, board.value === state.board));
    boards.addEventListener('change', () => vscode.postMessage({ type: 'filter', name: 'board', value: boards.value }));
    first.append(boards);
  } else {
    first.append(el('span', 'project-chip', state.project));
  }
  first.append(el('h1', 'board-title', state.title), el('span', 'muted count', `${state.open} open`), el('span', 'spacer'));
  const newTask = el('button', 'primary', '+ New Task');
  newTask.type = 'button';
  newTask.addEventListener('click', () => vscode.postMessage({ type: 'newTask' }));
  first.append(newTask);

  const second = el('div', 'row row-search');
  const search = el('input', 'search');
  search.id = 'board-search';
  search.type = 'search';
  search.placeholder = 'Search tasks';
  search.setAttribute('aria-label', 'Search tasks');
  search.value = state.search;
  search.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => vscode.postMessage({ type: 'search', text: search.value }), 250);
  });
  const refresh = el('button', 'icon', '⟳');
  refresh.type = 'button';
  refresh.title = 'Refresh';
  refresh.setAttribute('aria-label', 'Refresh');
  refresh.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
  second.append(search, refresh);
  if (state.busy) second.append(el('span', 'muted', 'Saving…'));

  const third = el('div', 'row row-filters');
  if (state.filters.canFilterMe) {
    const mine = el('button', state.filters.assignedToMe ? 'toggle on' : 'toggle', 'Assigned to me');
    mine.type = 'button';
    mine.setAttribute('aria-pressed', String(state.filters.assignedToMe));
    mine.addEventListener('click', () => vscode.postMessage({ type: 'assignedToMe', value: !state.filters.assignedToMe }));
    third.append(mine);
  }
  third.append(filterSelect('Priority', 'priority', state.filters.priority), filterSelect('Assignee', 'assignee', state.filters.assignee), filterSelect('Type', 'type', state.filters.type), filterSelect('Milestone', 'milestone', state.filters.milestone));

  head.append(first, second, third);
  return head;
}

function filterSelect(label: string, name: 'milestone' | 'assignee' | 'type' | 'priority', filter: { value: string | null; options: BoardChoice[] }): HTMLElement {
  const select = el('select', filter.value === null ? 'filter' : 'filter on');
  select.setAttribute('aria-label', label);
  if (filter.options.length === 0) select.hidden = true;
  select.append(new Option(`${label}: any`, '', false, filter.value === null));
  for (const option of filter.options) select.append(new Option(`${label}: ${option.label}`, option.value, false, option.value === filter.value));
  select.addEventListener('change', () => vscode.postMessage({ type: 'filter', name, value: select.value === '' ? null : select.value }));
  return select;
}

function body(state: BoardState): HTMLElement {
  if (state.message) return el('p', 'empty', state.message);
  const columns = el('div', 'columns');
  columns.style.setProperty('--columns', String(Math.max(state.columns.length, 1)));
  for (const column of state.columns) columns.append(drawColumn(column));
  return columns;
}

function drawColumn(column: BoardColumn): HTMLElement {
  const section = el('section', 'column');
  section.dataset['column'] = column.name;
  const head = el('h2', 'column-head');
  const dot = el('span', 'dot');
  setColor(dot, column.color);
  head.append(dot, el('span', '', column.name), el('span', 'muted', String(column.cards.length)));
  const cards = el('div', 'cards');
  cards.setAttribute('role', 'list');
  for (const task of column.cards) cards.append(drawCard(task));

  section.addEventListener('dragover', (event) => {
    if (!dragged) return;
    event.preventDefault();
    section.classList.add('drop');
  });
  section.addEventListener('dragleave', (event) => {
    if (event.relatedTarget instanceof Node && section.contains(event.relatedTarget)) return;
    section.classList.remove('drop');
  });
  section.addEventListener('drop', (event) => {
    event.preventDefault();
    section.classList.remove('drop');
    const id = dragged ?? event.dataTransfer?.getData('text/plain');
    dragged = null;
    if (id) vscode.postMessage({ type: 'move', id, column: column.name });
  });
  section.append(head, cards);
  return section;
}

function drawCard(task: BoardCard): HTMLElement {
  const card = el('article', task.done ? 'card done' : 'card');
  card.setAttribute('role', 'listitem');
  card.draggable = true;
  card.tabIndex = 0;
  card.dataset['id'] = task.id;
  card.title = `${task.id} ${task.title}`;

  const title = el('div', 'card-title', task.title);
  const meta = el('div', 'meta');
  meta.append(el('span', 'eidos-id', task.id));
  if (task.type) {
    const type = el('span', 'chip typed', task.type);
    setColor(type, task.typeColor);
    meta.append(type);
  }
  if (task.priority) {
    const priority = el('span', 'priority');
    const mark = el('span', 'dot');
    setColor(mark, task.priorityColor);
    priority.append(mark, el('span', '', task.priority));
    meta.append(priority);
  }
  if (task.progress) meta.append(el('span', 'muted', `${task.progress.done}/${task.progress.total}`));
  if (task.blocked) meta.append(el('span', 'chip blocked', 'blocked'));
  const first = task.blueprints[0];
  if (first) meta.append(el('span', 'chip', first));
  if (task.blueprints.length > 1) meta.append(el('span', 'chip', `+${task.blueprints.length - 1}`));
  const people = el('span', 'people');
  for (const person of task.assignees) {
    const avatar = el('span', 'avatar', person.initials);
    avatar.title = `@${person.alias} · ${person.name}`;
    people.append(avatar);
  }
  meta.append(people);
  card.append(title, meta);

  card.addEventListener('dragstart', (event) => {
    dragged = task.id;
    event.dataTransfer?.setData('text/plain', task.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    dragged = null;
    card.classList.remove('dragging');
  });
  card.addEventListener('click', () => vscode.postMessage({ type: 'open', id: task.id }));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') vscode.postMessage({ type: 'open', id: task.id });
  });
  return card;
}
