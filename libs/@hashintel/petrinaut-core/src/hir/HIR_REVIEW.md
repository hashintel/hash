# Petrinaut HIR review

This note is a quick architectural review of the HIR pipeline after the
buffer-native simulator, packed token layout, string/UUID support and
Monte-Carlo expression metric work.

## What the HIR does here

Petrinaut accepts a restricted TypeScript surface for four user-code surfaces:

- differential equations (`dynamics`)
- transition lambdas (`lambda`)
- transition kernels (`kernel`)
- Monte-Carlo expression metrics (`metric`)

The HIR is the shared representation between that TypeScript surface and the
simulator runtime. It is typechecked by a separate `HirType` inference pass; the
nodes themselves carry ids and source spans, not inline type annotations.

```text
TypeScript user code
  -> lower-typescript.ts
  -> hir.ts expression tree
  -> typecheck.ts / analyze.ts / lint.ts
  -> emit-buffer-js.ts
  -> versioned HirArtifacts
  -> instantiate.ts in the worker/runtime
  -> packed frame buffers
```

The important design choice is that the simulator no longer compiles arbitrary
user TypeScript at runtime. `compileHirArtifacts` produces versioned,
JSON-serializable artifacts ahead of execution, and the engine instantiates
those artifacts without importing `typescript`.

The emitted programs use the packed-buffer ABI:

- inputs are shared `f64`, `u64` and `u8` views over token bytes;
- `placeBases` identifies the byte offset for each colored input arc;
- `indices` identifies the selected token for each input slot;
- kernels write directly into staging buffers;
- metrics read raw frame views (`placeCounts`, `placeOffsets`, token views);
- strings are stored by per-run string-pool id;
- UUIDs are split across 64-bit lanes and RNG-consuming UUID/distribution work
  is deferred through the engine sink.

## Does the design make sense?

Yes. The shape fits Petrinaut's problem well.

The simulator needs deterministic stochastic execution, editor diagnostics with
source ranges, fast repeated transition evaluation and worker bundles that do
not include the full TypeScript compiler. A small HIR gives those concerns a
single place to meet.

The current HIR is deliberately pure, expression-oriented and mostly loop-free.
That is a good fit for transition logic, because the compiler can symbolically
evaluate structural values like token arrays and output records while emitting
direct scalar buffer reads and writes for the values that actually reach the
runtime.

First-class distributions are also a strong domain choice. They let the compiler
see the stochastic graph, preserve shared-sample semantics, and defer seeded RNG
sampling to the engine in a deterministic order.

The buffer ABI is the right direction for the simulator. It avoids repeated
decode/call/re-encode object work for every token combination, matches the
packed frame format, and leaves a plausible path to future Wasm or GPU-oriented
backends.

## How standard is it?

The broad compiler shape is standard:

- parse/lower a source language into an intermediate representation;
- desugar or reject complex source constructs;
- typecheck and analyze the IR;
- emit a lower-level executable representation;
- instantiate that representation in the runtime.

The name "HIR" is also standard compiler vocabulary. Rust's compiler, for
example, has a High-level IR that stays close to surface syntax while desugaring
some constructs, then lowers further to MIR for flow-sensitive checks and code
generation.

What is custom here is not the idea of an IR, but the exact representation and
backend:

- Petrinaut HIR is a bespoke JSON-friendly expression tree, not LLVM IR, MLIR,
  SSA, bytecode or a control-flow graph.
- It is closer to a typechecked AST/ANF-style domain IR than to a low-level
  compiler IR.
- That is reasonable because the accepted language subset is small, pure and
  tightly coupled to SDCPN token semantics.

If Petrinaut later grows general loops, mutation, recursion, early returns or
large user-defined helper functions, the current expression tree will start
feeling strained. At that point a second normalized IR with basic blocks,
temporaries and explicit control flow would become more conventional.

## What is working well

- The IR has stable node ids and source spans, so diagnostics can point back to
  user code.
- `SurfaceContext` keeps model-derived facts out of the lowerer and makes the
  typechecker/emitter aware of places, parameters, arc weights and token shapes.
- Artifacts are versioned and include runtime sanity metadata such as
  `inputSlotCount`, `outputByteCount` and metric `placeNames`.
- The simulator validates artifact metadata before running, which catches stale
  artifacts from a changed net.
- The runtime boundary is clean: workers instantiate emitted functions without
  importing the TypeScript frontend.
- Tests cover example-model compilation, artifact versioning, stale metadata,
  buffer execution, string/UUID token layout and HIR-backed expression metrics.

## Main concerns

### Documentation drift

