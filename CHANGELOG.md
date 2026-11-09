# Changelog

## 0.1.0

The first build, against eidos 0.21.0, which each platform's VSIX carries.

- The Eidos activity: Properties, which follows the Eidos file in the editor and edits its frontmatter as a form; the Core, each collection's blueprints by category; the Backlog, the tasks by status in board order, filtered by board, milestone, assignee, Assigned to me, and a search.
- The board in an editor tab: a column per board column, a card per task, a card dragged to another column set to its status.
- In a task, a CodeLens to tick each open checklist line and to append a note.
- `eidos check`'s findings in Problems, with the command a finding names as a quick fix.
- Blueprint and task ids that hover and open anywhere in the workspace, a requirement label after a blueprint id opening at that requirement.
- Go to Blueprint, Go to Task, and New Task.
- `eidos.path` to run another eidos; one older than the carried one is not used, and a command whose `--json` does not read from it runs on the carried one.
