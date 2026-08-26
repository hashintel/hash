---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut-cli": patch
---

Optimization trials run their seeded replicates in parallel. The Monte Carlo worker protocol now attaches to any thread runtime (Web Worker, Node `worker_threads`, or an in-process loopback), experiments accept explicit per-run seeds, and each run's final metric values are reported per run. The CLI evaluates a trial as one sharded experiment, preserving the common-random-numbers seed list and the wire contract.
