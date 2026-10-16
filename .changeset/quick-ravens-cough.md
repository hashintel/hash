---
"@hashintel/ds-components": minor
---

`Button` no longer shows a pressed state for `aria-expanded` or emits `aria-pressed`: the `pressed` prop is visual-only, and `Menu` passes pressed state to `Button` through context.
