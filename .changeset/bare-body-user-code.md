---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

Transition kernels, lambdas, and differential equations can now be written as a bare function body ending in `return`, like metrics and scenario code: `input` (or `tokens` for dynamics) and `parameters` are in scope ambiently, with full editor type checking and completions. The `export default TransitionKernel(...)` / `Lambda(...)` / `Dynamics(...)` module form is still accepted, and the editor picks the right checking mode per form. Default templates, built-in examples, and the AI assistant now use the bare form. Visualizers are unchanged.
