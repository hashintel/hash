---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

Sweep compute is reused and pipelined: simulation workers persist across batches, surface cells sample in batched chunks in quad-tree order across the CPU pool, the navigator's selection streams first while the ladder pipelines its rungs, and one GPU backend (device, shader, calibration) with a small preview tile serves a session's batches. The surface reads a cell's value from the last sampled frame, so terminating nets fill it; charts mount their axes when the drawer opens and apply data once per animation frame.
