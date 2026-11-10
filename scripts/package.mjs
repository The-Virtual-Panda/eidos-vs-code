// Packages one platform's VSIX: the eidos binary for that target fetched into bin/ (scripts/fetch-eidos.mjs),
// the extension built, and vsce run with --target, so each VSIX carries only its own platform's eidos (REQ14).
//
//   node scripts/package.mjs [target...]     targets default to this machine's; `all` packages every one
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { currentTarget, fetchEidos, platforms } from './fetch-eidos.mjs';

const asked = process.argv.slice(2);
let targets = asked.length > 0 ? asked : [currentTarget()];
if (targets.includes('all')) targets = Object.keys(platforms);
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

execFileSync('node', ['scripts/build.mjs'], { stdio: 'inherit' });
for (const target of targets) {
  await fetchEidos(target);
  const out = `eidos-${target}-${version}.vsix`;
  execFileSync('pnpm', ['exec', 'vsce', 'package', '--no-dependencies', '--target', target, '--out', out], { stdio: 'inherit' });
  console.log(`✓ ${out}`);
}
