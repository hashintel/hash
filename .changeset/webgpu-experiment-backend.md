---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

Add an experimental WebGPU compute backend for experiments.

An experiment's runs are independent, so the GPU runs one invocation per run and steps the whole net on the device. WGSL is generated from the net's lowered HIR, the same HIR the CPU engine compiles to buffer programs, so dynamics, firing rates and transition kernels execute on the device rather than being interpreted per frame. Metrics reduce on-GPU into per-frame histograms, and only a compact per-run summary is read back, so run state never leaves the device.

It is a **subset** engine, asked rather than told: it reports whether it can run a net before the experiment starts, and a net it cannot take falls back to the CPU with the reason recorded. It needs every place holding typed tokens to declare a token capacity, arcs consuming at most two typed tokens per place, no `string` or `uuid` attributes, and metrics that measure place token counts without a time aggregation. A weight-2 pairwise condition is scanned over every pair by combinatorial unranking, which preserves the CPU's lexicographic firing order.

Two backends can be loaded at once and the choice is per experiment, via a toggle in the create-experiment drawer. Results are not seed-identical to the CPU, because WebGPU cannot reproduce the CPU generator, so trajectories differ while distributions agree. Continuous dynamics integrate with RK4. Which backend ran an experiment is recorded alongside its results.

A **Compilation** panel, behind a user setting, reports what the compiler made of each condition, kernel and differential equation, and what stops a net running on the GPU.
