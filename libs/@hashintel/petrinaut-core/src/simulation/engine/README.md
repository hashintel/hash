# Simulation Engine

Core simulation logic for SDCPN Petri net execution.

## Overview

The engine builds an SDCPN definition into a runnable `SimulationInstance` and
computes frames by evaluating transitions and differential equations. It imports
user-code compilation helpers from `authoring/user-code/`, but owns the
runtime stepping state and frame layout.

## Core Functions

| Function                 | Description                                       |
| ------------------------ | ------------------------------------------------- |
| `buildSimulation(input)` | Compiles SDCPN into SimulationInstance            |
| `computeNextFrame(sim)`  | Computes next frame, checks completion conditions |

## Computation Flow

```text
buildSimulation(SDCPN, initialMarking, params, maxTime)
       │
       ▼
SimulationInstance (frame 0)
       │
       ▼ (loop)
computeNextFrame(simulation)
       │
       ├─► Check if maxTime reached → "maxTime" completion
       ├─► Apply differential equations
       ├─► For each transition: check enablement, sample firing, execute kernel
       ├─► Build new EngineFrame
       └─► Check deadlock → "deadlock" completion
```

`buildSimulation` first works from a sanitized SDCPN snapshot based on the
active extension settings. Transition lambdas are compiled only when
stochasticity is enabled or when colours are enabled and the transition has a
standard or read input arc from a coloured place. Otherwise the engine installs
the always-enabled default. Transition kernels are compiled only for
transitions with coloured output places; uncoloured outputs are generated from
arc weights.

## Internal EngineFrame

A snapshot of simulation state. The run controller owns frame number and
simulation time; `EngineFrame` only stores the state needed to advance the
simulation. Public callers should read frames through `SimulationFrameReader`.

```typescript
type EngineFrame = ArrayBuffer;
```

The frame does not contain place or transition IDs. `SimulationInstance` owns an
`EngineFrameLayout` derived from the SDCPN and passes it to internal readers and
writers.

## Token Value Storage (packed token structs)

Token values are stored as a byte region of packed structs inside the frame
buffer (`FRAME_VERSION = 2`). Each colour has a `TokenSlotLayout` computed by
`engine/token-layout.ts` — the single source of truth for the physical
mapping:

| Element type | Physical type                       | Size | Alignment |
| ------------ | ----------------------------------- | ---- | --------- |
| `real`       | `f64`                               | 8 B  | 8 B       |
| `integer`    | `f64` (rounded via the value codec) | 8 B  | 8 B       |
| `boolean`    | `u8` (0/1)                          | 1 B  | 1 B       |

Per colour, fields are ordered by decreasing alignment (stable within equal
alignment), each field's byte offset is aligned to its physical alignment, and
the stride (`sizeof(token)`) is rounded up to 8 bytes. Because the token
region starts at an 8-aligned offset and every stride is a multiple of 8, all
f64 fields are addressable through a shared `Float64Array` view
(`index = (placeByteOffset + token * strideBytes + fieldByteOffset) / 8`) and
u8 fields through a `Uint8Array` view — no `DataView` in hot paths.

Place counts and per-place byte offsets are stored in separate `Uint32Array`
sections, so a place can be accessed in O(1) when the SDCPN layout is known.

```text
Colour of p1: { x: real, n: integer, on: boolean } → stride 24 B
  x @ 0 (f64) · n @ 8 (f64) · on @ 16 (u8) · padding 17..24

Place p1: byteOffset=0,  count=2, strideBytes=24
Place p2: byteOffset=48, count=1, strideBytes=16

bytes: [tok0: x n on pad][tok1: x n on pad][tok2: a b]
        └──────── p1 tokens (48 B) ──────┘ └ p2 (16 B) ┘
```

Access:

```typescript
const frameView = readEngineFrame(simulation.frameLayout, frame);
const place = frameView.getPlaceState("p1"); // { byteOffset, count, strideBytes }
const layout = simulation.frameLayout.placeTokenLayouts[placeIndex];
const token = readTokenRecord(
  layout,
  frameView.tokenF64,
  frameView.tokenBytes,
  place.byteOffset + tokenIndex * place.strideBytes,
);
```
