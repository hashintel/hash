# Simulation Simulator

Core simulation logic for SDCPN Petri net execution.

## Key Types

### SimulationInstance

The compiled, runnable simulation state.

```typescript
type SimulationInstance = {
  // SDCPN structure (immutable)
  places: Map<string, Place>;
  transitions: Map<string, Transition>;
  types: Map<string, Type>;

  // Compiled user code functions
  differentialEquationFns: Map<string, DifferentialEquationFn>;
  lambdaFns: Map<string, LambdaFn>;
  transitionKernelFns: Map<string, TransitionKernelFn>;

  // Configuration (immutable once set)
  parameterValues: Record<string, string>;
  dt: number;
  maxTime: number | null;  // Simulation stopping condition

  // Mutable state
  rngState: number;
  frames: SimulationFrame[];
  currentFrameNumber: number;
};
```

### SimulationFrame

A snapshot of simulation state at a point in time.

```typescript
type SimulationFrame = {
  time: number;
  places: Record<string, SimulationFrameState_Place>;
  transitions: Record<string, SimulationFrameState_Transition>;
  buffer: Float64Array;  // Token values storage
};

type SimulationFrameState_Place = {
  offset: number;      // Position in buffer
  count: number;       // Token count
  dimensions: number;  // Values per token
};

type SimulationFrameState_Transition = {
  instance: Transition;
  timeSinceLastFiringMs: number;
  firedInThisFrame: boolean;
  firingCount: number;
};
```

## Core Functions

| Function                                                     | Description                                           |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| `buildSimulation(input)`                                     | Compiles SDCPN into SimulationInstance                |
| `computeNextFrame(simulation)`                               | Computes next frame, checks completion conditions     |
| `checkTransitionEnablement(frame)`                           | Checks which transitions can fire                     |
| `computePossibleTransition(frame, simulation, transitionId)` | Attempts to fire a transition                         |

### computeNextFrame Return Type

```typescript
type SimulationCompletionReason = "maxTime" | "deadlock";

type ComputeNextFrameResult = {
  simulation: SimulationInstance;
  transitionFired: boolean;
  completionReason: SimulationCompletionReason | null;
};
```

Completion conditions checked:

- `"maxTime"`: Current frame time >= `simulation.maxTime`
- `"deadlock"`: No transition fired and no transitions are enabled

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
       ├─► Check if maxTime reached → return completionReason: "maxTime"
       │
       ├─► Apply differential equations (continuous dynamics)
       │
       ├─► For each transition:
       │      computePossibleTransition()
       │        ├─► Check enablement (token counts)
       │        ├─► Evaluate lambda function (firing rate)
       │        ├─► Sample firing probability
       │        └─► If fires: execute transition kernel
       │
       ├─► Build new SimulationFrame
       │
       └─► Check completion conditions
              │
              ▼
       Return { simulation, transitionFired, completionReason }
```

## Token Value Storage

Token values are stored in a flat `Float64Array` buffer for performance.

```text
Place p1: offset=0, count=2, dimensions=3
Place p2: offset=6, count=1, dimensions=2

buffer: [v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.a, v3.b]
         └──────── p1 tokens ────────────┘ └── p2 ──┘
```

Access token values:

```typescript
const startIdx = place.offset + tokenIdx * place.dimensions;
const values = buffer.slice(startIdx, startIdx + place.dimensions);
```
