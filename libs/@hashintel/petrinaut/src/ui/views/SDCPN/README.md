---
layer: ui.views.canvas
name: Canvas
role: Renders the net as an interactive graph, with node and arc interaction
invariants:
  - Reads frame state through the execution-frame interface, so the same canvas renders live runs and recordings
---

# Canvas

The React Flow-based rendering of a net: places, transitions, arcs, selection,
dragging, and per-frame visual state during a run.

Frame state arrives through the execution-frame abstraction rather than from the
simulation provider directly. That is what lets the canvas render an Actual-mode
recording without knowing it is not a live simulation.
