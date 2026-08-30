---
"@hashintel/petrinaut": patch
"@hashintel/petrinaut-core": patch
---

The WebGPU backend now matches the CPU engine's stochastic semantics — a memoryless per-frame firing test over dt with the draw consumed whether or not the transition fires, metric frames aligned to the CPU's numbering (frame 0 is the initial state), runs excluded from the frame they finish in, and the same frame-count rounding — and streams metric frames per dispatch chunk instead of delivering everything at completion.

Range sweeps run on the WebGPU backend: each run's parameter draw is uploaded to a per-run buffer the shader reads instead of a baked literal. Per-run draws are also translated through the scenario's parameter overrides, so sweeping a scenario parameter now varies every run's dynamics on the CPU too (previously only draws whose name collided with a net parameter took effect).
