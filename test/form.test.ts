import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectIndex } from '../src/core/model.ts';
import { blueprintChange, blueprintForm, taskChange, taskForm } from '../src/core/form.ts';
import { snapshot } from './fixtures/project.ts';

const index = new ProjectIndex(snapshot);

test("a blueprint's form: its collection's properties, typed, with what the CLI writes read-only and the tasks serving it", () => {
  const blueprint = index.blueprint('B-A45');
  assert.ok(blueprint);
  const form = blueprintForm(index, blueprint);
  const kinds = Object.fromEntries(form.fields.map((field) => [field.name, field.kind]));
  assert.deepEqual(kinds, { id: 'readonly', summary: 'textarea', variant: 'select', maturity: 'select', component: 'text', labels: 'chips', date_created: 'readonly' });
  assert.equal(form.fields.find((field) => field.name === 'maturity')?.value, 'Infant');
  assert.deepEqual(
    form.tasks?.map((task) => task.id),
    ['T-E55'],
  );
});

test("a task's form: the format's properties in the backlog's order, selects for its board's statuses and priorities, and the project's own", () => {
  const task = index.task('T-B12.2');
  assert.ok(task);
  const form = taskForm(index, task);
  assert.deepEqual(
    form.fields.map((field) => field.name),
    ['id', 'title', 'status', 'type', 'priority', 'milestone', 'assignee', 'blueprints', 'parent', 'estimate', 'created', 'updated'],
  );
  const status = form.fields.find((field) => field.name === 'status');
  assert.equal(status?.kind, 'select');
  assert.deepEqual(
    status?.options?.map((option) => option.value),
    ['Intake', 'To Do', 'In Progress', 'Done'],
  );
  assert.deepEqual(form.progress, { done: 1, total: 2 });
  assert.equal(form.fields.find((field) => field.name === 'parent')?.links?.[0]?.label, 'T-B12 Release Eidos from version tags');
});

test('a blueprint change is `eidos property set`, and a value taken away `unset`', () => {
  assert.deepEqual(blueprintChange('B-A45', 'maturity', 'Mature'), ['property', 'set', '@B-A45', 'maturity', 'Mature']);
  assert.deepEqual(blueprintChange('B-A45', 'labels', ['a', 'b']), ['property', 'set', '@B-A45', 'labels', 'a,b']);
  assert.deepEqual(blueprintChange('B-A45', 'component', null), ['property', 'unset', '@B-A45', 'component']);
});

test('a task change is `eidos backlog set` with the one option it changes', () => {
  assert.deepEqual(taskChange('T-E55', 'status', 'Done'), ['backlog', 'set', 'T-E55', '--status', 'Done']);
  assert.deepEqual(taskChange('T-E55', 'priority', null), ['backlog', 'set', 'T-E55', '--priority', '']);
  assert.deepEqual(taskChange('T-E55', 'assignee', ['brenton', 'agent']), ['backlog', 'set', 'T-E55', '--assignee', 'brenton', '--assignee', 'agent']);
  assert.deepEqual(taskChange('T-E55', 'assignee', []), ['backlog', 'set', 'T-E55', '--assignee', '']);
  assert.deepEqual(taskChange('T-E55', 'blueprints', ['B-A45']), ['backlog', 'set', 'T-E55', '--for', 'B-A45']);
  assert.deepEqual(taskChange('T-E55', 'estimate', '3'), ['backlog', 'set', 'T-E55', '--property', 'estimate=3']);
});
