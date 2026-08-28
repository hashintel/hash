# Notebook View

> **Experimental.** Enable **Notebook view** in the viewport settings dialog (the gear button in the canvas controls) to add a **Notebook** option to the mode selector in the top bar.

The Notebook view shows your net as a list of one-line cells — one per place, transition, token type, differential equation, and parameter — so you can read a model like code instead of untangling a diagram. It is read-only: use it to review, debug, or understand a net (especially one someone else built), and switch back to **Edit** to change anything.

## Cells

Each row reads like a declaration: the kind keyword (`Place`, `Transition`, `Type`, `Equation`, `Parameter`), the name, and a one-line summary — a transition shows its flow (`WIPQueue, ChambersAvailable → InProcess`), a place shows its type and dynamics, a parameter shows its value.

- Click the caret (or press **→** / **←**) to open or close a cell. Open cells show the full definition: a transition's inputs and outputs with weights and arc kinds, its firing-time and kernel code, an equation's code, a type's fields. Cells stay as you leave them; selecting a cell does not open it.
- Click a row to select it. **↑** / **↓** move the selection, **Enter** or **Space** select the focused row.
- The end of each row shows how many things depend on it, as `direct → total`. `2 → 11` means two cells use it directly and eleven are affected in total downstream.

Two badges can appear after a cell's name:

- **`initial`** (blue) — this place must hold tokens in the initial state. Nothing in the net can produce its first token: either nothing feeds it at all, or it belongs to a pool that only circulates what it starts with (a resource pool such as a set of machines). If a scenario leaves every place of such a group empty, the transitions that need it can never fire.
- **`↻N`** (tinted) — this node is part of cycle _N_. Hover the badge to light up the whole cycle in the list and the graph.

## Toolbar

- **Search** — type in the search box (or press **/**) to fuzzy-match cell names; matching characters are highlighted and other cells fade. **↑** / **↓** step through matches, **Enter** jumps to the first one, **Escape** clears.
- **Document / Topological** — list cells in the order the net stores them, or in flow order where every type, equation, and parameter appears just before the first cell that uses it, and places that must be seeded come first.
- **Kind filters** — toggle Places, Transitions, Types, Equations, and Parameters in and out of the list and the search.

## Dependency lines

Selecting a cell draws angled connector lines in the margins: the left gutter connects it to what it depends on, the right gutter to what depends on it.

## Graph explorer

The right-hand panel draws the whole net as a top-to-bottom flow graph of places (pills, with their token type's colour dot) and transitions (boxes) — laid out from the arc structure, ignoring canvas positions. Places that must hold initial tokens carry a hollow token marker, and cycle members carry a dashed ring.

- Selecting a place or transition highlights it in the graph: dependencies in blue, dependents in orange, a node connected in both directions in purple. Clicking a node in the graph selects its cell.
- The **target button** re-organizes the graph around the selected node: what it depends on stacks above it, what depends on it below, everything else settles underneath. The re-layout is animated. Toggle it off to return to the default flow layout.
- Below the graph, the selected cell's dependencies and dependents are listed in full — including types, equations, and parameters, which the diagram itself leaves out.
- Drag the panel's left edge to resize it, and the divider above the lists to trade space between the graph and the lists.

## Limits

- The view is read-only, including for the AI assistant.
- Subnets and component instances are not shown as cells yet.
- A parameter counts as "used" by a transition or equation when its variable name appears in the code — comments included.
