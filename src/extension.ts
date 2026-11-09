// The Eidos extension: turns on in a workspace holding an Eidos project
// (REQ1), finds the eidos it runs (REQ14, REQ21), and registers the views,
// the board, the editor features, and the commands, all on the CLI's --json.
import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { askVersion, EidosCli } from './core/cli.ts';
import type { Binary } from './core/cli.ts';
import { Notices } from './vscode/notices.ts';
import { Projects } from './vscode/projects.ts';
import { BacklogTree, CoreTree } from './vscode/trees.ts';
import { PropertiesView } from './vscode/propertiesView.ts';
import { IdLinks, Problems, TaskLenses } from './vscode/editorFeatures.ts';
import { registerCommands } from './vscode/commands.ts';

// Where an id may be written: code, a comment, a commit message (REQ10)
const anywhere: vscode.DocumentSelector = [{ scheme: 'file' }, { scheme: 'untitled' }, { scheme: 'vscode-scm' }, { scheme: 'git' }];

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const started = Date.now();
  const notices = new Notices();
  context.subscriptions.push(notices);

  const bundled = await carriedBinary(context, notices);
  const cli = new EidosCli(notices, bundled);
  await cli.configure(vscode.workspace.getConfiguration('eidos').get<string>('path', ''));

  const projects = new Projects(cli, notices);
  context.subscriptions.push(projects);

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
      await cli.configure(vscode.workspace.getConfiguration('eidos').get<string>('path', ''));
      await Promise.all(projects.all.map((project) => project.read()));
    }),
  );

  await projects.discover();
  await Promise.all(projects.all.map((project) => project.read()));
  notices.log(`ready in ${Date.now() - started} ms: ${projects.all.map((project) => project.root).join(', ') || 'no Eidos project'} on eidos ${cli.active?.version ?? 'none'} (${cli.active?.source ?? '-'})`);
  for (const project of projects.all) project.scheduleCheck(0);
}

// The eidos this VSIX carries, at the version package.json names; a development build without one runs the eidos on the PATH
async function carriedBinary(context: vscode.ExtensionContext, notices: Notices): Promise<Binary | null> {
  const name = process.platform === 'win32' ? 'eidos.exe' : 'eidos';
  const file = vscode.Uri.joinPath(context.extensionUri, 'bin', name).fsPath;
  const packageJson: unknown = context.extension.packageJSON;
  const declared = readDeclaredVersion(packageJson);
  if (existsSync(file) && declared) return { path: file, version: declared, source: 'bundled' };

  const onPath = await askVersion(name, 'path');
  if (onPath) {
    notices.log(`this build carries no eidos; running the one on the PATH (${onPath.version})`);
    return onPath;
  }
  notices.notifyOnce('no-eidos', 'Eidos: this build of the extension carries no eidos for this platform and none is on the PATH. Set eidos.path to an eidos.', 'error');
  return null;
}

function readDeclaredVersion(packageJson: unknown): string | null {
  if (typeof packageJson !== 'object' || packageJson === null || !('eidos' in packageJson)) return null;
  const eidos = packageJson.eidos;
  if (typeof eidos !== 'object' || eidos === null || !('version' in eidos)) return null;
  return typeof eidos.version === 'string' ? eidos.version : null;
}

export function deactivate(): void {}
