// What the extension adds to VS Code's own editor: a CodeLens to tick a
// checklist line and to append a note in a task (REQ6), `eidos check`'s
// findings in Problems with the fix the CLI names (REQ9), and ids that hover
// and open anywhere in the workspace (REQ10). Every answer comes from the
// project as last read, never a command run per request (REQ13).
import * as vscode from 'vscode';
import { findingsByFile } from '../core/model.ts';
import type { Finding, Task } from '../core/shapes.ts';
import { idAt, isNotesSection, requirementLine, taskLayout } from '../core/text.ts';
import type { Projects } from './projects.ts';
import type { EidosProject } from './project.ts';

export function sectionsOf(project: EidosProject, task: Task) {
  const settings = project.index?.snapshot.backlog?.settings;
  const type = settings?.types.find((candidate) => candidate.name === (task.type || 'default'));
  return type?.sections ?? task.sections.map((section) => ({ key: section.key, title: section.title, type: section.type }));
}

// ── CodeLens ───────────────────────────────────────────────────────────────

export class TaskLenses implements vscode.CodeLensProvider {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;
  private readonly projects: Projects;

  constructor(projects: Projects) {
    this.projects = projects;
    projects.onDidChangeProject(() => this.changed.fire());
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const found = this.projects.entityAt(document.uri.fsPath);
    if (found?.entity.kind !== 'task') return [];
    const task = found.entity.task;
    const layout = taskLayout(document.getText(), sectionsOf(found.project, task));
    const lenses: vscode.CodeLens[] = [];
    for (const line of layout.checklist) {
      if (line.done) continue;
      const range = new vscode.Range(line.line, 0, line.line, 0);
      lenses.push(new vscode.CodeLens(range, { title: `Tick #${line.n}`, command: 'eidos.tickChecklistLine', arguments: [{ file: document.uri.fsPath, key: line.key, n: line.n }], tooltip: `eidos backlog check ${task.id} ${line.n} --in ${line.key}` }));
    }
    for (const section of layout.sections) {
      if (!isNotesSection(section)) continue;
      const range = new vscode.Range(section.line, 0, section.line, 0);
      lenses.push(new vscode.CodeLens(range, { title: 'Append Note', command: 'eidos.appendNote', arguments: [{ file: document.uri.fsPath, key: section.key }], tooltip: `eidos backlog set ${task.id} --append ${section.key}=…` }));
    }
    return lenses;
  }
}

// ── Problems ───────────────────────────────────────────────────────────────

// The command a finding's message names for its fix, `(eidos linter --fix)` or `` `eidos backlog ids` ``.
// The CLI's --json carries a fix only as a button label for the app's page, so the command is read from
// the message's text: matched here alone, against the wording `eidos check` uses today.
export function fixCommand(finding: Finding): string | null {
  const named = /[(`](eidos [a-z][a-z:-]*(?: [a-z-][a-z:-]*)*(?: --[a-z-]+)*)[)`]/.exec(finding.message);
  return named?.[1] ?? null;
}

export class Problems implements vscode.CodeActionProvider, vscode.Disposable {
  static readonly kinds = [vscode.CodeActionKind.QuickFix];
  private readonly collection = vscode.languages.createDiagnosticCollection('eidos');
  private readonly byProject = new Map<EidosProject, vscode.Uri[]>();
  private readonly fixes = new WeakMap<vscode.Diagnostic, string>();

  constructor(projects: Projects) {
    projects.onDidCheckProject((project) => this.show(project));
  }

  private show(project: EidosProject): void {
    for (const uri of this.byProject.get(project) ?? []) this.collection.delete(uri);
    const framework = project.index?.snapshot.framework;
    if (!framework) return;
    const uris: vscode.Uri[] = [];
    for (const [file, findings] of findingsByFile(project.root, framework.file, project.findings)) {
      const uri = vscode.Uri.file(file);
      uris.push(uri);
      this.collection.set(uri, findings.map((finding) => this.diagnostic(finding)));
    }
    this.byProject.set(project, uris);
  }

  private diagnostic(finding: Finding): vscode.Diagnostic {
    const line = Math.max((finding.line ?? 1) - 1, 0);
    const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER);
    const severity = finding.level === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
    const diagnostic = new vscode.Diagnostic(range, finding.message, severity);
    diagnostic.source = 'eidos';
    diagnostic.code = finding.code;
    const command = fixCommand(finding);
    if (command) this.fixes.set(diagnostic, command);
    return diagnostic;
  }

  provideCodeActions(document: vscode.TextDocument, _range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== 'eidos') continue;
      const command = this.fixes.get(diagnostic);
      if (!command) continue;
      const action = new vscode.CodeAction(`Run \`${command}\``, vscode.CodeActionKind.QuickFix);
      action.diagnostics = [diagnostic];
      action.command = { command: 'eidos.runFix', title: 'Run fix', arguments: [document.uri.fsPath, command] };
      actions.push(action);
    }
    return actions;
  }

  dispose(): void {
    this.collection.dispose();
  }
}

