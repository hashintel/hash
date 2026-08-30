---
"@hashintel/petrinaut": patch
"@hashintel/petrinaut-core": patch
---

Range sweeps run on the WebGPU backend: each run's parameter draw is uploaded to a per-run buffer the shader reads instead of a baked literal. Per-run draws are also translated through the scenario's parameter overrides, so sweeping a scenario parameter now varies every run's dynamics on the CPU too (previously only draws whose name collided with a net parameter took effect).
