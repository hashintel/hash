# Petrinaut HIR — high-level intermediate representation

The HIR is a **typed, source-spanned, JSON-serializable expression tree** for
Petrinaut user code, and its pipeline is the **only compiler** for dynamics,
lambda and transition-kernel code (the Babel `new Function` path is gone):

```
                 (surface languages)                    (backends)

  TypeScript ──lower-typescript.ts──┐               ┌──emit-buffer-js.ts──▶ buffer-ABI JS
                                    ├──▶  HIR  ──▶──┤   (direct packed-buffer reads/writes)
  Petrinaut DSL (planned) ──────────┘      │        ├──emit-js.ts─────────▶ object-convention JS
                                           │        │   (structural fallback shapes)
                                           ▼        ├──▶ WASM (planned)
                                       analyses     └──▶ GPU kernels (planned)
                              (typecheck, dependencies,
                          distribution DAG, semantic lints)
```

## Why an HIR at all

TypeScript is a great authoring surface but a poor analysis substrate. With
the HIR, the things Petrinaut needs to know are one call away:

- **Distribution DAG of a kernel** — which distributions exist, how they
  derive via `.map`, which output attributes their samples flow into, which
  outputs share one draw (`analyzeHir(fn).distributionDag`).
- **Dependency sets** — does this lambda depend on parameters? Which token
  attributes does it actually read? (`analyzeHir(fn).dependencies`).
- **Determinism** — pure function of (tokens, parameters) or sampling?
- **Compilation** — token attributes are validated against the color schema
  (`typecheckHir` + `HirSurfaceContext`) and compiled to **statically
  resolved buffer offsets**: `tokenValues[slotBases[slot] + attrIndex]`
  instead of decode-to-records / re-encode.

## Design invariants

Defined in [`hir.ts`](./hir.ts):

1. **Expression-oriented and pure** (OCaml-like): `let` bindings, `cond`,
   `arrayMap` comprehensions — no mutation, loops or recursion. Guard-clause
   `if (c) return a;` and if/else-returns lower to `cond`; `const { a, b } =
parameters` and array destructuring lower to plain bindings. Every
   analysis is a single structural pass or one symbolic evaluation.
2. **Every node carries a `Span`** into the user-visible source text —
   diagnostics land on exact editor ranges with no sourcemap machinery.
3. **Every node has a stable `id`** — analyses return side tables.
4. **Distributions are first-class node kinds** (`distribution`,
   `distributionMap`).
5. **Plain JSON** — `HirFunction` round-trips through `JSON.stringify`.

### The accepted subset

`const` (with object/array destructuring and renames), guard `if`s and
early returns, ternaries, arithmetic/comparison/logic, `Math.*`,
`parameters.x` (and destructured aliases), token access
(`input.Place[i].attr`, `.length`), `.map(...)` (including `(token, index)`
and destructured params), `Distribution.*` + `.map`, record/array literals,
`Infinity`/`NaN`/`Math.PI`/`Math.E`, type assertions (erased).

Rejected with positioned errors (out-of-subset code **cannot run**): loops,
`let`/`var`, spread, strings-as-values, computed keys, arbitrary calls,
helper functions, unreachable code. The shipped example models are the
coverage gate (`compile.test.ts`): all of them must compile fully — and all
of them reach the buffer ABI.

## Pipeline stages

| Stage          | Module                | Contract                                                                                                                                                                                                                                                                                                                                            |
| -------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lowering       | `lower-typescript.ts` | TS module → `HirFunction`, or short-circuit with one positioned diagnostic.                                                                                                                                                                                                                                                                         |
| Context        | `surface-context.ts`  | Model-derived environment per surface: parameters, token attribute schemas, and the **slot layout invariant** — one slot per colored non-inhibitor input arc token (arc order), mirroring the engine's `inputPlacesWithTokenValues` filter. Duplicate place names resolve last-arc-wins (runtime key-overwrite parity). Net-aware for subnet items. |
| Typecheck      | `typecheck.ts`        | Bottom-up inference + surface checks against the Color schema: unknown/missing attributes, discrete derivatives, Distribution-into-discrete (H-6519), index vs arc weight, output place coverage and token counts, predicate/stochastic returns. A clean typecheck **gates buffer-ABI emission**.                                                   |
| Analyses       | `analyze.ts`          | Symbolic evaluation → dependencies, distribution DAG (nodes/edges/sinks/shared draws), binding usage; `foldHir` constant folding.                                                                                                                                                                                                                   |
| Lint           | `lint.ts`             | All of the above as `HirDiagnostic[]` + semantic rules (`hir:math-random`, `hir:transition-never-fires`, `hir:shared-sample`, `hir:unused-binding`). Out-of-subset = error by default.                                                                                                                                                              |
| Buffer backend | `emit-buffer-js.ts`   | Symbolic-evaluation emitter producing the **buffer ABI** (below). Structural shapes it cannot scalarize return `null`.                                                                                                                                                                                                                              |
| Object backend | `emit-js.ts`          | Object-convention functions (legacy calling shape) — the fallback for non-scalarizable shapes, plus the buffer-native dynamics loop emitter.                                                                                                                                                                                                        |
| Instantiation  | `instantiate.ts`      | Compiler-free (`typescript`-free) — safe in worker bundles. Defines `HirArtifacts` (v2).                                                                                                                                                                                                                                                            |
| Batch compile  | `compile.ts`          | `compileHirArtifacts(sdcpn, extensions)` → `{ artifacts, failures }` over the root net **and all subnets**, availability-gated like the engine.                                                                                                                                                                                                     |

