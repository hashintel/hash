# Composition

Build a net from components: subnets drawn once and placed many times, joined to the net and to each other by **fusing** places. A fused set of places is one place when the net runs.

Composition is experimental. Enable **User settings → Labs → Net Components** to see the Nets panel, the component tool and the Components panel. A net that already holds components draws and runs with the setting off: only the tools that edit them are hidden.

## Components and instances

A component is a subnet: a net of its own with places, transitions, types, parameters and equations. Draw one from the **Nets** panel (**+**). Mark the places that form its boundary as **ports** in the place properties (**Options → Component port**).

To use a component, place an **instance** of it: pick the component from the cube tool in the bottom toolbar and click the canvas. An instance draws as a card: its name, the component it runs, and a labelled pin on its edge for each port, coloured by the port's token type. Inside the component, a port place wears the same pin on its own edge and says which kind of port it is beside its name, so the boundary reads alike from inside and outside. Select an instance to name it, describe it and set its parameters.

A component with more than four ports starts **folded**: its card keeps its base height, says how many ports go in and out, and its arcs and fusion links meet its edges. The chevron in the card's header unfolds it to show every port with its pin and name, and folds it again. The card unfolds downward, so its header stays where it is.

A component can carry its own **icon** and **colour**. Open the options on its row in the **Nets** panel, choose an SVG file under **Icon** and a colour under **Color**. The icon's shape is drawn in one colour, the component's or the default grey, in place of the cube on the card of each instance and beside the component's name in the **Nets** panel. An instance of an interface wears the icon and colour of the implementation it runs, then the interface's own. An icon is plain shapes: its SVG may hold only `svg`, `g`, `path`, `rect`, `circle`, `ellipse`, `line`, `polyline` and `polygon` elements. A file with any other element, such as `use`, `defs`, `title` or `style`, is refused, and the message names the element to remove. **Remove** takes the icon away again, and an export without visual information leaves both out.

A transition of the net can connect to a port with an arc, as to any place. The arc reaches the place inside the instance.

## Ports and their direction

A port can declare a **direction** in the place properties, under Component port:

- **Input** -- the component only takes tokens from it.
- **Output** -- the component only puts tokens into it.
- **Input and output** -- both, as a shared pool of resources is.
- **Inferred** -- whatever the component's arcs do with it, or with a port of an instance inside the component that it is fused with. A read or an inhibitor arc takes nothing from a place, so it does not make a port an input.

Input ports pin the left edge of an instance, output ports the right, two-way ports both. The checks tell you when a component uses a port against its declaration, in the **Diagnostics** tab under **Composition**.

## Fusing places

Drag between a place and an instance's port, or between the ports of two instances, to **fuse** them. The fusion draws as a dashed line with a knot in the middle; click it to see its name and the fused places. A new fusion is named **Fusion 1**, **Fusion 2** and so on: rename it in its properties. A fusion always has a name, so an empty one is refused.

- A fusion joins any number of ports and at most one place of the net itself, which gives the fused place its initial marking and visualizer. Dragging a second place onto a fusion is refused with a notice; fuse the ports with the place you already have.
- Dragging onto a port or place that is already fused adds to that fusion. Fusing two fused things merges their fusions.
- Drag an end of a fusion's line onto another port or place to move the fusion there, or drop it on the empty canvas to take that end out. Where a fusion joins more than two, its lines meet at one of them, and each line moves by its other end.
- Remove one member from the fusion's properties, or delete the fusion with its trash button or the Delete key.
- A port that is fused can still be connected to a transition with an arc; the arc reaches the fused place.

The fused places must agree: the same token type, the same capacity where one is set, and the same differential equations on the places that have dynamics. A transition can reach a fused place through one arc of each kind: two arcs of the same kind from one transition onto places of one fusion are an error, and one of them has to go. Problems turn the fusion's line red, or amber for a warning. They are listed in the fusion's properties and in the **Diagnostics** tab under **Composition**, with notes for a fusion nothing fills or nothing empties, and the errors and warnings count in the bottom bar's diagnostics indicator.

When the net runs, each fusion is one place, shown under the fusion's name: tokens a component puts into its port are in the fused place, and a transition of another component takes them from there.

