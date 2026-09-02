---
"@hashintel/petrinaut": patch
"@hashintel/petrinaut-core": patch
---

The WebGPU backend matches the CPU engine's stochastic semantics and frame numbering, streams metric frames per dispatch chunk, and runs range sweeps from a per-run parameter buffer. It sizes and calibrates metric histograms and typed-place buffers from the model and device instead of refusing or warning, and tiles experiments larger than the device's limits with bit-identical results. Sweep batch instantiation no longer blocks the main thread: scenario compilation is prepared once per experiment and per-run values travel as one typed-array plan.