The HIR README is intentionally short, and the packed-buffer ABI now has a
single home in `BUFFER_ABI.md`. Keep those files current when changing artifact
metadata, token layout or runtime signatures; stale compiler docs make later
conflict resolution and optimization work risky.

### ABI contract spread across files

The slot/staging/frame layout contract is currently encoded in several places:

- `surface-context.ts`
- `emit-buffer-js.ts`
- `instantiate.ts`
- `build-simulation.ts`
- `buffer-transition.ts`
- `token-layout.ts`
- frame reader/raw-view code

That split is workable, but the ABI is important enough to deserve a single
short spec and perhaps shared assertion helpers. The spec should define arc
ordering, slot ordering, byte offsets, field lane types, output staging order,
string/UUID representation and metric place ordinal binding.

### Lowerer is pragmatic, not semantic TypeScript

`lower-typescript.ts` uses the TypeScript AST but mostly lowers syntactically.
That is fine for a deliberately small subset, but it means the HIR frontend is
not a full TypeScript semantic compiler.

If the subset grows, either keep the language intentionally small and test every
accepted pattern, or use more TypeScript checker information during lowering so
aliases, literals, narrowed values and helper forms are resolved consistently.

### One-shot lower diagnostics

The lowerer often returns the first blocking error. That keeps implementation
simple, but editor experience would improve if unsupported syntax diagnostics
could be collected in one pass where practical.

### Expression IR has a growth limit

The pure expression design is right for today's transition logic. It is less
suited to:

- arbitrary loops;
- early returns in nested blocks;
- mutable locals;
- data-dependent token production counts;
- nontrivial helper functions;
- optimizations that require dataflow over control-flow joins.

If those become product requirements, introduce a normalized lower HIR/MIR
rather than adding special cases to the current emitter.

### Runtime instantiation still uses generated JavaScript

The runtime avoids the TypeScript compiler, but it still instantiates emitted
JavaScript through `new Function`. For trusted model code running in workers
that may be acceptable. If user code becomes security-sensitive, the isolation
story should be explicit, and a Wasm backend becomes more attractive.

## Practical improvement list

1. Keep `README.md`, `BUFFER_ABI.md` and nearby comments synchronized with
   artifact/runtime changes.
2. Add more differential tests between a simple reference interpreter and the
   buffer emitter for generated programs inside the accepted subset.
3. Add targeted span tests for metric wrapper offset shifting, including empty
   input, CRLF and non-ASCII source.
4. Consider a small normalized-core HIR pass before emission so the emitter sees
   fewer surface forms.
5. Make artifact compatibility more explicit: keep `version`, and consider
   adding ABI feature flags or a content/layout hash when artifacts can be
   cached beyond the current SDCPN snapshot.

## Concepts and resources

- Rust compiler HIR: a good reference for the "high-level IR close to surface
  syntax, but more compiler-friendly" idea:
  <https://rustc-dev-guide.rust-lang.org/hir.html>
- Rust compiler MIR: useful contrast for when a project outgrows expression
  trees and needs explicit control flow, locals and rvalues:
  <https://rustc-dev-guide.rust-lang.org/mir/index.html>
- GCC GIMPLE: an example of lowering a rich frontend tree into a simpler
  restricted representation for analysis and optimization:
  <https://gcc.gnu.org/onlinedocs/gccint/GIMPLE.html>
- LLVM IR reference: the canonical typed low-level IR reference, useful for
  understanding blocks, instructions, types and lowering targets:
  <https://llvm.org/docs/LangRef.html>
- MLIR rationale: useful for domain-specific compiler stacks, dialects and
  multi-level lowering:
  <https://mlir.llvm.org/docs/Rationale/Rationale/>
- Cranelift: a pragmatic compiler backend project focused on translating
  frontend IR into executable code:
  <https://cranelift.dev/>
- WebAssembly core spec introduction: useful background if the buffer emitter
  eventually targets a portable low-level backend instead of generated JS:
  <https://webassembly.github.io/spec/core/intro/introduction.html>
- TypeScript Compiler API wiki: relevant to the current lowerer because it uses
  TypeScript ASTs; note that the compiler API is not fully stable:
  <https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API>

## Bottom line

The HIR is a sensible and fairly standard compiler move for Petrinaut. The
custom parts are justified by the SDCPN runtime model: packed token frames,
deterministic stochastic semantics, source diagnostics and worker constraints.

The highest-value next step is not a redesign. It is to keep tightening the
contract: maintain the ABI docs, expand golden/differential tests and keep the
accepted language subset deliberately small until there is a clear need for a
lower control-flow IR.
