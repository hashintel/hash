---
"@hashintel/ds-components": patch
---

Closing a multi `Select`'s dropdown with Escape now reverts the selection to what it was when the dropdown opened, firing `onChange` with the reverted values; closing any other way keeps the selection as before.
