---
"@hashintel/petrinaut": minor
---

Experiments support parameter ranges (sweeps): each scenario parameter in the create-experiment drawer can be a fixed value or a range (min, max, number of values). Ranged parameters expand into a grid of combinations, each running its own Monte Carlo batch through a concurrency-capped worker pool with a shared seed (common random numbers). The experiment view drawer gains a parameter navigator — toggling a parameter off merges (marginalizes) its metric distributions across all its values, toggling it on pins it to a slider-selected value — so the metric space can be explored across all ranged parameters without re-running simulations. `CreateExperimentInput.scenarioParameterValues` now takes fixed-or-range inputs, and `ExperimentRecord` exposes `parameterAxes` and per-combination `cells`.
