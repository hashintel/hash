---
layer: react.hooks
role: Cross-cutting hooks over the providers — guarded edits, notices, measuring, latest values
---

Hooks that more than one provider or view needs.

`usePetrinautMutations` and `usePetrinautCommands` are how the UI edits the
document: each call asks the read-only reason and the host's rules first, and
shows a notice where it is refused. The rest are small utilities: the latest
value of a prop for a handler, the size of an element, whether it is on
screen.
