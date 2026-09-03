---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut-cli": patch
---

Optimization trials run their seeded replicates in parallel as one sharded experiment. The Monte Carlo worker protocol attaches to any thread runtime, and the CLI's `--threads <n>` bounds the workers, defaulting to one per core minus one.
