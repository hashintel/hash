# Visual Settings

Access the settings dialog via the **gear icon** in the viewport controls (bottom-right corner of the canvas). The viewport controls are a small floating cluster of buttons -- zoom in / out, fit-to-view, and the gear icon -- anchored to the bottom-right of the canvas.

On hosts with app navigation enabled, opening or closing this dialog is part of
Browser Back / Forward history. The setting values themselves remain saved
preferences and are not reverted by browser navigation.

## Available settings

### Animations

Toggle panel transition and UI interaction animations. Disable for a snappier feel or if animations cause performance issues. The results drawers follow it too: the header's condensing, the cards' folds and bar fills, and the purple pulse of a sweep's **Parameters** card while the optimizer drives it all hold still when animations are off, or when your system asks for reduced motion.

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

### Highlight on hover

When enabled (the default), resting the pointer on a node highlights its [neighbourhood](drawing-a-net.md#neighbourhood-highlight): what feeds it, what it feeds, and the arcs between.

Disable it and the pointer changes nothing. Selecting a node still highlights its neighbourhood, so the colours remain available on demand.

### Partial selection

Controls selection box behavior in [Select mode](drawing-a-net.md#pan-and-select-modes):

- **Enabled** -- nodes that are only partially inside the selection box are selected.
- **Disabled** -- nodes must be fully enclosed to be selected.

### WebGPU (experimental)

Off by default. Offers a GPU option when creating an experiment; each experiment then chooses its own backend. See [Compute backend](experiments.md#compute-backend-experimental).

### Compilation output (experimental)

Off by default. Adds a [Compilation](compilation-output.md) tab to the bottom panel.

### Parameter sweeps (experimental)

Off by default. Adds an interval toggle to every numeric value of the experiment form -- **Sweep**, or **Optimize** when In-browser optimization is on -- so an experiment explores an interval instead of one value. See [Parameter sweeps](experiments.md#parameter-sweeps).

### In-browser optimization (experimental)

Shown only when the host application provides an optimizer that runs in your browser. Off by default. On, the experiment form's interval toggles read **Optimize**: creating the experiment starts a study over the selected intervals, with an **Objective** and **Constraints** chosen in the form. Off, the toggles read **Sweep** and the sweep waits for your selection; any running in-browser optimization is cancelled. See [Optimizing a sweep](experiments.md#optimizing-a-sweep).

### Arcs rendering

Choose how arcs are drawn between nodes:

| Style               | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| **Square**          | Right-angle paths (smoothstep routing).                     |
| **Bezier**          | Smooth curved paths.                                        |
| **Adaptive Bezier** | Curved paths that adjust based on node positions. (Default) |
