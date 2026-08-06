---
layer: react.state
name: Editor state
role: Contexts owning editor-session state — active net, selection, settings, undo/redo, read-only mode
invariants:
  - Read-only mode is derived here and consumed everywhere, so no component decides for itself whether editing is allowed
---

State belonging to an editing session rather than to a document or a run.

Read-only is the load-bearing piece: simulate mode locks editing except for an
allow-list, and `use-is-read-only` is the single source of that answer.
Components ask rather than working it out from mode flags, because a component
that guesses will eventually guess differently from its neighbour.
