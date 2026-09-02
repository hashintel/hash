---
"@hashintel/petrinaut": patch
"@hashintel/petrinaut-core": patch
---

A sweep's range selection runs as one stochastic simulation over the ranges: every run draws its own value per ranged parameter, and the metric distribution over the region streams live. `ExperimentRequest` carries optional per-run overrides (`runs`), forwarded by the worker-pool backend and refused by the WebGPU backend.
