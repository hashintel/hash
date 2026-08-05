---
layer: core.simulation.frames
name: Frames & metrics
role: The frame layout and the readers hosts use to inspect one frame
invariants:
  - Readers are views over an existing buffer, not copies, so reading a frame does not allocate per place or per transition
---

# Frames & metrics

The frame is the unit of simulation output, and this layer owns both its memory
layout and the read side.

- `internal-frame.ts` — the layout: how a frame's places, tokens and transition
  state are packed into buffers.
- `frame-reader.ts` — the host-facing view over a frame
  (`getPlaceTokens`, `getPlaceTokenCount`, `getTransitionState`).
- `transition-state.ts` — per-transition firing data exposed through the reader.
- `hir-metric.ts` — evaluating a compiled metric against a frame.

The reader is deliberately a view rather than a snapshot object. Rendering a
large net means reading every place every frame, so a reader that materialised
objects would make frame cost scale with net size in allocation as well as
compute.
