// Prints the GitHub release notes for the version package.json names: its CHANGELOG.md entry, then how to
// install, with the file for each platform scripts/package.mjs makes. The release workflow publishes them.
//
//   node scripts/release-notes.mjs > release-notes.md
import { readFileSync } from 'node:fs';
import { platforms } from './fetch-eidos.mjs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const entry = changelog.split(/^## /m).find((section) => section.split('\n')[0].trim() === version);
if (!entry) {
  console.error(`✗ CHANGELOG.md has no entry for ${version}: add a "## ${version}" section before tagging v${version}`);
  process.exit(1);
}
const body = entry.slice(entry.indexOf('\n') + 1).trim();

const labels = {
  'darwin-arm64': 'macOS, Apple Silicon',
  'darwin-x64': 'macOS, Intel',
  'win32-x64': 'Windows, x64',
  'linux-x64': 'Linux, x64',
  'linux-arm64': 'Linux, Arm64',
  'alpine-x64': 'Alpine Linux, x64',
  'alpine-arm64': 'Alpine Linux, Arm64',
};
const missing = Object.keys(platforms).filter((target) => !labels[target]);
if (missing.length > 0) {
  console.error(`✗ no platform name for ${missing.join(', ')}; add it to the labels in scripts/release-notes.mjs`);
  process.exit(1);
}
const file = (target) => `eidos-${target}-${version}.vsix`;

console.log(`${body}

**Install:** search for **Eidos** in the extensions view of Cursor, Windsurf, or VSCodium ([Open VSX](https://open-vsx.org/extension/the-virtual-panda/eidos)). To install by hand, in VS Code or any of them, download the file for your platform below and run **Extensions: Install from VSIX…**, or:

\`\`\`bash
code --install-extension ${file('darwin-arm64')}
\`\`\`

| Platform | File |
| --- | --- |
${Object.keys(labels)
  .map((target) => `| ${labels[target]} | \`${file(target)}\` |`)
  .join('\n')}

**Open in Eidos** needs Eidos MD 0.22 or later.

The extension's code is MIT. The \`eidos\` binary inside each file keeps the CLI's own license; see NOTICE.`);
