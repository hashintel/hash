---
"@hashintel/petrinaut-core": patch
---

Add the `@hashintel/petrinaut-core/experiments` entry point: an `ExperimentBackend` interface, a worker-pool implementation of it, and `selectExperimentBackend`, which walks backends in preference order and records every refusal.
