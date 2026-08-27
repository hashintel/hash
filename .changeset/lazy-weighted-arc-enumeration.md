---
"@hashintel/petrinaut-core": patch
---

Weighted-arc token combinations now enumerate lazily, in place, in the same lexicographic order. Evaluating a transition with a weight-2 coloured input arc no longer materialises every `C(n, 2)` combination per frame: measured, a firing transition at 400 tokens in the place drops from 3.86 ms to 12.6 µs per run-frame, and a never-firing one from 13.8 ms to 2.5 ms. Trajectories are unchanged for every seed.
