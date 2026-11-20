---
layer: ui.views.notebook
role: The Definitions view, which shows the net as expandable cells with editable code, dependency analysis and a whole-net graph explorer
---

The notebook is the Definitions view of Edit mode: `NotebookView` in
`notebook-view.tsx` renders the net as a flat list of cells. A cell is a
place, a transition, a type, a differential equation or a parameter. Arcs and
component instances have no cell.

The list has two orders. `document`, the default, follows the order of the net
definition: places, transitions, types, differential equations, parameters.
`topological` follows the token flow and puts each declaration before the
first cell that uses it.

The notebook shows in place of the canvas and its panels, and its Monaco
editors use the same document URIs. An editor on either side attaches to the
one model of its URI.

An expanded cell edits in place: names, fields, arc weights, type
assignments and code, through `usePetrinautMutations`, as the properties
panel does. Adding and removing nodes, arcs and fields is done in the canvas
view.

The folder splits into plain functions and views. `notebook-model`,
`notebook-order`, `net-graph-layout` and `net-graph-animation` are functions
over the net definition, unit-tested without the DOM. `buildConnectionIndex`
and `buildDependentCounts` in `notebook-model` do the dependency analysis.
The `.tsx` files render their output and own only view state: expansion and
search live here, and selection comes from the editor. The graph explorer
draws the whole net from the arc structure alone and ignores canvas
positions.

The view is two groups of `react-resizable-panels`: the cells beside the
explorer, and in the explorer the graph above the connection lists. The
explorer and the lists keep their size in pixels when the window resizes. The
library holds both sizes, so neither is React state. The two separators meet
in a T, and a press there resizes both panes: the library takes it for both
groups because the explorer's panel is stacked over the separator beside it
(`explorerColumnStyle`). `edgeSeparatorStyle` in `ui/resize` gives the
separators the look of the ones that resize the docked panels.
