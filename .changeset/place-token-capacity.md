---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

Add an optional per-place token capacity.

A place can now declare a maximum number of tokens it will hold, set from the place properties panel. Useful for supply-chain style models with finite storage. It also converts frames from growable to fixed-size, which is the precondition for a fixed-layout GPU or WASM path.

Capacity participates in transition enablement, following the standard Petri-net capacity constraint: a transition cannot fire if doing so would take any output place above its capacity. Output tokens are applied at the end of a frame, so the check accounts for what transitions earlier in the same frame have already committed. Several transitions feeding one capped place cannot collectively overflow it.

Deadlock detection includes the same check, so a net whose only remaining transitions are blocked by full output places is reported as deadlocked rather than stepping to `maxTime` with nothing happening.

Nets without capacities are unaffected: the constraint tables are empty and the hot path skips them.
