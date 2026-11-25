---
layer: react.host
role: The contexts that carry what a host supplies from outside the editor, namely its list of nets, the action it offers on a read-only document, its error tracker and its Actual mode stream
---

A host supplies values that are no part of the document: where its nets are
stored, what to offer when a document is read-only, where to report a failure
and the stream of events of Actual mode. Each value has a context here, and
each context has a default that does nothing, so a host that supplies none
still mounts the editor.

## Interface

| File                          | Context                 | Who fills it                                                                     |
| ----------------------------- | ----------------------- | -------------------------------------------------------------------------------- |
| `net-management-context.ts`   | `NetManagementContext`  | `PetrinautDocumentProvider`, from the title, the list of nets and the callbacks. |
| `read-only-action-context.ts` | `ReadOnlyActionContext` | `PetrinautDocumentProvider`, and the plugin runtime where a plugin declares one. |
| `error-tracker-context.ts`    | `ErrorTrackerContext`   | The host, around the editor.                                                     |
| `actual-mode-context.ts`      | `ActualModeContext`     | The host, around the editor. The Preview fills it from its `actualMode` prop.    |

The host's connected optimizer is the fifth such value. Its context is in
[the optimizations folder](layer:react.optimizations), beside the studies
that run through it.

## Rules

- **The host's values are not in the document context.** A host may pass a
  new title, list of nets or callback on every edit, and almost every
  component reads the document. Held by the test "a new list of nets renders
  no reader of the document" in `petrinaut-provider-layers.test.tsx`.
- **The read-only action has a context of its own.** Every component that
  can edit reads it, and the rest of net management must not render those
  components. Held by the test "the host's read-only action reaches its
  readers" in the same file.
