# Code Conventions

Conventions for this crate, accumulated from review. When a review comment
establishes a new rule, add it here.

## File layout

- Order within a file: `//!` module docs, inner attributes, `use`
  statements, then `mod` declarations. `#[cfg(test)] mod tests;` belongs
  with the other declarations at the top, never at the bottom of the file.
- A file that grows past roughly 500 lines excluding tests (800 including
  an inline test module) splits into submodules. Conceptually distinct
  machinery splits earlier regardless of size: a type's fitting machinery
  lives in `fit.rs` beside the type's `mod.rs`, private helpers visible to
  the parent via `pub(super)` constructors rather than scoped field
  visibility.
- Modules with tests are directories: `foo/mod.rs` plus `foo/tests.rs`.
  Unit tests live in the sibling `tests.rs`, not inline.
- Attribute order on items: `#[expect(...)]` first, then `#[inline]` /
  `#[inline(always)]`, then `#[must_use]`, then the item.

## Control flow

- Prefer early returns. `if !valid { return None; }` followed by the happy
  path, not an `if`/`else` whose branches return `Some`/`None`.

## Constness and inlining

- `const fn` wherever the language allows. Nightly features are enabled,
  including `const_trait_impl` (`const impl Trait for Type` syntax) and
  `[const]` trait bounds.
- `#[inline]` on small public functions (accessors, operators,
  conversions).
- `#[inline(always)]` only for private helpers on SIMD kernel paths, where
  a missed inline silently spills vector values through memory (the Rust
  ABI passes `repr(simd)` values indirectly across non-inlined calls). It
  carries `#[expect(clippy::inline_always, reason = ...)]`.

## Precision policy

- `f32` is the working precision: coordinates, transforms, gradients,
  distances take and return `f32`.
- `f64` accumulators inside long reductions are an implementation detail
  and an accuracy guarantee; they never appear in signatures. Document
  them as behavior ("accumulated in double precision"), not as types.
- `f64` in a signature needs a consumer whose algorithm demands it (for
  example the classifier's quasi-Newton optimizer, whose tolerances lie
  below `f32` epsilon).

## SIMD

