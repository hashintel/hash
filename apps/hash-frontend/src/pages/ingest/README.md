# Ingest

The ingest pages are the HASH frontend for the unstructured-ingest prototype
([H-6290](https://linear.app/hash/issue/H-6290)): upload a PDF, watch the
extraction pipeline's progress, then browse the entities, claims and evidence
it found alongside the source pages.

The pipeline itself does not live in this repository. It runs in the internal
repo's `apps/agent-workflows` as a Mastra API (upload, progress events,
results) backed by Temporal workers. These pages only proxy to that API, so the
feature is **local-dev only**.

## Enabling it

Everything is gated on `MASTRA_API_ORIGIN`. When it is unset, the proxy
rewrites are not registered, both pages return 404 and the sidebar link is
hidden (`isIngestEnabled` in `src/lib/public-env.ts`).

To run the full flow locally:

1. Add `MASTRA_API_ORIGIN=http://localhost:4111` to
   `apps/hash-frontend/.env.local`.
2. Start HASH's external services (`yarn compose up -d`), then the graph, API
   and frontend (`yarn start:graph`, `yarn dev:backend`, `yarn dev:frontend`).
3. In the internal repo's `apps/agent-workflows`, start the workers and the
   Mastra API against HASH's Temporal namespace. These pages call the
   `/ingest-runs` and `/ingest-fixtures` routes, which exist only on
   [hashintel/internal#639](https://github.com/hashintel/internal/pull/639)
   until it merges; check out that branch.
   - `TEMPORAL_NAMESPACE=HASH yarn temporal:worker:ts`
   - `TEMPORAL_NAMESPACE=HASH yarn temporal:worker:py`
   - `TEMPORAL_NAMESPACE=HASH yarn dev:api`
4. Log in and open `/ingest` (the sidebar link sits under Agents, behind the
   `workers` feature flag).

`/ingest/results?fixture=<id>` renders a stored fixture from the Mastra API
without running the pipeline; with no query it loads the default fixture.

## How a run flows

```text
/ingest            upload-panel → useIngestRun
  POST /api/ingest                 ─rewrite→  Mastra POST /ingest-runs
  GET  /api/ingest/:id/events      ─API route→ Mastra /ingest-runs/:id/events (SSE)
  on success → /ingest/results?runId=:id

/ingest/results    results-panel + page-viewer
  GET  /api/ingest/:id/view        ─rewrite→  Mastra /ingest-runs/:id/view
  GET  /artifacts/*  (page images) ─rewrite→  Mastra /artifacts/*
```

The rewrites are in `next.config.js`. Progress events go through
`pages/api/ingest/[runId]/events.api.ts` instead, because Next.js rewrites
buffer responses and would hold the stream back.

While a run is in progress its id is kept in the URL (`/ingest?runId=…`), so a
reload resumes it: the page loads the run's status, then replays its events
from the start (`?after=0`). `useIngestRun` parses the stream with
`eventsource-parser`, maps any event to a `RunStatus`, and reopens a dropped
connection with `Last-Event-ID`.

## Files

```text
index.page.tsx               /ingest: upload + extraction-mode panel, URL ↔ run sync
index.page/
  use-ingest-run.ts          upload, resume and progress-stream state
  upload-panel.tsx           drop zone and progress/result states
  upload-panel/
    progress-labels.ts       pipeline phase/step → display text
results.page.tsx             /ingest/results: loads a run's or fixture's view
results.page/
  results-panel.tsx          entity cards with assertion windows or claims
  results-panel/
    claim-grouping.ts        claims per roster entry
  page-viewer.tsx            scrolling page images with evidence highlights
  page-viewer/
    bbox-transform.ts        PDF-point bbox → CSS percentages
  evidence-resolver.ts       selection → highlighted blocks and target page
  shared/highlight-styles.ts
shared/
  routing.ts                 page and API paths, query helpers
  types.ts                   pipeline contract types (see below)
```

## The contract types

`shared/types.ts` mirrors the Zod schemas of the internal repo's pipeline
contracts as plain TypeScript. Nothing here validates responses at runtime
beyond rejecting an unknown run status, so when the pipeline's contract
changes, update these types by hand to match.

## Known gaps

- Targeted extraction is shown but disabled; it needs type selection wired
  through to the Temporal workflow.
- `mechanical_fallback` context plans are typed but not rendered. Entity cards
  fall back from assertion windows to claims, then to the roster summary.
- There is no hash-api or graph integration yet: results live only in the
  Mastra API.
- There is no end-to-end test; the unit tests cover stream parsing and
  reconnection, page navigation, the events proxy, grouping and the bbox
  transform.
