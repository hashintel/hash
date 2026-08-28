---
"@hashintel/petrinaut": patch
---

A sweep's range selection now runs as one stochastic simulation over the ranges: every run draws its own value per ranged parameter across the selected interval, computed by the full worker pool with the metric distribution streaming live, instead of sharding the region into quantized grid points computed one small batch at a time.
