#!/usr/bin/env node
// A stand-in eidos for the runner's tests: its own version and how it answers come from its file name, and like
// the real one it runs as EIDOS_USE_VERSION when that is set, else as the version a `pin` file in its folder names.
const fs = require('node:fs');
const path = require('node:path');
const name = path.basename(process.argv[1]);
const own = /eidos-(\d+\.\d+\.\d+)/.exec(name)?.[1] ?? '0.22.0';
const pinFile = path.join(process.cwd(), 'pin');
const pinned = fs.existsSync(pinFile) ? fs.readFileSync(pinFile, 'utf8').trim() : null;
const runs = process.env.EIDOS_USE_VERSION || pinned || own;
const broken = name.includes('broken');
const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log(`eidosmd ${runs} (standard 5.10.0)`);
  process.exit(0);
}
if (args[0] === 'runs-as') {
  console.log(JSON.stringify({ runsAs: runs }));
  process.exit(0);
}
if (args[0] === 'fail') {
  console.error('the project has no framework (.eidos/Framework.yaml): run eidos install');
  process.exit(2);
}
if (args[0] === 'list') {
  if (broken) console.log(JSON.stringify({ blueprints: [] }));
  else console.log(JSON.stringify([{ id: 'B-A45', title: 'The VS Code Extension', summary: null, collection: 'specs', group: null, variant: null, path: 'specs/x.md', properties: {} }]));
  process.exit(0);
}
console.log('{}');
