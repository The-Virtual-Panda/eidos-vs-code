# Changelog

## 0.2.1

- The listing's name is Eidos MD Specs and Backlog.

## 0.2.0

The extension now runs the `eidos` you installed instead of carrying its own, so it is one small package for every platform.

- It finds `eidos` on the PATH, or where the install script puts it, and needs 0.22 or later.
- With no `eidos` installed, the Eidos sidebar offers Install the Eidos CLI, which runs the CLI's install command in a terminal. With an older one, it offers Update eidos, which runs `eidos version update`.
- In a project, `eidos` runs as the version the project pins, as it does in a terminal. A pin older than the extension reads runs as the installed `eidos`, said once.
- `eidos.path` names an `eidos` installed elsewhere; one older than the extension reads is passed over for the installed one.
- A command whose `--json` does not read as expected fails naming the version the extension reads, instead of running again on a carried build.
- The listing's name is Eidos MD.

## 0.1.1

- The README, and so the extension's listing, shows what it looks like: a spec with Properties, a task, the board, an id hovering in code, and `eidos check` in Problems.

## 0.1.0

The first build, against eidos 0.22.0, which each platform's VSIX carries.

- The Eidos activity: Properties, which follows the Eidos file in the editor and edits its frontmatter as a form; the Core, each collection's blueprints by category; the Backlog, the tasks by status in board order, filtered by board, milestone, assignee, Assigned to me, and a search.
- The board in an editor tab: a column per board column, a card per task, a card dragged to another column set to its status.
- In a task, a CodeLens to tick each open checklist line and to append a note.
- `eidos check`'s findings in Problems, with the command a finding names as a quick fix.
- Blueprint and task ids that hover and open anywhere in the workspace, a requirement label after a blueprint id opening at that requirement.
- Open in Eidos, from Properties or the palette: the blueprint or task at its page in Eidos MD, by the app's `eidosmd://open?project=&to=` link (Eidos MD 0.22 and later; an older app opens the project at its start or not at all).
- Go to Blueprint, Go to Task, and New Task.
- `eidos.path` to run another eidos; one older than the carried one is not used, and a command whose `--json` does not read from it runs on the carried one.
