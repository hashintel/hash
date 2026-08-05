---
layer: ui.views
name: Views
role: The top-level screens the editor composes — the editor shell and the net canvas
---

# Views

Each subfolder is a screen rather than a widget: `Editor/` is the shell that
arranges panels around the canvas, `SDCPN/` is the canvas itself, and `shared/`
holds the pieces both need.

The split matters because the canvas is reused outside the full editor — Actual
mode renders a net with no editing affordances at all — so it cannot depend on the
editor shell around it.
