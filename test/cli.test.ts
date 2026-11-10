import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CliError, commandName, EidosCli, installedCandidates } from '../src/core/cli.ts';
import type { Candidate } from '../src/core/cli.ts';
import { readBlueprints } from '../src/core/shapes.ts';

const dir = mkdtempSync(path.join(tmpdir(), 'eidos-fake-'));
function fake(name: string): string {
  const file = path.join(dir, name);
  copyFileSync(path.join(import.meta.dirname, 'fixtures', 'fake-eidos.cjs'), file);
  chmodSync(file, 0o755);
  return file;
}
const minimum = '0.22.0';
const older = fake('eidos-0.20.0');
const current = fake('eidos-0.22.0');
const newer = fake('eidos-0.23.0');
const broken = fake('eidos-0.23.0-broken');
const nowhere = path.join(dir, 'no-eidos-here');

function project(pin?: string): string {
  const root = mkdtempSync(path.join(dir, 'project-'));
  mkdirSync(path.join(root, '.eidos'));
  if (pin) writeFileSync(path.join(root, 'pin'), `${pin}\n`);
  return root;
}

function host() {
  const notices: string[] = [];
  const said = new Set<string>();
  return {
    notices,
    notifyOnce(key: string, message: string) {
      if (said.has(key)) return;
      said.add(key);
      notices.push(message);
    },
    log() {},
  };
}

function installed(...paths: string[]): () => Candidate[] {
  return () => paths.map((file) => ({ path: file, source: 'path' }));
}

test('names a command by its words before its arguments', () => {
  assert.equal(commandName(['backlog', 'set', 'T-A00', '--status', 'Done']), 'backlog set');
  assert.equal(commandName(['list', '--project', '/x']), 'list');
  assert.equal(commandName(['--project', '/x', 'backlog', 'check', 'T-A00', '5']), 'backlog check');
  assert.equal(commandName(['property', 'set', '@B-A45', 'maturity', 'Mature']), 'property set');
});

test('looks on the PATH, then where the install script puts eidos', () => {
  assert.deepEqual(installedCandidates('darwin', {}, '/Users/me'), [
    { path: 'eidos', source: 'path' },
    { path: '/Users/me/.local/bin/eidos', source: 'install' },
  ]);
  assert.deepEqual(installedCandidates('linux', { EIDOS_INSTALL_DIR: '/opt/eidos' }, '/home/me')[1], { path: '/opt/eidos/eidos', source: 'install' });
  assert.deepEqual(installedCandidates('win32', { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, 'C:\\Users\\me'), [
    { path: 'eidos.exe', source: 'path' },
    { path: 'C:\\Users\\me\\AppData\\Local\\Programs\\eidos\\eidos.exe', source: 'install' },
  ]);
});

test('runs the first installed eidos the extension reads', async () => {
  const cli = new EidosCli(host(), minimum, installed(nowhere, older, current, newer));
  assert.equal(await cli.locate(''), 'ready');
  assert.equal(cli.binary?.path, current);
  assert.equal(cli.binary?.version, '0.22.0');
});

test('with no eidos installed, nothing runs and the reason says how to get one', async () => {
  const cli = new EidosCli(host(), minimum, installed(nowhere));
  assert.equal(await cli.locate(''), 'missing');
  assert.match(cli.problem ?? '', /not installed/);
  await assert.rejects(cli.run(['list'], { cwd: dir }), /not installed/);
});

test('with only an older eidos installed, it is not run and the reason names both versions', async () => {
  const cli = new EidosCli(host(), minimum, installed(older));
  assert.equal(await cli.locate(''), 'outdated');
  assert.equal(cli.binary, null);
  assert.equal(cli.outdated?.path, older);
  assert.match(cli.problem ?? '', /0\.20\.0.*0\.22\.0 or later/);
});

test('an eidos.path the extension reads comes before the installed one', async () => {
  const cli = new EidosCli(host(), minimum, installed(current));
  await cli.locate(newer);
  assert.equal(cli.binary?.path, newer);
  assert.equal(cli.binary?.source, 'setting');
});

test('an eidos.path older than the extension reads is not used, and says so once', async () => {
  const h = host();
  const cli = new EidosCli(h, minimum, installed(current));
  await cli.locate(older);
  await cli.locate(older);
  assert.equal(cli.binary?.path, current);
  assert.equal(h.notices.length, 1);
  assert.match(h.notices[0] ?? '', /0\.20\.0.*older than 0\.22\.0/);
});

test('in a project, eidos runs as the version the project pins', async () => {
  const cli = new EidosCli(host(), minimum, installed(newer));
  await cli.locate('');
  const result = await cli.run(['runs-as'], { cwd: project('0.22.1') });
  assert.deepEqual(JSON.parse(result.stdout), { runsAs: '0.22.1' });
});

test('a project pinning a version older than the extension reads runs as the installed eidos, said once', async () => {
  const h = host();
  const cli = new EidosCli(h, minimum, installed(newer));
  await cli.locate('');
  const root = project('0.18.0');
  const first = await cli.run(['runs-as'], { cwd: root });
  await cli.run(['runs-as'], { cwd: root });
  assert.deepEqual(JSON.parse(first.stdout), { runsAs: '0.23.0' });
  assert.equal(h.notices.length, 1);
  assert.match(h.notices[0] ?? '', /runs eidos 0\.18\.0.*as 0\.23\.0.*eidos version pin 0\.23\.0/);
});

test('a pin moved since is asked again once the project is forgotten', async () => {
  const cli = new EidosCli(host(), minimum, installed(newer));
  await cli.locate('');
  const root = project('0.18.0');
  await cli.run(['runs-as'], { cwd: root });
  writeFileSync(path.join(root, 'pin'), '0.22.0\n');
  cli.forgetProject(root);
  const result = await cli.run(['runs-as'], { cwd: root });
  assert.deepEqual(JSON.parse(result.stdout), { runsAs: '0.22.0' });
});

test('a read whose --json does not read fails naming the version the extension reads', async () => {
  const cli = new EidosCli(host(), minimum, installed(broken));
  await cli.locate('');
  await assert.rejects(cli.json(['list'], readBlueprints, { cwd: dir }), /eidos list --json.*0\.22\.0 or later/);
});

test('a read prints the --json the extension reads', async () => {
  const cli = new EidosCli(host(), minimum, installed(current));
  await cli.locate('');
  const list = await cli.json(['list'], readBlueprints, { cwd: dir });
  assert.equal(list[0]?.id, 'B-A45');
});

test('a command that cannot run fails with the reason the CLI gives', async () => {
  const cli = new EidosCli(host(), minimum, installed(current));
  await cli.locate('');
  await assert.rejects(cli.run(['fail'], { cwd: dir }), (error: unknown) => {
    assert.ok(error instanceof CliError);
    assert.equal(error.code, 2);
    assert.match(error.message, /no framework/);
    return true;
  });
});
