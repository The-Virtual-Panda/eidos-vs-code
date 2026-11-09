# Gaps

What the extension could not do as its spec (B-A45) asks with what the `eidos` CLI publishes today, and how it
stands in for each. The extension uses only the CLI's `--json` and the commands a person would run, so each gap
is closed in the CLI or the desktop app, never by reaching past them.

## Open in Eidos (REQ4)

The desktop app's `eidosmd://` link carries only a sign-in today, so it cannot name a project or a file to open
([The Desktop App](https://github.com/The-Virtual-Panda/eidosmd), B-A45's dependency). **Open in Eidos** says so
in a message that names the blueprint or task, and offers to copy its id; it neither starts the app nor guesses a
link. Once the link carries a project and a file, the button opens it there (and starts the app when it is not
running) without any other change to the extension.

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
