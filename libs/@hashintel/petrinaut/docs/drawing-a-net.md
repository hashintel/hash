# Drawing a Net

## Editor layout

The editor is organized around a central canvas where you build your net:

- **Top bar** -- net management menu, optional title field, **Edit / Simulate / Actual** mode switcher, active-experiments indicator, recent-changes history. See [Top bar](#top-bar).
- **Canvas** (center) -- the main workspace where places and transitions are displayed and connected.
- **Left sidebar** -- lists of entities organized into tabs: Nodes, Types, Differential Equations, Parameters.
- **Properties panel** (right) -- opens when you select an entity, showing its configurable properties.
- **Bottom panel** -- tabs for Diagnostics (code errors), Simulation Settings, and Timeline (during simulation).
- **Bottom toolbar** -- editing mode buttons, simulation controls, the AI assistant toggle, and a show/hide button for the bottom panel.

<img width="1793" height="1175" alt="full-editor" src="https://github.com/user-attachments/assets/ea41efe8-9056-479b-a936-e0d5e4196b11" />

## Top bar

Spans the full editor width and has three sections.

**Left**

- **Sidebar toggle** -- collapses or expands the left sidebar.
- **Menu** (hamburger icon) -- file operations: **Export** (JSON / JSON without visual info / TikZ), **Layout** (apply auto-layout), and **Docs**. A standalone embed of Petrinaut may additionally show **New**, **Open**, **Import**, and **Load example**.
- **Net title** -- editable inline title for the current net. Whether the title field is shown depends on the host application; the demo site shows it, but a Petrinaut embedded in another product may hide it.

**Center**

- **Edit / Simulate / Actual** mode switcher. See [Global modes](#global-modes) below.

**Right**

- **Active experiments** -- a flask icon with a count (e.g. "2 active") that appears only when [Monte Carlo experiments](experiments.md) are initializing or running. Clicking it opens a popover; clicking a row jumps to that experiment in Simulate mode.
- **Recent changes** (clock icon) -- a dropdown listing your recent undo/redo checkpoints with timestamps. Click any entry to jump to that state. This is the same history you walk via Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z.
- The host application may add additional buttons here (login, share, ...).

## Global modes

Petrinaut global modes are switched via the centre control in the top bar.

| Mode         | Workspace                                                                                                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Edit**     | Canvas + left sidebar + properties panel + bottom panel + bottom toolbar (with AI assistant). This is where you draw the net, configure entities, write code, and run single simulations.            |
| **Simulate** | Replaces the workspace with the [Scenarios](scenarios.md) and [Experiments](experiments.md) management views, plus [Optimizations](optimization.md) when the host application provides an optimizer. |
| **Actual**   | Shows a host-provided live execution source. It is disabled unless the host provides Actual-mode data. See [Actual Mode](actual-mode.md).                                                            |

In Simulate mode the net structure becomes read-only -- you can still manage scenarios and experiments and, when enabled by the host, run optimizations. You cannot change places, transitions, arcs, types, or parameters. Switch back to Edit mode to modify the net.

In Actual mode the net is also read-only. It shows the Petri net supplied by the live source, with an Actual timeline and Events tab in the bottom panel when execution data is available.

Switching modes does not stop background experiments. The active-experiments indicator remains visible in the top bar from any mode.

## Adding places and transitions

Use the bottom toolbar to add nodes:

- **Add Place** (shortcut: **N**) -- click the canvas to drop a place, or click and drag the button onto the canvas.
- **Add Transition** (shortcut: **T**) -- click the canvas to drop a transition, or drag the button onto the canvas.

New nodes are named automatically (Place1, Place2, Transition1, etc.). Rename them by selecting the node and editing the name in the properties panel.

<img width="160" height="58" alt="add-place-transition-toolbar" src="https://github.com/user-attachments/assets/9bb72c0b-6faa-4d17-a74d-ae6962087dab" />

## Connecting with arcs

Drag from a node's handle to connect it:

- **Place to Transition** creates an **input arc** (standard input arcs consume tokens from the place).
- **Transition to Place** creates an **output arc** (the transition produces tokens in the place).

Petri nets are bipartite: you cannot connect a place to another place or a transition to another transition. New arcs default to weight 1. Input arcs default to **Standard**, and can be changed to **Read** or **Inhibitor** in the arc properties panel.

![drawing-arc](https://github.com/user-attachments/assets/ac688560-bba8-44fe-a6f8-c7ff320474a4)

## Component ports

Subnets can expose selected places as ports. If you don't see subnet or component controls, enable **Settings → Net Components** first.

Open the subnet, select a boundary place, and enable **Component port** in the place properties panel.

When you instantiate that subnet as a component, each port appears as a handle on the component instance:

- Drag from a transition to a component port to create an output arc into that port.
- Drag from a component port to a transition to create an input arc from that port.

Port arcs behave like ordinary transition arcs: they have weights, input arcs can be Standard, Read, or Inhibitor, and simulation treats the port as the corresponding place inside that component instance.

## Arc weight

Select an arc to open its properties. Set the **weight** to control how many tokens are required and consumed (standard input), required without being consumed (read input), blocked by (inhibitor input), or produced (output) per firing.

You can also edit an arc's weight via the properties panel for the transition it is connected to.

See also: [arc weight for multi-token operations](useful-patterns.md#arc-weight-for-multi-token-operations).

## Pan and Select modes

The editor has two cursor modes, toggled from the bottom toolbar dropdown:

| Mode       | Shortcut | Behavior                                               |
| ---------- | -------- | ------------------------------------------------------ |
| **Pan**    | H        | Click and drag to pan the canvas. This is the default. |
| **Select** | V        | Click and drag to draw a selection box around nodes.   |

With a selection, you can:

- **Move** -- drag selected nodes to reposition them.
- **Delete** -- press **Backspace** or **Delete**.
- **Copy** -- **Cmd+C** (Mac) / **Ctrl+C** (Windows/Linux).
- **Paste** -- **Cmd+V** / **Ctrl+V**.

Whether a node must be fully inside or only partially inside the selection box is configurable in [visual settings](visual-settings.md).

<img width="941" height="296" alt="selection" src="https://github.com/user-attachments/assets/174dd165-1be9-45a4-bccf-ffdd2e419d44" />

## Left sidebar

The left sidebar has four tabs for creating and managing entities:

| Tab                        | Contents                                                             |
| -------------------------- | -------------------------------------------------------------------- |
| **Nodes**                  | All places and transitions. Click to select and open properties.     |
| **Types**                  | Token types (colours). Click **+** to create a new type.             |
| **Differential Equations** | ODE definitions for continuous dynamics. Click **+** to create.      |
| **Parameters**             | Global parameters available in all user code. Click **+** to create. |

Toggle the sidebar with the button in the top-left corner.

## Search

Press **Cmd+F** / **Ctrl+F** to open a search bar. Type to filter entities by name. Press **Escape** to close.

## Undo / Redo

Use the **Cmd+Z** / **Ctrl+Z** shortcut to undo the last action. Use the **Cmd+Shift+Z** / **Ctrl+Shift+Z** shortcut to redo the last action.

The recent history is displayed in the top-right corner. Click on a history entry to go back to that state.

## Keyboard shortcuts

| Shortcut           | Action                                 |
| ------------------ | -------------------------------------- |
| N                  | Add Place mode                         |
| T                  | Add Transition mode                    |
| H                  | Pan mode                               |
| V                  | Select mode                            |
| Escape             | Clear selection, return to cursor mode |
| Cmd+A              | Select all places and transitions      |
| Cmd+C              | Copy selection                         |
| Cmd+V              | Paste                                  |
| Cmd+Z              | Undo                                   |
| Cmd+Shift+Z        | Redo                                   |
| Cmd+F              | Search                                 |
| Delete / Backspace | Delete selection                       |

On Windows/Linux, use Ctrl instead of Cmd.

## Snap to grid

When enabled, node positions snap to a grid when placing or dragging. Toggle this in [visual settings](visual-settings.md).

## Import and export

From the top-bar menu (hamburger icon), under **Export**:

- **JSON** -- the full SDCPN: places, transitions, arcs, types, dynamics, parameters, scenarios, metrics, **and** canvas positions / display colours. The format other Petrinaut instances can re-import faithfully.
- **JSON without visual info** -- the same payload minus node positions and type display colours. Useful when only the logical structure matters (sharing for review, embedding in another tool, comparing two nets without layout noise). On import, the receiving editor applies auto-layout to fill in positions.
- **TikZ** -- a `.tex` file with a structural diagram. This is a simplified view: only the place / transition / arc structure is included. Token types, dynamics, read/inhibitor arcs, scenarios, and metrics are **not** encoded. Intended for papers and presentations.

**Import**: loads a net from a `.json` file. If node positions are missing, an automatic layout is applied on load.

## Auto-layout

From the hamburger menu, select **Layout** to apply an automatic graph layout (ELK) that rearranges all nodes. Useful after importing a net without positions or when a net has become cluttered. This will not always be an improvement!
