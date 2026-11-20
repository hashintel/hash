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
while it is open. The panel sizes follow the same rule, and so does how far
each panel is in view while it slides open or shut: both are Motion values,
described in [Panel geometry outside React state](doc:react.state/panel-sizes).

The editor context is read by almost every component too, so what only the
panels need is kept out of it: `AssistantPlacementContext` says where the AI
assistant sits, and `PanelPresenceContext` holds the values the panels slide
by.

A component can also read one part of the editor context or of the user
settings: `useEditorState`, `useEditorFields`, `useUserSettings` and
`useUserSettingsFields` render their reader when that part changes, where
`use` on the context renders it for every change. Use them in a component
with many components below it, or one of many like it. The value they give
arrives one render pass after the context's, in the same frame, so a guard
does not read through them. The read-only reason is such a guard and has a
context of its own, `ReadOnlyReasonContext`, which `useReadOnlyReason` and
`useIsReadOnly` read.

A component that only acts on the editor calls `useEditorActions`. The
actions are one object for the editor's life, built once in
`editor-provider/editor-actions.ts`, and each reads what it needs when it is
called. So a handler made from them keeps its identity, and their reader
renders for no change of the editor's state.

A hook that builds a function, an object or an array and calls no hook but
`use` starts with the directive `"use memo"`. The compiler takes a hook that
calls another hook or returns JSX, and `use` alone does not count: without the
directive the hook gives a new value on every render, and so does every hook
that builds on it.

What the host owns is not in the document context either. Its title, its
nets and its callbacks are in `NetManagementContext`, the action of the
read-only notice in `ReadOnlyActionContext`, and what it passes as `slots`
in `PetrinautSlotsContext`. A host may hand over new ones on every edit, and
`SDCPNContext` is read by almost every part of the editor.
