# Roles

Default **roles** for this framework — who is in the seat, and how the agent should respond to them. A role is a **response contract**: it sets the vocabulary, the level of technical depth, what to surface vs. fold away, and who holds which decisions. The agent reads it **before acting** (see the Eidos standard's `EIDOS.md`, "Roles").

These are the opinionated baseline, browsable here and installed into a project's `.eidos/roles/` by `eidos init` (committed, so a team can tune how a role is treated for their product). Each person who works on the folder picks one in their local, gitignored `.eidos/me.md` and **calibrates** it — what they own on this folder, their experience with the scope, and their technical capacity — with `eidos whoami`. Role sets the baseline; calibration tunes it per person.

- [Developer](developer.md) — builds from the blueprints.
- [Stakeholder](stakeholder.md) — reviews direction.
- [Designer](designer.md) — shapes the experience.
- [Project Manager](project-manager.md) — tracks scope and progress.

A role is a baseline, not a cage: anyone can write a custom role in their `me.md`, and a framework can add or reshape role files here. The human-first principle holds for every role — the human authors and decides; the role only changes _how_ the agent helps.
