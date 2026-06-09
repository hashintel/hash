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
  "ts": "2026-06-05T17:17:27.866Z"
}
```

`input` and `output` are transition-local token count maps. They are not full
before/after markings.

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
