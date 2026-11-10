// Which eidos runs, and running it (REQ14, REQ21). The extension carries no
// eidos of its own: it runs the one the person installed, found by the
// `eidos.path` setting, then the PATH, then where the install script puts it.
// One older than the version this extension reads is not used. In a project,
// that eidos runs as the version the project pins, as every eidos does; a pin
// older than the extension reads runs as the installed eidos instead, said once.
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { compareVersions, parseVersionOutput } from './version.ts';
import type { Reader } from './shapes.ts';

export interface Binary {
  path: string;
  version: string;
  source: 'setting' | 'path' | 'install';
}

export interface Candidate {
  path: string;
  source: Binary['source'];
}

// ready: an eidos the extension reads; missing: none found; outdated: only ones older than the extension reads
export type CliStatus = 'ready' | 'missing' | 'outdated';

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

export class CliError extends Error {
  readonly args: string[];
  readonly code: number;
  readonly stderr: string;

  constructor(args: string[], code: number, stderr: string, message?: string) {
    super(message ?? (firstLine(stderr) || `eidos ${args.join(' ')} exited ${code}`));
    this.args = args;
    this.code = code;
    this.stderr = stderr;
  }
}

export interface CliHost {
  // a notice the person sees once; the host keeps it from repeating
  notifyOnce(key: string, message: string): void;
  log(line: string): void;
}

export interface RunOptions {
  cwd: string;
  // the exit codes that still carry the command's output: `eidos check` exits 1 on an error it found
  acceptCodes?: number[];
}

const maxOutput = 256 * 1024 * 1024;

// The CLI's own install commands (CLI Distribution REQ8)
export const installCommands = {
  unix: 'curl -fsSL https://eidosmd.com/install | sh',
  windows: 'irm https://eidosmd.com/install.ps1 | iex',
};

export function firstLine(text: string): string {
  return (
    text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ''
  );
}

// The command a notice names: its words before the first option or argument, `backlog set`, `check`
export function commandName(args: string[]): string {
  const words: string[] = [];
  let rest = args;
  while (rest[0] === '--project' || rest[0] === '--root') rest = rest.slice(2);
  for (const arg of rest) {
    if (arg.startsWith('-') || arg.startsWith('@') || /[A-Z/.]/.test(arg) || words.length === 2) break;
    words.push(arg);
  }
  return words.join(' ');
}

// Where an installed eidos is looked for after `eidos.path`: the PATH, then the install script's own folder,
// which a VS Code started outside a shell may not have on its PATH
export function installedCandidates(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env, home: string = homedir()): Candidate[] {
  if (platform === 'win32') {
    const local = env['LOCALAPPDATA'] ?? path.win32.join(home, 'AppData', 'Local');
    const folder = env['EIDOS_INSTALL_DIR'] ?? path.win32.join(local, 'Programs', 'eidos');
    return [
      { path: 'eidos.exe', source: 'path' },
      { path: path.win32.join(folder, 'eidos.exe'), source: 'install' },
    ];
  }
  const folder = env['EIDOS_INSTALL_DIR'] ?? path.posix.join(home, '.local', 'bin');
  return [
    { path: 'eidos', source: 'path' },
    { path: path.posix.join(folder, 'eidos'), source: 'install' },
  ];
}

export function spawnEidos(binary: string, args: string[], cwd: string, extraEnv: Record<string, string> = {}): Promise<RunResult> {
  const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ...extraEnv };
  return new Promise((resolve, reject) => {
    execFile(binary, args, { cwd, env, maxBuffer: maxOutput, windowsHide: true }, (error, stdout, stderr) => {
      if (error && typeof error.code !== 'number') {
        reject(new CliError(args, -1, String(stderr), `could not run ${binary}: ${error.message}`));
        return;
      }
      const code = error && typeof error.code === 'number' ? error.code : 0;
      resolve({ stdout: String(stdout), stderr: String(stderr), code });
    });
  });
}

// The version an eidos runs as in `cwd`: its own, a project's pin, or the person's default, as the CLI chooses
export async function askVersion(binary: string, cwd: string = homedir()): Promise<string | null> {
  try {
    const result = await spawnEidos(binary, ['--version'], cwd);
    if (result.code !== 0) return null;
    return parseVersionOutput(result.stdout);
  } catch {
    return null;
  }
}

export class EidosCli {
  status: CliStatus = 'missing';
  // the eidos every command runs, when the status is ready
  binary: Binary | null = null;
  // the first eidos found, when every one found is older than the extension reads
  outdated: Binary | null = null;
  readonly minimum: string;
  private readonly host: CliHost;
  private readonly candidates: () => Candidate[];
  private readonly projectEnv = new Map<string, Promise<Record<string, string>>>();

  constructor(host: CliHost, minimum: string, candidates: () => Candidate[] = () => installedCandidates()) {
    this.host = host;
    this.minimum = minimum;
    this.candidates = candidates;
  }

