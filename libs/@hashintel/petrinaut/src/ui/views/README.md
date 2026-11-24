---
layer: ui.views
role: The top-level screens of the editor, which are the editor shell, the net canvas and the notebook
---

Each subfolder but `shared/` is a screen: the
[editor shell](layer:ui.views.editor), the [canvas](layer:ui.views.canvas) and
the [notebook](layer:ui.views.notebook). The shell's folder also holds
[Simulate](layer:ui.views.editor.simulate), the workspace the shell shows in
the Simulate mode. `shared/` holds code that more than one screen uses.

The canvas and the notebook import nothing from the editor shell. Rules of
`archinaut check` hold that. [The canvas](doc:ui.views.canvas/canvas) gives
the reason.
