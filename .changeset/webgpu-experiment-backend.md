---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

Add an experimental WebGPU compute backend for experiments, chosen per experiment behind a user setting. It runs the net's lowered HIR on the device, declines nets it cannot run so they fall back to the CPU, and agrees with the CPU in distribution rather than seed for seed. A Compilation panel, also behind a setting, shows what the compiler made of each condition, kernel and equation.
