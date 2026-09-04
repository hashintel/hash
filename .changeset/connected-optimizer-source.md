---
"@hashintel/petrinaut": patch
"@hashintel/ds-components": patch
---

A connected optimization source runs studies in this browser behind the experimental In-browser optimization setting. The optimization form gains Runs per step and the experiments' Backend switch, which stays on the CPU because the GPU backend cannot compute an expression objective. A connected study's drawer streams the objective's metrics for the step being evaluated, and for whichever point the navigator or the surface picks once the study is over. The connected study's Surface draws only the study's steps — each a dot the field interpolates between, the best emphasized, pruned steps hollow — and fills in as the step in flight streams; it becomes navigable once the study is over or Follow steps is off, as do the Parameters band sliders. `Slider` accepts `disabled`.
