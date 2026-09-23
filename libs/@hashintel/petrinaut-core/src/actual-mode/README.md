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

- the transition firing shape used by Petrinaut's timeline
- marking reconstruction from an initial state plus transition firings
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
   state, and transition firing payloads. Once the definition and the initial
   state have both arrived, the provider checks the initial state against the
   definition and applies each firing to the marking reconstructed so far; an
   initial state or firing that fails ends the stream with `status: "error"`
   and the thrown message.
4. The website normalizes the Brunch definition into a read-only SDCPN with
   Petrinaut extensions disabled.
5. `@hashintel/petrinaut` receives `ActualModeContext`.
6. Core reconstructs markings and timeline frames from the initial state and
   transition firings.

The transition firing shape is:

```json
{
  "transitionId": "start_implementation",
  "inputTokens": { "queued": [{ "ticket_id": "T-1", "attempts": 0 }] },
  "outputTokens": { "implementing": [{ "ticket_id": "T-1", "attempts": 1 }] },
  "ts": "2026-06-05T17:17:27.866Z"
}
```

`inputTokens` and `outputTokens` list the tokens the firing consumed and
produced, one record per token, keyed by place id. They are not full
before/after markings. Place keys may be scoped ids (`instanceId::placeId`)
when a firing touches a componentInstance's copy of a subnet place.

Each token record must fit its place in the net definition. The same rule
covers the token arrays of an initial marking:

- A record for a place with a colour carries exactly the colour's elements,
  with no element missing and no other attribute.
- Each value is the at-rest form of its element's type: a finite number for
  `real`, an integer for `integer`, a boolean for `boolean`, a string for
  `string`, and a canonical lowercase UUID string for `uuid`.
- A record for an uncoloured place is `{}`.
- Every place a firing or marking names is defined by the net.

`applyActualModeTransitionFiring` checks the firing's records before applying
it, and `validateActualModeInitialState` checks an initial marking. Both throw
an error naming the place, the record, and the element or attribute at fault;
a firing's error also names the transition and timestamp. Recording parsing,
the frame replay, and the Brunch provider all run these checks.

Marking reconstruction consumes tokens by value:

- A place stays a token count while every token recorded for it is `{}`; the
  first token with attributes turns it into an array.
- A recorded input token removes the first token in the reconstructed place
  that is equal to it on every attribute.
- A firing that consumes a token the reconstructed marking does not hold is
  an error: `applyActualModeTransitionFiring` throws, naming the transition,
  the place and the unmatched record. This covers a recorded input token that
  matches no token in the place and a firing that consumes more tokens than a
  count place holds. The React frame source replays firings during render, so a host
  applies each firing as it arrives and reports the error through the
  context's `status: "error"` before the firing reaches the context.
- Produced tokens are appended as recorded.

Recordings carry `version: 2`.

The transition-firing log is retained unbounded for the life of a stream, and
each firing holds one record per token moved, so a long-running stream's
memory grows with the number of tokens moved. Windowed retention (a checkpoint
marking plus the last N firings) is the known follow-up.

## File Map

- `constants.ts`: shared Actual Mode constants.
- `types.ts`: transport-neutral Actual Mode types and context shape.
- `schemas.ts`: Zod schemas for core Actual Mode payloads and recordings.
- `context.ts`: unavailable/default context value.
- `marking.ts`: marking reconstruction helpers.
- `token-records.ts`: checks that token records fit their places in the net.
- `timeline.ts`: live timeline point generation and frame-reader adapter.
- `recording.ts`: normalized and raw-event recording helpers.
- `time.ts`: timestamp parsing helpers used by recordings and timelines.

When the Brunch/Petrinaut protocol becomes stable, the standardized protocol
schemas should move here from the website adapter.
