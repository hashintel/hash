---
layer: ui.views
role: The top-level screens of the editor, which are the editor shell, the net canvas and the notebook
---

Three subfolders are screens: the [editor shell](layer:ui.views.editor), the
[canvas](layer:ui.views.canvas) and the [notebook](layer:ui.views.notebook).
The fourth, `shared/`, holds code that two screens use.

The canvas and the notebook import nothing from the editor shell. No rule of
`archinaut check` enforces it. [The canvas](doc:ui.views.canvas/canvas) gives
the reason.
