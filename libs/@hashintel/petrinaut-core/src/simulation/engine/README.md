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

## Token Value Storage

Token values are stored in a packed `Float64Array` section inside the frame
buffer. Place counts and value offsets are stored in separate `Uint32Array`
sections, so a place can be accessed in O(1) when the SDCPN layout is known.

```text
Place p1: offset=0, count=2, dimensions=3
Place p2: offset=6, count=1, dimensions=2

buffer: [v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.a, v3.b]
         └──────── p1 tokens ────────────┘ └── p2 ──┘
```

Access:

```typescript
const frameView = readEngineFrame(simulation.frameLayout, frame);
const place = frameView.getPlaceState("p1");
const values = frameView.getPlaceTokenValues("p1");
```
