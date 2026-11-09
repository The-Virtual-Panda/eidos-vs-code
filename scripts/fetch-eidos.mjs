// Puts the eidos binary a VSIX carries in bin/: the CLI's release file for one
// VS Code target, at the version package.json names (eidos.version), checked
// against the SHA-256 the release publishes beside it, unpacked, and asked its
// version before it is kept. The binary keeps the CLI's own license (NOTICE).
//
//   node scripts/fetch-eidos.mjs [target]     target defaults to this machine's
//
// EIDOS_DOWNLOADS_URL points it at another host, as the CLI's install script does.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// VS Code's platform targets, each to the CLI's release platform
export const platforms = {
  'darwin-arm64': 'darwin-arm64',
  'darwin-x64': 'darwin-x64',
  'linux-x64': 'linux-x64',
  'linux-arm64': 'linux-arm64',
  'alpine-x64': 'linux-x64-musl',
  'alpine-arm64': 'linux-arm64-musl',
  'win32-x64': 'windows-x64',
};

export function currentTarget() {
  const os = process.platform === 'win32' ? 'win32' : process.platform;
  return `${os}-${process.arch}`;
}

export async function fetchEidos(target) {
  const platform = platforms[target];
  if (!platform) throw new Error(`no eidos binary for the target ${target}; the CLI's release files cover ${Object.keys(platforms).join(', ')}`);
  const version = JSON.parse(readFileSync('package.json', 'utf8')).eidos.version;
  const base = process.env.EIDOS_DOWNLOADS_URL ?? 'https://dl.eidosmd.com';
  const windows = platform.startsWith('windows');
  const archive = `eidos-${platform}.${windows ? 'zip' : 'tar.gz'}`;
  const url = `${base}/cli/v${version}/${archive}`;

  const tmp = mkdtempSync(path.join(tmpdir(), 'eidos-fetch-'));
  try {
    console.log(`Fetching eidos ${version} for ${target} (${platform}) from ${url}`);
    const body = await download(url);
    const expected = (await download(`${url}.sha256`)).toString('utf8').trim().split(/\s+/)[0];
    const actual = createHash('sha256').update(body).digest('hex');
    if (actual !== expected) throw new Error(`${archive} does not match its published checksum (${actual} against ${expected})`);
    const archivePath = path.join(tmp, archive);
    writeFileSync(archivePath, body);
    if (windows) execFileSync('tar', ['-xf', archivePath, '-C', tmp]);
    else execFileSync('tar', ['-xzf', archivePath, '-C', tmp]);

    const name = windows ? 'eidos.exe' : 'eidos';
    const unpacked = path.join(tmp, name);
    if (!existsSync(unpacked)) throw new Error(`${archive} holds no ${name}`);
    chmodSync(unpacked, 0o755);
    if (target === currentTarget()) {
      const said = execFileSync(unpacked, ['--version'], { encoding: 'utf8', env: { ...process.env, EIDOS_RUNS_AS: version } });
      if (!said.includes(version)) throw new Error(`the downloaded eidos says it is "${said.trim()}", not ${version}`);
    }

    rmSync('bin', { recursive: true, force: true });
    mkdirSync('bin', { recursive: true });
    renameSync(unpacked, path.join('bin', name));
    writeFileSync(path.join('bin', 'VERSION'), `${version}\n${target}\n`);
    console.log(`✓ bin/${name}: eidos ${version} for ${target}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`could not download ${url}: ${response.status} ${response.statusText}`);
  return Buffer.from(await response.arrayBuffer());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await fetchEidos(process.argv[2] ?? currentTarget());
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