## Interfaces and implementations

An **interface** is a component with ports and parameters but no body: it says what a component looks like from outside without saying how it works. Add a subnet, mark its places as ports, then open its options in the **Nets** panel (the gear on its row) and tick **Interface**. Its row shows a puzzle piece. An interface holds no transitions or instances; remove them before ticking the box. An interface cannot implement an interface: ticking the box clears what the subnet implemented.

A component **implements** an interface when its options tick that interface under **Implements**. It needs every port the interface declares, matched by name and holding the same token type, and every parameter, matched by variable name; it may have more of each. A port used against the direction the interface declares is a warning. Problems show in the **Diagnostics** tab under **Composition**; click one to open the subnet or select the instance it is about.

An instance of an interface runs an **implementation**:

- The interface's options choose the **Default implementation** for the whole document. An interface has one default: a file that names two is an error under **Composition**, the first applies, and choosing the default again keeps one.
- An instance's properties choose an **Implementation** for that instance alone, or keep the document's default. The properties say which implementation the instance runs, and so does the card on the canvas, under the instance's name.

Wire the net against the interface: arcs and fusions attach to the interface's ports and follow whichever implementation runs. An instance with nothing bound is an error, and the net does not run until an implementation is chosen for it. The net does not run either while the implementation that is bound falls short of its interface, or while a component holds an instance that runs that same component, directly or through others: both are listed under **Composition**.

## Components from libraries

An application that embeds Petrinaut can offer **libraries**: sets of components kept outside the document. Each library is listed in the **Components** panel on the left under its name, with its components beneath it. Click a component, then the canvas, to place an instance of it, or drag it from the panel onto the canvas. The panel shows once Net Components is on, and places instances in the root net.

A document that uses a component of a library **imports** the library: it keeps the library's id and nothing else, and reads the components each time it is opened. Placing the first instance from a library adds the import, and so does choosing one of its components as an instance's implementation. Removing the last instance leaves it in place. A component of a library is not in the Nets panel and cannot be opened or changed. An instance's properties name the component and the library it comes from. Wire its ports as any others, with fusions and with arcs, and set its parameters on the instance.

A component of a library either runs, or is an **interface**, shown with a puzzle piece. An instance of an interface needs an implementation, chosen in its properties: a component of the document that has the interface's ports and parameters, or a component of a library that does. A component of a library can likewise be chosen as the implementation of an interface of the document. Across a library nothing is ticked under **Implements**: the choice is checked on the ports and parameters, and what is missing is reported on the instance under **Composition**.

While a library is being fetched, the editor is covered and says **Resolving**. Nothing is reported about that library until it has arrived, and the net does not run before it has.

A library that cannot be fetched, or that the application does not know, is one error under **Composition**, naming the library and how many instances use it. Instances of its components draw with **unresolved** under their name and no ports, the Components panel says why under the library's id, and the net does not run. Such an instance can still be renamed, described, moved and removed.

An instance that names a component its library does not have draws the same way and keeps the net from running. It is one error under **Composition**, naming the instance, the component and the library.

To hand a document to someone without the libraries, export it with its imports inlined: **Export → YAML with imports inlined** or **JSON with imports inlined**, offered when the document imports a library. Each component the document uses becomes a subnet of the file, under ids of its own, and the file imports nothing.

A library the net names without importing it, as a file edited by hand may, is one error under **Composition**. Choose the component or the implementation again to add the import.

### Composing only

An application can set Petrinaut up to compose the components of its libraries and nothing else. The editor then shows the canvas, the **Components** panel and the **Diagnostics** tab, whether Net Components is on or off. It has no tools that draw places or transitions, no Nets panel, no Definitions view and no simulator. It shows the root net only: a diagnostic or a link that points into a subnet opens the root net.

What is left is composing: place instances, name them and set their parameters, fuse their ports by dragging from one pin to another, move or detach the ends of a fusion's line, delete instances and fusions, and arrange the canvas. An instance of an interface chooses its **Implementation** among the components of the application's libraries, or keeps the document's default. Anything else, a paste included, is refused with a notice.

Undo goes back as far as where the editor started composing, and no further: what was done to the net before that stays. **Recent changes** lists the changes made since.
