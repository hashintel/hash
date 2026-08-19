---
"@hashintel/petrinaut-core": patch
---

Add an optional `execution.seedsPerTrial` field to the optimization manifest (1–100, default 1), extend the describe/evaluate contract types with the seeds-per-trial count and per-seed `replicates`, count every trial seed against the total simulation-step budget, and export the Monte Carlo `deriveRunSeed` derivation.
