---
layer: core.actual-mode
role: Renders an execution supplied by an external source rather than by simulation
---

# Actual Mode Core

This folder contains the experimental, transport-neutral pieces of Petrinaut
Actual Mode.

Actual Mode lets Petrinaut render an execution that comes from an external
source instead of from Quick Simulation or Monte Carlo. A host application
connects to that source however it likes, then feeds Petrinaut a Petri net
definition, an initial marking, and transition firing events through
`ActualModeContext`. Petrinaut does not know or care what the source is.

## Experimental Status

This is not a stable Petrinaut protocol yet. The shapes below may change as
more hosts adopt Actual Mode.

Core owns only the pieces that are useful independently of React and
independently of how a host transports events:

- the source, marking and transition firing effect shapes used by Petrinaut's
  timeline
- marking reconstruction from an initial state plus transition effects
- timeline point generation for a live or completed external execution
- a `SimulationFrameReader` adapter so existing visualizer/timeline code can
  inspect Actual Mode frames
- recording helpers for normalized replay artifacts
- the context value type shared with the React package

Wire formats, connection handling and raw-payload exports belong to the host.

## Host Flow

1. The host connects to its execution source.
2. The host validates its own payloads and converts them to an SDCPN, an
   `ActualModeMarking` and `ActualModeTransitionFiring`s.
3. The host provides an `ActualModeContextValue` with an `ActualModeSource`:
   an opaque `id`, unique per execution, and an optional human-readable
   `label`. A new `id` starts a new timeline.
4. `@hashintel/petrinaut` reads `ActualModeContext`.
5. Core reconstructs markings and timeline frames from the initial state and
   transition firing effects.

The accepted transition firing shape is:

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

## Recordings

`createActualModeRecording` builds a normalized recording: the SDCPN, the
initial marking, the transition firings and the source. `parseActualModeRecording`
reads one back.

## File Map

- `constants.ts`: shared Actual Mode constants.
- `types.ts`: transport-neutral Actual Mode types and context shape.
- `schemas.ts`: Zod schemas for core Actual Mode payloads and recordings.
- `context.ts`: unavailable/default context value.
- `marking.ts`: marking reconstruction helpers.
- `timeline.ts`: live timeline point generation and frame-reader adapter.
- `recording.ts`: normalized recording helpers.
- `time.ts`: timestamp parsing helpers used by recordings and timelines.
