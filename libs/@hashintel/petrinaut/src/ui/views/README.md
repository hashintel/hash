---
layer: ui.views
role: The top-level screens the editor composes — the editor shell, the net canvas, and the notebook
---

Each subfolder is a screen rather than a widget. The split matters because the
canvas is reused outside the full editor — Actual mode renders a net with no
editing affordances — so it cannot depend on the editor shell around it.