// ── Ids: hover and Go to Definition ────────────────────────────────────────

export class IdLinks implements vscode.HoverProvider, vscode.DefinitionProvider {
  private readonly projects: Projects;

  constructor(projects: Projects) {
    this.projects = projects;
  }

  private at(document: vscode.TextDocument, position: vscode.Position) {
    const line = document.lineAt(position.line).text;
    const match = idAt(line, position.character);
    if (!match) return undefined;
    const found = this.projects.find(match.id, document.uri.fsPath);
    if (!found) return undefined;
    const range = new vscode.Range(position.line, match.start, position.line, match.end);
    return { match, found, range };
  }

  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    const at = this.at(document, position);
    if (!at) return undefined;
    const { found, match } = at;
    const markdown = new vscode.MarkdownString(undefined, true);
    markdown.isTrusted = { enabledCommands: ['eidos.openId', 'eidos.openBoard'] };
    const open = `command:eidos.openId?${encodeURIComponent(JSON.stringify([match.id, document.uri.fsPath, match.requirement]))}`;
    if (found.entity.kind === 'blueprint') {
      const blueprint = found.entity.blueprint;
      const status = [blueprint.properties['maturity'], blueprint.properties['implementation_status'], blueprint.properties['status']].filter((value) => typeof value === 'string').join(' · ');
      markdown.appendMarkdown(`$(layers) \`${blueprint.id}\` **${escapeMarkdown(blueprint.title)}**`);
      if (match.requirement) markdown.appendMarkdown(` · ${match.requirement}`);
      markdown.appendMarkdown('\n\n');
      if (blueprint.summary) markdown.appendMarkdown(`${escapeMarkdown(blueprint.summary)}\n\n`);
      if (status) markdown.appendMarkdown(`${escapeMarkdown(status)}\n\n`);
      markdown.appendMarkdown(`[Open Blueprint](${open})`);
    } else {
      const task = found.entity.task;
      const people = task.assignee.map((alias) => `@${alias}`).join(' ');
      const facts = [task.status, task.priority, people].filter((value) => value).join(' · ');
      const description = task.sections.find((section) => section.type === 'text' && section.text.trim())?.text ?? '';
      markdown.appendMarkdown(`$(tasklist) \`${task.id}\` **${escapeMarkdown(task.title)}**\n\n`);
      if (facts) markdown.appendMarkdown(`${escapeMarkdown(facts)}\n\n`);
      if (description) markdown.appendMarkdown(`${escapeMarkdown(firstSentences(description))}\n\n`);
      const served = task.blueprints.map((blueprint) => blueprint.title ?? blueprint.id).join(', ');
      if (served) markdown.appendMarkdown(`Serves ${escapeMarkdown(served)}\n\n`);
      markdown.appendMarkdown(`[Open Task](${open}) · [Open Board](command:eidos.openBoard)`);
    }
    return new vscode.Hover(markdown, at.range);
  }

  async provideDefinition(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.LocationLink[] | undefined> {
    const at = this.at(document, position);
    if (!at) return undefined;
    const target = await locate(at.found.project, at.found.entity, at.match.requirement);
    if (!target) return undefined;
    return [{ originSelectionRange: at.range, targetUri: target.uri, targetRange: target.range }];
  }
}

// Where an id opens: its file, and for a blueprint id with a requirement label, that requirement's line
export async function locate(project: EidosProject, entity: NonNullable<ReturnType<Projects['find']>>['entity'], requirement: string | null): Promise<{ uri: vscode.Uri; range: vscode.Range } | undefined> {
  const index = project.index;
  if (!index) return undefined;
  const relative = entity.kind === 'blueprint' ? entity.blueprint.path : entity.task.file;
  const uri = vscode.Uri.file(index.absolute(relative));
  let line = 0;
  if (requirement) {
    const document = await vscode.workspace.openTextDocument(uri);
    line = requirementLine(document.getText(), requirement) ?? 0;
  }
  return { uri, range: new vscode.Range(line, 0, line, 0) };
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]<>#|]/g, '\\$&');
}

function firstSentences(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= 280) return flat;
  return `${flat.slice(0, 277)}…`;
}
