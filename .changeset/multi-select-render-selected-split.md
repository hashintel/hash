---
"@hashintel/ds-components": minor
---

Split the multi select's selected-value rendering: `renderSelectedItem` now renders a single selected value inside the trigger's overflow row (a plain-string result also supplies the `summary` mode's text for that value), and the new `renderSelectedAll` takes over its previous whole-selection behaviour. `Filter` multi-select inputs accept both.
