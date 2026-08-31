---
layer: ui.views.notebook
role: Notebook view — the net as expandable cells with editable code, dependency analysis, and a whole-net graph explorer
---

The notebook renders the net as a flat list of cells, one per entity, so a
model reads like a program: declarations and the flow that uses them. It replaces the canvas and its
panels wholesale, which is what lets its Monaco editors reuse the LSP
document URIs — a model is never mounted twice.

Everything an expanded cell shows edits in place — names, fields, arc
weights, type assignments, and code — through the same guarded mutations as
the properties panel; only adding and removing nodes, arcs, and fields
stays in Edit mode.

The folder splits into a pure core and thin views. `notebook-model`,
`notebook-order`, `net-cycles`, `net-siphons` and `net-graph-layout` are
plain functions over the net definition, unit-tested without the DOM; the
`.tsx` files render their output and own only view state (selection comes
from the editor, expansion and search live here). The graph explorer draws
the whole net from the arc structure alone, ignoring canvas positions, so
the diagram answers "what feeds what" rather than "where did the author
drag things".
