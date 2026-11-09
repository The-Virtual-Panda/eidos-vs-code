import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openLink, pageRoute } from '../src/core/links.ts';
import { ProjectIndex } from '../src/core/model.ts';
import { snapshot } from './fixtures/project.ts';

const index = new ProjectIndex(snapshot);

// The desktop app's reading of the link (eidosmd desktop/src/sign-in-link.ts, openLinkOf), restated here to check against
function readLink(link: string): { project: string; to: string } | null {
  const url = new URL(link);
  if (url.protocol !== 'eidosmd:' || url.hostname !== 'open') return null;
  const project = url.searchParams.get('project');
  const raw = url.searchParams.get('to');
  if (!project) return null;
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return { project, to: '/' };
  const resolved = new URL(raw, 'http://page.invalid');
  return { project, to: `${resolved.pathname}${resolved.search}` };
}

test("a blueprint opens at its page, /b/ and its path, each segment encoded", () => {
  const entity = index.find('B-A45') ?? null;
  assert.equal(pageRoute(entity), '/b/specs/app/the-vs-code-extension.md');
  const link = openLink('/Users/me/My Project/Blueprints', entity);
  assert.deepEqual(readLink(link), { project: '/Users/me/My Project/Blueprints', to: '/b/specs/app/the-vs-code-extension.md' });
});

test("a task opens at the page the CLI's --json names, and with neither the project opens at its start", () => {
  const task = index.task('T-E55');
  assert.ok(task);
  const entity = { kind: 'task' as const, task: { ...task, href: '/p/backlog/tasks/t-e55-make-a-template-opt-in' } };
  assert.deepEqual(readLink(openLink('/p', entity)), { project: '/p', to: '/p/backlog/tasks/t-e55-make-a-template-opt-in' });
  assert.equal(pageRoute({ kind: 'task', task }), '/');
  assert.deepEqual(readLink(openLink('/p', null)), { project: '/p', to: '/' });
});

test('a path with spaces and symbols survives the link', () => {
  const blueprint = index.blueprint('B-A45');
  assert.ok(blueprint);
  const entity = { kind: 'blueprint' as const, blueprint: { ...blueprint, path: 'specs/a b/c#d?.md' } };
  const read = readLink(openLink('/p', entity));
  assert.equal(read?.to, '/b/specs/a%20b/c%23d%3F.md');
});
