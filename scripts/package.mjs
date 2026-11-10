// Packages the extension as one VSIX for every platform: it carries no eidos, so nothing differs between them.
//
//   node scripts/package.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const out = `eidos-${version}.vsix`;

execFileSync('node', ['scripts/build.mjs'], { stdio: 'inherit' });
execFileSync('pnpm', ['exec', 'vsce', 'package', '--no-dependencies', '--out', out], { stdio: 'inherit' });
console.log(`✓ ${out}`);
