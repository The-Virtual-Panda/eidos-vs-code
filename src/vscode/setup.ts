// The eidos the extension runs (REQ14, REQ21): found where the person installed
// it, and, when there is none or only one older than the extension reads,
// installed or updated from VS Code by the CLI's own commands, run as a task in
// the terminal so the person sees each step.
import * as vscode from 'vscode';
import { installCommands } from '../core/cli.ts';
import type { CliStatus, EidosCli } from '../core/cli.ts';
import type { Projects } from './projects.ts';
import type { Notices } from './notices.ts';

export interface Setup extends vscode.Disposable {
  // Finds the eidos again, then reads every project when one is ready
  locate(): Promise<CliStatus>;
}

export function registerSetup(cli: EidosCli, projects: Projects, notices: Notices): Setup {
  const offered = new Set<CliStatus>();
  let locating: Promise<CliStatus> | null = null;

  const locate = (): Promise<CliStatus> => {
    locating ??= (async () => {
      try {
        const status = await cli.locate(vscode.workspace.getConfiguration('eidos').get<string>('path', ''));
        await vscode.commands.executeCommand('setContext', 'eidos.cli', status);
        projects.refresh();
        if (status === 'ready') {
          await Promise.all(projects.all.map((project) => project.read()));
          for (const project of projects.all) project.scheduleCheck(0);
        } else if (projects.all.length > 0) {
          offer(status);
        }
        return status;
      } finally {
        locating = null;
      }
    })();
    return locating;
  };

  // Said once a session for each reason, with the step that fixes it
  const offer = (status: CliStatus): void => {
    if (offered.has(status)) return;
    offered.add(status);
    notices.log(cli.problem ?? status);
    if (status === 'missing') {
      void vscode.window
        .showWarningMessage('Eidos: the Eidos CLI is not installed, and the extension reads and writes the project through it.', 'Install the Eidos CLI', 'Set Eidos: Path')
        .then((choice) => {
          if (choice === 'Install the Eidos CLI') void install();
          else if (choice === 'Set Eidos: Path') void vscode.commands.executeCommand('workbench.action.openSettings', 'eidos.path');
        });
    } else if (status === 'outdated') {
      void vscode.window.showWarningMessage(`Eidos: ${cli.problem ?? ''}`, 'Update eidos').then((choice) => {
        if (choice) void update();
      });
    }
  };

  const install = async (): Promise<void> => {
    const execution =
      process.platform === 'win32' ? new vscode.ProcessExecution('powershell.exe', ['-NoProfile', '-Command', installCommands.windows]) : new vscode.ShellExecution(installCommands.unix);
    const code = await runTask('Install the Eidos CLI', execution);
    if (code !== 0) {
      notices.show('Eidos: the Eidos CLI was not installed; its terminal says why.', 'error');
      return;
    }
    const status = await locate();
    if (status === 'missing') notices.show('Eidos: the Eidos CLI was installed, but the extension cannot find it. Set Eidos: Path to the eidos its terminal names.', 'warning');
  };

  const update = async (): Promise<void> => {
    const binary = cli.outdated ?? cli.binary;
    if (!binary) return install();
    const code = await runTask('Update eidos', new vscode.ProcessExecution(binary.path, ['version', 'update']));
    if (code !== 0) {
      notices.show('Eidos: eidos was not updated; its terminal says why.', 'error');
      return;
    }
    const status = await locate();
    if (status === 'outdated') notices.show(`Eidos: eidos still runs ${cli.outdated?.version ?? 'an older version'} here, older than ${cli.minimum}; its terminal says why.`, 'warning');
  };

  const disposables: vscode.Disposable[] = [
    vscode.commands.registerCommand('eidos.installCli', install),
    vscode.commands.registerCommand('eidos.updateCli', update),
    // an eidos installed or updated outside VS Code is found when the window is next focused
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused && cli.status !== 'ready') void locate();
    }),
  ];

  return {
    locate,
    dispose: () => {
      for (const disposable of disposables) disposable.dispose();
    },
  };
}

// Runs one step as a task in the terminal, and settles with its exit code once it ends
async function runTask(name: string, execution: vscode.ShellExecution | vscode.ProcessExecution): Promise<number | undefined> {
  const task = new vscode.Task({ type: 'eidos' }, vscode.workspace.workspaceFolders?.[0] ?? vscode.TaskScope.Workspace, name, 'Eidos', execution, []);
  task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated, clear: true, focus: false };
  let run: vscode.TaskExecution | undefined;
  const ended = new Promise<number | undefined>((resolve) => {
    const listener = vscode.tasks.onDidEndTaskProcess((event) => {
      if (event.execution !== run) return;
      listener.dispose();
      resolve(event.exitCode);
    });
  });
  run = await vscode.tasks.executeTask(task);
  return ended;
}
