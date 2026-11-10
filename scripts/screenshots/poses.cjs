// The poses the README's screenshots show, run inside the Extension Development Host run.mjs opens. Each pose
// sets the window up, writes <name>.ready, and waits for <name>.done before the next.
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

const poses = process.env.EIDOS_SHOTS_POSES;
const project = process.env.EIDOS_SHOTS_PROJECT;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = (command, ...args) => vscode.commands.executeCommand(command, ...args);
const log = (line) => fs.appendFileSync(path.join(poses, 'log.txt'), `${new Date().toISOString()} ${line}\n`);

async function pose(name, setUp) {
  await run('workbench.action.closeAllEditors');
  await run('workbench.action.closePanel');
  await run('workbench.action.closeAuxiliaryBar');
  await setUp();
  await run('notifications.clearAll');
  await sleep(2500);
  const done = path.join(poses, `${name}.done`);
  fs.writeFileSync(path.join(poses, `${name}.ready`), '');
  log(`ready ${name}`);
  for (let waited = 0; !fs.existsSync(done) && waited < 600000; waited += 250) await sleep(250);
  log(`done ${name}`);
}

async function open(rel, line = 0, column = 0) {
  const document = await vscode.workspace.openTextDocument(path.join(project, rel));
  const editor = await vscode.window.showTextDocument(document, { preview: false });
  const at = new vscode.Position(line, column);
  editor.selection = new vscode.Selection(at, at);
  editor.revealRange(new vscode.Range(at, at), vscode.TextEditorRevealType.AtTop);
  return editor;
}

exports.run = async function runPoses() {
  const extension = vscode.extensions.all.find((candidate) => candidate.packageJSON.name === 'eidos');
  const api = await extension.activate();
  for (let waited = 0; !api.projects.all[0]?.index && waited < 20000; waited += 250) await sleep(250);

  await pose('sidebar', async () => {
    await run('workbench.view.extension.eidos');
    await open('Blueprints/specs/playback/resume-playback.md');
    await run('eidos.core.focus');
    await run('list.focusFirst');
    await run('list.expand');
    await run('workbench.action.focusActiveEditorGroup');
  });

  await pose('task', async () => {
    await run('workbench.view.extension.eidos');
    await run('eidos.backlog.focus');
    await run('list.focusFirst');
    await run('list.expand');
    await open('Blueprints/backlog/t-k48-store-the-playback-position-per-profile.md');
    await run('workbench.action.focusActiveEditorGroup');
  });

  await pose('board', async () => {
    await run('workbench.view.explorer');
    await run('workbench.action.closeSidebar');
    await run('eidos.openBoard');
  });

  await pose('hover', async () => {
    await run('workbench.view.explorer');
    const editor = await open('src/player/resume.ts', 2, 5);
    editor.selection = new vscode.Selection(new vscode.Position(2, 5), new vscode.Position(2, 5));
    await sleep(800);
    await run('editor.action.showHover');
  });

  await pose('problems', async () => {
    await run('workbench.view.extension.eidos');
    await run('eidos.runCheck');
    await sleep(2000);
    const findings = vscode.languages.getDiagnostics().filter(([, diagnostics]) => diagnostics.length > 0);
    const finding = findings.find(([uri]) => uri.fsPath.includes(`${path.sep}specs${path.sep}`)) ?? findings[0];
    if (finding) {
      const document = await vscode.workspace.openTextDocument(finding[0]);
      await vscode.window.showTextDocument(document, { preview: false });
    }
    await run('workbench.actions.view.problems');
  });
};
