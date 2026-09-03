---
layer: ui.contour-surface
role: Filled contour plot over a sparse grid with a drag control, shared by the sweep and optimization surfaces
---

`contour-surface.tsx` in the parent folder is the component. Its private pieces: `contour-field.ts` (inverse-distance-weighted raster, marching-squares iso-lines, contour levels), `paint-field.ts` (the canvas paint through the shared colour ramp, with the dimmed ghost of the previous field), `use-surface-drag.tsx` (one armed pointer, crosshair overlay, pick and preview callbacks).
