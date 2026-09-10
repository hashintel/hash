---
"@hashintel/ds-components": patch
---

`Select` gains a `naked` variant that strips all input chrome — no border, padding, hover or focus styles — and inherits the surrounding text styles regardless of `size`, which still sizes the dropdown list; the host supplies any focus affordance. `Filter` select inputs now use it, so their text matches the chip exactly.
