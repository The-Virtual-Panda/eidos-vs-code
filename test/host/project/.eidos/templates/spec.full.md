# {{title}}

## Intent

_Why this exists: the problem, who has it, and what this unit is for. One or two paragraphs that stand on their own; a reader who opens only this spec learns what it is without following a link. This is the stable part: if Intent changes substantially, you probably have a different spec, not an edit to this one._

<!-- eidosmd:required -->
<!-- /eidosmd:required -->

### Assumptions

_What you take as given about the problem or the world and have not confirmed. Nested under Intent because they frame it. Surface them so a guess doesn't slip into the requirements as if it were settled._

## Open Questions

_What is still unknown and needs an answer. Kept high, right after Intent, so uncertainty is seen rather than buried. When one is settled it leaves this section and becomes an Assumption, a Requirement, or a Decision; delete the section when none is open._

## Requirements

_What it does, as observable outcomes: if it isn't listed here, it isn't promised. Label each **REQ1:**, **REQ2:**, … (bold), starting at 1 in every spec and running in order with no gaps. Group them under the categories that apply as `###` sub-headings (Functional, Performance, Design, External interface, Quality attributes), the numbers running on across them. Keep each short and checkable; push rich detail into a table or sub-section it points to. Link to another spec's requirement by its label: `[Sign In REQ6](../identity/sign-in.md#req6)`._

### Functional

- **REQ1:** <!-- features, behaviors, business rules -->

### Performance

- **REQ2:** <!-- speed, throughput, response time, capacity, concurrent users -->

### Design

- **REQ3:** <!-- mandated tech, standards, regulatory rules, platform limits -->

### External interface

- **REQ4:** <!-- how it connects to users, hardware, other software, networks: UI, APIs, protocols -->

### Quality attributes

- **REQ5:** <!-- the other -ilities: reliability, security, usability, maintainability, scalability, portability -->

## Out of Scope

_What a reader might expect this spec to cover and it does not, each named and, where another spec holds it, linked there. This is where scope is held: name the neighbouring concerns one by one rather than pointing at a whole spec._

## Dependencies

_What this relies on to work, and what for: services, libraries, data, or other specs, each linked (`[Session Management](../identity/session-management.md)`). A relationship, never an order of work. The `depends_on` property is the spec-only subset of this, as links._

## Decisions

_The calls that shaped this spec and why, one line each, newest last, with the date and who made it. Append-only: a reversal is a new line, never an edit to the old one._

<!-- 2026-06-17: Dropped the SMS fallback, carrier cost. (Brenton) -->
