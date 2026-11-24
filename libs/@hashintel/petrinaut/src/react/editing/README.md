---
layer: react.editing
role: Says whether the document may be edited and why not, and gives the mutations and commands that ask first
---

The edit guard is the one door to a change of the document. It works out why
editing is refused, if it is, and hands out Core's mutations and commands
wrapped so that each asks before it runs. It reads
[the document](layer:react.document), [the editor state](layer:react.state)
and [the run](layer:react.simulation), and none of them reads it.

## Interface

| File                            | What a caller takes from it                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `use-petrinaut-mutations.ts`    | `usePetrinautMutations`, each mutation of Core, which answers whether it went through.          |
| `use-petrinaut-commands.ts`     | `usePetrinautCommands`, the paste and the automatic layout.                                     |
| `use-is-read-only.ts`           | `useIsReadOnly`, for a component that disables an input.                                        |
| `use-read-only-reason.ts`       | `useReadOnlyReason`, `ReadOnlyReason` and `mutationBlockedBy`, for a caller that needs the why. |
| `use-mutation-refusal.ts`       | `useMutationRefusal`, why the host's rules would refuse a mutation, before it is tried.         |
| `use-read-only-feedback.ts`     | `useReadOnlyFeedback`, the notice of a blocked edit.                                            |
| `read-only-reason-provider.tsx` | `ReadOnlyReasonProvider`, which `PetrinautCanvasProvider` mounts below the editor state.        |

## Protocol

`ReadOnlyReason` is null while editing is allowed. Otherwise it names one of
four causes, checked in this order: the host made the document read-only,
the editor is in Simulate mode, the editor is in Actual mode, or a run is
running, paused or complete.

A guarded mutation asks two questions before it reaches Core. The first is
`mutationBlockedBy`, which applies the reason with its exceptions. The
second is the host's rules, through `mutationRefusal` of the instance. A
refusal shows one notice and the mutation answers `false`.

## Rules

- **An edit goes through `usePetrinautMutations` or `usePetrinautCommands`.**
  `usePetrinautInstance` returns the instance without `mutations` and
  `commands`, so the type checker holds the rule. The test "guards every
  mutation of the instance" in `use-petrinaut-mutations.test.tsx` holds that
  none is left out.
- **The reason holds in the commit that changes the mode.** A layout effect
  of that commit that edits the document is refused. This is why the reason
  has a context of its own, and why its provider reads the mode with
  `useEditorMode` and not through a selector, whose value arrives one render
  pass later. Held by the test "gives a host's layout effect the read-only
  reason of the same commit" in `plugin-editor.test.tsx`.
- **A reader of the reason renders only when the reason is a different
  one.** A panel that opens or a selection does not render every component
  that can edit. Held by `editor-provider.test.tsx`.
- **Scenarios, metrics and a place's visualizer code stay editable in
  Simulate mode and during a run.** They do not change the run. Only a
  document the host made read-only refuses them. Held by
  `use-petrinaut-mutations.test.tsx`.

## Pitfalls

- `useIsReadOnly` is `useReadOnlyReason() !== null`, so it answers true for
  every edit in Simulate mode. `mutationBlockedBy`, which
  `usePetrinautMutations` applies, makes the exceptions. For every reason but
  `host-readonly` it lets through the mutations in
  `simulateModeAllowedMutationNames`, and an `updatePlace` that sets only
  `visualizerCode`.
