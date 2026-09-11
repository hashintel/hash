---
"@hashintel/ds-components": minor
---

`Select`, `TextInput`, and `NumberInput` now accept `clearable` as `boolean | { onClear: () => void }`, and `Select` accepts `searchable` as `boolean | { onSearch?, hideCount?, hideSelectAllToggle? }`, replacing the previous `{ clearable: boolean, onClear }` and `{ searchable: boolean, onSearch }` object shapes. `Banner`'s `dismissible` and `Chip`'s and `Filter`'s `removeable` are now `false | { onDismiss: () => void }` / `false | { onRemove: () => void }` instead of objects with an inner enabled flag.
