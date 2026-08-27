---
"@hashintel/petrinaut": patch
---

Sweep experiments with two or more swept parameters gain a Surface section: an Optuna-style filled contour of a metric's final value over two chosen parameters, filling in live as combinations are sampled (8 runs each, coarse-to-fine) on a background lane that never steals the navigator's workers. Clicking the surface moves the navigator to the nearest combination; other parameters stay at their navigator values and changing them restarts the fill.
