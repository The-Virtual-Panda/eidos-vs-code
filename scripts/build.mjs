// Builds the extension into dist/: extension.js, the CommonJS bundle VS Code
// loads (vscode is the host's), and the two webviews' scripts, each an IIFE
// for the browser with nothing loaded from outside (REQ19). --watch builds on
// every change.
import { context } from 'esbuild';

const watching = process.argv.includes('--watch');
const builds = [
  { entryPoints: ['src/extension.ts'], outfile: 'dist/extension.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node20', external: ['vscode'], sourcemap: watching, legalComments: 'none' },
  { entryPoints: ['src/webview/properties.ts'], outfile: 'dist/webview/properties.js', bundle: true, platform: 'browser', format: 'iife', target: 'es2022', legalComments: 'none' },
  { entryPoints: ['src/webview/board.ts'], outfile: 'dist/webview/board.js', bundle: true, platform: 'browser', format: 'iife', target: 'es2022', legalComments: 'none' },
  { entryPoints: ['src/webview/webview.css'], outfile: 'dist/webview/webview.css', bundle: true, legalComments: 'none' },
];

for (const options of builds) {
  const built = await context({ ...options, logLevel: 'info' });
  if (watching) await built.watch();
  else {
    await built.rebuild();
    await built.dispose();
  }
}
