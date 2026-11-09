// Runs the extension in a VS Code Extension Development Host against a scratch
// copy of an Eidos project, and the checks in suite.cjs inside it.
//
//   node test/host/run.mjs <project>     the project is copied; the original is never written
//
// VSCODE_PATH names the VS Code to run (default: the installed one on macOS, else a download).
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runTests } from '@vscode/test-electron';

const source = process.argv[2] ?? process.env.EIDOS_TEST_PROJECT;
if (!source || !existsSync(path.join(source, '.eidos'))) {
  console.error('usage: node test/host/run.mjs <an Eidos project, copied before the test runs>');
  process.exit(2);
}
const scratch = mkdtempSync(path.join(tmpdir(), 'eidos-host-'));
const project = path.join(scratch, 'project');
cpSync(source, project, { recursive: true, filter: (file) => !file.includes(`${path.sep}.git${path.sep}`) });
const userData = path.join(scratch, 'user-data');
const macCode = '/Applications/Visual Studio Code.app/Contents/MacOS/Electron';
const vscodeExecutablePath = process.env.VSCODE_PATH ?? (existsSync(macCode) ? macCode : undefined);

try {
  await runTests({
    vscodeExecutablePath,
    // EIDOS_EXTENSION_PATH runs the checks on another build, an unpacked VSIX's extension/ folder
    extensionDevelopmentPath: path.resolve(process.env.EIDOS_EXTENSION_PATH ?? '.'),
    extensionTestsPath: path.resolve('test/host/suite.cjs'),
    launchArgs: [project, '--disable-extensions', '--user-data-dir', userData, '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust'],
    extensionTestsEnv: { EIDOS_TEST_PROJECT: project },
  });
} catch (error) {
  console.error(`✗ the Extension Development Host tests failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (!process.env.EIDOS_KEEP_SCRATCH) rmSync(scratch, { recursive: true, force: true });
}
