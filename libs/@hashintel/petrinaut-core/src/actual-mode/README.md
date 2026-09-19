---
layer: core.actual-mode
role: Renders an execution supplied by an external source rather than by simulation
---

# Actual Mode Core

This folder contains the experimental, transport-neutral pieces of Petrinaut
Actual Mode.

Actual Mode lets Petrinaut render an execution that comes from an external
source instead of from Quick Simulation or Monte Carlo. The first integration is
the Brunch demo route in `apps/petrinaut-website`, which connects to a Brunch
SSE endpoint and feeds Petrinaut a Petri net definition, an initial marking, and
transition firing events.

## Experimental Status

This is not a stable Petrinaut protocol yet.

The Brunch SSE event names, endpoint layout, raw export shape, and temporary
Brunch definition schema are still owned by the demo website integration. They
should not be treated as a public Petrinaut Core protocol until the Brunch and
Petrinaut teams standardize that contract.

Core currently owns only the pieces that are useful independently of React and
independently of how a host transports events:

- the transition firing effect shape used by Petrinaut's timeline
- marking reconstruction from an initial state plus transition effects
- timeline point generation for a live or completed external execution
- a `SimulationFrameReader` adapter so existing visualizer/timeline code can
  inspect Actual Mode frames
- recording helpers for normalized replay artifacts and raw received events
- the context value type shared with the React package

## Current Brunch Flow

The current demo path is:

1. `apps/petrinaut-website` opens `/brunch?sse=<url>`.
2. The Brunch provider connects with `EventSource`.
3. Website-local parsers validate the temporary Brunch definition, initial
   state, and transition firing payloads.
4. The website normalizes the Brunch definition into a read-only SDCPN with
   Petrinaut extensions disabled.
5. `@hashintel/petrinaut` receives `ActualModeContext`.
6. Core reconstructs markings and timeline frames from the initial state and
   transition firing effects.

The currently accepted transition firing shape is:

```json
{
  "transitionId": "start_implementation",
  "input": { "queued": 1 },
  "output": { "implementing": 1 },
  "inputTokens": { "queued": [{ "ticket_id": "…" }] },
  "outputTokens": { "implementing": [{ "ticket_id": "…" }] },
  "ts": "2026-06-05T17:17:27.866Z"
}
```

`input` and `output` are transition-local token count maps. They are not full
before/after markings. The optional `inputTokens` and `outputTokens` carry the
attribute values of the consumed and produced tokens, keyed like
`input`/`output`; a token record may carry a subset of the colour's attributes
(at least the identity key elements), and `uuid` values are canonical
lowercase strings. Place keys may be scoped ids (`instanceId::placeId`) when a
firing touches a componentInstance's copy of a subnet place.

Marking reconstruction treats the `input`/`output` counts as authoritative and
the token-value records as enrichment:

- A recorded input token is removed by value: the first token in the
  reconstructed place that agrees on every attribute the record carries.
- A recorded input token that matches nothing removes nothing. Keeping a
  divergent token beats removing another instance's token, so after a
  malformed or out-of-order event a place's reconstructed count can exceed
  the count-only projection until the stream and the reconstruction
  re-converge.
- At most `input`-count tokens are removed per place; recorded input tokens
  beyond the count are ignored, and consumption beyond the recorded values
  falls back to FIFO.
- Produced tokens take the recorded output values first and pad up to the
  `output` count with attribute-less tokens.

Recordings are written with version 2; version-1 recordings (which predate
per-firing token values) still parse.

The transition-firing log is retained unbounded for the life of a stream, and
token-value records multiply the per-firing size, so a long-running stream
retains markedly more memory than a count-only one. Windowed retention (a
checkpoint marking plus the last N firings) is the known follow-up.

## File Map

- `constants.ts`: shared Actual Mode constants.
- `types.ts`: transport-neutral Actual Mode types and context shape.
- `schemas.ts`: Zod schemas for core Actual Mode payloads and recordings.
- `context.ts`: unavailable/default context value.
- `marking.ts`: marking reconstruction helpers.
- `timeline.ts`: live timeline point generation and frame-reader adapter.
- `recording.ts`: normalized and raw-event recording helpers.
- `time.ts`: timestamp parsing helpers used by recordings and timelines.

When the Brunch/Petrinaut protocol becomes stable, the standardized protocol
schemas should move here from the website adapter.
