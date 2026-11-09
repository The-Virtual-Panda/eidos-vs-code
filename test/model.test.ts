import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ProjectIndex, boardColumns, coreOutline, emptyFilter, filterTasks, groupByStatus, hiddenAsDone, priorityColor, statusColor, statusOrder, whoAmI } from '../src/core/model.ts';
import { backlog, snapshot } from './fixtures/project.ts';

const settings = backlog.settings;

test('the Core lists the top-level docs, then each collection in the framework order, its categories in the grouping order', () => {
  const outline = coreOutline(snapshot);
  assert.deepEqual(outline.docs, [{ title: 'Orientation', file: path.resolve('/p/orientation.md') }]);
  assert.deepEqual(
    outline.collections.map((collection) => [collection.name, collection.count]),
    [
      ['frames', 1],
      ['specs', 4],
    ],
  );
  const specs = outline.collections[1];
  assert.deepEqual(
    specs?.categories.map((category) => [category.name, category.blueprints.map((blueprint) => blueprint.title)]),
    [
      ['cli-core', ['Check', 'CLI Distribution']],
      ['app', ['The Page', 'The VS Code Extension']],
    ],
  );
});

test('indexes blueprints and tasks by id, alias, and file, and the tasks serving a blueprint', () => {
  const index = new ProjectIndex(snapshot);
  assert.equal(index.find('b-a45')?.kind, 'blueprint');
  assert.equal(index.task('T-OLD1')?.id, 'T-I01');
  assert.equal(index.atFile('/p/backlog/t-e55.md')?.kind, 'task');
  assert.deepEqual(
    index.tasksServing('B-A45').map((task) => task.id),
    ['T-E55'],
  );
});

test('orders statuses as the board does: its columns, then the backlog statuses', () => {
  assert.deepEqual(statusOrder(settings, null), ['To Do', 'In Progress', 'Done', 'Intake']);
  assert.deepEqual(
    groupByStatus(settings, backlog.tasks, null).map((group) => [group.status, group.tasks.length]),
    [
      ['To Do', 1],
      ['In Progress', 1],
      ['Done', 1],
      ['Intake', 1],
    ],
  );
});

test('filters by milestone, assignee, assigned to me, type, and the ids a search kept', () => {
  const ids = (filter: Parameters<typeof filterTasks>[2]) => filterTasks(settings, backlog.tasks, filter, 'brenton').map((task) => task.id);
  assert.deepEqual(ids({ ...emptyFilter(), milestone: '0.22' }), ['T-B12.2']);
  assert.deepEqual(ids({ ...emptyFilter(), assignee: 'agent' }), ['T-E55']);
  assert.deepEqual(ids({ ...emptyFilter(), assignedToMe: true }), ['T-B12.2']);
  assert.deepEqual(ids({ ...emptyFilter(), type: 'bug' }), ['T-E55']);
  assert.deepEqual(ids({ ...emptyFilter(), searchIds: new Set(['T-I01']) }), ['T-I01']);
});

test("a board's columns are its own, else the project's narrowed to the statuses it uses", () => {
  const withBoards = { ...settings, boards: [{ name: 'web', title: 'Web', statuses: ['To Do', 'Done'] }, { name: 'ops', title: 'Ops', columns: [{ name: 'Now', statuses: ['In Progress'] }] }] };
  assert.deepEqual(
    boardColumns(withBoards, 'web').map((column) => column.name),
    ['To Do', 'Done'],
  );
  assert.deepEqual(
    boardColumns(withBoards, 'Ops').map((column) => column.name),
    ['Now'],
  );
  assert.equal(boardColumns(withBoards, null).length, 3);
});

test('a done task older than hide_done_days is not drawn on the board', () => {
  const now = new Date('2026-11-09T12:00:00-03:00');
  const old = backlog.tasks.find((task) => task.id === 'T-B12');
  const open = backlog.tasks.find((task) => task.id === 'T-B12.2');
  assert.ok(old && open);
  assert.equal(hiddenAsDone(settings, old, now), true);
  assert.equal(hiddenAsDone(settings, open, now), false);
});

test('colours a status and a priority from the settings, else from where each sits', () => {
  assert.equal(statusColor(settings, 'Done'), 'terminal.ansiCyan');
  assert.equal(statusColor(settings, 'In Progress'), 'charts.yellow');
  assert.equal(priorityColor(settings, 'high'), 'charts.red');
  assert.equal(priorityColor(settings, 'medium'), 'charts.orange');
  assert.equal(priorityColor(settings, 'low'), 'charts.blue');
});

test('finds who Assigned to me means', () => {
  const users = snapshot.users;
  assert.equal(whoAmI(users, 'agent', { name: null, email: null }), 'agent');
  assert.equal(whoAmI(users, null, { name: 'Someone', email: 'B@example.com' }), 'brenton');
  assert.equal(whoAmI(users, null, { name: 'brenton unger ii', email: 'other@example.com' }), 'brenton');
  assert.equal(whoAmI(users, null, { name: 'Nobody', email: null }), null);
});
