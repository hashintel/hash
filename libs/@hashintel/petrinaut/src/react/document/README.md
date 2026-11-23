---
layer: react.document
role: Publishes the Core instance and its open document to React, with the active net, the imports and the undo history
---

The document block is the bridge from a Core instance to React. It publishes
the instance, the definition of the open document, the net the editor shows,
the state of the document's imports and the undo history. It holds no state
of the editing session: the mode, the selection and the panels belong to
[the editor state](layer:react.state), and whether an edit is allowed
belongs to [the edit guard](layer:react.editing).

## Interface

| File                              | What a caller takes from it                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `sdcpn-provider.tsx`              | `SDCPNProvider`, which reads the definition from the instance and publishes it.                    |
| `sdcpn-context.ts`                | `SDCPNContext` for the whole value, and `useSDCPNState` for one part of it.                        |
| `use-document.ts`                 | `usePetrinautDefinitionSelector` for one part of the definition, and `useDocumentId`.              |
| `use-petrinaut-instance.ts`       | `usePetrinautInstance`, the instance without its mutations and commands.                           |
| `active-net-context.ts`           | `ActiveNetContext`, the root net or the component the location names.                              |
| `composition-context.ts`          | `CompositionContext`, the state of the imports and the host's rules.                               |
| `use-composes-only.ts`            | `useComposesOnly`, whether the host's rules keep the editor to composing.                          |
| `use-executable-definition.ts`    | `useExecutableDefinition`, the document with its imports inlined, for a simulator or the compiler. |
| `undo-redo-context.ts`            | `UndoRedoContext`, undo and redo over the handle's history.                                        |
| `use-default-parameter-values.ts` | `useDefaultParameterValues`, the default value of each parameter of the document.                  |

## Protocol

`SDCPNContextValue` is the contract between the instance and every reader of
the document. `SDCPNProvider` builds one value per edit and publishes it
twice, as [the shared helpers](layer:react.shared) describe, so a reader
takes the whole value with `use` or one part with a selector.

`UndoRedoContextValue` hands out `canUndo`, `canRedo` and `history` as
stores. A component that only acts reads the context and renders for no edit.
A component that shows the state subscribes to the store it shows.

## Rules

- **The host's values are not in the document context.** A host may pass a
  new title, list of nets or callback on every edit, and almost every
  component reads `SDCPNContext`. Held by `petrinaut-provider-layers.test.tsx`.
- **An edit of a visualizer's code reaches the readers after a short delay,
  and at once on the next interaction.** The document itself receives every
  edit when it is made. The delay keeps typing in the code editor from
  rendering the editor on each key, as
  [Monaco](doc:ui.monaco/monaco) describes. Held by
  `visualizer-definition-store.test.ts`.
- **A store of the undo history tells its reader of a change of its own
  value, and of nothing else.** An edit then renders only the component that
  shows what the edit changed. Held by `derive-store.test.ts`.
- **The active net resolves from the location.** A component id is read as
  written, converted to its canonical form and written back, and an id that
  names no component resolves to the root net. Held by
  `active-net-provider.test.tsx`.
