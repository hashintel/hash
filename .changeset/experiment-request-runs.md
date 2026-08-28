---
"@hashintel/petrinaut-core": patch
---

`ExperimentRequest` carries optional per-run overrides (`runs`), forwarded by the worker-pool backend and refused by the WebGPU backend, whose shader bakes parameter values in.
