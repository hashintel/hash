---
"@hashintel/petrinaut": patch
---

Sweep compute parallelism: surface chunk batches shard across the CPU pool whenever the navigator's ladder is idle or computing on the GPU; the ladder pipelines its rungs (the next rung starts once the current one streams); and surface cells paint as each shard completes instead of waiting for the whole chunk.
