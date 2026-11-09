// Which eidos runs, and running it (REQ14, REQ21). The extension carries its
// own eidos and runs it for every project, whatever version the project pins;
// `eidos.path` names another, used only when it is the same version or newer,
// and a read whose --json does not read as expected from that one runs again
// on the carried one, said once per command.
import { execFile } from 'node:child_process';
import { compareVersions, parseVersionOutput } from './version.ts';
import type { Reader } from './shapes.ts';

export interface Binary {
  path: string;
  version: string;
  source: 'bundled' | 'setting' | 'path';
}

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
  binary?: Binary;
}

const maxOutput = 256 * 1024 * 1024;

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
  for (const arg of args) {
    if (arg.startsWith('-') || arg.startsWith('@') || /[A-Z/.]/.test(arg) || words.length === 2) break;
    words.push(arg);
  }
  return words.join(' ');
}

export function spawnEidos(binary: Binary, args: string[], cwd: string): Promise<RunResult> {
  // EIDOS_RUNS_AS keeps the binary from handing the command to a version the project pins (D-D88)
  const env = { ...process.env, EIDOS_RUNS_AS: binary.version, NO_COLOR: '1', FORCE_COLOR: '0' };
  return new Promise((resolve, reject) => {
    execFile(binary.path, args, { cwd, env, maxBuffer: maxOutput, windowsHide: true }, (error, stdout, stderr) => {
      if (error && typeof error.code !== 'number') {
        reject(new CliError(args, -1, String(stderr), `could not run ${binary.path}: ${error.message}`));
        return;
      }
      const code = error && typeof error.code === 'number' ? error.code : 0;
      resolve({ stdout: String(stdout), stderr: String(stderr), code });
    });
  });
}

export async function askVersion(path: string, source: Binary['source']): Promise<Binary | null> {
  const probe: Binary = { path, version: '', source };
  try {
    const result = await spawnEidos(probe, ['--version'], process.cwd());
    if (result.code !== 0) return null;
    const version = parseVersionOutput(result.stdout);
    if (!version) return null;
    return { path, version, source };
  } catch {
    return null;
  }
}

export class EidosCli {
  private readonly host: CliHost;
  private bundled: Binary | null;
  private configured: Binary | null = null;

  constructor(host: CliHost, bundled: Binary | null) {
    this.host = host;
    this.bundled = bundled;
  }

  get active(): Binary | null {
    return this.configured ?? this.bundled;
  }

  get carried(): Binary | null {
    return this.bundled;
  }

  // Reads the `eidos.path` setting: asked its version, and kept only when it is not older than the one carried
  async configure(settingPath: string): Promise<void> {
    this.configured = null;
    const wanted = settingPath.trim();
    if (!wanted) return;
    const named = await askVersion(wanted, 'setting');
    if (!named) {
      this.host.notifyOnce(`path-unusable:${wanted}`, `Eidos: the eidos at ${wanted} (eidos.path) did not answer \`--version\`, so the extension runs ${this.describeCarried()}.`);
      return;
    }
    if (this.bundled && compareVersions(named.version, this.bundled.version) < 0) {
      this.host.notifyOnce(
        `path-older:${wanted}:${named.version}`,
        `Eidos: the eidos at ${wanted} (eidos.path) is ${named.version}, older than ${this.bundled.version}, the version this extension is built against, so the extension runs its own ${this.bundled.version}.`,
      );
      return;
    }
    this.configured = named;
    this.host.log(`eidos.path: ${wanted} (${named.version})`);
  }

  private describeCarried(): string {
    if (!this.bundled) return 'no other eidos';
    return `its own ${this.bundled.version}`;
  }

  async run(args: string[], options: RunOptions): Promise<RunResult> {
    const binary = options.binary ?? this.active;
    if (!binary) throw new CliError(args, -1, '', 'Eidos: no eidos to run. This build of the extension carries none for this platform; set eidos.path to an eidos.');
    const started = Date.now();
    const result = await spawnEidos(binary, args, options.cwd);
    this.host.log(`eidos ${args.join(' ')} → ${result.code} in ${Date.now() - started} ms (${binary.version}, ${binary.source})`);
    const accepted = options.acceptCodes ?? [0];
    if (!accepted.includes(result.code)) throw new CliError(args, result.code, result.stderr || result.stdout);
    return result;
  }

  // A read: the command's --json, read by `reader`; one that does not read from eidos.path's eidos runs on the carried one
  async json<T>(args: string[], reader: Reader<T>, options: RunOptions): Promise<T> {
    const withJson = args.includes('--json') ? args : [...args, '--json'];
    const binary = options.binary ?? this.active;
    const carried = this.bundled;
    const canFallBack = carried !== null && binary !== null && binary.path !== carried.path;
    const name = commandName(args);

    let failure: CliError | null = null;
    try {
      const result = await this.run(withJson, { ...options, binary: binary ?? undefined });
      const read = parseWith(result.stdout, reader);
      if (read !== null) return read;
      failure = new CliError(withJson, result.code, result.stderr, `Eidos: \`eidos ${name} --json\` did not print what the extension reads.`);
    } catch (error) {
      if (!(error instanceof CliError)) throw error;
      failure = error;
    }
    if (!canFallBack) throw failure;

    this.host.notifyOnce(
      `fallback:${name}:${binary.version}`,
      `Eidos: \`eidos ${name} --json\` from ${binary.version} (eidos.path) did not read as this extension expects, so it runs on its own ${carried.version} for that command.`,
    );
    const again = await this.run(withJson, { ...options, binary: carried });
    const reread = parseWith(again.stdout, reader);
    if (reread === null) throw new CliError(withJson, again.code, again.stderr, `Eidos: \`eidos ${name} --json\` did not print what the extension reads.`);
    return reread;
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
