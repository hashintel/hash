---
layer: core.hir
role: Lowers user-authored TypeScript to a source-spanned IR, then typechecks, lints, and emits or interprets it
---

# Petrinaut HIR

The HIR is Petrinaut's source-spanned intermediate representation for
user-authored simulation code. HIR nodes do not carry inferred types inline;
`typecheck.ts` infers a separate `HirType` side table keyed by node id. The
pipeline is the only runtime path for dynamics, transition lambdas,
transition kernels, Monte-Carlo expression metrics and scenario code.

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

## Interface

The folder has no entry file. Two package entries beside it are its interface,
and they differ in whether the importer loads the TypeScript compiler.

| Entry                                                      | Loads the compiler | Imported by                                                                                  |
| ---------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------- |
| `src/hir.ts`, published as `@hashintel/petrinaut-core/hir` | Yes                | The LSP worker, which bundles the compiler, and Node tooling, which loads it as a dependency |
| `src/hir-runtime.ts`, published as `…/hir-runtime`         | No                 | The simulation runtimes, the experiment backends and the WebGPU backend                      |

`lower-typescript.ts` and `user-code-form.ts` import the compiler.
`compile.ts`, `classify-net.ts`, `lint.ts`, `print.ts` and `scenario.ts` reach
it through `lower-typescript.ts`. Code that ships in the main entry, a
simulation worker or the WebGPU entry imports none of these files at run time:
it takes a type from them with `import type`, and everything else from
`hir-runtime.ts` or from a compiler-free file of this folder by its path.
`scripts/check-browser-safe-entries.mjs` holds this after a build: it fails
when the built `index`, `webgpu` or `hir-runtime` entry reaches the compiler.

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

The `visualizer` surface covers the expressions inside a place visualizer,
whose elements lower to the view HIR (`../view-hir`). It adds template
literals and string `+`, `.slice`, `.filter` and `.toFixed`, `null`, and
JavaScript's value semantics for `&&`, `||`, conditions and out-of-range
indexes; nothing else, and no other surface sees them.

Rejected code cannot run: loops, mutation, arbitrary helper calls, spread,
computed object keys, dynamic transition-token indexes and structurally dynamic
transition outputs.

## Compilation coverage

| User-code surface                                     | Compiled through HIR | Compilation and execution path                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Differential equations (dynamics)                     | Yes                  | Compiled in the LSP worker; buffer program runs in simulation workers. An equation compiles to nested loops over every combination of `arity` tokens, summing each combination's records into the tokens' derivatives.                                                                                   |
| Transition firing rates and predicates (lambdas)      | Yes                  | Compiled in the LSP worker; buffer program runs during transition enablement checks.                                                                                                                                                                                                                     |
| Transition kernels                                    | Yes                  | Compiled in the LSP worker; buffer program writes kernel staging bytes and defers seeded operations through the engine sink.                                                                                                                                                                             |
| Timeline and Monte-Carlo expression metrics           | Yes                  | Compiled in the LSP worker; buffer program reads packed frame views in the timeline or Monte-Carlo worker.                                                                                                                                                                                               |
| Scenario initial-state code and per-place expressions | Yes                  | Lowered by `hir/scenario.ts` (LSP worker in the browser, inline in Node); type-checked and evaluated by the interpreter (`interpret.ts`) in `compile-scenario.ts`, with no `new Function`.                                                                                                               |
| Place visualizers                                     | Yes                  | Lowered to the view HIR (`../view-hir`) in the LSP worker (`sdcpn/lowerVisualizer`), with every expression lowered, typed and interpreted by this pipeline under the `visualizer` surface; the editor interprets the view and turns the element values into React elements. No Babel, no `new Function`. |

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
| `compile.ts`          | Batch-compiles a root net and components to `HirArtifacts`.               |

## Runtime artifacts

`compileHirArtifacts(sdcpn, extensions)` returns:

```ts
{
  version: 4,
  fingerprint: string,
  dynamics: Record<string, { source: string; arity: number }>,
  lambdas: Record<string, { source: string; inputSlotCount: number }>,
  kernels: Record<string, {
    source: string;
    inputSlotCount: number;
    outputByteCount: number;
  }>,
  metrics: Record<string, { source: string; placeNames: string[] }>,
}
```

With `includeHir`, every artifact also carries the lowered `hir` tree it was
emitted from, so the WebGPU backend can generate a shader without lowering the
net in the browser. Metric artifacts carry it too, for the same consumer.

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

The precise runtime contract is in [HIR buffer ABI](doc:core.hir/buffer-abi).

## Tests

The HIR test suite covers:

- every shipped example model compiling through the HIR;
- stable artifact metadata and representative emitted sources;
- buffer lambdas/kernels/dynamics/metrics against hand-packed buffers;
- stale artifact rejection;
- deterministic end-to-end simulation behavior.

## Related notes

- [HIR buffer ABI](doc:core.hir/buffer-abi): packed-buffer runtime contract.
- [Compiling user code](doc:core.hir/user-code): the pipeline from authored
  code to buffer programs and interpreted HIR.
