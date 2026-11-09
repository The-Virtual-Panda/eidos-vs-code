// The desktop app's link to a project's page, `eidosmd://open?project=<folder>&to=<route>` (The Desktop App
// REQ25): a blueprint's page is `/b/<its path>`, each segment encoded, and a task's is the `href` the CLI's
// `eidos backlog --json` prints; with neither, the project opens at its start.
import type { Entity } from './model.ts';

export function pageRoute(entity: Entity | null): string {
  if (entity?.kind === 'blueprint') return `/b/${entity.blueprint.path.split('/').map(encodeURIComponent).join('/')}`;
  if (entity?.kind === 'task' && entity.task.href?.startsWith('/')) return entity.task.href;
  return '/';
}

export function openLink(projectRoot: string, entity: Entity | null): string {
  const query = new URLSearchParams({ project: projectRoot, to: pageRoute(entity) });
  return `eidosmd://open?${query.toString()}`;
}
