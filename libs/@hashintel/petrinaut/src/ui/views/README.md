---
layer: ui.views
role: The top-level screens of the editor, which are the editor shell, the net canvas and the notebook
---

Each subfolder is a screen: the [editor shell](layer:ui.views.editor), the
[canvas](layer:ui.views.canvas) and the [notebook](layer:ui.views.notebook).

The canvas and the notebook import nothing from the editor shell. The
[preview](layer:ui.preview) mounts the same canvas outside the editor, so the
canvas cannot depend on the shell around it.
