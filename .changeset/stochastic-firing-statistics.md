---
"@hashintel/petrinaut-core": patch
---

Fix stochastic transition firing statistics: fire with the memoryless per-frame probability `1 - e^(-rate * dt)`, advance the RNG state on every evaluation instead of discarding non-firing draws, and compute the seeded LCG with exact integer arithmetic. Firing counts now match Poisson expectations. Identical seeds produce different sequences than earlier releases.
