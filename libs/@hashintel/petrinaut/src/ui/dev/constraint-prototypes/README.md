# Constraint authoring prototypes (FE-1556)

Playable Storybook explorations of how optimization constraints get
defined, building on FE-1518's boolean-expression groundwork and the
FE-1282/FE-1339 RFC. Run Storybook and open **Dev / Constraint
Prototypes**. Nothing in this folder ships: the stories run against a toy
cooling-tank model with their own small expression evaluator, kept
syntax-compatible with the product surface (product expressions add the
`scenario.*` namespaces; the toy model exposes bare names).

Two constraint kinds, with different goals:

- **Parameter constraints** exist for the sampler. The goal is to draw
  from the safe region directly — shape the sampling space — rather than
  prune most draws after the fact.
- **State constraints** monitor the run. The goal is a margin: a signed
  robustness value that feeds the objective as a continuous multiplier,
  ~1 inside the safe region and dropping progressively to zero as the
  violation deepens, so the sampler keeps a gradient toward safety.

## The five prototypes

1. **Predicate with a derived margin** — constraints stay the boolean
   expressions FE-1518 ships; margins, robustness, and the smooth penalty
   are derived (comparison slack, `&&` = min, worst step). Includes the
   masking comparison: min across constraints vs mean-of-violations
   (the AGM lesson — one deep violation hides all other progress from
   the sampler).
2. **Margin-first** — the user authors the margin expression itself
   (`80 - temperature`, a number that must stay ≥ 0), with the RFC's
   canonical rewrite offered when they type a comparison instead, and the
   normalisation scale as an explicit authoring control.
3. **Sentence builder** — structured pickers (scope · metric · direction
   · bound · across-runs quorum) that compile to the same expressions,
   judged over 24 seeded runs; the across-runs quorum is the RFC's chance
   constraint (CH1) made visible.
4. **Parameter sampling playground** — one predicate, four sampling
   strategies side by side (uniform / rejection / soft-learning /
   by-construction), with the router that classifies each `&&` conjunct:
   bounds fold into the box, `a <= b` becomes an ordering transform, the
   affine part is walked as a polytope (hit-and-run), nonlinear leftovers
   reject. Draw counts make the "shape, don't prune" argument concrete.
5. **Temporal operators** — the extension, not the base: `always`,
   `eventually`, `during`, `within`, `until`, `atEnd` as ordinary
   functions in the same grammar, with STL quantitative semantics and an
   optional logsumexp smoothing temperature ("Smooth Operator", Pant et
   al. 2017) that trades exactness (±ln(m)·T) for differentiability.

## How the pieces map to a real implementation

- `expr.ts` `marginOf` mirrors the Python HIR evaluator's `margin()`
  already on FE-1518 (comparison slack, min/max composition) — a
  TypeScript twin over real HIR would replace it.
- `robustness.ts` is the STL layer: per-step margins collapse over the
  trace; the same recursion works over HIR. Discrete-time, closed
  windows in simulated time units; `until`'s hold is a strict prefix.
- `sampling.ts` `planConjuncts` is the automatic router the research
  supports (Ax parses linear constraint strings the same way): a
  declarative predicate compiles per conjunct into bound-folding,
  ordering transforms, a polytope walk, or rejection — with the soft
  margin channel (Optuna's `constraints_func`) always layered on top.
- `penaltyMultiplier` is the "objective multiplier that drops
  continuously to zero" — exponential (exactly 1 inside), logistic
  (discounts near-boundary satisfaction), and hard (for contrast).
