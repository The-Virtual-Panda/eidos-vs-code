// The page a webview loads (REQ15, REQ19): the extension's own script and
// style under a content security policy that allows nothing else, with
// VS Code's theme variables doing every colour and font.
import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';

export function webviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, script: 'properties' | 'board', title: string): string {
  const nonce = randomBytes(16).toString('base64');
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', `${script}.js`));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'webview.css'));
  const policy = [`default-src 'none'`, `img-src ${webview.cspSource}`, `font-src ${webview.cspSource}`, `style-src ${webview.cspSource}`, `script-src 'nonce-${nonce}'`].join('; ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${styleUri.toString()}">
<title>${title}</title>
</head>
<body class="${script}">
<main id="app" aria-live="polite"></main>
<script nonce="${nonce}" src="${scriptUri.toString()}"></script>
</body>
</html>`;
}

export function webviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
  return { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')] };
}
