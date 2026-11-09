#!/usr/bin/env node
// A stand-in eidos for the runner's tests: its version and how it answers come from its file name.
const path = require('node:path');
const name = path.basename(process.argv[1]);
const version = /eidos-(\d+\.\d+\.\d+)/.exec(name)?.[1] ?? '0.21.0';
const broken = name.includes('broken');
const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log(`eidosmd ${version} (standard 5.10.0)`);
  process.exit(0);
}
if (args[0] === 'runs-as') {
  console.log(JSON.stringify({ runsAs: process.env.EIDOS_RUNS_AS ?? null }));
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