## The buffer ABI

Design goal: zero per-combination allocation, token attributes at statically
resolved offsets. All scratch lives on `CompiledTransition.buffer` and is
reused (the engine is single-threaded per simulation instance).

```
dynamics: (__params) => (currentState, dimensions, numberOfTokens) => Float64Array
lambda:   (tokenValues: Float64Array, slotBases: Int32Array) => number | boolean
kernel:   (tokenValues, slotBases, out: Float64Array,
           distSink: (floatIndex, distribution) => void) => void
```

- **`slotBases`** — one float base offset per input token slot (per colored
  non-inhibitor arc, `weight` slots each, arc order). The engine fills it per
  enumerated combination with `place.offset + tokenIndex * dimensions`
  (`engine/buffer-transition.ts#fillSlotBases`).
- **Reads** compile to `tokenValues[slotBases[k] + attrIndex]` (booleans
  `!== 0`); `.length` folds to the static arc weight; `.map` over tuples is
  unrolled (weights are static and small).
- **Kernel writes** go place-major into the `out` staging floats: integers
  pre-rounded, booleans 0/1. Distribution-valued attributes are deferred via
  `distSink`; the engine samples them **ordered by output float index**,
  reproducing the legacy (place, token, element) sampling order and hence the
  exact RNG stream. Shared draws work by object identity (a `const`
  distribution feeding two slots samples once via the sample cache).
- Artifacts carry `inputSlotCount` / `outputFloatCount` so `buildSimulation`
  can reject stale buffer programs (it then runs the object program; a
  missing artifact altogether is a per-item `SDCPNItemError`).

Equivalence is enforced by `engine/build-simulation-hir.test.ts`: buffer and
object programs produce **bit-identical frames** over 50 steps of a
stochastic model, including RNG state evolution.

## Where things run

- **Compilation** (needs `typescript`): the LSP worker. The worker answers a
  `sdcpn/compileHirArtifacts` request (`LanguageClient.requestHirArtifacts`);
  the React simulation/experiments providers await it and pass
  `hirArtifacts` through `SimulationConfig` / the Monte-Carlo config → worker
  init messages → `buildSimulation`.
- **Instantiation** (dependency-free): the simulation and monte-carlo
  workers import only [`src/hir-runtime.ts`](../hir-runtime.ts). Removing
  Babel shrank those worker bundles from ~3 MB to ~40 kB each.
- **Editor diagnostics**: `lsp/lib/checker.ts` runs the HIR linter per item
  after TypeScript (only when TS reports no errors), with `source: "hir"`
  and stable numeric codes (99001+). Out-of-subset code is an **error** and
  blocks Play (`DiagnosticsSnapshot.errorCount` gates the run controls).

## Current limitations

- Structural shapes the buffer emitter cannot scalarize (conditionals over
  whole records, dynamic token indices, `.map` over >16 tokens) fall back to
  the object-convention program per item — still HIR-compiled, just with the
  engine's record decode/encode around it.
- Kernels run the object program when stochasticity is disabled (the object
  wrapper carries the distributions-forbidden runtime check).
- Metrics, scenarios and visualizers are separate surfaces: metrics/scenarios
  keep their `new Function` compilation (they never used Babel), visualizers
  (JSX) keep `@babel/standalone` in the UI package.
- Lowering is syntactic (no `ts.TypeChecker`); `.map` is disambiguated by
  tracking distribution-valued bindings.
- Numeric semantics are JS doubles end-to-end; integer attributes are exact
  up to ±2^53 (matching the token format).

## Next steps

1. **Skip `materializeEngineFrame`** in the single-run engine: the buffer
   path only needs place offsets/counts and the token floats — a cheap view
   would remove the remaining per-transition-per-step frame copy.
2. **Buffer-native dynamics for more shapes** (cross-token reductions),
   and buffer kernels under disabled stochasticity (needs the
   distributions-forbidden check on the buffer path).
3. **Metrics & scenarios on the HIR**: needs `reduce`/`filter` comprehension
   nodes and a `MetricState` surface context; then their `new Function`
   paths can go too.
4. **WASM backend**: the buffer ABI is already the right shape — scalars,
   static offsets, no GC; lower `emit-buffer-js` output structure to WAT and
   provide host shims for `Math.*`/distributions/RNG.
5. **GPU**: dynamics and Monte-Carlo runs are embarrassingly parallel; the
   buffer loop maps onto a WGSL compute shader over the packed frame.
6. **DSL frontend**: see [`dsl-sketch.md`](./dsl-sketch.md) — parses to this
   same HIR; TS ⇄ DSL migration is a pretty-printing problem.
7. **Artifact caching**: persist `HirArtifacts` keyed by a content hash of
   the code + schema so repeated runs skip recompilation.
