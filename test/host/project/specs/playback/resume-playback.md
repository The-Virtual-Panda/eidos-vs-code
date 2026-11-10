---
id: B-V63
title: Resume Playback
summary: Returns a viewer to the exact second they stopped, on any device.
variant: full
status: In Progress
date_created: 2026-09-14
date_modified: 2026-10-07
domain: playback
type: feature
depends_on: ["[Profiles](../identity/profiles.md)"]
---

# Resume Playback

## Intent

A viewer who stops a film halfway, on the TV at night or on a phone on the train, should never have to hunt for their place when they come back. Two out of three films on Reelhouse are watched in more than one sitting, so finding your place again is the most common thing a viewer does after pressing play.

### Assumptions

- Progress is kept per profile, not per account: two people sharing an account are two viewers.
- A position a few seconds behind where the viewer stopped is better than one a few seconds ahead.

## Open Questions

- When a viewer is in the last few minutes of a film, do they want to resume, or have they finished?
- Should a film started on the TV offer to resume on a phone that is offline?

## Requirements

### Functional

- **REQ1:** Pressing play on a film the profile has started opens it at the last position saved, from whichever device saved it last.
- **REQ2:** The player offers Resume or Start over when the saved position is more than a minute in.
- **REQ3:** A film watched past its credits marker counts as finished and starts from the beginning.

### Performance

- **REQ4:** The saved position is never more than ten seconds behind where the viewer stopped.

## Out of Scope

- Cross-account resume. A shared TV is one device, not one person.
- Resuming trailers and extras. They are short enough to start again.
- Syncing a position between two devices playing at the same time.
- Resuming a film the viewer has removed from their history.

## Dependencies

- [Profiles](../identity/profiles.md): progress belongs to a profile.

## Decisions

- 2026-09-15: The position is written by the API, never by the client, so two devices cannot overwrite each other. (Tomás)

<!-- comments:threads -->
### Out of Scope (t-a7qk2m)
- **Tomás Reyes** (developer) · 2026-11-10 02:05 UTC
  Do we need to say anything about a film the viewer removed from their history? Right now it would still resume.
- **Maya Okafor** (project-manager) · 2026-11-10 02:10 UTC
  Good catch. Removed history stays removed; I added it to Out of Scope.

### Open Questions (t-f5rd1x)
- **Priya Nair** (designer) · 2026-11-10 02:07 UTC
  In the last few minutes, I think the credits are the signal. If they are past the credits marker, they finished.

### Functional › REQ3 (t-c3wn8p)
- **Tomás Reyes** (developer) · 2026-11-10 04:08 UTC
  Does every film carry a credits marker, or only the ones ingested since the new pipeline?
- **Claude** · 2026-11-10 04:09 UTC
  Only films ingested since August carry one, about 60% of the catalogue. For the rest, T-R08 can treat the last five minutes as finished. Want me to add that as REQ5?
- **Maya Okafor** (project-manager) · 2026-11-10 04:10 UTC
  Yes, add it. Five minutes is fine for now.
<!-- /comments:threads -->
