---
"@hashintel/petrinaut": patch
"@hashintel/ds-components": patch
---

Extract the contour plot into a `ContourSurface` component shared by the sweep and optimization surfaces, decouple `SweepNavigator` from the experiments context, and add Storybook stories for each component's states. Sweep navigation is continuous: a point selection uses a single-thumb slider, slider moves commit during the drag, and charts keep their axes, grid and size while frames stream in. `Slider` treats 0 as a real value, and `useElementSize` follows an element that mounts after the first render.
