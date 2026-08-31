---
"@hashintel/petrinaut": patch
---

The sweep surface reads a cell's value from the last sampled frame instead of the literal last frame, so terminating nets (whose runs finish before max time) fill the surface instead of silently discarding every cell. Metric charts mount their axes the moment the drawer opens (a pinned time domain needs no data), so the full layout is on screen before the first frame streams, and chart data now applies at most once per animation frame.
