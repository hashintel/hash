---
layer: ui.views.editor
name: Editor shell
role: Arranges the panels, toolbars and dialogs around the canvas
---

# Editor shell

The largest layer in the package, and mostly composition rather than logic: the
top bar, sidebars, bottom panel, and the dialogs and popovers they open.

`panels/` is where most of the surface area lives — metric authoring, experiment
configuration, the simulation timeline, the AI assistant, scenario editing. Each
panel owns its own view state and reads shared state from the React layer's
contexts, which is why panels can be added without touching the shell.