  // Finds the eidos to run: `eidos.path` when it names one the extension reads, else the first installed one it reads
  async locate(settingPath: string): Promise<CliStatus> {
    this.binary = null;
    this.outdated = null;
    this.projectEnv.clear();
    const wanted = settingPath.trim();
    const candidates: Candidate[] = [...(wanted ? [{ path: wanted, source: 'setting' as const }] : []), ...this.candidates()];
    for (const candidate of candidates) {
      const version = await askVersion(candidate.path);
      if (!version) {
        if (candidate.source === 'setting')
          this.host.notifyOnce(`path-unusable:${wanted}`, `Eidos: the eidos at ${wanted} (eidos.path) did not answer \`--version\`, so the extension looks for another.`);
        continue;
      }
      const found: Binary = { path: candidate.path, version, source: candidate.source };
      if (compareVersions(version, this.minimum) < 0) {
        if (candidate.source === 'setting') {
          this.host.notifyOnce(
            `path-older:${wanted}:${version}`,
            `Eidos: the eidos at ${wanted} (eidos.path) is ${version}, older than ${this.minimum}, the oldest this extension reads, so the extension looks for another.`,
          );
        }
        this.outdated ??= found;
        continue;
      }
      this.binary = found;
      break;
    }
    this.status = this.binary ? 'ready' : this.outdated ? 'outdated' : 'missing';
    if (this.binary) this.host.log(`eidos: ${this.binary.path} (${this.binary.version}, ${this.binary.source})`);
    else if (this.outdated) this.host.log(`eidos: only ${this.outdated.path} (${this.outdated.version}), older than ${this.minimum}`);
    else this.host.log('eidos: none installed');
    return this.status;
  }

  // Why nothing can run, in words for a view, or null when an eidos is ready
  get problem(): string | null {
    if (this.status === 'missing')
      return 'The Eidos CLI is not installed, and the extension reads and writes the project through it. Install it from the Eidos sidebar, or set Eidos: Path to an eidos installed elsewhere.';
    if (this.status === 'outdated' && this.outdated)
      return `The eidos installed here is ${this.outdated.version}, and this extension reads ${this.minimum} or later. Run Eidos: Update eidos, or \`eidos version update\` in a terminal.`;
    return null;
  }

  // The project's pin changed, so its version is asked again before its next command
  forgetProject(cwd: string): void {
    this.projectEnv.delete(cwd);
  }

  // What a command in `cwd` adds to its environment: nothing, so it runs as the version the project runs, unless
  // that version is older than the extension reads, when it runs as the installed eidos and says so once
  private envFor(binary: Binary, cwd: string): Promise<Record<string, string>> {
    let known = this.projectEnv.get(cwd);
    if (!known) {
      known = askVersion(binary.path, cwd).then((runs): Record<string, string> => {
        if (runs === null || compareVersions(runs, this.minimum) >= 0) return {};
        this.host.notifyOnce(
          `pin-older:${cwd}:${runs}`,
          `Eidos: the project at ${cwd} runs eidos ${runs}, older than ${this.minimum}, the oldest this extension reads, so the extension runs its commands there as ${binary.version}. \`eidos version pin ${binary.version}\` in the project moves everyone to that version.`,
        );
        return { EIDOS_USE_VERSION: binary.version };
      });
      this.projectEnv.set(cwd, known);
    }
    return known;
  }

  async run(args: string[], options: RunOptions): Promise<RunResult> {
    const binary = this.binary;
    if (!binary) throw new CliError(args, -1, '', `Eidos: ${this.problem ?? 'no eidos to run.'}`);
    const env = await this.envFor(binary, options.cwd);
    const started = Date.now();
    const result = await spawnEidos(binary.path, args, options.cwd, env);
    const runsAs = env['EIDOS_USE_VERSION'] ? `as ${env['EIDOS_USE_VERSION']}` : 'as the project runs';
    this.host.log(`eidos ${args.join(' ')} → ${result.code} in ${Date.now() - started} ms (${binary.version}, ${runsAs})`);
    const accepted = options.acceptCodes ?? [0];
    if (!accepted.includes(result.code)) throw new CliError(args, result.code, result.stderr || result.stdout);
    return result;
  }

  // A read: the command's --json, read by `reader`
  async json<T>(args: string[], reader: Reader<T>, options: RunOptions): Promise<T> {
    const withJson = args.includes('--json') ? args : [...args, '--json'];
    const result = await this.run(withJson, options);
    const read = parseWith(result.stdout, reader);
    if (read !== null) return read;
    throw new CliError(
      withJson,
      result.code,
      result.stderr,
      `Eidos: \`eidos ${commandName(args)} --json\` did not print what this extension reads. It reads eidos ${this.minimum} or later; \`eidos version list\` in the project says which version runs there.`,
    );
  }
}

function parseWith<T>(stdout: string, reader: Reader<T>): T | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  return reader(parsed);
}
