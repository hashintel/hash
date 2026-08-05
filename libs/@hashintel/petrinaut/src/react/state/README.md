---
layer: react.state
name: Editor state
role: Contexts owning editor-session state — active net, selection, settings, undo/redo, read-only mode
invariants:
  - Read-only mode is derived here and consumed everywhere, so no component decides for itself whether editing is allowed
---

# Editor state

The contexts holding state that belongs to an editing session rather than to a
document or a run: which net is active, what is selected, user settings, the
undo/redo stack, and whether the editor is currently read-only.

Read-only is the load-bearing piece. Simulate mode locks editing except for an
allow-list (`simulate-mode-allowed-mutation-names.ts`), and
`use-is-read-only` / `use-read-only-reason` are the single source of that answer.
Components ask; they never work it out from mode flags themselves, because a
component that guesses will eventually guess differently from its neighbour.
