# Visual Settings

Access the settings dialog via the **gear icon** in the viewport controls (bottom-right corner of the canvas). The viewport controls are a small floating cluster of buttons -- zoom in / out, fit-to-view, and the gear icon -- anchored to the bottom-right of the canvas.

On hosts with app navigation enabled, opening or closing this dialog is part of
Browser Back / Forward history. The setting values themselves remain saved
preferences and are not reverted by browser navigation.

## Available settings

### Petricon

In the **Viewport** section, turn on **Petricon (Experimental)** to use Petricon, Petrinaut's
custom icons for entities, playback, zoom, and navigation. The pack includes the
sidebar toggle, main menu, pan hand and compact selection arrow, add-place and add-transition
buttons, settings gears, editing actions, diagnostics, simulation and data views,
and assistant and voice controls, including icons inside shared menus and forms.
Checkbox marks and loading indicators keep their default appearance.
The change applies immediately, and turning it off
restores the default icons.

**Add Place** and **Add Transition** show a plain circle and square. Hover over
either button to reveal a plus at the bottom-right of its shape; the plus disappears
when you move away. Selecting either tool fills its icon and plays a short bounce. Turning off **Animations** below keeps the selection feedback and removes
the motion. Icons also respect your device's reduced-motion preference.
The sidebar toggle keeps a thin line near the left edge of its frame when the
sidebar is collapsed. Hovering makes it thicker and moves it slightly right.
When open, the full-height divider sits left of center and nudges a little
left on hover to suggest closing. The outer frame stays still.
Settings gears have sharp teeth and turn slightly while their menu is open,
returning to their resting angle when it closes. Turning off **Animations**
changes the angle immediately.

Other interactive icons give small action hints on hover: the trash lid lifts,
the copy sheets separate, and arrows move slightly in their direction. The main
menu icon changes when its menu opens, the playback icon changes between play
and pause, and the microphone draws a slash when muted. These transitions follow
the control's state. Decorative icons stay still, and disabled controls do not
animate. The **Animations** setting and your device's reduced-motion preference
apply throughout the pack.

Clicking an action icon gives a brief response that follows its purpose: arrows
move in their direction, sheets separate for copying, and parameter knobs scrub
along their tracks. These movements settle back without changing the control's
meaning. Controls with a persistent state keep their existing state animation.

**Recent changes** uses a clock with a return arrow. Hovering or opening its menu
briefly rewinds the hands. The subnet cube turns in depth on hover and makes a
quarter-turn when clicked. The click turn finishes even if you move the pointer
or keyboard focus away; rear edges stay hidden throughout the turn.

The running-person icon runs in place while you hover over its control or focus
it with the keyboard. Clicking makes it jump, then land and continue running
until you move away or move keyboard focus elsewhere.

The AI assistant button uses a robot head. Hovering makes its eyes blink and
its antenna move briefly before settling.

Hovering over **Edit** turns the triangle toward the right, tilts the square and
diamond separately, and nudges the circle. Selecting **Edit** moves the shapes
into a different resting arrangement, which stays until you leave Edit mode.
Both resting states keep the shapes aligned and the square upright.
Hovering while Edit is selected adds smaller movements to that arrangement.

Hovering over a parameter icon briefly scrubs its slider knobs along their tracks,
then returns them to their starting positions. The tracks stay horizontal. This
is a visual preview; your parameter values stay the same.

In **Simulate**, the **Experiments** flask has a flat liquid surface at rest.
Hovering sends a wave across the liquid, which then settles back to flat even if
you move away. The glass stays still, and the shaded fill makes the fluid visible
at small sizes. Selecting
it raises the liquid slightly. The **Scenarios** icon gently separates its layers
on hover and selection. Both respond quickly to pressing and settle when released;
moving away returns them to the selected or unselected appearance.

The diagnostics indicator transitions between a green check when valid, an
amber exclamation mark for warnings, and a red cross for errors. The same two
strokes move and change length between these shapes. The issue count slides
out from behind the icon with a soft fade, and the badge smoothly resizes around
it. Resolving every issue slides the count back away. These animations follow
validation results; clicking the indicator opens Diagnostics.

The pack is off by default. Your choice is saved in this browser and restored
when you reopen Petrinaut.

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

- **Classic** (disabled, the default) -- larger nodes with inline summary information (e.g. token counts, firing-rate type indicators). Easier to read at a glance for small models or when teaching / demoing.
- **Compact** (enabled) -- small card-style nodes that show just the place / transition name. Fits more of the net on screen at once; best for large or dense models where you mostly select-and-inspect via the Properties panel.

Both styles draw a node the same way -- a thin outline in the place's token colour, a white transition, and a soft shadow -- and differ only in a node's size, shape, and how much it shows.

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
