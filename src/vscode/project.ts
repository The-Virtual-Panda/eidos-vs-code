// One Eidos project in a workspace folder: what the extension last read of it
// through the CLI's --json, read again when a file in it changes (REQ12,
// REQ13), and every write to it, which never lands over unsaved edits (REQ17).
import * as vscode from 'vscode';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { CliError, firstLine } from '../core/cli.ts';
import type { EidosCli } from '../core/cli.ts';
import { ProjectIndex, emptyFilter, whoAmI } from '../core/model.ts';
import type { BacklogFilter, Snapshot } from '../core/model.ts';
import { readBacklog, readBlueprints, readCheck, readFramework, readTaskIds, readUsers, readWhoami } from '../core/shapes.ts';
import type { Backlog, Finding } from '../core/shapes.ts';
import type { Notices } from './notices.ts';

// Files the CLI writes for itself on a read (each task's change history, and on a project's first run the
// seat's me.md and local settings), which change nothing the views draw
const ownWrites = [
  /[\\/]\.eidos[\\/]plugins[\\/]backlog[\\/]history[\\/]/,
  /[\\/]\.eidos[\\/]plugins[\\/][^\\/]+[\\/]local([\\/]|\.yaml$)/,
  /[\\/]\.eidos[\\/]me\.md$/,
  /[\\/]\.git[\\/]/,
];

// What a read takes in: the framework with the users, the blueprints, and the backlog, each its own command
type Part = 'framework' | 'blueprints' | 'backlog';
const allParts: Part[] = ['framework', 'blueprints', 'backlog'];

