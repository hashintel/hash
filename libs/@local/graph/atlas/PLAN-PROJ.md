# Projector training plan (track 1, step 10)

The working plan for `salt/projector`, split out of `PLAN.md` for room;
step 10 there points here. Same contract as PLAN: update on decisions,
not after the fact. SPEC 3.6 is normative for every formula named
below; legacy `salt-BAK/salt/projector/` (~6,600 lines incl. train/)
and `salt-BAK/projection/` are reference semantics only.

## Deliverable

`salt/projector`: the trained FiLM-residual MLP mapping a normalized
512-component representation (plus optional pooled type context and a
role embedding) to 2D coordinates, under a global scalar relation
condition `eta`. Outputs: a checkpoint artifact (framework-native,
named in the repository) plus training evidence (loss traces, budget
diagnostics, miner statistics). Consumed by step 11 (ladder projection
across `eta` conditions), step 12 (quality suite), step 13 (canonical
selection), and serving steps 8-9 (inference + placement).

Every input is built: the node matrix (`salt/prepare`, `f32[N,512]`),
the semantic graph (`salt/semantic`), the relation indexes
(`salt/relation`: attraction groups + protection masses), the landmark
skeleton with 2D layout (`salt/landmark`), and the policy table
(`salt/policy`, strength frozen at 1).

## Normative digest (v1 simplifications applied)

What v1 actually trains, with everything staged-off removed:

- **Model** (3.6.1): input `u = [x; t; r]` - representation, pooled
  type context `t` (inverse-depth-weighted mean of projected type
  embeddings, randomly dropped in training so untyped entities work),
  role embedding `r`. Width-512 stem, four residual blocks
  (`LN -> SiLU` bottleneck, zero-init second layer), linear head to 2.
  FiLM modulates each block from `(t, eta)`; `eta` is the
  generation-level relation lens, never a per-relation lookup.
  Width/depth are benchmark axes; the smallest model passing the
  gates wins.
- **Objective** (3.6.2): `L = lambda_S L_S + lambda_N L_N +
lambda_H L_H + lambda_R L_R + lambda_A L_A + lambda_L L_L
(+ optional L_G, L_J)`. Typed Deconflict is off (`lambda_D = 0`).
- **Semantic terms** (3.6.3): affinity `q(d) = 1/(1 + a d^{2b})` -
  `math::AffinityCurve` with its fitted `a, b`. `L_S` pulls semantic
  edges by `-w log(q + eps)`; `L_N` pushes sampled negatives by
  `-omega log(1 - q + eps)`. Ordinary negatives must respect the
  protection predicate `P^N` (mass >= eta_N) and never enter from
  Overlay/absence evidence.
- **Hard negatives** (3.6.4): mine close projected points in 2D at a
  configured cadence (never per step). Eligible set = 2D neighbours
  minus (512-d kNN, protected pairs `P^H`, self). Rank-based bounded
  weights; same negative energy as `L_N`. Protection uses
  pre-attraction-gate masses from `ProtectionIndex` with channel
  floors `a_min,H = a_min,N = 0` as the v1 baseline cell (positive
  floors are an open ablation; thresholds recalibrate per cell).
- **Relation attraction** (3.6.5): normalized distance
  `z = d / sqrt(rho_i rho_j)` with detached local scales `rho_i` =
  median 2D distance to 15 of the 512-d kNN. Class energies:
  Coincident `Huber_delta([z - u_C]_+)`, Proximal
  `tau_P softplus((z - u_P)/tau_P)` - `math::{huber, softplus}`.
  Per-instance weight `c nu` (effective confidence x degree norm,
  already on `AttractionIndex` edges); per-relation weight
  `kappa_C p*_C, kappa_P p*_P` (already on the groups). v1:
  `kappa_C = 0`, `kappa_P = 1`, strength `h == 1` under stopgrad.
  Minibatches MUST cap per-relation-type representation (uniform or
  sqrt-of-edge-count sampling); raw edge frequency must not own the
  layout.
- **Signed budgets** (3.6.6): per node, semantic gradient norm
  `B_i = max(||g_S||, gamma)` bounds the relation gradient:
  `g_R <- g_R min(1, beta B_i / ||g_R||)`, clipped in coordinate
  space BEFORE propagating through shared parameters (the
  detached-leaf surrogate). v1 has attraction only; the
  total-variation cap collapses onto the same clip. Metrics MUST
  report clip fractions, norm ratios, and cap activation.
- **Coefficients** (3.6.6a): `kappa_P = 1` is the unit convention.
  Radii are set FROM DATA: run the semantic-only baseline, set `u_P`
  at the 75th percentile of `z` over reviewed-good Proximal pairs
  (`u_C` analogously when Coincident arrives). Shared coefficients
  are never learned by descending the loss they weight (degeneracy
  rule); `beta_+` comes from an outer-loop grid.
- **Anchors and landmarks** (3.6.7): `L_A` (temporal anchors against
  prior coordinates) is structurally present but EMPTY for a first
  generation - no prior atlas exists. `L_L` is the live support term:
  robust normalized coordinate loss against the landmark skeleton's
  layout.

## Design skeleton

