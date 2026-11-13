# Composition

Build a net from components: subnets drawn once and placed many times, joined to the net and to each other by **fusing** places. A fused set of places is one place when the net runs.

Composition is experimental. Enable **User settings → Labs → Net Components** to see the Nets panel and the component tool.

## Components and instances

A component is a subnet: a net of its own with places, transitions, types, parameters and equations. Draw one from the **Nets** panel (**+**). Mark the places that form its boundary as **ports** in the place properties (**Options → Component port**).

To use a component, place an **instance** of it: pick the component from the cube tool in the bottom toolbar and click the canvas. An instance shows its ports as dots on its box. Select it to name it, describe it and set its parameters.

A transition of the net can connect to a port with an arc, as to any place. The arc reaches the place inside the instance.

## Ports and their direction

A port can declare a **direction** in the place properties, under Component port:

- **Input** -- the component only takes tokens from it.
- **Output** -- the component only puts tokens into it.
- **Input and output** -- both, as a shared pool of resources is.
- **Inferred** -- whatever the component's arcs do with it.

Input ports draw on the left of an instance, output ports on the right, two-way ports on both sides. The checks tell you when a component uses a port against its declaration, in the **Diagnostics** tab under **Composition**.

## Fusing places

Drag between a place and an instance's port, or between the ports of two instances, to **fuse** them. The fusion draws as a dashed line with a knot in the middle; click it to see the fused places and the name of the fused place.

- A fusion joins any number of ports and at most one place of the net itself, which gives the fused place its name, initial marking and visualizer. Dragging a second place onto a fusion is refused with a notice; fuse the ports with the place you already have.
- Dragging onto a port or place that is already fused adds to that fusion. Fusing two fused things merges their fusions.
- Remove one member from the fusion's properties, or delete the fusion with its trash button or the Delete key.
- A port that is fused can still be connected to a transition with an arc; the arc reaches the fused place.

The fused places must agree: the same token type, the same capacity where one is set, and the same differential equations on the places that have dynamics. A transition can reach a fused place through one arc of each kind: two arcs of the same kind from one transition onto places of one fusion are an error, and one of them has to go. Problems turn the fusion's line red, or amber for a warning. They are listed in the fusion's properties and in the **Diagnostics** tab under **Composition**, with notes for a fusion nothing fills or nothing empties, and the errors and warnings count in the bottom bar's diagnostics indicator.

When the net runs, each fusion is one place: tokens a component puts into its port are in the fused place, and a transition of another component takes them from there.
