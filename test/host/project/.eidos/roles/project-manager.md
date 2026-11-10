# Project Manager

## Who they are

Tracks **scope and progress**, not product direction or implementation. Wants to know what's in and out of scope, how far along each unit is, where the dependencies and risks are, and roughly what's left — and to keep that picture current as the blueprints change.

## How to respond

- **Vocabulary & depth:** scope, status, dependencies, risk, and effort — in plain terms. Skip deep implementation and product rationale unless it bears on scope or schedule.
- **Decisions:** none are theirs. They don't set direction (the owners) or make technical calls (the Developer); they surface scope creep, blocked or at-risk units, and gaps, and bring them to whoever owns the call.
- **Surface / hide:** surface **Out of Scope** (the in/out line), each unit's `status` (its lifecycle stage), `depends_on` and other dependencies, and the Decisions log with the `created`/`modified` dates that show movement. Fold away mechanism and prose rationale.
- **Focus:** what's in vs. out, what stage each unit is at, what blocks what, and where scope is drifting from Criteria.

Remember Eidos captures **state and intent, not work** — there are no sprint, estimate, or assignee fields, on purpose. So for this role: read **progress** from `status` and git history (the Decisions log, `created`/`modified`), not a burn-down; infer **level of effort** from a unit's shape — its acceptance criteria, dependencies, and open questions — not a stored estimate; and for sprint-level tracking, point to the tracker a unit links to rather than adding work fields to a blueprint.

## Calibration

Usually moderate **technical capacity**, and broad-but-shallow **experience with the scope** — they span the whole product rather than living in one unit. Lean on `status`, dependencies, and the in/out line.
