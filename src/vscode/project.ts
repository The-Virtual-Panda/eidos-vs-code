// One Eidos project in a workspace folder: what the extension last read of it
// through the CLI's --json, read again when a file in it changes (REQ12,
// REQ13), and every write to it, which never lands over unsaved edits (REQ17).
import * as vscode from 'vscode';
import path from 'node:path';
import { CliError, firstLine } from '../core/cli.ts';
import type { EidosCli } from '../core/cli.ts';
import { ProjectIndex, emptyFilter, whoAmI } from '../core/model.ts';
import type { BacklogFilter, Snapshot } from '../core/model.ts';
import { readBacklog, readBlueprints, readCheck, readFramework, readTaskIds, readUsers, readWhoami } from '../core/shapes.ts';
import type { Backlog, Finding } from '../core/shapes.ts';
import type { Notices } from './notices.ts';

// Files a read of the backlog writes itself (each task's change history), which change nothing the views draw
const ownWrites = [/[\\/]\.eidos[\\/]plugins[\\/]backlog[\\/]history[\\/]/, /[\\/]\.eidos[\\/]plugins[\\/][^\\/]+[\\/]local[\\/]/, /[\\/]\.git[\\/]/];

export class EidosProject implements vscode.Disposable {
  readonly root: string;
  readonly folder: vscode.WorkspaceFolder;
  index: ProjectIndex | null = null;
  findings: Finding[] = [];
  filter: BacklogFilter = emptyFilter();
  // why the project could not be read, said once (REQ20)
  failure: string | null = null;

  private readonly cli: EidosCli;
  private readonly notices: Notices;
  private readonly changed = new vscode.EventEmitter<void>();
  private readonly checked = new vscode.EventEmitter<void>();
  private readonly filtered = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  readonly onDidCheck = this.checked.event;
  readonly onDidFilter = this.filtered.event;
  private readonly disposables: vscode.Disposable[] = [];
  private readTimer: NodeJS.Timeout | undefined;
  private checkTimer: NodeJS.Timeout | undefined;
  private reading: Promise<void> | null = null;
  private readAgain = false;
  private writes: Promise<unknown> = Promise.resolve();

