# String interning for `string` token elements

Status: implemented (FE-769). Companion to the format-v2 packed token layout
described in `docs/architecture/engine.html`.

## Problem

Format v2 stores each place's tokens as fixed-stride packed structs inside one
contiguous frame buffer. Everything the engine does well depends on that
fixed stride:

- **O(1) token addressing** — `byteOffset + tokenIndex * strideBytes`.
- **Byte-range moves** — removals/additions compact and append tokens with
  `Uint8Array.set`, never interpreting field contents.
- **Shared typed-array views** — f64/u8/u64 views over the whole token
  region, no `DataView` in hot paths.

`string` elements are variable-length. A JS string cannot be dropped into a
fixed-width struct field without either truncating it or breaking the stride
invariants, so the value itself cannot live in the frame.

## Options considered and rejected

1. **Inline variable-length bytes in the token region.** Tokens would no
   longer have a per-colour `sizeof`; addressing becomes a prefix-sum walk,
   stride math dies, and every byte-range compaction in
   `compute-place-next-state` / Monte Carlo `frame-operations` would need to
   understand field contents. Rejected — it destroys the core property of the
   format.
2. **Fixed-width truncated char arrays** (e.g. 32 bytes of UTF-8 per field).
   Keeps the stride but is lossy (silent truncation is a correctness bug, not
   a trade-off), wasteful for short strings, and still forces a max length
   into the schema. Rejected.
3. **Per-frame string tables.** Self-contained frames, but the table is
   duplicated into every retained frame. The interactive worker retains the
   whole frame history for scrubbing — thousands of frames sharing mostly
   identical string sets would multiply memory by the frame count. Rejected.
4. **Strings only in decoded `TokenRecord`s** (never in frames). The frame
   would no longer round-trip: re-encoding a frame's tokens, replaying, or
   reading a historical frame would lose string values. Rejected — frames are
   the source of truth for simulation state.

## Chosen design: append-only per-run intern pool

- `engine/string-pool.ts` defines `StringPool`: append-only map from string →
  small integer ID. **id 0 is pre-seeded as `""`**, so a zeroed buffer decodes
  to the empty string and "missing value" needs no sentinel.
- Frames store a **u64 pool reference** per string field (`PhysicalKind
"u64"`, 8 bytes, align 8), read and written through the existing
  `BigUint64Array` view. IDs are small integers; `Number(id)` / `BigInt(id)`
  convert at the boundary.
- **The pool is part of the simulation, not of the frame.** It lives on
  `SimulationInstance.stringPool`, created fresh by `buildSimulation` per
  init/run.
- Encoding is total: kernel/marking/scenario values coerce via
  `String(value)` with `undefined`/`null` → `""`, then intern. Distributions
  on string fields keep throwing the discrete-element error. Dynamics can
  read string fields (the decode passes the pool) but never write them
  (derivative type is `?: never`).

### Interactive worker

The pool lives in the worker; frames are posted to the main thread. Rather
than shipping the pool (or the strings) with every frame, each
`SimulationFramePayload` carries an **append-only delta**:

```
newStrings?: { baseId: number; values: string[] }
```

The worker tracks `sentStringCount` (starting at 1 — `""` is pre-seeded on
both sides) and attaches `pool.valuesFrom(sentStringCount)` whenever new
entries exist. The main-thread frame store owns an accumulated `string[]`
copy: `appendBatch` asserts `baseId === pool.length` and pushes the values
before storing the frame, then hands a pool accessor to the compiled frame
reader. Delta ordering guarantees the invariant a reader needs: every frame
only references IDs at or below the pool length reached once its own delta is
applied (pool prefix ≤ frame).

### Monte Carlo

Each `MonteCarloRun` builds its own simulation via `buildSimulation`, so each
run has its own pool. Frames never leave the worker; the run-local metric
frame reader decodes with the run's pool and metric frames carry plain
decoded values. No protocol change.

## Mutability analysis

- **Append-only, immutable entries.** An ID written into any retained frame
  must decode to the same string for the whole frame history — scrubbing and
  replay read old frames against the current pool. Reassigning or compacting
  IDs mid-run would silently corrupt history.
- **No mid-run GC/compaction.** Deciding an entry is dead requires scanning
  every retained frame's string fields; the savings don't justify the cost or
  the invalidation risk. Growth is bounded by the number of _distinct_
  strings, not tokens.
- **Reset boundaries.** A fresh pool per `init` (interactive) and per run
  (Monte Carlo); the main-thread copy resets on `frameStore.clear()`
  (`Simulation.reset`). Nothing survives a run.

## Determinism

Intern order is execution order: the same net, marking, parameters, seed and
dt produce the same sequence of interned strings and therefore the same IDs
and identical frame bytes. Equal strings always share an ID (interned
equality), and no RNG state is consumed by interning — string handling cannot
perturb stochastic draws.

## Known issues / accepted trade-offs

- **Unbounded growth for unique-string workloads.** A kernel emitting
  `order-${n}` interned per firing grows the pool for the whole run. The
  constructor's `maxSize` guard (default 1,000,000 distinct values) turns the
  pathological case into a clear error ("string pool exceeded N distinct
  values — are kernels generating unbounded unique strings?") instead of
  silent memory exhaustion.
- **Frames alone no longer decode string fields.** A frame is only meaningful
  together with a pool prefix of sufficient length. The delta ordering above
  guarantees this on the main thread; `readTokenRecord` throws if a layout
  contains string fields and no pool is supplied (programmer error, not a
  runtime condition).
- **Main-thread pool copy duplicates memory.** The strings themselves are
  shared by reference after structured clone materialises them once per
  delta; the duplicated cost is the array of references, which is negligible
  next to frame retention.

## Future iterations

- **Refcounting/GC between runs** if pools are ever shared across runs (they
  currently are not — reset makes GC unnecessary).
- **Enum element type** building on the same pool mechanics with a closed,
  schema-declared value set (ticket exists in the parent epic): same u64
  representation, but validation instead of open interning, and stable IDs
  derivable from the schema.
- **Pool statistics in run summaries** (distinct-string count, byte
  estimate), cheap to expose from `StringPool.size` for diagnosing
  string-heavy models.
