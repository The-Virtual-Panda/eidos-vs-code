// The Eidos extension: turns on in a workspace holding an Eidos project
// (REQ1), finds the installed eidos it runs (REQ14, REQ21), offering to install
// or update it, and registers the views, the board, the editor features, and
// the commands, all on the CLI's --json.
import * as vscode from 'vscode';
import { EidosCli } from './core/cli.ts';
import { Notices } from './vscode/notices.ts';
import { registerSetup } from './vscode/setup.ts';
import { Projects } from './vscode/projects.ts';
import { BacklogTree, CoreTree } from './vscode/trees.ts';
import { PropertiesView } from './vscode/propertiesView.ts';
import { IdLinks, Problems, TaskLenses } from './vscode/editorFeatures.ts';
import { registerCommands } from './vscode/commands.ts';

// Where an id may be written: code, a comment, a commit message (REQ10)
const anywhere: vscode.DocumentSelector = [{ scheme: 'file' }, { scheme: 'untitled' }, { scheme: 'vscode-scm' }, { scheme: 'git' }];

// The projects are handed back only to the Extension Development Host's tests (test/host)
export async function activate(context: vscode.ExtensionContext): Promise<{ projects: Projects } | undefined> {
  const started = Date.now();
  const notices = new Notices();
  context.subscriptions.push(notices);

  const cli = new EidosCli(notices, readMinimumVersion(context.extension.packageJSON));
  const projects = new Projects(cli, notices);
  context.subscriptions.push(projects);
  const setup = registerSetup(cli, projects, notices);
  context.subscriptions.push(setup);

  const core = new CoreTree(projects);
  const backlog = new BacklogTree(projects);
  const properties = new PropertiesView(projects, context.extensionUri);
  const problems = new Problems(projects);
  const links = new IdLinks(projects);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('eidos.core', core),
    vscode.window.registerTreeDataProvider('eidos.backlog', backlog),
    vscode.window.registerWebviewViewProvider(PropertiesView.id, properties, { webviewOptions: { retainContextWhenHidden: true } }),
    properties,
    problems,
    vscode.languages.registerCodeLensProvider({ scheme: 'file', language: 'markdown' }, new TaskLenses(projects)),
    vscode.languages.registerCodeActionsProvider({ scheme: 'file' }, problems, { providedCodeActionKinds: Problems.kinds }),
    vscode.languages.registerHoverProvider(anywhere, links),
    vscode.languages.registerDefinitionProvider(anywhere, links),
    ...registerCommands({ projects, notices, cli, extensionUri: context.extensionUri }),
  );

  const rediscover = async () => {
    await projects.discover();
    await Promise.all(projects.all.filter((project) => !project.index).map((project) => project.read()));
  };
  const markers = vscode.workspace.createFileSystemWatcher('**/.eidos/Framework.{yaml,yml,json}', false, true, false);
  context.subscriptions.push(
    markers,
    markers.onDidCreate(() => void rediscover()),
    markers.onDidDelete(() => void rediscover()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => void rediscover()),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (!event.affectsConfiguration('eidos.path')) return;
      await setup.locate();
    }),
  );

  await projects.discover();
  // finds the eidos, then reads every project once one is ready
  await setup.locate();
  notices.log(`ready in ${Date.now() - started} ms: ${projects.all.map((project) => project.root).join(', ') || 'no Eidos project'} on eidos ${cli.binary?.version ?? cli.status} (${cli.binary?.path ?? '-'})`);
  if (context.extensionMode === vscode.ExtensionMode.Test) return { projects };
  return undefined;
}

// The oldest eidos this release reads, the one package.json names (eidos.minimum)
function readMinimumVersion(packageJson: unknown): string {
  if (typeof packageJson === 'object' && packageJson !== null && 'eidos' in packageJson) {
    const eidos = packageJson.eidos;
    if (typeof eidos === 'object' && eidos !== null && 'minimum' in eidos && typeof eidos.minimum === 'string') return eidos.minimum;
  }
  throw new Error('package.json names no eidos.minimum');
}

export function deactivate(): void {}