// A backlog command writes tasks (and the Tasks region of a blueprint, which `eidos list` does not show);
// `property` writes a blueprint; any other command, a fix among them, may write anything
function partsWritten(args: string[]): Part[] {
  if (args[0] === 'backlog') return ['backlog'];
  if (args[0] === 'property') return ['blueprints'];
  return allParts;
}

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
  private readonly pending = new Set<Part>();
  private readonly scheduled = new Set<Part>();
  private lastReadStarted = 0;
  private writing = 0;
  private checking: Promise<void> | null = null;
  private checkAgain = false;
  private writes: Promise<unknown> = Promise.resolve();

  constructor(folder: vscode.WorkspaceFolder, root: string, cli: EidosCli, notices: Notices) {
    this.folder = folder;
    this.root = root;
    this.cli = cli;
    this.notices = notices;

    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '**/*.{md,yaml,yml,json}'));
    const onFile = (uri: vscode.Uri) => void this.fileChanged(uri);
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

  // A change made while a write of the extension's own runs is read by the read that follows the write,
  // and one the last read already saw is not read again
  private async fileChanged(uri: vscode.Uri): Promise<void> {
    if (ownWrites.some((pattern) => pattern.test(uri.fsPath))) return;
    if (this.writing > 0) return;
    const modified = await stat(uri.fsPath)
      .then((stats) => stats.mtimeMs)
      .catch(() => null);
    if (modified !== null && modified < this.lastReadStarted) return;
    this.scheduleRead(this.partsFor(uri.fsPath));
    this.scheduleCheck();
  }

  // What a file's change asks to read again: the framework and everything for `.eidos/`, the backlog for its folder, else the blueprints
  private partsFor(file: string): Part[] {
    const relative = path.relative(this.root, file);
    if (relative.startsWith(`.eidos${path.sep}`)) return allParts;
    const folder = this.index?.snapshot.backlog?.folder;
    if (folder && relative.startsWith(`${folder}${path.sep}`)) return ['backlog'];
    return ['blueprints'];
  }

  private saved(document: vscode.TextDocument): void {
    if (!this.contains(document.uri.fsPath)) return;
    this.scheduleCheck();
  }

  scheduleRead(parts: Part[] = allParts, delay = 250): void {
    for (const part of parts) this.scheduled.add(part);
    clearTimeout(this.readTimer);
    this.readTimer = setTimeout(() => {
      const asked = [...this.scheduled];
      this.scheduled.clear();
      void this.read(asked);
    }, delay);
  }

  scheduleCheck(delay = 1200): void {
    clearTimeout(this.checkTimer);
    this.checkTimer = setTimeout(() => void this.check(), delay);
  }

  // Reads the parts asked for, each by its command, all at once. One asked for while a read runs is made after
  // it, and the caller's promise settles only once a read that began after the ask is done.
  read(parts: Part[] = allParts): Promise<void> {
    for (const part of parts) this.pending.add(part);
    if (this.reading) return this.reading;
    this.reading = this.readUntilCurrent();
    return this.reading;
  }

  private async readUntilCurrent(): Promise<void> {
    try {
      while (this.pending.size > 0) {
        const parts = new Set(this.pending);
        this.pending.clear();
        this.lastReadStarted = Date.now();
        await this.readOnce(parts);
      }
    } finally {
      this.reading = null;
    }
  }

  private async readOnce(asked: Set<Part>): Promise<void> {
    const options = { cwd: this.root };
    // `--project` is the CLI's global option, so it goes before the command
    const project = ['--project', this.root];
    // the first read, or one after a failure, reads every part
    const last = this.index?.snapshot ?? null;
    const reads = (part: Part) => last === null || asked.has(part);
    const noUsers = { users: [], acting: null };
    try {
      const [framework, blueprints, backlog, users, seat] = await Promise.all([
        reads('framework') ? this.cli.json([...project, 'framework'], readFramework, options) : last?.framework,
        reads('blueprints') ? this.cli.json([...project, 'list'], readBlueprints, options) : last?.blueprints,
        reads('backlog') ? this.readBacklog() : (last?.backlog ?? null),
        reads('framework') ? this.cli.json([...project, 'users', 'list'], readUsers, options).catch(() => noUsers) : { users: last?.users ?? [], acting: null },
        last === null ? this.cli.json([...project, 'whoami'], readWhoami, options).catch(() => null) : null,
      ]);
      if (!framework || !blueprints) throw new Error('the project was read in part before it was read whole');
      let me = last?.me ?? null;
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
      return await this.cli.json(['--project', this.root, 'backlog'], readBacklog, { cwd: this.root });
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

  // After any read in flight, so the two never compete for the machine; one asked for while a check runs follows it
  check(): Promise<void> {
    if (this.checking) {
      this.checkAgain = true;
      return this.checking;
    }
    this.checking = this.checkUntilCurrent();
    return this.checking;
  }

  private async checkUntilCurrent(): Promise<void> {
    try {
      do {
        this.checkAgain = false;
        if (this.reading) await this.reading;
        if (!this.index) return;
        try {
          const result = await this.cli.json(['--project', this.root, 'check'], readCheck, { cwd: this.root, acceptCodes: [0, 1] });
          this.findings = result.findings;
          this.checked.fire();
        } catch (error) {
          this.notices.log(`check: ${error instanceof Error ? error.message : String(error)}`);
        }
      } while (this.checkAgain);
    } finally {
      this.checking = null;
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
        const ids = await this.cli.json(['--project', this.root, 'backlog', '--search', words], readTaskIds, { cwd: this.root });
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
    return this.queued(async () => {
      try {
        await this.cli.run(['--project', this.root, ...args], { cwd: this.root });
        return true;
      } catch (error) {
        this.notices.show(`Eidos: \`eidos ${args.slice(0, 3).join(' ')}\` failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return false;
      }
    }, partsWritten(args));
  }

  // One write at a time; the files it changes are read once it is done, not by the watcher as it runs
  private async queued<T>(run: () => Promise<T>, parts: Part[]): Promise<T> {
    const turn = this.writes.then(async () => {
      this.writing++;
      try {
        return await run();
      } finally {
        this.writing--;
      }
    });
    this.writes = turn.catch(() => undefined);
    const result = await turn;
    await this.read(parts);
    this.scheduleCheck(300);
    return result;
  }

  // Runs a command whose --json the caller reads (`backlog add`), under the same queue as every write
  async writeJson<T>(args: string[], reader: (value: unknown) => T | null): Promise<T | null> {
    return this.queued(async () => {
      try {
        return await this.cli.json(['--project', this.root, ...args], reader, { cwd: this.root });
      } catch (error) {
        this.notices.show(`Eidos: \`eidos ${args.slice(0, 3).join(' ')}\` failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return null;
      }
    }, partsWritten(args));
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
