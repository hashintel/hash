# Composition

Build a net from components: subnets drawn once and placed many times, joined to the net and to each other by **fusing** places. A fused set of places is one place when the net runs.

Composition is experimental. Enable **User settings → Labs → Net Components** to see the Nets and Components panels and the component tool.

## Components and instances

A component is a subnet: a net of its own with places, transitions, types, parameters and equations. Draw one from the **Nets** panel (**+**), or let the **Components** panel add one. Mark the places that form its boundary as **ports** in the place properties (**Options → Component port**).

To use a component, place an **instance** of it:

- In the **Components** panel, click a component, then click the canvas where the instance goes, or drag the component onto the canvas.
- Or pick it from the cube tool in the bottom toolbar and click the canvas.

An instance shows its ports as dots on its box. Select it to name it, describe it and set its parameters.

## Component libraries

The host application, or its plugins, may offer **component libraries**: ready-made components listed in the Components panel under the library's name. The demo site offers the **Standard components**: a Source, a Sink, a Stage, a Server with a pool of workers, a Splitter, a Merger and an Assembly, all for untyped tokens.

The first time you use a library component, a copy of it joins your document as a subnet, so the document stays complete without the plugin. Using it again reuses the copy.

## Ports and their direction

A port can declare a **direction** in the place properties, under Component port:

- **Input** -- the component only takes tokens from it.
- **Output** -- the component only puts tokens into it.
- **Input and output** -- both, as a shared pool of resources is.
- **Inferred** -- whatever the component's arcs do with it.

Input ports draw on the left of an instance, output ports on the right, two-way ports on both sides. The checks tell you when a component uses a port against its declaration.

## Fusing places

Drag between a place and an instance's port, or between the ports of two instances, to **fuse** them. The fusion draws as a dashed line with a knot in the middle; click it to see the fused places and the name of the fused place.

- A fusion joins any number of ports and at most one place of the net itself, which gives the fused place its name, initial marking and visualizer. Dragging a second place onto a fusion is refused with a notice; fuse the ports with the place you already have.
- Dragging onto a port or place that is already fused adds to that fusion. Fusing two fused things merges their fusions.
- Remove one member from the fusion's properties, or delete the fusion with its trash button or the Delete key.
- A port can still be connected to a transition with an arc, as before; the arc reaches the fused place.

The fused places must agree: the same token type, the same capacity where one is set, and at most one differential equation among them. Disagreements show in red on the knot and in the fusion's properties, and in the **Diagnostics** tab under **Composition**, with notes for a fusion nothing fills or nothing empties.

## Components only

Switch **Components only** on in the Components panel to build the root net from instances and fusions alone: the place and transition tools go away, and any place or transition the root still holds is reported under Composition in Diagnostics. The switch is saved with the net.

## Code view

With the **Code view** plugin, **Code** appears beside **Canvas** and **Definitions**. It shows the net as text in the Petrinaut DSL, with its components inline and every piece of code as the function body you wrote, re-printed on every change. The view is read-only for now; select an item on the canvas or in the sidebar to jump to its lines, and use **Copy** to take the text elsewhere.

## Example

**Load example → Assembly Line** opens a line built from the standard components: a Source of parts feeds a Cutter stage, whose output is the net's Buffer place with a capacity of 5, which a Drill stage empties into Finished. Open the Code view to read the whole line on one screen.
