---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

Reuse simulation workers across sweep batches instead of spawning and terminating a pool per batch, and sample the sweep surface in batched chunks (one experiment for many cells when the swept parameters do not shape the initial marking). Switching the surface metric now re-reads the cached samples instead of re-simulating.
