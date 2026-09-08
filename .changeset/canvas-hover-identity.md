---
"@hashintel/petrinaut": patch
---

Hovering the canvas re-renders only the nodes and arcs the neighbourhood highlight touches, instead of every item in the net. Muting the rest is done by the pane rather than by rewriting each item, which cuts the script cost of a hover on a 1000-node net by about a third.
