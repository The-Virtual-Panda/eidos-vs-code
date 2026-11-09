import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findIds, idAt, isNotesSection, requirementLine, taskLayout } from '../src/core/text.ts';

test('finds blueprint and task ids, and a requirement after a blueprint id', () => {
  const ids = findIds('# T-B12.2: rides B-5M5A REQ4 and B-A45, not SHA-256 or XB-1234');
  assert.deepEqual(
    ids.map((match) => [match.id, match.requirement]),
    [
      ['T-B12.2', null],
      ['B-5M5A', 'REQ4'],
      ['B-A45', null],
    ],
  );
  assert.equal(findIds('see B-A45x and T-W85_old').length, 0);
  assert.equal(findIds('see B-SP56.').length, 1);
});

test('finds the id under the cursor', () => {
  const line = 'a comment naming T-W85 here';
  assert.equal(idAt(line, 19)?.id, 'T-W85');
  assert.equal(idAt(line, 2), null);
});

test('finds the line a requirement is defined on', () => {
  const text = ['## Requirements', 'REQ6 is mentioned first', '- **REQ6:** In an open task, a CodeLens', '- **REQ16:** Every action'].join('\n');
  assert.equal(requirementLine(text, 'REQ6'), 2);
  assert.equal(requirementLine(text, 'REQ16'), 3);
  assert.equal(requirementLine(text, 'REQ99'), null);
});

const sections = [
  { key: 'description', title: 'Description', type: 'text' },
  { key: 'acceptance-criteria', title: 'Acceptance Criteria', type: 'checklist' },
  { key: 'implementation-notes', title: 'Implementation Notes', type: 'text' },
];

test('lays out a task: its sections and its checklist lines', () => {
  const text = [
    '---',
    'id: T-A00',
    '---',
    '',
    '## Description',
    '<!-- backlog:description -->',
    '- [ ] #9 not a checklist line, a description',
    '### a heading of the description',
    '<!-- /backlog:description -->',
    '',
    '## Acceptance Criteria',
    '<!-- backlog:acceptance-criteria -->',
    '- [x] #1 done',
    '- [ ] #2 open',
    '<!-- /backlog:acceptance-criteria -->',
    '',
    '## Implementation Notes',
    '<!-- backlog:implementation-notes -->',
    'Built.',
    '<!-- /backlog:implementation-notes -->',
  ].join('\n');
  const layout = taskLayout(text, sections);
  assert.deepEqual(
    layout.sections.map((place) => [place.key, place.line]),
    [
      ['description', 4],
      ['acceptance-criteria', 10],
      ['implementation-notes', 16],
    ],
  );
  assert.deepEqual(
    layout.checklist.map((line) => [line.n, line.done, line.line, line.key]),
    [
      [1, true, 12, 'acceptance-criteria'],
      [2, false, 13, 'acceptance-criteria'],
    ],
  );
});

test('reads an older task whose sections are bare headings', () => {
  const layout = taskLayout(['## Acceptance Criteria', '- [ ] #1 open'].join('\n'), sections);
  assert.equal(layout.checklist.length, 1);
  assert.equal(layout.checklist[0]?.key, 'acceptance-criteria');
});

test('a notes section is a text section whose key ends in notes', () => {
  assert.equal(isNotesSection({ key: 'implementation-notes', type: 'text' }), true);
  assert.equal(isNotesSection({ key: 'notes', type: 'text' }), true);
  assert.equal(isNotesSection({ key: 'description', type: 'text' }), false);
  assert.equal(isNotesSection({ key: 'release-notes', type: 'checklist' }), false);
});
