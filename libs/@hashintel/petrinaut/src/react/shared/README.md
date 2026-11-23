---
layer: react.shared
role: The helpers every provider and hook of the layer is built from, for reading a store, reading part of a context value and keeping a callback stable
---

Every provider and hook of the React layer is built from these helpers. Each
file holds one helper, and the other folders import the file by its path.

## Interface

| File                        | What it gives                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `use-store.ts`              | `useStore` and `useStoreSelector` read a Core store in a component. `selectStore` and `constantStore` build a store a context hands out. |
| `select-from-context.ts`    | `usePublished` publishes a provider's context value as a store. `useSelected` and `useSelectedFields` read one part of it.               |
| `use-latest.ts`             | A ref that holds the latest value, for a handler or an effect.                                                                           |
| `use-stable-callback.ts`    | A callback that keeps one identity and calls the latest function.                                                                        |
| `use-block-window-close.ts` | The browser's warning before the window closes.                                                                                          |
| `error-message.ts`          | The message of a thrown value.                                                                                                           |

## Protocol

A provider whose value changes often publishes it twice. Its own context
carries the value, and a second context carries the store that `usePublished`
returns. A hook built on `useSelected` takes both contexts and a selector. It
renders its reader when the selected part changes, where `use` of the context
renders the reader when any part does.

[The React layer](doc:react/react-layer) says which way of reading fits which
state.

## Rules

- **A reader by selector renders only when its part changes.** A value that
  changes on most interactions would otherwise render every reader. Held by
  `select-from-context.test.tsx`.
- **Where nothing is published, a reader by selector follows the context.**
  A test or a story can then provide the context alone. Held by
  `select-from-context.test.tsx`.
- **`useStoreSelector` does not render its reader while the selected value
  stays the same.** Held by `use-store.test.tsx`.
- **`useStableCallback` returns one function that calls the callback of the
  latest commit.** An effect can then depend on it without running again.
  Held by `use-stable-callback.test.tsx`.
