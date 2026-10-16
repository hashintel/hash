---
"@hashintel/petrinaut-core": patch
---

Optimization trials run their seeded replicates in parallel, and the CLI's `--threads <n>` bounds the number of workers.
