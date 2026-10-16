---
"@hashintel/ds-components": minor
---

`clearable` on `Select`, `TextInput` and `NumberInput` is now `boolean | { onClear }`, and `searchable` on `Select` is `boolean | { onSearch?, hideCount?, hideSelectAllToggle? }`. `Banner`'s `dismissible` is now `false | { onDismiss }`, and `removeable` on `Chip` and `Filter` is `false | { onRemove }`. These replace the previous object shapes with an inner enabled flag.
