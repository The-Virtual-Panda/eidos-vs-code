---
id: T-D04
title: Position jumps back a minute on Android TV
type: bug
status: To Do
assignee: ["tomas"]
milestone:
priority: High
parent:
created: 2026-09-22
updated: 2026-10-07
blueprints: ["B-V63"]
---

## Description

<!-- backlog:description -->
On Android TV the player resumes about a minute before where the viewer stopped, after the app has been in the background.
<!-- /backlog:description -->

## Acceptance Criteria

<!-- backlog:acceptance-criteria -->

<!-- /backlog:acceptance-criteria -->

<!-- comments:threads -->
### the task (t-h2tv6b)
- **Maya Okafor** (project-manager) · 2026-11-10 04:07 UTC
  How long does the TV hold it? If a viewer switches to the phone first, the phone's position should win.
- **Claude** · 2026-11-10 04:09 UTC
  Until it reconnects, and only if it is newer than the position the API already has. The API compares the two times and keeps the later one, so the phone wins.
<!-- /comments:threads -->
