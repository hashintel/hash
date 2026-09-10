---
"@hashintel/ds-components": patch
---

`Select`, `TextInput`, and `NumberInput` now accept `clearable` as `boolean | { onClear: () => void }`, and `Select` accepts `searchable` as `boolean | { onSearch?, hideCount?, hideSelectAllToggle? }`, replacing the previous `{ clearable: boolean, onClear }` and `{ searchable: boolean, onSearch }` object shapes. A bare `clearable` clears through the component's own `onChange` (`""` for text inputs, `null` for single selects, `[]` for multi selects); pass `{ onClear }` to control clearing yourself, and `onSearch` is now optional. Likewise `Banner`'s `dismissible` and `Chip`'s and `Filter`'s `removeable` are now `false | { onDismiss: () => void }` / `false | { onRemove: () => void }` instead of objects with an inner enabled flag.
