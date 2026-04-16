# Drawing a Net

## Editor layout

The editor is organized around a central canvas where you build your net:

- **Canvas** (center) -- the main workspace where places and transitions are displayed and connected.
- **Left sidebar** -- lists of entities organized into tabs: Nodes, Types, Differential Equations, Parameters.
- **Properties panel** (right) -- opens when you select an entity, showing its configurable properties.
- **Bottom panel** -- tabs for Diagnostics (code errors), Simulation Settings, and Timeline (during simulation).
- **Bottom toolbar** -- editing mode buttons and simulation controls (+ show/hide toggle for bottom panel).

<img width="1793" height="1175" alt="full-editor" src="https://github.com/user-attachments/assets/ea41efe8-9056-479b-a936-e0d5e4196b11" />

## Adding places and transitions

Use the bottom toolbar to add nodes:

- **Add Place** (shortcut: **N**) -- click the canvas to drop a place, or click and drag the button onto the canvas.
- **Add Transition** (shortcut: **T**) -- click the canvas to drop a transition, or drag the button onto the canvas.

New nodes are named automatically (Place1, Place2, Transition1, etc.). Rename them by selecting the node and editing the name in the properties panel.

<img width="160" height="58" alt="add-place-transition-toolbar" src="https://github.com/user-attachments/assets/9bb72c0b-6faa-4d17-a74d-ae6962087dab" />

## Connecting with arcs

Drag from a node's handle to connect it:

- **Place to Transition** creates an **input arc** (the transition consumes tokens from the place).
- **Transition to Place** creates an **output arc** (the transition produces tokens in the place).

Petri nets are bipartite: you cannot connect a place to another place or a transition to another transition. New arcs default to weight 1.

![drawing-arc](https://github.com/user-attachments/assets/ac688560-bba8-44fe-a6f8-c7ff320474a4)

## Arc weight

Select an arc to open its properties. Set the **weight** to control how many tokens are consumed (input) or produced (output) per firing.

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

| Tab                        | Contents                                                              |
| -------------------------- | --------------------------------------------------------------------- |
| **Nodes**                  | All places and transitions. Click to select and open properties.      |
| **Types**                  | Token types (colours). Click **+** to create a new type.              |
| **Differential Equations** | ODE definitions for continuous dynamics. Click **+** to create.       |
| **Parameters**             | Global parameters available in all user code. Click **+** to create.  |

Toggle the sidebar with the button in the top-left corner.

## Search

Press **Cmd+F** / **Ctrl+F** to open a search bar. Type to filter entities by name. Press **Escape** to close.

## Undo / Redo

Use the **Cmd+Z** / **Ctrl+Z** shortcut to undo the last action. Use the **Cmd+Shift+Z** / **Ctrl+Shift+Z** shortcut to redo the last action.

The recent history is displayed in the top-right corner. Click on a history entry to go back to that state.

## Keyboard shortcuts

| Shortcut             | Action                                  |
| -------------------- | --------------------------------------- |
| N                    | Add Place mode                          |
| T                    | Add Transition mode                     |
| H                    | Pan mode                                |
| V                    | Select mode                             |
| Escape               | Clear selection, return to cursor mode  |
| Cmd+A                | Select all places and transitions       |
| Cmd+C                | Copy selection                          |
| Cmd+V                | Paste                                   |
| Cmd+Z                | Undo                                    |
| Cmd+Shift+Z          | Redo                                    |
| Cmd+F                | Search                                  |
| Delete / Backspace   | Delete selection                        |

On Windows/Linux, use Ctrl instead of Cmd.

## Snap to grid

When enabled, node positions snap to a grid when placing or dragging. Toggle this in [visual settings](visual-settings.md).

## Import and export

From the hamburger menu (top-left):

- **Export as JSON** -- saves the full net definition including positions and visual styling.
- **Export as JSON without visual info** -- strips node positions and type display colours. Useful for sharing the logical structure only.
- **Export as TikZ** -- generates a `.tex` file with a structural diagram. This is a simplified view: no colours, inhibitor arcs, dynamics, or token types are encoded. Intended for papers and presentations.
- **Import from JSON** -- loads a net from a `.json` file. If node positions are missing, an automatic layout is applied.

## Auto-layout

From the hamburger menu, select **Layout** to apply an automatic graph layout (ELK) that rearranges all nodes. Useful after importing a net without positions or when a net has become cluttered. This will not always be an improvement!
