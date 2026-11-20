---
layer: react.hooks
role: Hooks the UI and a host call to read and edit the document, and small helpers for handlers and measuring
---

`usePetrinautMutations` and `usePetrinautCommands` are how the UI edits the
document. Each call asks the read-only reason and the host's rules first, and
shows a notice where the edit is refused.

`usePetrinautDefinitionSelector` reads one part of the document, and
`useRevealInEditor` selects an item and opens the panel that shows it.

The helpers serve any component: `useLatest` and `useStableCallback` give a
handler the latest value of a prop, `useElementSize` measures an element, and
`useElementOnScreen` says whether it is in view.

The guide "The React layer" lists which hook to call for what.
