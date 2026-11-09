// The Properties view (REQ4): follows the file in the active editor, draws a
// blueprint's or a task's frontmatter as a form, and turns each change into
// `eidos property set` or `eidos backlog set`, so the file in the editor
// changes with it. On any other file it says it follows Eidos files.
import * as vscode from 'vscode';
import path from 'node:path';
import { blueprintChange, blueprintForm, taskChange, taskForm } from '../core/form.ts';
import type { FieldValue, Form } from '../core/form.ts';
import type { PropertiesState, PropertiesToExtension } from '../webview/protocol.ts';
import type { Projects } from './projects.ts';
import type { EidosProject } from './project.ts';
import type { Entity } from '../core/model.ts';
import { webviewHtml, webviewOptions } from './webviewHtml.ts';

export class PropertiesView implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly id = 'eidos.properties';
  private view: vscode.WebviewView | undefined;
  private file: string | null = null;
  private busy = false;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly projects: Projects;
  private readonly extensionUri: vscode.Uri;

  constructor(projects: Projects, extensionUri: vscode.Uri) {
    this.projects = projects;
    this.extensionUri = extensionUri;
    vscode.window.onDidChangeActiveTextEditor((editor) => this.follow(editor), null, this.disposables);
    projects.onDidChangeProject(() => this.post(), null, this.disposables);
    projects.onDidChangeProjects(() => this.post(), null, this.disposables);
    this.follow(vscode.window.activeTextEditor);
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = webviewOptions(this.extensionUri);
    view.webview.html = webviewHtml(view.webview, this.extensionUri, 'properties', 'Properties');
    view.webview.onDidReceiveMessage((message: PropertiesToExtension) => void this.receive(message), null, this.disposables);
    view.onDidChangeVisibility(() => this.post(), null, this.disposables);
  }

  // A panel or an output pane taking focus is not a file opening: the form stays on the last editor's file
  private follow(editor: vscode.TextEditor | undefined): void {
    if (!editor) {
      if (vscode.window.visibleTextEditors.length === 0) this.file = null;
    } else if (editor.document.uri.scheme === 'file') {
      this.file = editor.document.uri.fsPath;
    } else {
      return;
    }
    this.post();
  }

  private current(): { project: EidosProject; entity: Entity } | undefined {
    if (!this.file) return undefined;
    return this.projects.entityAt(this.file);
  }

  private state(): PropertiesState {
    if (!this.file) return { kind: 'empty', text: 'Properties follows the Eidos file open in the editor. Open a blueprint or a task to edit its properties here.' };
    const found = this.current();
    if (!found) {
      const project = this.projects.forFile(this.file);
      if (project && !project.index) return { kind: 'empty', text: project.failure ?? 'Reading the project…' };
      return { kind: 'empty', text: `${path.basename(this.file)} is not an Eidos file. Open a blueprint or a task to edit its properties here.` };
    }
    const index = found.project.index;
    if (!index) return { kind: 'empty', text: 'Reading the project…' };
    let form: Form;
    if (found.entity.kind === 'blueprint') form = blueprintForm(index, found.entity.blueprint);
    else form = taskForm(index, found.entity.task);
    return { kind: 'form', form, busy: this.busy };
  }

  private post(): void {
    if (!this.view?.visible) return;
    void this.view.webview.postMessage(this.state());
  }

  private async receive(message: PropertiesToExtension): Promise<void> {
    if (message.type === 'ready') {
      this.post();
      return;
    }
    if (message.type === 'open') {
      await vscode.commands.executeCommand('eidos.openId', message.id, this.file ?? undefined);
      return;
    }
    const found = this.current();
    if (!found) return;
    const { project, entity } = found;
    if (message.type === 'newTask') {
      if (entity.kind === 'blueprint') await vscode.commands.executeCommand('eidos.newTask', { project, blueprint: entity.blueprint.id });
      return;
    }
    if (message.type === 'openInEidos') {
      await vscode.commands.executeCommand('eidos.openInEidos', this.file);
      return;
    }
    if (message.type === 'openBoard') {
      await vscode.commands.executeCommand('eidos.openBoard', project);
      return;
    }
    if (message.type === 'set') {
      await this.change(project, entity, message.field, message.value);
      return;
    }
    if (message.type === 'remove') {
      const current = this.listValue(entity, message.field);
      await this.change(project, entity, message.field, current.filter((value) => value !== message.value));
      return;
    }
    if (message.type === 'pick') {
      const added = await this.pick(project, entity, message.field);
      if (added === undefined) return;
      const current = this.listValue(entity, message.field);
      if (current.includes(added)) return;
      await this.change(project, entity, message.field, [...current, added]);
    }
  }

  private listValue(entity: Entity, field: string): string[] {
    if (entity.kind === 'task') {
      if (field === 'assignee') return entity.task.assignee;
      if (field === 'blueprints') return entity.task.blueprints.map((served) => served.id);
      const value = entity.task.properties[field];
      return Array.isArray(value) ? value.map(String) : [];
    }
    const value = entity.blueprint.properties[field];
    if (Array.isArray(value)) return value.map(String);
    return [];
  }

  // A chip is added from a Quick Pick of what the framework allows: the project's users, its blueprints, or the property's options
  private async pick(project: EidosProject, entity: Entity, field: string): Promise<string | undefined> {
    const snapshot = project.index?.snapshot;
    if (!snapshot) return undefined;
    if (field === 'assignee') {
      const chosen = await vscode.window.showQuickPick(
        snapshot.users.map((user) => ({ label: `@${user.alias}`, description: user.name, alias: user.alias })),
        { placeHolder: 'Assign to' },
      );
      return chosen?.alias;
    }
    if (field === 'blueprints') {
      const chosen = await vscode.window.showQuickPick(
        snapshot.blueprints.map((blueprint) => ({ label: blueprint.title, description: blueprint.id, detail: blueprint.summary ?? undefined, id: blueprint.id })),
        { placeHolder: 'A blueprint this task serves', matchOnDescription: true, matchOnDetail: true },
      );
      return chosen?.id;
    }
    const declarations = entity.kind === 'task' ? (snapshot.backlog?.settings.properties ?? []) : snapshot.framework.properties.custom;
    const declared = declarations.find((declaration) => declaration.name === field);
    if (declared?.options) return vscode.window.showQuickPick(declared.options, { placeHolder: `Add to ${field}` });
    return vscode.window.showInputBox({ prompt: `Add to ${field}` });
  }

  private async change(project: EidosProject, entity: Entity, field: string, value: FieldValue): Promise<void> {
    let args: string[];
    let file: string;
    if (entity.kind === 'blueprint') {
      args = blueprintChange(entity.blueprint.id, field, value);
      file = project.index?.absolute(entity.blueprint.path) ?? '';
    } else {
      args = taskChange(entity.task.id, field, value);
      file = project.index?.absolute(entity.task.file) ?? '';
    }
    this.busy = true;
    this.post();
    try {
      const written = await project.write(args, file);
      // a task's file is named by its id and title, so a new title moves the file the editor showed
      const before = entity.kind === 'task' ? entity.task : undefined;
      const renamed = before ? project.index?.task(before.id) : undefined;
      if (written && before && renamed && renamed.file !== before.file) {
        const moved = project.index?.absolute(renamed.file);
        if (moved) await vscode.window.showTextDocument(vscode.Uri.file(moved), { preview: false });
      }
    } finally {
      this.busy = false;
      this.post();
    }
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
  }
}
