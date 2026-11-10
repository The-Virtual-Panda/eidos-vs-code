// Prints the GitHub release notes for the version package.json names: its CHANGELOG.md entry, then how to
// install the one file scripts/package.mjs makes. The release workflow publishes them.
//
//   node scripts/release-notes.mjs > release-notes.md
import { readFileSync } from 'node:fs';

const { version, eidos } = JSON.parse(readFileSync('package.json', 'utf8'));
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const entry = changelog.split(/^## /m).find((section) => section.split('\n')[0].trim() === version);
if (!entry) {
  console.error(`✗ CHANGELOG.md has no entry for ${version}: add a "## ${version}" section before tagging v${version}`);
  process.exit(1);
}
const body = entry.slice(entry.indexOf('\n') + 1).trim();
const file = `eidos-${version}.vsix`;
const minimum = eidos.minimum.replace(/\.0$/, '');

console.log(`${body}

**Install:** search for **Eidos MD Specs and Backlog** in the extensions view of Cursor, Windsurf, or VSCodium ([Open VSX](https://open-vsx.org/extension/the-virtual-panda/eidos)). To install by hand, in VS Code or any of them, download \`${file}\` below and run **Extensions: Install from VSIX…**, or:

\`\`\`bash
code --install-extension ${file}
\`\`\`

The extension runs the Eidos CLI you install, ${minimum} or later, and offers to install it when there is none. **Open in Eidos** needs Eidos MD ${minimum} or later.`);
