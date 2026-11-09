// Every action as an `Eidos:` command (REQ16): Go to Blueprint and Go to Task
// (REQ11), New Task (REQ8), the checklist and the notes (REQ6), the check
// (REQ9), the backlog's filters (REQ2), the board (REQ5), and Open in Eidos.
import * as vscode from 'vscode';
import path from 'node:path';
import { readBlueprintIds, readTask, readTaskIds } from '../core/shapes.ts';
import { boardTypes, findBoard, statusColor } from '../core/model.ts';
import { taskLayout } from '../core/text.ts';
import type { Projects } from './projects.ts';
import type { EidosProject } from './project.ts';
import type { Notices } from './notices.ts';
import { BoardPanel } from './boardPanel.ts';
import { locate, sectionsOf } from './editorFeatures.ts';
import type { EidosCli } from '../core/cli.ts';

interface Context {
  projects: Projects;
  notices: Notices;
  cli: EidosCli;
  extensionUri: vscode.Uri;
}

export function registerCommands(context: Context): vscode.Disposable[] {
  const { projects, notices } = context;
  const register = (name: string, run: (...args: never[]) => unknown) =>
    vscode.commands.registerCommand(name, async (...args: never[]) => {
      try {
        await run(...args);
      } catch (error) {
        notices.show(`Eidos: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    });

  return [
    register('eidos.openId', (id: string, near?: string, requirement?: string | null) => openId(projects, id, near, requirement ?? null)),
    register('eidos.goToBlueprint', () => goTo(projects, 'blueprints')),
    register('eidos.goToTask', () => goTo(projects, 'tasks')),
    register('eidos.openBoard', async (given?: EidosProject) => {
      const project = isProject(given) ? given : await projects.pick();
      if (project) BoardPanel.show(project, projects, context.extensionUri);
    }),
    register('eidos.newTask', (given?: { project?: EidosProject; blueprint?: string; board?: string | null }) => newTask(projects, given)),
    register('eidos.tickChecklistLine', (given?: { file: string; key: string; n: number }) => tick(projects, given)),
    register('eidos.appendNote', (given?: { file: string; key: string }) => appendNote(projects, given)),
    register('eidos.runCheck', async () => {
      await Promise.all(projects.all.map((project) => project.check()));
      await vscode.commands.executeCommand('workbench.actions.view.problems');
    }),
    register('eidos.runFix', (file: string, command: string) => runFix(projects, file, command)),
    register('eidos.openInEidos', (file?: string) => openInEidos(projects, file)),
    register('eidos.refresh', async () => {
      await projects.discover();
      await Promise.all(projects.all.map((project) => project.read()));
    }),
    register('eidos.filterBacklog', (given?: EidosProject) => filterBacklog(projects, given)),
    register('eidos.searchBacklog', async (given?: EidosProject) => {
      const project = isProject(given) ? given : await projects.pick();
      if (!project) return;
      const words = await vscode.window.showInputBox({ prompt: 'Search the backlog, as `eidos backlog --search` does', value: project.filter.search });
      if (words !== undefined) project.setFilter({ search: words });
    }),
    register('eidos.toggleAssignedToMe', async () => {
      const project = await projects.pick();
      if (!project) return;
      if (!project.index?.snapshot.me) {
        notices.show('Eidos: this machine acts as no user of the project, so Assigned to me has no one to filter by. Set one with `eidos setup --as <alias>`, or `eidos whoami`.', 'warning');
        return;
      }
      project.setFilter({ assignedToMe: !project.filter.assignedToMe });
    }),
    register('eidos.clearBacklogFilters', async () => {
      const project = await projects.pick();
      if (project) project.setFilter({ board: null, milestone: null, assignee: null, assignedToMe: false, type: null, priority: null, search: '' });
    }),
    register('eidos.showEidosOutput', () => notices.channel.show()),
  ];
}

function isProject(value: unknown): value is EidosProject {
  return typeof value === 'object' && value !== null && 'root' in value && 'filter' in value;
}

async function openId(projects: Projects, id: string, near: string | undefined, requirement: string | null): Promise<void> {
  const found = projects.find(id, near);
  if (!found) {
    void vscode.window.showWarningMessage(`Eidos: no blueprint or task is ${id}.`);
    return;
  }
  const target = await locate(found.project, found.entity, requirement);
  if (!target) return;
  await vscode.window.showTextDocument(target.uri, { selection: target.range, preview: false });
}

// ── Go to Blueprint, Go to Task ────────────────────────────────────────────

type GoItem = vscode.QuickPickItem & { id?: string; project?: EidosProject };

async function goTo(projects: Projects, what: 'blueprints' | 'tasks'): Promise<void> {
  const project = await projects.pick();
  const index = project?.index;
  if (!project || !index) return;
  const settings = index.snapshot.backlog?.settings;

  const blueprintItem = (id: string): GoItem | null => {
    const blueprint = index.blueprint(id);
    if (!blueprint) return null;
    return { label: `$(file-text) ${blueprint.title}`, description: blueprint.id, detail: blueprint.summary ?? undefined, id: blueprint.id, project, alwaysShow: true };
  };
  const taskItem = (id: string): GoItem | null => {
    const task = index.task(id);
    if (!task) return null;
    const description = [task.id, task.status].join(' · ');
    return { label: `$(tasklist) ${task.title}`, description, id: task.id, project, alwaysShow: true, iconPath: settings ? new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(statusColor(settings, task.status))) : undefined };
  };

  const everyTask = (index.snapshot.backlog?.tasks ?? []).filter((task) => task.open).map((task) => taskItem(task.id));
  const everyBlueprint = index.snapshot.blueprints.map((blueprint) => blueprintItem(blueprint.id));
  const initial = (what === 'tasks' ? everyTask : everyBlueprint).filter((item): item is GoItem => item !== null);

  const pick = vscode.window.createQuickPick<GoItem>();
  pick.placeholder = what === 'tasks' ? 'Search the tasks, as `eidos backlog --search` does' : 'Search the blueprints, as `eidos list --search` does';
  pick.matchOnDescription = true;
  pick.items = initial;
  let asked = 0;
  let timer: NodeJS.Timeout | undefined;

  pick.onDidChangeValue((value) => {
    clearTimeout(timer);
    const words = value.trim();
    if (!words) {
      pick.items = initial;
      return;
    }
    timer = setTimeout(async () => {
      const ask = ++asked;
      pick.busy = true;
      try {
        const root = ['--project', project.root, '--search', words];
        const options = { cwd: project.root };
        const items: GoItem[] = [];
        if (what === 'tasks') {
          const [taskIds, blueprintIds] = await Promise.all([project.cliJson(['backlog', ...root], readTaskIds, options), project.cliJson(['list', ...root], readBlueprintIds, options)]);
          items.push(...taskIds.map(taskItem).filter((item): item is GoItem => item !== null));
          const blueprints = blueprintIds.map(blueprintItem).filter((item): item is GoItem => item !== null);
          if (blueprints.length > 0) items.push({ label: 'blueprints', kind: vscode.QuickPickItemKind.Separator }, ...blueprints);
        } else {
          const ids = await project.cliJson(['list', ...root], readBlueprintIds, options);
          items.push(...ids.map(blueprintItem).filter((item): item is GoItem => item !== null));
        }
        if (ask === asked) pick.items = items;
      } catch (error) {
        pick.items = [{ label: `The search failed: ${error instanceof Error ? error.message : String(error)}`, alwaysShow: true }];
      } finally {
        if (ask === asked) pick.busy = false;
      }
    }, 200);
  });

  pick.onDidAccept(() => {
    const chosen = pick.selectedItems[0];
    pick.hide();
    if (chosen?.id) void vscode.commands.executeCommand('eidos.openId', chosen.id, path.join(project.root, '.eidos'));
  });
  pick.onDidHide(() => pick.dispose());
  pick.show();
}

// ── New Task ───────────────────────────────────────────────────────────────

async function newTask(projects: Projects, given?: { project?: EidosProject; blueprint?: string; board?: string | null }): Promise<void> {
  const project = given?.project ?? (await projects.pick('New task in which project?'));
  const backlog = project?.index?.snapshot.backlog;
  if (!project || !backlog) {
    if (project) void vscode.window.showWarningMessage('Eidos: the Backlog plugin is off for this project, so it has no tasks to add to.');
    return;
  }
  const settings = backlog.settings;

  let board = given?.board ?? project.filter.board ?? null;
  if (settings.boards.length > 1 && !findBoard(settings, board)) {
    const chosen = await vscode.window.showQuickPick(
      settings.boards.map((candidate) => ({ label: candidate.title, description: candidate.name, name: candidate.name })),
      { placeHolder: 'The board it goes on' },
    );
    if (!chosen) return;
    board = chosen.name;
  }
  const boardName = findBoard(settings, board)?.name ?? null;

  const blueprint = given?.blueprint ? project.index?.blueprint(given.blueprint) : undefined;
  const title = await vscode.window.showInputBox({
    prompt: blueprint ? `A task serving ${blueprint.id} ${blueprint.title}` : 'The new task',
    placeHolder: 'Title',
    validateInput: (value) => (value.trim() ? null : 'A task needs a title'),
  });
  if (!title) return;

  const types = boardTypes(settings, boardName);
  let type = types[0] ?? 'default';
  if (types.length > 1) {
    const titles = new Map(settings.types.map((candidate) => [candidate.name, candidate.title]));
    const chosen = await vscode.window.showQuickPick(
      types.map((name) => ({ label: titles.get(name) ?? name, description: name === 'default' ? undefined : name, name })),
      { placeHolder: 'The kind of task' },
    );
    if (!chosen) return;
    type = chosen.name;
  }

  const args = ['backlog', 'add', title.trim(), '--type', type];
  if (boardName) args.push('--board', boardName);
  if (blueprint) args.push('--for', blueprint.id);
  const task = await project.writeJson(args, readTask);
  if (!task) return;
  await vscode.window.showTextDocument(vscode.Uri.file(path.join(project.root, task.file)), { preview: false });
}

// ── The checklist and the notes ────────────────────────────────────────────

async function activeTask(projects: Projects, file: string | undefined) {
  const target = file ?? vscode.window.activeTextEditor?.document.uri.fsPath;
  const found = target ? projects.entityAt(target) : undefined;
  if (found?.entity.kind !== 'task') {
    void vscode.window.showWarningMessage('Eidos: open a task in the editor first.');
    return undefined;
  }
  return { project: found.project, task: found.entity.task, file: path.join(found.project.root, found.entity.task.file) };
}

async function tick(projects: Projects, given?: { file: string; key: string; n: number }): Promise<void> {
  const found = await activeTask(projects, given?.file);
  if (!found) return;
  let key = given?.key;
  let n = given?.n;
  if (key === undefined || n === undefined) {
    const document = await vscode.workspace.openTextDocument(found.file);
    const open = taskLayout(document.getText(), sectionsOf(found.project, found.task)).checklist.filter((line) => !line.done);
    if (open.length === 0) {
      void vscode.window.showInformationMessage(`Eidos: every checklist line of ${found.task.id} is ticked.`);
      return;
    }
    const chosen = await vscode.window.showQuickPick(
      open.map((line) => ({ label: `#${line.n} ${line.text}`, line })),
      { placeHolder: `Tick a line of ${found.task.id}` },
    );
    if (!chosen) return;
    key = chosen.line.key;
    n = chosen.line.n;
  }
  await found.project.write(['backlog', 'check', found.task.id, String(n), '--in', key], found.file);
}

async function appendNote(projects: Projects, given?: { file: string; key: string }): Promise<void> {
  const found = await activeTask(projects, given?.file);
  if (!found) return;
  const key = given?.key ?? sectionsOf(found.project, found.task).find((section) => section.type === 'text' && /(^|-)notes$/.test(section.key))?.key;
  if (!key) {
    void vscode.window.showWarningMessage(`Eidos: a ${found.task.type || 'default'} task has no notes section to append to.`);
    return;
  }
  const note = await vscode.window.showInputBox({ prompt: `A note for ${found.task.id}, added at the end of its ${key} section`, placeHolder: 'What you learned' });
  if (!note?.trim()) return;
  await found.project.write(['backlog', 'set', found.task.id, '--append', `${key}=${note.trim()}`], found.file);
}

// ── Fixes, Open in Eidos, filters ──────────────────────────────────────────

async function runFix(projects: Projects, file: string, command: string): Promise<void> {
  const project = projects.forFile(file);
  if (!project) return;
  const args = command.split(/\s+/).slice(1);
  const dirty = vscode.workspace.textDocuments.filter((document) => document.isDirty && project.contains(document.uri.fsPath));
  const run = 'Run';
  const unsaved = dirty.length > 0 ? ` ${dirty.length} file(s) in the project have unsaved edits and are saved first.` : '';
  const answer = await vscode.window.showWarningMessage(`Run \`${command}\` in ${project.name}? It may change more files than this one.${unsaved}`, { modal: true }, run);
  if (answer !== run) return;
  for (const document of dirty) {
    if (!(await document.save())) return;
  }
  await project.write(args, null);
}

async function openInEidos(projects: Projects, file?: string): Promise<void> {
  const target = file ?? vscode.window.activeTextEditor?.document.uri.fsPath;
  const found = target ? projects.entityAt(target) : undefined;
  let name: string | undefined;
  if (found?.entity.kind === 'blueprint') name = found.entity.blueprint.id;
  else if (found?.entity.kind === 'task') name = found.entity.task.id;
  // The desktop app's eidosmd:// link carries only a sign-in today, so it cannot name a project or a file (docs/gaps.md)
  const copy = 'Copy Id';
  let message = 'Eidos MD cannot be opened at a file yet: its eidosmd:// link carries only a sign-in, not a project or a file.';
  if (name) message = `Eidos MD cannot be opened at ${name} yet: its eidosmd:// link carries only a sign-in, not a project or a file. Open the project in Eidos MD and go to ${name} there.`;
  const answer = await vscode.window.showInformationMessage(message, ...(name ? [copy] : []));
  if (answer === copy && name) await vscode.env.clipboard.writeText(name);
}

async function filterBacklog(projects: Projects, given?: EidosProject): Promise<void> {
  const project = isProject(given) ? given : await projects.pick();
  const index = project?.index;
  const backlog = index?.snapshot.backlog;
  if (!project || !backlog) return;
  const settings = backlog.settings;
  const filter = project.filter;
  const options: Array<vscode.QuickPickItem & { run: () => Promise<void> | void }> = [];
  if (settings.boards.length > 0) options.push({ label: 'Board', description: filter.board ?? 'all', run: () => choose('Board', settings.boards.map((board) => ({ label: board.title, value: board.name })), (value) => project.setFilter({ board: value })) });
  options.push({ label: 'Milestone', description: filter.milestone ?? 'any', run: () => choose('Milestone', settings.milestones.map((milestone) => ({ label: milestone.name, value: milestone.name })), (value) => project.setFilter({ milestone: value })) });
  options.push({ label: 'Assignee', description: filter.assignee ? `@${filter.assignee}` : 'anyone', run: () => choose('Assignee', index.snapshot.users.map((user) => ({ label: `@${user.alias}`, description: user.name, value: user.alias })), (value) => project.setFilter({ assignee: value })) });
  options.push({ label: 'Assigned to me', description: filter.assignedToMe ? 'on' : 'off', run: () => vscode.commands.executeCommand('eidos.toggleAssignedToMe') as Promise<void> });
  options.push({ label: 'Search…', description: filter.search || 'none', run: () => vscode.commands.executeCommand('eidos.searchBacklog', project) as Promise<void> });
  options.push({ label: 'Clear every filter', run: () => project.setFilter({ board: null, milestone: null, assignee: null, assignedToMe: false, type: null, priority: null, search: '' }) });
  const chosen = await vscode.window.showQuickPick(options, { placeHolder: 'Filter the backlog (the board shares these filters)' });
  if (chosen) await chosen.run();
}

async function choose(what: string, values: Array<{ label: string; value: string | null; description?: string }>, apply: (value: string | null) => void): Promise<void> {
  const any: { label: string; value: string | null } = { label: `Any ${what.toLowerCase()}`, value: null };
  const chosen = await vscode.window.showQuickPick([any, ...values], { placeHolder: what });
  if (chosen) apply(chosen.value);
}
