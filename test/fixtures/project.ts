// A small project as the CLI's --json would print it, for the model's and the form's tests.
import type { Backlog, Blueprint, Framework, Task } from '../../src/core/shapes.ts';
import type { Snapshot } from '../../src/core/model.ts';

export const framework: Framework = {
  root: '/p',
  file: '.eidos/Framework.yaml',
  eidos_version: '5.10.0',
  top_level: [{ title: 'Orientation', path: '../orientation.md' }],
  folders: [
    { name: 'frames', variants: [{ name: 'architecture', default: true }] },
    {
      name: 'specs',
      variants: [{ name: 'full', default: true }, { name: 'micro' }],
      grouping: { groups: [{ name: 'cli-core' }, { name: 'app' }] },
    },
    { name: 'backlog', owned_by: '@backlog/tasks' },
  ],
  properties: {
    core: [{ name: 'id', type: 'Text', required: true }],
    custom: [
      { name: 'maturity', type: 'Text', applies_to: 'all', options: ['Infant', 'Developing', 'Mature', 'Retired'] },
      { name: 'component', type: 'Text', applies_to: ['specs'] },
      { name: 'labels', type: 'List', applies_to: ['specs'], options: ['a', 'b'] },
      { name: 'date_created', type: 'Date', applies_to: 'all', eidosmd: { new: 'today' } },
      { name: 'effective', type: 'Date', applies_to: ['standard'] },
    ],
  },
};

function blueprint(id: string, title: string, collection: string, group: string | null, properties: Blueprint['properties'] = {}): Blueprint {
  return { id, title, summary: `${title} in one line`, collection, group, variant: null, path: `${collection}/${group ? `${group}/` : ''}${title.toLowerCase().replace(/\s+/g, '-')}.md`, properties: { id, title, ...properties } };
}

export const blueprints: Blueprint[] = [
  blueprint('B-Q7KN', 'Architecture', 'frames', null),
  blueprint('B-A45', 'The VS Code Extension', 'specs', 'app', { maturity: 'Infant', component: 'App', labels: ['a'], date_created: '2026-11-09' }),
  blueprint('B-5M5A', 'CLI Distribution', 'specs', 'cli-core', { maturity: 'Developing' }),
  blueprint('B-CHK1', 'Check', 'specs', 'cli-core'),
  blueprint('B-PAGE', 'The Page', 'specs', 'app'),
];

function task(id: string, title: string, status: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    name: id.toLowerCase(),
    aliases: [],
    file: `backlog/${id.toLowerCase()}.md`,
    title,
    type: 'default',
    board: null,
    status,
    column: status,
    open: status !== 'Done',
    assignee: [],
    milestone: null,
    priority: null,
    parent: null,
    created: '2026-11-01T10:00:00-03:00',
    updated: '2026-11-01T10:00:00-03:00',
    blueprints: [],
    properties: {},
    sections: [],
    ...extra,
  };
}

export const backlog: Backlog = {
  folder: 'backlog',
  settings: {
    statuses: ['Intake', 'To Do', 'In Progress', 'Done'],
    columns: [
      { name: 'To Do', statuses: ['To Do'] },
      { name: 'In Progress', statuses: ['In Progress'] },
      { name: 'Done', statuses: ['Done'] },
    ],
    default_status: 'Intake',
    priorities: ['high', 'medium', 'low'],
    milestones: [{ name: '0.22', date: null }],
    properties: [{ name: 'estimate', type: 'Number' }],
    builtin_properties: [{ name: 'status' }, { name: 'type' }],
    types: [
      { name: 'default', title: 'Task', sections: [{ key: 'acceptance-criteria', title: 'Acceptance Criteria', type: 'checklist' }, { key: 'implementation-notes', title: 'Implementation Notes', type: 'text' }] },
      { name: 'bug', title: 'Bug', color: 'red', sections: [] },
    ],
    status_colors: { Done: 'teal' },
    status_categories: { Intake: 'todo', 'To Do': 'todo', 'In Progress': 'in_progress', Done: 'done' },
    priority_colors: {},
    hide_done_days: 30,
    boards: [],
  },
  tasks: [
    task('T-B12.2', 'Version tags drive the pipeline', 'In Progress', {
      assignee: ['brenton'],
      milestone: '0.22',
      priority: 'medium',
      parent: 'T-B12',
      blueprints: [{ id: 'B-5M5A', title: 'CLI Distribution', path: 'specs/cli-core/cli-distribution.md', missing: false }],
      sections: [{ key: 'acceptance-criteria', title: 'Acceptance Criteria', type: 'checklist', text: '', present: true, items: [{ n: 1, done: true, text: 'one' }, { n: 2, done: false, text: 'two' }] }],
    }),
    task('T-B12', 'Release Eidos from version tags', 'Done', { updated: '2026-10-01T10:00:00-03:00' }),
    task('T-E55', 'Make a template opt-in', 'To Do', { type: 'bug', assignee: ['agent'], blueprints: [{ id: 'B-A45', title: 'The VS Code Extension', path: 'specs/app/x.md', missing: false }] }),
    task('T-I01', 'An idea', 'Intake', { aliases: ['T-OLD1'] }),
  ],
};

export const snapshot: Snapshot = {
  root: '/p',
  framework,
  blueprints,
  backlog,
  users: [
    { name: 'Brenton Unger II', alias: 'brenton', email: 'b@example.com' },
    { name: 'AI Agent', alias: 'agent', agent: true },
  ],
  me: 'brenton',
};