- Batch types are 32 bytes and aligned for
  [`Simd<f32, 8>`](https://doc.rust-lang.org/std/simd/struct.Simd.html);
  alignment asserts are lower bounds (`>=`), never equality, because
  `Simd` alignment is target-dependent.
- Reduction kernels use logical vectors wider than the narrowest target
  hardware (`f64x8` on 128-bit NEON is a four-register unroll) plus two
  independent accumulators: what hides FMA latency is the number of
  independent chains in flight, not matching the register width. Benchmark
  before narrowing.
- Vector operations whose lowering is target-dependent go through
  `math::kernel` dispatchers rather than being called inline, so the
  selection logic and its rationale live in one place. Fused multiply-add
  is the canonical case:
  [`StdFloat::mul_add`](https://doc.rust-lang.org/std/simd/trait.StdFloat.html#method.mul_add)
  is a single instruction with native FMA and a per-lane libm call
  without, so the dispatcher selects by `cfg`.
- Transcendentals go through the `math::kernel` wrappers, which call
  [sleef](https://docs.rs/sleef) (a dependency-free pure-Rust port of the
  SLEEF vector math library, no `unsafe`, no build script). Its `u10`
  variants are accurate to 1.0 unit in the last place - the same bound a
  quality system libm provides - and the kernel tests verify that bound
  against scalar libm, including exact special points and overflow
  agreement. Do not call sleef directly outside `math::kernel`: the
  wrappers are the single seam for swapping or evicting the dependency.
  (Exception: benchmarks may call candidate lowerings directly when
  comparing strategies for a kernel decision.)
- [`StdFloat`](https://doc.rust-lang.org/std/simd/trait.StdFloat.html)
  also exposes vector transcendentals (`exp`, `exp2`, `ln`, `log2`,
  `sin`, `cos` - there is no `powf`), but the compiler lowers them to one
  libm call per lane on every current target. Do not trust a vector
  signature: verify the lowering against the emitted assembly
  (`rustc -O --emit=asm`) before relying on it.
- Prefer safe conversions (`Simd::from_array`, `from_slice`,
  destructuring) over `transmute` and `read_unaligned`; they compile to
  the same single vector load when alignment is known.
- Performance claims are verified against compiler output, not assumed.
  When a claim matters (inlining, load fusion, scalarization), check the
  assembly and record the finding in the relevant `//` comment.

## Lints

- Lint suppressions are a last resort. When clippy's suggestion is
  correct and at least as performant (`mul_add`, `recip`, early returns),
  adopt it; a suppression that trades performance or clarity for
  convenience does not pass review.
- The acceptable `#[expect]` categories, each with a `reason`: bit-exact
  test assertions (`float_cmp`), test reference implementations that
  deliberately mirror a naive form (`suboptimal_flops`,
  `imprecise_flops`), casts that are the operation itself
  (`cast_possible_truncation` in checked narrowing), guaranteed inlining
  on SIMD kernel paths (`inline_always`), and canonical domain names
  (`min_ident_chars` for literature parameters like the affinity curve's
  `a` and `b`).
- `#[expect]` over `#[allow]` everywhere, so a suppression that stops
  being needed becomes a warning itself.

## Allocation

- Any function that allocates (and subsequently frees or returns) heap
  memory has a `*_in` variant taking an
  [`Allocator`](https://doc.rust-lang.org/std/alloc/trait.Allocator.html),
  with the plain name delegating to `*_in` with `Global` (see
  `BoxedVecN::new` / `new_in`). Transient internal allocations should be
  eliminated where possible (recompute instead of buffer) before being
  parameterized.
- Prefer zero-allocation formulations outright: iterate and fold instead
  of collecting, recompute cheap values per pass instead of materializing
  them.

## Types and naming

- Acronyms are camel case: `Soa`, not `SoA`.
- Batch suffixes: `Vec2x4` is the natural (interleaved) layout, `Vec2x4T`
  the transposed (axis-grouped) layout. `T` reads as transposed.
- `D` prefix for double-precision twins (`DVecN`), following glam.
- Constructors: `new` takes ownership; `from_ref` / `from_mut` wrap
  borrowed data in place (std convention: `slice::from_ref`,
  `Cell::from_mut`).
- Composition methods are named `then` and read in application order:
  `a.then(b)` applies `a` first.
- Operator impl parameters use the canonical name `rhs`.

## Invariants and zerocopy

- Types with construction invariants (validated ranges, alignment,
  ordering) must not derive `FromBytes` (or `FromZeros` unless the zeroed
  value is valid): byte-level constructors bypass validating constructors
  in safe code. Note the exclusion in a short `//` comment above the
  derive block.
- Fallible constructors return `Option`; the invariant then makes
  downstream operations total (`Similarity::inverse`) or unchecked
  (`Bounds2` consumers never re-validate).

## Documentation

- Title-first summaries, affirmative contracts, ASCII only, intra-doc
  links, `# Examples` with asserts, `# Panics` / `# Safety` where
  applicable (see the
  [rustdoc book](https://doc.rust-lang.org/rustdoc/how-to-write-documentation.html)
  for the baseline; the house style tightens it).
- Doc comments state what IS. Design rationale, rejected alternatives,
  and implementation narration belong in `//` inline comments (when a
  maintainer needs them to judge a change) or in review discussion, not
  in `///`.
- Honest scope statements are contracts, not narration: "perspective is
  out of scope" and performance thresholds ("parallelism pays off from
  roughly a hundred thousand points") stay in docs.

## Tests

- Behavioral and non-tautological: assert against hand-computed values,
  independent reference implementations, or cross-path agreement (batch
  vs scalar) - never against the implementation's own intermediate
  values.
- Bit-exact assertions are contracts; mark the file
  `#![expect(clippy::float_cmp, reason = ...)]` and choose exactly
  representable values (powers of two) where exactness is asserted.
- Tolerances scale with magnitude (see `math::tests::assert_vec2_close`);
  absolute epsilons hide magnitude-dependent error.
- Reference implementations in tests deliberately use plain arithmetic,
  with an `#[expect(clippy::suboptimal_flops)]` noting the independence
  from the FMA path under test.
- Fitting and optimization routines carry formal certificates, not just
  point checks: a local-optimality test (the returned parameters score at
  least as well as a grid of small perturbations), an exact-recovery test
  (fitting data generated by known parameters returns them), and
  invariance laws of the problem (translation/rotation/scaling
  equivariance) where they exist.
