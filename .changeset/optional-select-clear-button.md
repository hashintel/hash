---
"@hashintel/ds-components": minor
---

Clear optional single `Select` and `Combobox` values with the clear button instead of an empty first option. A single select that is not `required` is always clearable. A `required` one can opt in with `clearable`, which lets `onChange` receive `null`. The `Select` clear button now sits beside the dropdown arrow at a size per select size, drawn with the same stroke width as the arrow.
