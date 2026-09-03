---
"@hashintel/petrinaut-core": patch
---

Weighted-arc token combinations enumerate lazily in the same lexicographic order, so a transition with a weight-2 coloured input arc no longer materialises every combination per frame. Trajectories are unchanged for every seed.
