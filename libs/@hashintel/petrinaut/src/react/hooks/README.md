---
layer: react.hooks
role: Hooks the UI calls to read and edit the document, and small helpers for handlers and measuring
---

`usePetrinautMutations` and `usePetrinautCommands` edit the document, and
`usePetrinautDefinitionSelector` reads one part of it. Three hooks serve the
refusal of an edit: `useMutationRefusal` says why the host's rules would
refuse a mutation, and `useReadOnlyFeedback` and `useHostRulesFeedback` show
the notice.

`useRevealInEditor` selects an item, or switches to Simulate and opens a
scenario, a metric or an experiment in the drawer.

`useLatest`, `useStableCallback`, `useElementSize` and `useElementOnScreen`
serve any component. [The React layer](doc:react/react-layer) lists which hook to call
for what, with the hooks of the other folders.
