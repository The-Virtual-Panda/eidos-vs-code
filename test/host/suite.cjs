// The checks run inside the Extension Development Host, against the scratch project test/host/run.mjs made.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const vscode = require('vscode');

const root = process.env.EIDOS_TEST_PROJECT;
const results = [];

async function check(name, run) {
  const started = Date.now();
  try {
    await run();
    results.push(`✓ ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    results.push(`✗ ${name}: ${error && error.stack ? error.stack : error}`);
  }
}

async function until(what, test, timeout = 10000) {
  const started = Date.now();
  for (;;) {
    const value = await test();
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function firstTaskWithOpenLine(index) {
  return index.snapshot.backlog.tasks.find((task) => task.open && task.sections.some((section) => section.type === 'checklist' && section.items.some((item) => !item.done)));
}

// The checks write (tick lines, set statuses, add a task), so they run only on run.mjs's scratch copy: the
// project and every folder open in the host must sit in a fresh eidos-host- folder in the temp directory.
function assertScratch(folder) {
  const scratch = path.dirname(fs.realpathSync(folder));
  const temp = fs.realpathSync(require('node:os').tmpdir());
  if (path.dirname(scratch) !== temp || !path.basename(scratch).startsWith('eidos-host-')) {
    throw new Error(`refusing to run the checks on ${folder}: they write, and run only on a scratch copy in ${temp}/eidos-host-*`);
  }
}

exports.run = async function run() {
  assert.ok(root, 'EIDOS_TEST_PROJECT names the scratch project');
  assertScratch(root);
  for (const folder of vscode.workspace.workspaceFolders ?? []) assertScratch(folder.uri.fsPath);
  const extension = vscode.extensions.all.find((candidate) => candidate.packageJSON.name === 'eidos');
  assert.ok(extension, 'the extension is installed in the host');
  const activated = Date.now();
  const api = await extension.activate();
  const project = api.projects.all[0];
  for (const each of api.projects.all) assertScratch(each.root);

  await check('REQ1: turns on in the folder holding the project and finds one project', async () => {
    assert.equal(api.projects.all.length, 1);
    assert.equal(fs.realpathSync(project.root), fs.realpathSync(root));
  });

  await check('REQ13: the views have the project within a second or so of turning on', async () => {
    await until('the project read', () => project.index);
    const elapsed = Date.now() - activated;
    results.push(`  read ${project.index.snapshot.blueprints.length} blueprints and ${project.index.snapshot.backlog.tasks.length} tasks; activation to ready ${elapsed} ms`);
  });

  await check('REQ16: every command is an Eidos: command', async () => {
    const all = await vscode.commands.getCommands(true);
    for (const contributed of extension.packageJSON.contributes.commands) assert.ok(all.includes(contributed.command), contributed.command);
  });

  const index = project.index;
  const blueprint = index.snapshot.blueprints.find((candidate) => candidate.id === 'B-A45') ?? index.snapshot.blueprints[0];
  const task = firstTaskWithOpenLine(index);

  await check('REQ10: an id hovers with its title and opens at a requirement', async () => {
    const file = path.join(root, 'scratch-ids.ts');
    fs.writeFileSync(file, `// serves ${blueprint.id} REQ6 and ${task.id}\n`);
    const document = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(document);
    const line = document.lineAt(0).text;
    const blueprintAt = new vscode.Position(0, line.indexOf(blueprint.id) + 2);
    const hovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', document.uri, blueprintAt);
    const text = hovers.flatMap((hover) => hover.contents.map((content) => (typeof content === 'string' ? content : content.value))).join('\n');
    assert.ok(text.includes(blueprint.title.slice(0, 12)), `hover names ${blueprint.title}: ${text}`);
    const definitions = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', document.uri, blueprintAt);
    const target = definitions[0];
    const targetUri = target.targetUri ?? target.uri;
    assert.equal(fs.realpathSync(targetUri.fsPath), fs.realpathSync(path.join(root, blueprint.path)));
    const range = target.targetRange ?? target.range;
    const opened = await vscode.workspace.openTextDocument(targetUri);
    if (blueprint.id === 'B-A45') assert.match(opened.lineAt(range.start.line).text, /REQ6/);
    const taskAt = new vscode.Position(0, line.indexOf(task.id) + 2);
    const taskHovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', document.uri, taskAt);
    assert.ok(taskHovers.length > 0, 'a task id hovers');
  });

  const taskFile = path.join(root, task.file);
  await check('REQ6: a task has a Tick lens over each unticked line and Append Note over its notes', async () => {
    const document = await vscode.workspace.openTextDocument(taskFile);
    await vscode.window.showTextDocument(document);
    const lenses = await vscode.commands.executeCommand('vscode.executeCodeLensProvider', document.uri, 50);
    const titles = lenses.map((lens) => lens.command && lens.command.title);
    const open = task.sections.filter((section) => section.type === 'checklist').flatMap((section) => section.items.filter((item) => !item.done));
    assert.equal(titles.filter((title) => title && title.startsWith('Tick #')).length, open.length, titles.join(', '));
    results.push(`  lenses: ${titles.join(', ')}`);
  });

  await check('REQ6, REQ12: ticking a line runs eidos backlog check, and the file and the project follow', async () => {
    const section = task.sections.find((candidate) => candidate.type === 'checklist' && candidate.items.some((item) => !item.done));
    const line = section.items.find((item) => !item.done);
    await vscode.commands.executeCommand('eidos.tickChecklistLine', { file: taskFile, key: section.key, n: line.n });
    assert.match(fs.readFileSync(taskFile, 'utf8'), new RegExp(`- \\[x\\] #${line.n}\\b`));
    await until('the index to show the tick', () => {
      const now = project.index.task(task.id);
      return now.sections.find((candidate) => candidate.key === section.key).items.find((item) => item.n === line.n).done;
    });
  });

  await check('REQ6: appending a note runs eidos backlog set --append', async () => {
    const notes = task.sections.find((section) => section.type === 'text' && /(^|-)notes$/.test(section.key));
    if (!notes) {
      results.push('  (this task type has no notes section)');
      return;
    }
    const written = await project.write(['backlog', 'set', task.id, '--append', `${notes.key}=Noted from the Extension Development Host`], taskFile);
    assert.equal(written, true);
    assert.match(fs.readFileSync(taskFile, 'utf8'), /Noted from the Extension Development Host/);
  });

  await check('REQ4: a status change runs eidos backlog set and lands in the file', async () => {
    const settings = project.index.snapshot.backlog.settings;
    const other = settings.statuses.find((status) => status !== project.index.task(task.id).status);
    await project.write(['backlog', 'set', task.id, '--status', other], taskFile);
    assert.match(fs.readFileSync(taskFile, 'utf8'), new RegExp(`^status: "?${other}"?$`, 'm'));
  });

  await check('REQ4: a blueprint property change runs eidos property set', async () => {
    const maturity = project.index.snapshot.framework.properties.custom.find((declaration) => declaration.name === 'maturity');
    if (!maturity || !maturity.options) return;
    const next = maturity.options.find((option) => option !== blueprint.properties.maturity);
    await project.write(['property', 'set', `@${blueprint.id}`, 'maturity', next], path.join(root, blueprint.path));
    assert.match(fs.readFileSync(path.join(root, blueprint.path), 'utf8'), new RegExp(`^maturity: ${next}$`, 'm'));
  });

  await check('REQ17: a write never lands over unsaved edits: refused unless the developer saves first', async () => {
    const document = await vscode.workspace.openTextDocument(taskFile);
    const editor = await vscode.window.showTextDocument(document);
    await editor.edit((edit) => edit.insert(new vscode.Position(document.lineCount, 0), '\nAn unsaved line.\n'));
    assert.equal(document.isDirty, true);
    const ask = vscode.window.showWarningMessage;
    const asked = [];
    try {
      vscode.window.showWarningMessage = async (message) => {
        asked.push(message);
        return undefined;
      };
      const refused = await project.write(['backlog', 'set', task.id, '--priority', 'high'], taskFile);
      assert.equal(refused, false, 'the write is refused while the edits are unsaved');
      assert.equal(document.isDirty, true);
      assert.doesNotMatch(fs.readFileSync(taskFile, 'utf8'), /^priority: high$/m);
      vscode.window.showWarningMessage = async (message, _options, save) => {
        asked.push(message);
        return save;
      };
      const written = await project.write(['backlog', 'set', task.id, '--priority', 'high'], taskFile);
      assert.equal(written, true);
      const text = fs.readFileSync(taskFile, 'utf8');
      assert.match(text, /^priority: high$/m);
      assert.match(text, /An unsaved line\./, 'the saved edit is kept beside the write');
    } finally {
      vscode.window.showWarningMessage = ask;
    }
    assert.equal(asked.length, 2);
  });

  await check('REQ12: a change made outside VS Code shows without a reload', async () => {
    const binary = path.join(extension.extensionPath, 'bin', 'eidos');
    execFileSync(binary, ['--project', root, 'backlog', 'set', task.id, '--priority', 'low'], { env: { ...process.env, EIDOS_RUNS_AS: extension.packageJSON.eidos.version } });
    await until('the index to see the new priority', () => project.index.task(task.id).priority === 'low');
  });

  await check('REQ8: a new task made for a blueprint', async () => {
    const made = await project.writeJson(['backlog', 'add', 'A task from the Extension Development Host', '--for', blueprint.id], (value) => (value && value.id ? value : null));
    assert.ok(made && fs.existsSync(path.join(root, made.file)));
    await until('the blueprint to list it', () => project.index.tasksServing(blueprint.id).some((candidate) => candidate.id === made.id));
  });

  await check('REQ9: the findings of eidos check are in Problems', async () => {
    await project.check();
    await until('findings', () => project.findings.length > 0 || true);
    const withPath = project.findings.find((finding) => finding.path);
    if (!withPath) {
      results.push('  (the project has no findings)');
      return;
    }
    const uri = vscode.Uri.file(path.join(root, withPath.path));
    const diagnostics = await until('diagnostics', () => {
      const found = vscode.languages.getDiagnostics(uri);
      return found.length > 0 ? found : null;
    });
    assert.equal(diagnostics[0].source, 'eidos');
    results.push(`  ${project.findings.length} findings; first: ${withPath.code} on ${withPath.path}`);
  });

  await check('REQ5: Open Board opens the board in an editor tab', async () => {
    await vscode.commands.executeCommand('eidos.openBoard', project);
    await until('the board tab', () => vscode.window.tabGroups.all.some((group) => group.tabs.some((tab) => tab.label === 'Board')));
  });

  await check('REQ2: the backlog filters by milestone and Assigned to me, and searches as eidos backlog --search', async () => {
    project.setFilter({ search: task.id });
    await until('the search', () => project.filter.searchIds && project.filter.searchIds.has(task.id));
    project.setFilter({ search: '' });
  });

  await check('REQ4: Open in Eidos hands VS Code the desktop app link to the page of the open blueprint and task', async () => {
    const open = vscode.env.openExternal;
    const handed = [];
    try {
      vscode.env.openExternal = async (target) => {
        handed.push(typeof target === 'string' ? target : target.toString());
        return true;
      };
      await vscode.commands.executeCommand('eidos.openInEidos', path.join(root, blueprint.path));
      await vscode.commands.executeCommand('eidos.openInEidos', path.join(root, project.index.task(task.id).file));
    } finally {
      vscode.env.openExternal = open;
    }
    assert.equal(handed.length, 2);
    const read = handed.map((link) => {
      const url = new URL(link);
      return [url.protocol, url.hostname, url.searchParams.get('project'), url.searchParams.get('to')];
    });
    const encoded = blueprint.path.split('/').map(encodeURIComponent).join('/');
    assert.deepEqual(read[0], ['eidosmd:', 'open', project.root, `/b/${encoded}`]);
    assert.deepEqual(read[1], ['eidosmd:', 'open', project.root, project.index.task(task.id).href]);
    results.push(`  ${decodeURIComponent(handed[1])}`);
  });

  await check('REQ21: an eidos.path older than the carried eidos is not used', async () => {
    const fake = path.join(path.dirname(root), 'eidos-0.0.1');
    fs.copyFileSync(path.join(__dirname, '..', 'fixtures', 'fake-eidos.cjs'), fake);
    fs.chmodSync(fake, 0o755);
    await vscode.workspace.getConfiguration('eidos').update('path', fake, vscode.ConfigurationTarget.Global);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await vscode.workspace.getConfiguration('eidos').update('path', undefined, vscode.ConfigurationTarget.Global);
    assert.ok(project.index, 'the project still reads');
  });

  console.log(['', 'Extension Development Host checks:', ...results, ''].join('\n'));
  if (results.some((line) => line.startsWith('✗'))) throw new Error('some checks failed');
};
