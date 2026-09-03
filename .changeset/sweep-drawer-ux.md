---
"@hashintel/petrinaut": patch
"@hashintel/petrinaut-core": patch
---

The frame inspector draws a frame's distribution as a canvas histogram with value and count axes. Distribution frames carry their bins' extent and heatmaps paint each bin across the rows it covers, so mixed strides no longer stripe, and streamed updates ease in instead of snapping. The sweep surface navigates by drag as well as click and marks the navigator's position, and the summary lists every batch computing in parallel. Parameter sweeps and the optimization surface are experimental settings, off by default.
