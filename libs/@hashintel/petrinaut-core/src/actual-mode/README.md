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

- the source, marking and transition firing effect shapes a host reports
- the mapping of those to an [execution trace](layer:core.execution-trace),
  which is all Actual Mode adds: the canvas, the timeline and the player then
  show the host's execution with the code that shows a simulated run
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
5. `createActualModeTrace` writes the initial state as the trace's first
   event and each transition firing as an event at its timestamp. Position 0
   is the instant the host says the execution started, or else its first
   firing's timestamp, so every position also reads on the wall clock.

A host that already has an execution trace needs none of this: the trace is
the interface, and the shapes here are one way to fill it.

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
- `marking.ts`: applies one transition firing to a marking.
- `execution-trace.ts`: the mapping to an execution trace.
- `recording.ts`: normalized recording helpers.
- `time.ts`: timestamp parsing helpers used by recordings and the mapping.
