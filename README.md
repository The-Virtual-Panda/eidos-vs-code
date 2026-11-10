# Eidos for VS Code

The developer's workflow with [Eidos](https://eidosmd.com) without leaving the editor: the specs and tasks that
say what to build in a sidebar, edited in VS Code's own markdown editor with a Properties panel beside them, a
board of the backlog, `eidos check`'s findings in Problems, and blueprint and task ids that hover and open
anywhere in the workspace.

![A spec open in VS Code's markdown editor, its frontmatter as a form in Properties, the Core and the Backlog beneath](media/screenshots/sidebar.png)

It turns on in a workspace folder holding an Eidos project (a `.eidos/` folder at the folder or beneath it), and
it stands where any outside tool could: every read is a command of the `eidos` CLI run with `--json`, and every
write is the command a person would run, so a project changed from VS Code is the same as one changed in Eidos
MD or from the shell. Authoring the Core (new blueprints, moving them, the framework) stays in Eidos MD and the
CLI.

## What it adds

- **The Eidos activity**: **Properties**, which follows the blueprint or task open in the editor and edits its
  frontmatter as a form typed by the framework (a select for an option list, a status, or a priority, chips for a
  list, the id and the stamped dates read-only); **Core**, each collection's blueprints by category; and
  **Backlog**, the tasks by status in board order, filtered by board, milestone, assignee, **Assigned to me**, and
  a search.
- **Open Board**: the backlog's board in an editor tab. Drag a card to another column to set its status.
- **In a task**: a CodeLens to tick each open checklist line (`eidos backlog check`) and to append a note
  (`eidos backlog set --append`).
- **Problems**: `eidos check`'s findings on the files they name, refreshed on save.
- **Ids**: `B-A45` or `T-W85` anywhere hovers with its title, summary, and status, and opens with Go to Definition
  or a ⌘-click; `B-A45 REQ6` opens at that requirement.
- **Open in Eidos**: the blueprint or task open in the editor, at its page in Eidos MD (0.22 or later), by the
  app's `eidosmd://open` link.
- **Go to Blueprint**, **Go to Task**, and **New Task**, and every action as an `Eidos:` command.

A write is never made over unsaved edits: the extension asks you to save the file first.

**A task**, with its status, priority, and checklist in Properties and a CodeLens to tick the next line:

![A task open with Properties showing its title, type, status, and priority, and Tick #3 over the open checklist line](media/screenshots/task.png)

**The board**, a column per status, filtered as the Backlog view is:

![The board in an editor tab: To Do, In Progress, In Review, and Done, each card with its id, type, priority, and blueprint](media/screenshots/board.png)

**An id in code** hovers with the blueprint's title, summary, status, and the requirement it names:

![A comment naming B-V63 REQ2 in a TypeScript file, hovering with Resume Playback, its summary, and In Progress](media/screenshots/hover.png)

**`eidos check`** in Problems, on the files each finding names:

![The Problems panel listing eidos check findings under each file, with the spec they name open above](media/screenshots/problems.png)

The pictures show Reelhouse, a made-up streaming product.

## Which eidos it runs

Each platform's VSIX carries its own `eidos` binary, the version `package.json` names under `eidos.version`, and
runs it for every project whatever version the project pins, so nothing needs to be installed. The setting
**Eidos: Path** (`eidos.path`) points it at another `eidos`, a newer build or one being developed. One older than
the carried version is not used, and when a command's `--json` from it does not read as the extension expects,
that command runs on the carried one instead; each is said once.

## Develop

```bash
pnpm install
pnpm fetch-eidos        # the eidos binary for this machine, into bin/
pnpm build
pnpm check              # TypeScript
pnpm test               # unit tests
pnpm test:host <path to an Eidos project>   # the Extension Development Host checks, on a copy of the project
pnpm package [target]   # a VSIX for a platform (darwin-arm64, linux-x64, win32-x64, …, or all)
node scripts/screenshots/run.mjs <project>  # the poses the README's pictures show, for capturing them again
```

Without `bin/eidos`, a development build runs the `eidos` on the PATH. Press F5 with the repository open to run it
in an Extension Development Host.

What the CLI does not publish yet, and how the extension stands in for it, is in [docs/gaps.md](docs/gaps.md).

## License

The extension's code is MIT (see [LICENSE](LICENSE)). The `eidos` binary a VSIX carries keeps the CLI's own
license, PolyForm Strict 1.0.0 with a permission for any commercial purpose; see [NOTICE](NOTICE).
