---
layer: core.webgpu.shader
role: Generates the WGSL compute shader for a net, one module per concern (token layout, transition firing, output emission, dynamics, histograms, run parameters)
---

The shader generator's concerns, each in its own module so an extension changes one file: `token-layout.ts` owns how a token's attributes become words (a String or UUID attribute needs its word encoding here and its admission in `eligibility.ts`), `transition-firing.ts` owns enablement and the choice of tokens to consume, `output-emission.ts` writes kernel outputs, `dynamics.ts` emits the ODE stages, `histograms.ts` the per-metric windows and workgroup histograms, `run-parameters.ts` the per-run parameter buffer reads. `compile-net-shader.ts` in the parent folder assembles them into one shader.
