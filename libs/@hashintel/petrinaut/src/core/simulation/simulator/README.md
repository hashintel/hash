# Simulator

Core simulation logic for SDCPN Petri net execution.

## Overview

The simulator compiles an SDCPN definition into a runnable `SimulationInstance` and computes frames by evaluating transitions and differential equations.

## Core Functions

| Function                   | Description                                       |
| -------------------------- | ------------------------------------------------- |
| `buildSimulation(input)`   | Compiles SDCPN into SimulationInstance            |
| `computeNextFrame(sim)`    | Computes next frame, checks completion conditions |

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
       ├─► Build new SimulationFrame
       └─► Check deadlock → "deadlock" completion
```

## SimulationFrame

A snapshot of simulation state at a point in time.

```typescript
type SimulationFrame = {
  time: number;
  places: Record<string, { offset, count, dimensions }>;
  transitions: Record<string, { timeSinceLastFiringMs, firedInThisFrame, firingCount }>;
  buffer: Float64Array;  // Token values storage
};
```

## Token Value Storage

Token values are stored in a flat `Float64Array` buffer for performance.

```text
Place p1: offset=0, count=2, dimensions=3
Place p2: offset=6, count=1, dimensions=2

buffer: [v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.a, v3.b]
         └──────── p1 tokens ────────────┘ └── p2 ──┘
```

Access:

```typescript
const startIdx = place.offset + tokenIdx * place.dimensions;
const values = buffer.slice(startIdx, startIdx + place.dimensions);
```
