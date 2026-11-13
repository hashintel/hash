# Composition

Build a net from components: subnets drawn once and placed many times, joined to the net and to each other by **fusing** places. A fused set of places is one place when the net runs.

Composition is experimental. Enable **User settings → Labs → Net Components** to see the Nets panel and the component tool.

## Components and instances

A component is a subnet: a net of its own with places, transitions, types, parameters and equations. Draw one from the **Nets** panel (**+**). Mark the places that form its boundary as **ports** in the place properties (**Options → Component port**).

To use a component, place an **instance** of it: pick the component from the cube tool in the bottom toolbar and click the canvas. An instance draws as a card: its name, the component it runs, and a labelled pin on its edge for each port, coloured by the port's token type. Inside the component, a port place wears the same pin on its own edge and says which kind of port it is beside its name, so the boundary reads alike from inside and outside. Select an instance to name it, describe it and set its parameters.

A component with more than four ports starts **folded**: its card keeps its base height, says how many ports go in and out, and its arcs and fusion links meet its edges. The chevron in the card's header unfolds it to show every port with its pin and name, and folds it again. The card unfolds downward, so its header stays where it is.

A component can carry its own **icon** and **colour**. Open the options on its row in the **Nets** panel, choose an SVG file under **Icon** and a colour under **Color**. The icon's shape is drawn in one colour, the component's or the default grey, in place of the cube on the card of each instance and beside the component's name in the **Nets** panel. An instance of an interface wears the icon and colour of the implementation it runs, then the interface's own. **Remove** takes the icon away again, and an export without visual information leaves both out.

A transition of the net can connect to a port with an arc, as to any place. The arc reaches the place inside the instance.

## Ports and their direction

A port can declare a **direction** in the place properties, under Component port:

- **Input** -- the component only takes tokens from it.
- **Output** -- the component only puts tokens into it.
- **Input and output** -- both, as a shared pool of resources is.
- **Inferred** -- whatever the component's arcs do with it.

Input ports pin the left edge of an instance, output ports the right, two-way ports both. The checks tell you when a component uses a port against its declaration, in the **Diagnostics** tab under **Composition**.

## Fusing places

Drag between a place and an instance's port, or between the ports of two instances, to **fuse** them. The fusion draws as a dashed line with a knot in the middle; click it to see the fused places and the name of the fused place.

- A fusion joins any number of ports and at most one place of the net itself, which gives the fused place its name, initial marking and visualizer. Dragging a second place onto a fusion is refused with a notice; fuse the ports with the place you already have.
- Dragging onto a port or place that is already fused adds to that fusion. Fusing two fused things merges their fusions.
- Remove one member from the fusion's properties, or delete the fusion with its trash button or the Delete key.
- A port that is fused can still be connected to a transition with an arc; the arc reaches the fused place.

The fused places must agree: the same token type, the same capacity where one is set, and the same differential equations on the places that have dynamics. A transition can reach a fused place through one arc of each kind: two arcs of the same kind from one transition onto places of one fusion are an error, and one of them has to go. Problems turn the fusion's line red, or amber for a warning. They are listed in the fusion's properties and in the **Diagnostics** tab under **Composition**, with notes for a fusion nothing fills or nothing empties, and the errors and warnings count in the bottom bar's diagnostics indicator.

When the net runs, each fusion is one place: tokens a component puts into its port are in the fused place, and a transition of another component takes them from there.

## Interfaces and implementations

An **interface** is a component with ports and parameters but no body: it says what a component looks like from outside without saying how it works. Add a subnet, mark its places as ports, then open its options in the **Nets** panel (the gear on its row) and tick **Interface**. Its row shows a puzzle piece. An interface holds no transitions or instances; remove them before ticking the box.

A component **implements** an interface when its options tick that interface under **Implements**. It needs every port the interface declares, matched by name and holding the same token type, and every parameter, matched by variable name; it may have more of each. A port used against the direction the interface declares is a warning. Problems show in the **Diagnostics** tab under **Composition**; click one to open the subnet or select the instance it is about.

An instance of an interface runs an **implementation**:

- The interface's options choose the **Default implementation** for the whole document.
- An instance's properties choose an **Implementation** for that instance alone, or keep the document's default. The properties say which implementation the instance runs, and so does the card on the canvas, under the instance's name.

Wire the net against the interface: arcs and fusions attach to the interface's ports and follow whichever implementation runs. An instance with nothing bound is an error, and the net does not run until an implementation is chosen for it. The net does not run either while the implementation that is bound falls short of its interface, or while a component holds an instance that runs that same component, directly or through others: both are listed under **Composition**.
