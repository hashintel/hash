# Monte Carlo Simulator

## Goal

`MonteCarloSimulator` runs many independent SDCPN simulations with bounded
frame memory. It is separate from the interactive simulator: it does not retain
frame history, does not expose engine frame storage, and is designed for batch
statistics work.

## Concepts

| Name | Meaning |
| --- | --- |
| `MonteCarloSimulator` | Orchestrates a group of independent runs. |
| `MonteCarloRun` | One logical simulation run with its own seed, parameters, initial marking, status, time, and frame buffers. |
| `MonteCarloFrameBuffer` | Internal reusable binary storage for one frame. Each run owns a current buffer and next buffer. |
| `advanceAll()` | Deterministic round-robin scheduler. Advances every active run by one frame. |
| `runUntilComplete()` | Repeats `advanceAll()` until all runs are complete/errored or a guard limit is reached. |

## Memory Model

Each run owns two reusable `ArrayBuffer`s:

- `currentFrame`: the current frame.
- `nextFrame`: the write target for the next frame.

Each step writes into `nextFrame`, then swaps the two pointers. The simulator
does not append frames to a history array.

The frame buffer stores:

- per-place token counts
- per-place token value offsets
- per-transition elapsed time
- per-transition firing counts
- per-transition fired flags
- contiguous `Float64` token values

The token value section has a capacity. During transition execution the
simulator calculates the next token value count from removals and additions.
If the target buffer cannot hold it, that run reallocates a larger buffer and
continues. Reallocation is per run and tracked in run summaries.

The current growth policy doubles token value capacity on reallocation:

```text
nextCapacity = max(requiredTokenValueCount, currentCapacity * 2, 8)
```

Future versions should make this smarter. Static analysis could estimate the
maximum expansion ratio from arc weights and output token dimensions. Dynamic
analysis could adjust the growth ratio per run based on observed growth rate.

## Scheduling

The current strategy is single-threaded deterministic round-robin. This keeps
all runs moving together and avoids one long run starving the others. Future
parallelization can shard `MonteCarloRun`s across Web Workers without changing
the run state model.

## Current Limits

This first implementation focuses on bounded frame retention and a testable API.
It still reuses the existing user-code object API for dynamics, lambda, and
transition kernels. Future IR compilation can make those functions operate
directly on numeric buffers.
