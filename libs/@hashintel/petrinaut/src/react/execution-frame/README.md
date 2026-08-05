---
layer: react.execution-frame
name: Execution frame source
role: Abstracts where frames come from, so canvas and timeline work for live runs and recordings alike
invariants:
  - Consumers depend only on this interface, never on whether the frames are live or replayed
---

# Execution frame source

A single interface over "where frames come from":
`{ totalFrames, currentFrameIndex, currentFrameReader, scrubToFrame, getFramesInRange }`.

Live playback and Actual-mode recordings both satisfy it, which is what lets the
canvas and the timeline be written once. Without this seam every frame consumer
would need a branch for each source, and adding a third source would mean editing
all of them.