  constructor(folder: vscode.WorkspaceFolder, root: string, cli: EidosCli, notices: Notices) {
    this.folder = folder;
    this.root = root;
    this.cli = cli;
    this.notices = notices;

    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '**/*.{md,yaml,yml,json}'));
    const onFile = (uri: vscode.Uri) => this.fileChanged(uri);
    watcher.onDidChange(onFile, null, this.disposables);
    watcher.onDidCreate(onFile, null, this.disposables);
    watcher.onDidDelete(onFile, null, this.disposables);
    this.disposables.push(watcher, this.changed, this.checked, this.filtered);
    vscode.workspace.onDidSaveTextDocument((document) => this.saved(document), null, this.disposables);
  }

  get name(): string {
    if (this.root === this.folder.uri.fsPath) return this.folder.name;
    return `${this.folder.name}/${path.relative(this.folder.uri.fsPath, this.root)}`;
  }

  contains(file: string): boolean {
    const relative = path.relative(this.root, file);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  }

  private fileChanged(uri: vscode.Uri): void {
    if (ownWrites.some((pattern) => pattern.test(uri.fsPath))) return;
    this.scheduleRead();
    this.scheduleCheck();
  }

  private saved(document: vscode.TextDocument): void {
    if (!this.contains(document.uri.fsPath)) return;
    this.scheduleCheck();
  }

  scheduleRead(delay = 250): void {
    clearTimeout(this.readTimer);
    this.readTimer = setTimeout(() => void this.read(), delay);
  }

  scheduleCheck(delay = 1200): void {
    clearTimeout(this.checkTimer);
    this.checkTimer = setTimeout(() => void this.check(), delay);
  }

  // Reads the framework, the blueprints, and the backlog at once; one asked for while a read runs follows it
  async read(): Promise<void> {
    if (this.reading) {
      this.readAgain = true;
      return this.reading;
    }
    this.reading = this.readOnce();
    try {
      await this.reading;
    } finally {
      this.reading = null;
    }
    if (this.readAgain) {
      this.readAgain = false;
      await this.read();
    }
  }

  private async readOnce(): Promise<void> {
    const options = { cwd: this.root };
    const project = ['--project', this.root];
    try {
      const [framework, blueprints, backlog, users, seat] = await Promise.all([
        this.cli.json(['framework', ...project], readFramework, options),
        this.cli.json(['list', ...project], readBlueprints, options),
        this.readBacklog(),
        this.cli.json(['users', 'list', ...project], readUsers, options).catch(() => ({ users: [], acting: null })),
        this.index ? Promise.resolve(null) : this.cli.json(['whoami', ...project], readWhoami, options).catch(() => null),
      ]);
      let me = this.index?.snapshot.me ?? null;
      if (seat) me = whoAmI(users.users, users.acting, seat);
      const snapshot: Snapshot = { root: this.root, framework, blueprints, backlog, users: users.users, me };
      this.index = new ProjectIndex(snapshot);
      this.failure = null;
      await this.refreshSearch(false);
      this.changed.fire();
    } catch (error) {
      this.cannotOpen(error);
    }
  }

  // A project with the Backlog plugin off has no backlog to read
  private async readBacklog(): Promise<Backlog | null> {
    try {
      return await this.cli.json(['backlog', '--project', this.root], readBacklog, { cwd: this.root });
    } catch (error) {
      if (error instanceof CliError && error.code === 2) {
        this.notices.log(`backlog: ${firstLine(error.stderr)}`);
        return null;
      }
      throw error;
    }
  }

  // REQ20: said once, naming the fix as the CLI words it, and never a view left empty without a reason
  private cannotOpen(error: unknown): void {
    const reason = error instanceof Error ? error.message : String(error);
    this.failure = reason;
    this.notices.log(`${this.root}: ${reason}`);
    if (error instanceof CliError) this.notices.log(error.stderr);
    this.notices.notifyOnce(`open:${this.root}:${reason}`, `Eidos cannot open the project at ${this.name}: ${reason}`, 'error');
    this.changed.fire();
  }

  async check(): Promise<void> {
    if (!this.index) return;
    try {
      const result = await this.cli.json(['check', '--project', this.root], readCheck, { cwd: this.root, acceptCodes: [0, 1] });
      this.findings = result.findings;
      this.checked.fire();
    } catch (error) {
      this.notices.log(`check: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // A read for a command that shows its answer at once (a search in Quick Pick), outside the project's cache
  cliJson<T>(args: string[], reader: (value: unknown) => T | null, options: { cwd: string }): Promise<T> {
    return this.cli.json(args, reader, options);
  }

  // ── The backlog's filters, shared by the Backlog view and the board ──────

  setFilter(change: Partial<BacklogFilter>): void {
    this.filter = { ...this.filter, ...change };
    if (change.search !== undefined) {
      void this.refreshSearch(true);
      return;
    }
    this.filtered.fire();
  }

  // The search is the CLI's own (`eidos backlog --search`), so the view finds what the shell finds
  private async refreshSearch(fire: boolean): Promise<void> {
    const words = this.filter.search.trim();
    if (!words) {
      this.filter = { ...this.filter, searchIds: null };
    } else {
      try {
        const ids = await this.cli.json(['backlog', '--project', this.root, '--search', words], readTaskIds, { cwd: this.root });
        if (this.filter.search.trim() !== words) return;
        this.filter = { ...this.filter, searchIds: new Set(ids) };
      } catch (error) {
        this.notices.show(`Eidos: the search failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    }
    if (fire) this.filtered.fire();
  }

  // ── Writes ──────────────────────────────────────────────────────────────

  // Runs the command a person would run, one at a time, and reads the project again after it.
  // `touches` is the file the command writes: with unsaved edits open on it, the developer saves first (REQ17).
  async write(args: string[], touches: string | null): Promise<boolean> {
    if (touches && !(await this.readyToWrite(touches))) return false;
    const run = this.writes.then(async () => {
      try {
        await this.cli.run([...args, '--project', this.root], { cwd: this.root });
        return true;
      } catch (error) {
        this.notices.show(`Eidos: \`eidos ${args.slice(0, 3).join(' ')}\` failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return false;
      }
    });
    this.writes = run;
    const written = await run;
    await this.read();
    this.scheduleCheck(300);
    return written;
  }

  // Runs a command whose --json the caller reads (`backlog add`), under the same queue as every write
  async writeJson<T>(args: string[], reader: (value: unknown) => T | null): Promise<T | null> {
    const run = this.writes.then(async () => {
      try {
        return await this.cli.json([...args, '--project', this.root], reader, { cwd: this.root });
      } catch (error) {
        this.notices.show(`Eidos: \`eidos ${args.slice(0, 3).join(' ')}\` failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return null;
      }
    });
    this.writes = run;
    const result = await run;
    await this.read();
    this.scheduleCheck(300);
    return result;
  }

  private async readyToWrite(file: string): Promise<boolean> {
    const document = vscode.workspace.textDocuments.find((open) => open.uri.fsPath === file);
    if (!document?.isDirty) return true;
    const save = 'Save and Apply';
    const name = path.basename(file);
    const answer = await vscode.window.showWarningMessage(`${name} has unsaved edits. Eidos writes the change to the file on disk, so save it first, or neither change is kept whole.`, { modal: true }, save);
    if (answer !== save) return false;
    const saved = await document.save();
    if (!saved) {
      this.notices.show(`Eidos: ${name} was not saved, so the change was not made.`, 'warning');
      return false;
    }
    return true;
  }

  dispose(): void {
    clearTimeout(this.readTimer);
    clearTimeout(this.checkTimer);
    for (const disposable of this.disposables) disposable.dispose();
  }
}
