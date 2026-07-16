# Petrinaut HIR

The HIR is Petrinaut's source-spanned intermediate representation for
user-authored simulation code. HIR nodes do not carry inferred types inline;
`typecheck.ts` infers a separate `HirType` side table keyed by node id. The
pipeline is the only runtime path for dynamics, transition lambdas, transition
kernels and Monte-Carlo expression metrics.

```text
TypeScript user code
  -> lower-typescript.ts
  -> hir.ts
  -> typecheck.ts / analyze.ts / lint.ts
  -> emit-buffer-js.ts
  -> HirArtifacts version 4
  -> instantiate.ts
  -> packed simulation buffers
```

`emit-js.ts` is retained as an object-convention reference/test emitter. The
simulator does not fall back to it; unsupported HIR shapes are compile errors.

## Why HIR exists

TypeScript is a good authoring surface, but the simulator needs a smaller
representation that can be checked, analyzed and emitted without carrying the
TypeScript compiler into workers.

The HIR gives Petrinaut:

- exact source ranges for diagnostics;
- schema-aware checks for parameters, places, token attributes and outputs;
- dependency and stochastic-distribution analysis;
- deterministic seeded RNG semantics for distributions and UUID generation;
- direct packed-buffer reads/writes instead of per-token object conversion.

## Source subset

Accepted code is deliberately small: `const` bindings, destructuring,
guard-style returns, ternaries, arithmetic/comparison/logic, `Math.*`,
parameter reads, token reads, `.length`, `.map`, metric `.reduce`/`.concat`,
record/array literals, string/UUID helpers, distributions and constants.

Rejected code cannot run: loops, mutation, arbitrary helper calls, spread,
computed object keys, dynamic transition-token indexes and structurally dynamic
transition outputs.

## Compilation coverage

| User-code surface                                     | Compiled through HIR | Compilation and execution path                                                                                                                 |
| ----------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Differential equations (dynamics)                     | Yes                  | Compiled in the LSP worker; buffer program runs in simulation workers.                                                                         |
| Transition firing rates and predicates (lambdas)      | Yes                  | Compiled in the LSP worker; buffer program runs during transition enablement checks.                                                           |
| Transition kernels                                    | Yes                  | Compiled in the LSP worker; buffer program writes kernel staging bytes and defers seeded operations through the engine sink.                   |
| Timeline and Monte-Carlo expression metrics           | Yes                  | Compiled in the LSP worker; buffer program reads packed frame views in the timeline or Monte-Carlo worker.                                     |
| Scenario initial-state code and per-place expressions | No                   | Compiled separately by `simulation/authoring/scenario/compile-scenario.ts` using sandboxed `new Function`; evaluated once before a run starts. |
| Place visualizers                                     | No                   | Compiled in the Petrinaut UI package as JSX and executed during rendering.                                                                     |

There is no runtime fallback from an HIR surface to the non-HIR compilers. Code
outside the supported HIR subset is a blocking diagnostic.

## Main modules

| Module                | Role                                                                      |
| --------------------- | ------------------------------------------------------------------------- |
| `hir.ts`              | JSON-friendly expression tree, node ids, spans and the `HirType` algebra. |
| `lower-typescript.ts` | Lowers the accepted TypeScript subset to HIR.                             |
| `surface-context.ts`  | Builds model-derived facts for each surface.                              |
| `typecheck.ts`        | Infers node types and checks HIR against the surface context.             |
| `analyze.ts`          | Computes dependencies, distribution DAGs and binding usage.               |
| `lint.ts`             | Converts semantic checks into editor diagnostics.                         |
| `emit-buffer-js.ts`   | Emits packed-buffer JavaScript programs.                                  |
| `instantiate.ts`      | Instantiates artifacts without importing `typescript`.                    |
| `compile.ts`          | Batch-compiles a root net and subnets to `HirArtifacts`.                  |

## Runtime artifacts

`compileHirArtifacts(sdcpn, extensions)` returns:

```ts
{
  version: 4,
  fingerprint: string,
  dynamics: Record<string, { source: string }>,
  lambdas: Record<string, { source: string; inputSlotCount: number }>,
  kernels: Record<string, {
    source: string;
    inputSlotCount: number;
    outputByteCount: number;
  }>,
  metrics: Record<string, { source: string; placeNames: string[] }>,
}
```

The engine validates the artifact version and compilation-input fingerprint
before running, then checks per-program metadata. Missing or stale artifacts
produce errors instead of falling back to runtime compilation.

## ABI

The emitted programs use shared views over packed token bytes:

- `f64`, `u64`, `u8` token-region views;
- `placeBases` and `indices` for transition input selections;
- output staging bytes for kernels;
- `placeCounts` and `placeOffsets` for metrics;
- a per-run string pool;
- engine-handled sinks for distributions and UUIDs.

The precise runtime contract is in [`BUFFER_ABI.md`](./BUFFER_ABI.md).

## Tests

The HIR test suite covers:

- every shipped example model compiling through the HIR;
- stable artifact metadata and representative emitted sources;
- buffer lambdas/kernels/dynamics/metrics against hand-packed buffers;
- stale artifact rejection;
- deterministic end-to-end simulation behavior.

## Related notes

- [`BUFFER_ABI.md`](./BUFFER_ABI.md): packed-buffer runtime contract.
