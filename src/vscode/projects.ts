// The Eidos projects in the workspace (REQ1): one per workspace folder, found
// by its `.eidos/` marker at the folder or beneath it, the shallowest winning.
import * as vscode from 'vscode';
import path from 'node:path';
import type { EidosCli } from '../core/cli.ts';
import { EidosProject } from './project.ts';
import type { Notices } from './notices.ts';
import type { Entity } from '../core/model.ts';

const markers = '**/.eidos/Framework.{yaml,yml,json}';
const skipped = '{**/node_modules/**,**/.git/**}';

export class Projects implements vscode.Disposable {
  all: EidosProject[] = [];
  private readonly cli: EidosCli;
  private readonly notices: Notices;
  private readonly changedProjects = new vscode.EventEmitter<void>();
  private readonly changedAny = new vscode.EventEmitter<EidosProject>();
  private readonly checkedAny = new vscode.EventEmitter<EidosProject>();
  private readonly filteredAny = new vscode.EventEmitter<EidosProject>();
  readonly onDidChangeProjects = this.changedProjects.event;
  readonly onDidChangeProject = this.changedAny.event;
  readonly onDidCheckProject = this.checkedAny.event;
  readonly onDidFilterProject = this.filteredAny.event;
  private readonly perProject = new Map<EidosProject, vscode.Disposable[]>();

  constructor(cli: EidosCli, notices: Notices) {
    this.cli = cli;
    this.notices = notices;
  }

  async discover(): Promise<void> {
    const found = new Map<string, { folder: vscode.WorkspaceFolder; root: string }>();
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, markers), skipped, 50);
      const roots = files.map((file) => path.dirname(path.dirname(file.fsPath))).sort((left, right) => depth(left) - depth(right) || left.localeCompare(right));
      const root = roots[0];
      if (root) found.set(root, { folder, root });
    }

    for (const project of [...this.all]) {
      if (found.has(project.root)) continue;
      this.forget(project);
    }
    for (const { folder, root } of found.values()) {
      if (this.all.some((project) => project.root === root)) continue;
      const project = new EidosProject(folder, root, this.cli, this.notices);
      this.perProject.set(project, [
        project.onDidChange(() => this.changedAny.fire(project)),
        project.onDidCheck(() => this.checkedAny.fire(project)),
        project.onDidFilter(() => this.filteredAny.fire(project)),
      ]);
      this.all.push(project);
    }
    this.all.sort((left, right) => left.name.localeCompare(right.name));
    await vscode.commands.executeCommand('setContext', 'eidos.active', this.all.length > 0);
    this.changedProjects.fire();
  }

  private forget(project: EidosProject): void {
    for (const disposable of this.perProject.get(project) ?? []) disposable.dispose();
    this.perProject.delete(project);
    project.dispose();
    this.all = this.all.filter((other) => other !== project);
  }

  forFile(file: string): EidosProject | undefined {
    return this.all.find((project) => project.contains(file));
  }

  entityAt(file: string): { project: EidosProject; entity: Entity } | undefined {
    const project = this.forFile(file);
    const entity = project?.index?.atFile(file);
    if (!project || !entity) return undefined;
    return { project, entity };
  }

  // An id, looked for first in the project of the file it was found in, then in every other
  find(id: string, near?: string): { project: EidosProject; entity: Entity } | undefined {
    const first = near ? this.forFile(near) : undefined;
    const order = first ? [first, ...this.all.filter((project) => project !== first)] : this.all;
    for (const project of order) {
      const entity = project.index?.find(id);
      if (entity) return { project, entity };
    }
    return undefined;
  }

  // The project a command acts on: the active editor's, else the only one, else the one picked
  async pick(placeHolder = 'Which Eidos project?'): Promise<EidosProject | undefined> {
    const active = vscode.window.activeTextEditor?.document.uri.fsPath;
    const own = active ? this.forFile(active) : undefined;
    if (own) return own;
    if (this.all.length <= 1) return this.all[0];
    const chosen = await vscode.window.showQuickPick(
      this.all.map((project) => ({ label: project.name, description: project.root, project })),
      { placeHolder },
    );
    return chosen?.project;
  }

  dispose(): void {
    for (const project of [...this.all]) this.forget(project);
    this.changedProjects.dispose();
    this.changedAny.dispose();
    this.checkedAny.dispose();
    this.filteredAny.dispose();
  }
}

function depth(file: string): number {
  return file.split(path.sep).length;
}
