import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, parseVersionOutput } from '../src/core/version.ts';

test('reads the version eidos --version prints', () => {
  assert.equal(parseVersionOutput('eidosmd 0.21.0 (standard 5.10.0)\n'), '0.21.0');
  assert.equal(parseVersionOutput('eidosmd 0.22.0-rc.1 (standard 5.11.0)'), '0.22.0-rc.1');
  assert.equal(parseVersionOutput('no version here'), null);
});

test('orders versions as semver does', () => {
  assert.equal(compareVersions('0.21.0', '0.21.0'), 0);
  assert.equal(compareVersions('0.20.9', '0.21.0'), -1);
  assert.equal(compareVersions('0.21.1', '0.21.0'), 1);
  assert.equal(compareVersions('1.0.0', '0.99.99'), 1);
  assert.equal(compareVersions('0.22.0-rc.1', '0.22.0'), -1);
  assert.equal(compareVersions('0.22.0-rc.2', '0.22.0-rc.10'), -1);
  assert.equal(compareVersions('0.22.0-rc.1', '0.21.0'), 1);
});
