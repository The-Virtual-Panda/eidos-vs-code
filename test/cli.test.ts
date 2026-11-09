import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, chmodSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CliError, commandName, EidosCli } from '../src/core/cli.ts';
import type { Binary } from '../src/core/cli.ts';
import { readBlueprints } from '../src/core/shapes.ts';

const dir = mkdtempSync(path.join(tmpdir(), 'eidos-fake-'));
function fake(name: string): string {
  const file = path.join(dir, name);
  copyFileSync(path.join(import.meta.dirname, 'fixtures', 'fake-eidos.cjs'), file);
  chmodSync(file, 0o755);
  return file;
}
const carried: Binary = { path: fake('eidos-0.21.0'), version: '0.21.0', source: 'bundled' };
const older = fake('eidos-0.20.0');
const newer = fake('eidos-0.22.0');
const broken = fake('eidos-0.22.0-broken');

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

test('names a command by its words before its arguments', () => {
  assert.equal(commandName(['backlog', 'set', 'T-A00', '--status', 'Done']), 'backlog set');
  assert.equal(commandName(['list', '--project', '/x']), 'list');
  assert.equal(commandName(['property', 'set', '@B-A45', 'maturity', 'Mature']), 'property set');
});

test('runs the carried eidos as its own version, past any project pin', async () => {
  const cli = new EidosCli(host(), carried);
  const result = await cli.run(['runs-as'], { cwd: dir });
  assert.deepEqual(JSON.parse(result.stdout), { runsAs: '0.21.0' });
});

test('an eidos.path older than the carried one is not used, and says so once', async () => {
  const h = host();
  const cli = new EidosCli(h, carried);
  await cli.configure(older);
  await cli.configure(older);
  assert.equal(cli.active?.path, carried.path);
  assert.equal(h.notices.length, 1);
  assert.match(h.notices[0] ?? '', /0\.20\.0.*older than 0\.21\.0/);
});

test('an eidos.path the same or newer is used', async () => {
  const cli = new EidosCli(host(), carried);
  await cli.configure(newer);
  assert.equal(cli.active?.version, '0.22.0');
  assert.equal(cli.active?.source, 'setting');
  const list = await cli.json(['list'], readBlueprints, { cwd: dir });
  assert.equal(list[0]?.id, 'B-A45');
});

test('a read whose --json does not read falls back to the carried eidos, said once per command', async () => {
  const h = host();
  const cli = new EidosCli(h, carried);
  await cli.configure(broken);
  const list = await cli.json(['list'], readBlueprints, { cwd: dir });
  await cli.json(['list'], readBlueprints, { cwd: dir });
  assert.equal(list[0]?.id, 'B-A45');
  assert.equal(h.notices.length, 1);
  assert.match(h.notices[0] ?? '', /eidos list --json.*0\.22\.0.*0\.21\.0/);
});

test('a command that cannot run fails with the reason the CLI gives', async () => {
  const cli = new EidosCli(host(), carried);
  await assert.rejects(cli.run(['fail'], { cwd: dir }), (error: unknown) => {
    assert.ok(error instanceof CliError);
    assert.equal(error.code, 2);
    assert.match(error.message, /no framework/);
    return true;
  });
});
