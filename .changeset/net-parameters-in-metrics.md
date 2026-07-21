---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

Metrics can now read net parameters ambiently as `parameters.<variableName>` (bound to the run's resolved values, including scenario overrides). Scenario parameters remain unavailable to metrics.
