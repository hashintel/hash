---
"@hashintel/ds-components": patch
---

Give the `HelpTooltip` trigger an accessible name: it is now exposed as `role="img"` named "Information", overridable via a new `aria-label` prop. `Tooltip` accepts `aria-label` and `role` for icon-only triggers whose wrapper is the focusable element.
