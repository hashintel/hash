# Visual Settings

Access the settings dialog via the **gear icon** in the viewport controls (bottom-right corner of the canvas). The viewport controls are a small floating cluster of buttons -- zoom in / out, fit-to-view, and the gear icon -- anchored to the bottom-right of the canvas.

## Available settings

### Animations

Toggle panel transition and UI interaction animations. Disable for a snappier feel or if animations cause performance issues.

### Keep panels mounted

When enabled, hidden panels remain loaded in the background. Switching between panels is faster, but uses more memory. When disabled, panels are unmounted when hidden and re-created when opened.

### Minimap

Show or hide the **overview minimap** in the top-right corner of the canvas. The minimap provides a zoomed-out view of the entire net for orientation in large models.

### Snap to grid

When enabled, node positions snap to a grid when placing new nodes or dragging existing ones. Helps keep nets tidy and aligned.

### Compact nodes

Switch between two node rendering styles:

- **Compact** (enabled, the default) -- small card-style nodes that show just the place / transition name. Fits more of the net on screen at once; best for large or dense models where you mostly select-and-inspect via the Properties panel.
- **Classic** (disabled) -- larger nodes with inline summary information (e.g. token counts, firing-rate type indicators). Easier to read at a glance for small models or when teaching / demoing.

Toggle freely -- this setting only affects rendering, not the underlying net.

### Partial selection

Controls selection box behavior in [Select mode](drawing-a-net.md#pan-and-select-modes):

- **Enabled** -- nodes that are only partially inside the selection box are selected.
- **Disabled** -- nodes must be fully enclosed to be selected.

### Entities tree view (experimental)

Replaces the tabbed left sidebar with a unified **tree view** showing all entities (nodes, types, equations, parameters) in a single hierarchy.

### Arcs rendering

Choose how arcs are drawn between nodes:

| Style               | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| **Square**          | Right-angle paths (smoothstep routing).                     |
| **Bezier**          | Smooth curved paths.                                        |
| **Adaptive Bezier** | Curved paths that adjust based on node positions. (Default) |
