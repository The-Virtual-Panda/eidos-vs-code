# Gaps

What the extension could not do as its spec (B-A45) asks with what the `eidos` CLI publishes today, and how it
stands in for each. The extension uses only the CLI's `--json` and the commands a person would run, so each gap
is closed in the CLI or the desktop app, never by reaching past them.

## Open in Eidos (REQ4): closed by Eidos MD 0.22

**Open in Eidos** opens the desktop app's link, `eidosmd://open?project=<folder>&to=<route>` (The Desktop App
REQ25), which opens or reuses the project and goes to the page through the page's router, so a view holding
unsaved work still asks. A blueprint's page is `/b/<its path>`, each segment encoded; a task's is the `href`
`eidos backlog --json` prints. The link is handed to VS Code as a string, which reaches the OS unchanged; a
`vscode.Uri` would be re-encoded on the way and break a project folder holding `&`, `+`, or `#`.

The link ships in Eidos MD 0.22. An older app, or none, opens the project at its start or nothing at all, and
the extension does not ask which version is installed; when nothing takes the link it says that opening at a page
needs Eidos MD 0.22 and offers to copy the link. Whether the app starts when it is not running is the app's.

## A finding's fix (REQ9)

`eidos check --json` gives a finding's fix only as `fix`, a button label for the app's page, which posts
`{ code, path }` to the app's own fix route. No command applies a fix by its code and path. The quick fix the
extension offers is therefore the command a finding's message names, `(eidos linter --fix)` or
`` `eidos backlog ids` ``, read from the message text in one place (`fixCommand` in
`src/vscode/editorFeatures.ts`), asked about first since such a command can change more files than one, and run
after every unsaved file in the project is saved. A finding whose message names no command gets no quick fix.
What would close it: a command per fix, or `fix` in `--json` carrying the command to run.

## Who "Assigned to me" is (REQ2)

`eidos users list --json` gives `acting` only when this machine names a user in `local.yaml`, and
`eidos whoami --json` gives the seat's name and email but no alias. The extension matches the seat to a user by
email, then by name. What would close it: the alias the CLI acts as (the same one it records history under) in
`whoami --json` or `users list --json`.

## The one-second budget (REQ13)

On the 277 blueprints and 440 tasks of the Eidos project, the four reads at start (`framework`, `list`,
`backlog`, `users list`) take about 1.4 s together, `eidos list --json` alone about 1.2 s of it. After that
the extension reads only what a change touched, and Properties, hovers, and CodeLens answer from memory. A
thousand blueprints would be over a second at start. What would close it: a faster `list`, or one command that
prints the framework, the blueprints, and the backlog in one process.

## Reads that write

A read writes files of its own: every task's change history (`.eidos/plugins/backlog/history/`) and, on a
project's first run on a machine, `.eidos/me.md` and `.eidos/plugins/eidosmd/local.yaml`. The extension leaves
those out of what it watches, so a read never sets off another.

## Smaller notes

- `--project` goes before the command (`eidos --project <root> backlog set …`): the backlog's subcommands refuse
  it after them, while `eidos property set … --project <root>` takes it either way.
- `eidos backlog set` prints a line, not the task, so after each write the extension reads the backlog again;
  `--json` on `set` and `check` printing the task would spare that read.
- The order the app's Project Core view draws collections, categories, and blueprints in is not in any `--json`.
  The Core view uses the framework's folder order, each grouping's category order, and the blueprints by title.
