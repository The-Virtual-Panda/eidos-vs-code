---
id: architecture
title: Architecture
summary: The apps, the API that holds every position and watchlist, and the licence service between them.
variant: architecture
date_created: 2026-08-11
date_modified: 2026-08-11
---

# Architecture

## Shape

Three clients (TV, phone, web) talk to one API. The API owns every piece of state a viewer would miss on another device.

## Components

- The player, on each client.
- The API, with the catalogue, profiles, progress, and watchlists.
- The licence service, which says what may be streamed or downloaded where.

## Data and flow

A client reports what the viewer did; the API decides what is true and tells every other device.

## Boundaries and dependencies

The video itself comes from the CDN. Payments go through the billing provider.