```
salt/projector/
|- mod.rs        - surface: fit + checkpoint types
|- model/        - burn module: blocks, FiLM, role embedding,
|                  zero-init contracts, forward tests
|- scale.rs      - detached local scales rho_i (2D medians over the
|                  512-d kNN table)
|- sample/       - minibatch assembly: semantic edges (weight-
|                  proportional), relation edges (per-type caps over
|                  AttractionIndex groups), ordinary negatives
|                  (uniform, protection-vetoed), all seeded
|- miner.rs      - 2D hard-negative miner + protection/kNN set
|                  algebra, refresh cadence
|- loss.rs       - the composite objective over a prepared batch
|- budget.rs     - coordinate-space clip: detached-leaf surrogate,
|                  clip diagnostics
|- train/        - loop: Adam + cosine, eta conditions, type-context
|                  dropout, metrics, checkpointing
`- artifact.rs   - checkpoint save/load + repository naming
```

Slices, in dependency order (each lands green on its own):

1. **Model + burn returns.** The burn dep (backend decision below),
   the module definition, zero-init/forward contracts, config.
   Certificates: zero-init means block output == input at init; FiLM
   identity at `eta = 0`; output shape/finiteness.
2. **Scales + samplers.** `rho_i` from the k-NN table + current
   coordinates; the three samplers over built artifacts, seeded and
   deterministic. Certificates: cap enforcement under skew, protection
   veto respected, seeded reproducibility.
3. **Losses + budget.** Composite loss over a hand-built batch;
   budget clip as pure 2D vector algebra (unit-testable without
   burn). Certificates: term-by-term hand-computed values, clip
   satisfies the SPEC inequalities, gradient direction sanity.
4. **Miner.** Spatial index choice + set algebra + cadence.
   Certificates: eligibility set algebra on fixtures.
5. **Training loop + artifact.** Wiring, metrics, checkpoint
   round-trip. End-to-end: small synthetic corpus converges; landmark
   support keeps the frame; determinism across runs at fixed seed.

## Decisions to make (fresh eyes, before slice 1)

1. **burn backend.** Legacy trained on `Autodiff<NdArray>` (CPU).
   At ~1M nodes x 512 inputs x width 512, is CPU NdArray viable for
   the epoch budget, or does wgpu/metal enter? Decide by a
   forward/backward microbenchmark on the real shape, not by taste.
   Bit-reproducibility of the chosen backend matters for the
   manifest; if GPU nondeterminism is accepted, say so explicitly.
2. **The budget surrogate's autodiff seam.** Coordinates as detached
   leaf tensors: forward to `y`, compute semantic + relation
   coordinate gradients separately (two backward passes to the leaf,
   or manual coordinate gradients for the closed-form losses), clip,
   then one backward from `y . stopgrad(clipped)` into parameters.
   Legacy's `ClippedGradient`/`GradientBudget` is the reference;
   decide whether relation coordinate-gradients are computed by
   autodiff or hand-derived (the energies are simple closed forms -
   hand gradients through `math::` kernels may be both faster and
   exactly testable).
3. **Miner index.** usearch (legacy), kiddo (already planned for
   serving), or a uniform-grid spatial hash over `[0,10]^2`
   (coordinates live in a known frame; a grid is O(1) insert/query
   and trivially deterministic). Measure against the mining cadence;
   the `ProtectionIndex::judge` layout decision (PLAN step 10 note)
   hangs off the same measurement.
4. **Two-phase schedule.** Radii come from the semantic-only
   baseline (3.6.6a), so the loop natively supports phase A
   (semantic + support only) -> measure z-distribution -> phase B
   (full objective with frozen radii). Decide whether phase A is a
   separate fit invocation or a schedule segment inside one.
5. **Type context in v1.** The type table + parent edges exist
   (dataset); the pooled projection `P_t` adds a learned component.
   Ship v1 with type conditioning, or land the model with the input
   slot present but the pool deferred? (SPEC makes it optional;
   dropout already covers untyped entities.)
6. **eta conditions during training.** Step 11 projects
   `eta in [0, 1/32, ..., 1]`-style ladders; training must sample
   eta per batch (or per epoch segment) so FiLM learns the lens.
   Confirm the sampling distribution and whether `eta = 0` batches
   are pinned (the canonical frame).

## Deliberately out of scope

- Typed Deconflict machinery (`lambda_D`, `beta_-`, quarantine): the
  admission plumbing exists upstream (relation indexes); no loss term,
  no budget branch in v1.
- Strength head fitting (3.6.6b): `h == 1` frozen; the stopgrad slot
  exists in `L_R`'s factor already via the attraction group's
  strength field.
- Temporal anchor POPULATION: the loss term ships, the anchor set is
  empty until a second generation exists.
- Legacy's receipts/assurance apparatus around training (dropped
  crate-wide).

## Standing risks

- The budget surrogate is the piece most likely to fight burn's
  autodiff API; prototype it first inside slice 3 before committing
  the loss architecture.
- Minibatch determinism vs. throughput: batch assembly parallelizes,
  gradient accumulation order inside burn is the backend's business -
  the reproducibility contract may need to be per-backend.
- 1M-node local scales (`rho_i`) need current coordinates per refresh:
  a full forward pass per cadence tick. Budget it with the miner's
  cadence in the same measurement.
