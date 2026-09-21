---
layer: ui.views.editor.metric-timeline
role: Charts one experiment metric over time — line, percentile bands, density heatmap, or aggregates — as frames stream in
---

`experiment-metric-timeline.tsx` in the parent folder is the chart. Its private pieces: `use-metric-plot.ts` (the uPlot instance and its redraws), `view-state.ts` (the view settings and their defaults), `describe-metric-view.ts` (the subtitle naming the view), `metric-view-menu.tsx` (the chart options popover) and `frame-popover.tsx` (the hovered frame's readout).
