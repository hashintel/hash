---
"@hashintel/petrinaut": patch
"@hashintel/petrinaut-core": patch
---

The WebGPU backend now matches the CPU engine's stochastic semantics — a memoryless per-frame firing test over dt with the draw consumed whether or not the transition fires, metric frames aligned to the CPU's numbering (frame 0 is the initial state), runs excluded from the frame they finish in, and the same frame-count rounding — and streams metric frames per dispatch chunk instead of delivering everything at completion.

Range sweeps run on the WebGPU backend: each run's parameter draw is uploaded to a per-run buffer the shader reads instead of a baked literal. Per-run draws are also translated through the scenario's parameter overrides, so sweeping a scenario parameter now varies every run's dynamics on the CPU too (previously only draws whose name collided with a net parameter took effect).

Metric histograms size themselves per shader — up to 1,024 bins for up to four metrics (previously a fixed 256), shrinking to a sampled place's declared capacity — and experiments larger than the device's buffers or dispatch width run as sequential tiles with bit-identical results, so run counts in the millions no longer refuse.

Batch instantiation stays off the main thread's critical path: scenario compilation is prepared once per experiment and evaluated per draw, per-run sweep values travel as one typed-array plan instead of a record per run, and the remaining per-run loops yield cooperatively — a million-run range batch now blocks the page for under 0.2 s in total instead of multi-second freezes.
