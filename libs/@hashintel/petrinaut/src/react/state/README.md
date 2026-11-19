---
layer: react.state
role: Contexts owning editor-session state — active net, selection, settings, undo/redo, read-only mode
---

State belonging to an editing session rather than to a document or a run.

Read-only is the load-bearing piece: simulate mode locks editing except for an
allow-list, and `use-is-read-only` is the single source of that answer.
Components ask rather than working it out from mode flags, because a component
that guesses will eventually guess differently from its neighbour.

What a host's rules mean for the editor is asked the same way.
`use-composes-only` says whether the host keeps the editor to composing, and
`use-is-composition-interface-on` whether the tools that edit composition
show: the Net Components setting switches them on, and so does a host that
keeps the editor to composing.

What changes on every edit or pointer move is not published through context.
The undo history gains an entry per edit, so `UndoRedoContext` carries its
actions and hands out its flags and its list as stores: a reader that only
undoes never renders for an edit, and the version history menu subscribes
while it is open. The panel sizes follow the same rule, described in
[Panel sizes outside React state](doc:react.state/panel-sizes).

What the host owns is not in the document context either. Its title, its
nets and its callbacks are in `NetManagementContext`, the action of the
read-only notice in `ReadOnlyActionContext`, and what it passes as `slots`
in `PetrinautSlotsContext`. A host may hand over new ones on every edit, and
`SDCPNContext` is read by almost every part of the editor.
