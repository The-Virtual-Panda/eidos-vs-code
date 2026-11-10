---
id: T-K48
title: Store the playback position per profile
status: In Progress
assignee: ["tomas"]
milestone:
priority: High
parent:
created: 2026-09-22
updated: 2026-10-07
blueprints: ["B-V63"]
links:
  - { type: blocks, task: T-D71 }
  - { type: relates, task: T-R08 }
---

## Description

<!-- backlog:description -->
The API keeps the position each profile reached in each film, so any device can resume it.

Keep the latest position per profile and film in one table, written only by the API. The client reports; it never decides.
<!-- /backlog:description -->

## Acceptance Criteria

<!-- backlog:acceptance-criteria -->
- [x] #1 One row per profile and film
- [x] #2 Written only by the API
- [ ] #3 Read back in under 200 ms
<!-- /backlog:acceptance-criteria -->

<!-- backlog:subtasks -->
## Subtasks

- [x] T-K48.1 [Write the position endpoint](t-k48-1-write-the-position-endpoint.md) · Done
- [ ] T-K48.2 [Report progress every ten seconds from the TV player](t-k48-2-report-progress-every-ten-seconds.md) · In Progress
- [ ] T-K48.3 [Report progress from the phone apps](t-k48-3-report-progress-from-the-phone-apps.md) · To Do
<!-- /backlog:subtasks -->
