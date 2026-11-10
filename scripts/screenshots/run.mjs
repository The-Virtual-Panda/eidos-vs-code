// Opens the extension in an Extension Development Host on a scratch copy of a project and walks it through the
// poses in poses.cjs, the ones the README shows. At each pose it writes <pose>.ready in the poses folder and
// waits for <pose>.done, so whoever is taking the pictures captures the window in between.
//
//   node scripts/screenshots/run.mjs <a folder holding an Eidos project>
//
// The site's Reelhouse root (eidosmd site/scripts/screenshots/.work/roots/reel) is the one the README uses:
// a made-up product, so no real project's specs are shown. The copy is removed when the host closes.
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runTests } from '@vscode/test-electron';

const source = process.argv[2];
if (!source || !existsSync(source)) {
  console.error('usage: node scripts/screenshots/run.mjs <a folder holding an Eidos project>');
  process.exit(2);
}
const scratch = mkdtempSync(path.join(tmpdir(), 'eidos-host-'));
const project = path.join(scratch, 'reelhouse');
cpSync(source, project, { recursive: true, filter: (file) => !file.includes(`${path.sep}.git`) });

// a code file whose comments name a blueprint and a task, for the hover, and the module it imports
mkdirSync(path.join(project, 'src', 'player'), { recursive: true });
mkdirSync(path.join(project, 'src', 'api'), { recursive: true });
writeFileSync(
  path.join(project, 'src', 'api', 'position.ts'),
  'export async function savePosition(position: { profileId: string; filmId: string; seconds: number }) {\n  return position;\n}\n',
);
writeFileSync(
  path.join(project, 'src', 'player', 'resume.ts'),
  [
    "import { savePosition } from '../api/position';",
    '',
    '// B-V63 REQ2: report progress every ten seconds while a film plays (T-K48.2)',
    'export function reportProgress(profileId: string, filmId: string, seconds: number) {',
    '  return savePosition({ profileId, filmId, seconds: Math.floor(seconds) });',
    '}',
    '',
  ].join('\n'),
);

const poses = path.join(scratch, 'poses');
mkdirSync(poses);
const userData = path.join(scratch, 'user-data');
mkdirSync(path.join(userData, 'User'), { recursive: true });
writeFileSync(
  path.join(userData, 'User', 'settings.json'),
  JSON.stringify(
    {
      'workbench.colorTheme': 'Default Dark Modern',
      'workbench.startupEditor': 'none',
      'workbench.tips.enabled': false,
      'workbench.secondarySideBar.defaultVisibility': 'hidden',
      'workbench.layoutControl.enabled': false,
      'window.restoreWindows': 'none',
      'window.commandCenter': false,
      'editor.minimap.enabled': false,
      'editor.fontSize': 13,
      'chat.disableAIFeatures': true,
      'chat.commandCenter.enabled': false,
      'git.enabled': false,
      'update.mode': 'none',
      'telemetry.telemetryLevel': 'off',
      'extensions.ignoreRecommendations': true,
      'security.workspace.trust.enabled': false,
    },
    null,
    2,
  ),
);

const macCode = '/Applications/Visual Studio Code.app/Contents/MacOS/Electron';
console.log(`poses: ${poses}`);
try {
  await runTests({
    vscodeExecutablePath: process.env.VSCODE_PATH ?? (existsSync(macCode) ? macCode : undefined),
    extensionDevelopmentPath: path.resolve('.'),
    extensionTestsPath: path.resolve('scripts/screenshots/poses.cjs'),
    launchArgs: [project, '--extensions-dir', path.join(scratch, 'extensions'), '--user-data-dir', userData, '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust',
      // keep drawing while the window sits behind others, so a capture shows the pose and not the last frame drawn
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling'],
    extensionTestsEnv: { EIDOS_SHOTS_POSES: poses, EIDOS_SHOTS_PROJECT: project },
  });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
