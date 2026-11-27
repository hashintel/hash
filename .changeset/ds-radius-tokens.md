---
"@hashintel/ds-components": minor
---

**Breaking:** The preset's radius tokens from `xl` up are each one step smaller (`xl` is 10px, `2xl` 12px, `3xl` 16px, `4xl` 24px), so move each use up one name to keep its radius; the old 32px `4xl` has no replacement. `lg` `Button`, `TextInput`, `NumberInput`, `Select`, `Combobox`, `TagsInput` and `TextArea` now have 10px corners.
