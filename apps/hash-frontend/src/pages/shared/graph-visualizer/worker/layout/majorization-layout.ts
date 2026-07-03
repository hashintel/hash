/**
 * Constrained stress-majorization layout engine for the community tier.
 * Implements {@link LayoutSimulation} and fills a shared
 * {@link FlatGraphBuffer}.
 *
 * Architecture (IPSep-CoLa style: majorize, then project):
 *
 * 1. Sparse quadratic stress over graph edges + subsampled pivot terms (the Ortmann
 *    sparse-stress model; pivot selection and BFS graph distances come from the
 *    {@link StressAnalysis} passes; CSR / weak-components / pivot-BFS plus the
 *    PivotMDS initialisation). Weights are 1/d² in hop space and never change; the
 *    weighted CSR Laplacian is built once per (re)layout/absorb.
 * 2. Degenerate seed piles are scattered before any stress term is emitted:
 *    PivotMDS quantises coordinates to hop-difference lattice points (and a warm
 *    absorb often lands a batch of newcomers on one parent position), so a cold
 *    20k-node graph starts with thousands of nodes stacked on a few hundred spots
 *    and a mega-hub's spokes stacked on one. Pair relaxation is a diffusion
 *    process; separating a k-node coincident pile costs O(k) full passes (measured:
 *    an un-scattered 20k fixture burned >18 s and still failed its settle-pass
 *    cap), so piles are instead placed directly on an area-weighted phyllotaxis
 *    spiral (Vogel's sunflower model generalised to heterogeneous disk areas) at
 *    the engine's shared packing utilisation: deterministic, O(k log k), and
 *    near-feasible by construction. See {@link "#pile scatter"} stages.
 * 3. Per majorization iteration (SMACOF): the majorant right-hand side is computed from
 *    the current positions, then L·x = b_x and L·y = b_y are solved per dimension with
 *    Jacobi-preconditioned conjugate gradient. CG state persists across worker ticks;
 *    each tick advances a bounded number of CG steps, so per-tick cost is capped by
 *    construction (the budget is generous enough that each majorant is solved to
 *    tolerance; see CG_STEPS_PER_ITERATION).
 * 4. Feasibility comes from iterated circle relaxation ({@link OverlapSweep}'s
 *    shared spatial-grid machinery): gentle pile-bleeding passes
 *    at every iteration boundary, then a terminal settle phase (one bounded
 *    pass per unit) that runs until one full pass verifies the layout
 *    overlap-free. See ITERATION_RELAX_PASSES for why the rectangle-based VPSC
 *    solver is deliberately not used as a per-iteration projector (geometry
 *    mismatch ⇒ limit cycle). Positions are published to the shared buffer at
 *    iteration / settle-pass boundaries only, and the final published frame is
 *    verified overlap-free.
 *
 * Every phase advances in bounded work units (edge/term chunks, pair-visit
 * budgets on the relaxation sweeps, region budgets on the region floors), so a
 * single `advance()` call never scales with graph size: the worst unit is a few
 * milliseconds at 10⁵ nodes where the previous architecture's monolithic
 * project/settle units froze a 20k-node worker for 100+ ms at every iteration
 * boundary. Slicing changes only when work yields, never its order, so sliced
 * and unsliced runs produce bitwise-identical layouts.
 *
 * Feasibility scaling makes the two halves agree instead of fight: raw hop-space
 * targets (hops · 60 px) are frequently infeasible for the disk packing; a ~3k-node
 * cloud "wants" a ~240 px-radius layout while its disks need ~800 px; and an
 * infeasible stress optimum turns majorize→project into a permanent tug-of-war (the
 * solve compresses, the projector re-expands, every iteration, forever). Each weak
 * component therefore gets a target scale factor `scale_c = max(1, R_packing / R_hop-ideal)`
 * where `R_packing` is the radius of the disk that holds the component's nodes at the
 * shared packing utilisation and `R_hop-ideal` comes from the pivot-BFS
 * eccentricity. Scaled targets put the unconstrained stress optimum near the feasible
 * set, so the projector's correction is small and local, the alternation contracts,
 * and, because the PivotMDS seed is laid out at unscaled hop geometry, the layout
 * only ever expands toward its targets: no contract→expand swing.
 *
 * Non-overlap is therefore the projector's job, never the dynamics': there is no
 * force-summed separation term to livelock against the stress pull (the failure mode of
 * the abandoned force-interleave), and termination is a max-displacement threshold plus
 * a hard iteration cap that logs and stops rather than spinning.
 *
 * Community / degree / size awareness is target shaping, not forces:
 *
 * - Cross-community pair targets are inflated by `communitySeparation`; same-community
 *   targets are slightly deflated by `communityCohesion` (seeded Louvain ids).
 *   Weight-to-shaping mapping (the numeric slider ranges predate this engine, so the
 *   scales are documented explicitly): separation w → ×(1 + 2w) on cross-community
 *   targets (default 0.08 → +16 %, harness max 0.8 → +160 %); cohesion w → ×1/(1 + 2w)
 *   on same-community targets (default 0.02 → −4 %); degreeRepulsion w → haloShare
 *   min(1, 2w), the fraction of a packing-bound hub's packing radius its children
 *   are pushed out to (default 0.02 → compact packing against the hub's rim;
 *   harness max 0.3 → children start 60 % of the way to the packing shell). All
 *   three sliders keep working; they regenerate targets (the Laplacian, keyed to
 *   hop distances only, is unaffected).
 * - Hub-incident edge targets are packing-aware: when a hub's one-ring radius
 *   (Σ_children(2r+pad)/2π) exceeds the edge target, its children cannot all sit at
 *   the target distance, so its spokes get the feasible band from the collision gap
 *   out to the hub's disk-packing radius (at the shared ~55 % utilisation)
 *   with slack. A 150-leaf hub thus aims its spokes at a geometrically feasible
 *   halo from iteration one instead of compacting to an infeasible 1-hop length and
 *   being exploded by a terminal overlap pass; this kills the contract→expand
 *   relayout swing.
 * - Near-coincident non-adjacent pairs (the same {@link UniformGrid}
 *   3×3-neighbourhood scan the overlap passes use) get floor terms
 *   d* ≥ r_i + r_j + pad, so piles separate through the stress solve itself.
 *
 * Deterministic throughout: seeded pivot selection, hash-derived coincident directions,
 * index-ordered scans, and a deterministic projector; identical input yields identical
 * output. Warm start on absorb/relayout: positions are kept, the analysis + Laplacian
 * are rebuilt, and CG warm-starts from the current layout. No cold re-seed.
 *
 * References:
 * - Emden R. Gansner, Yehuda Koren, Stephen North, "Graph Drawing by Stress Majorization" (GD 2004).
 * - Tim Dwyer, Yehuda Koren, Kim Marriott, "IPSep-CoLa: An Incremental Procedure for Separation Constraint Layout of Graphs" (InfoVis 2006).
 * - Mark Ortmann, Mirza Klimenta, Ulrik Brandes, "A Sparse Stress Model" (GD 2016).
 * - Tim Dwyer, Kim Marriott, Peter J. Stuckey, "Fast Node Overlap Removal" (GD 2005).
 * - Helmut Vogel, "A better way to construct the sunflower head" (Mathematical
 *   Biosciences 44, 1979): the φ-angle spiral with r ∝ √k gives uniform area
 *   density; the pile scatter uses the area-weighted generalisation.
 */
/* eslint-disable no-bitwise */
/* eslint-disable id-length */
/* eslint-disable no-param-reassign -- typed-array kernels (SpMV / CG) write through
   caller-owned buffers by design */

import { UndirectedGraph } from "graphology";
import louvain from "graphology-communities-louvain";

import { parkMillerRng } from "../../math/random";
import { Column } from "../collections/column";
import { UniformGrid } from "../collections/uniform-grid";
import { defaultMajorizationConfig } from "./majorization-config";
import { OverlapSweep } from "./overlap-relax";
import {
  REGION_MIN_COMMUNITY_SIZE,
  REGION_PACKING_UTILISATION,
} from "./region-metrics";
import { INF_DIST, StressAnalysis } from "./stress-analysis";

import type { FlatGraphBuffer } from "../buffers/position-buffer";
import type {
  ForceEdge,
  ForceLayoutStatus,
  ForceNode,
  LayoutSimulation,
} from "./force-simulation";
import type { MajorizationConfig } from "./majorization-config";
import type { StressAnalysisResult } from "./stress-analysis";

/**
 * Engine defaults (ideal hop length, overlap padding, shaping weights,
 * convergence budget) live in the sibling {@link "./majorization-config"}
 * module; production passes the live {@link "../../config"} `majorization`
 * group, tests/benches may omit options entirely.
 */
const DEFAULT_TUNING = defaultMajorizationConfig;

/**
 * Slider-to-target-shaping gains. The three tuning weights shape targets:
 * cross-community target ×(1 + separation·GAIN), same-community ×1/(1 + cohesion·GAIN),
 * packing-bound hub spokes: haloShare = min(1, degreeRepulsion·GAIN); the fraction
 * of the hub's packing radius its children are pushed out to (0 = children may pack
 * right against the hub's rim; 1 = children start at the packing radius shell).
 * GAIN = 2 places the harness slider ranges (0-0.3 / 0-0.8 / 0-0.3) onto a
 * ±few-percent ... +160 % shaping range.
 */
const SEPARATION_TARGET_GAIN = 2;
const COHESION_TARGET_GAIN = 2;
const DEGREE_HALO_GAIN = 2;

/**
 * Disk-packing utilisation, used for the multi-ring hub floor (the disk that
 * packs a hub's children), for the per-component feasibility scale (the disk
 * that packs a whole component), and for the pile-scatter spiral density.
 */
const PACKING_UTILISATION = 0.55;

/** Near-pair floor weight: full edge weight; these terms are the separation engine. */
const NEAR_PAIR_WEIGHT = 1;
/** Cap near-pair partners per node so a k-node pile emits O(k), not O(k²), terms. */
const NEAR_PAIR_MAX_PARTNERS = 8;

/**
 * Pile scatter (see architecture point 2): degenerate-density detection runs
 * on a uniform grid of PILE_CELL_FACTOR × mean-radius cells (floored at
 * PILE_MIN_CELL_SIZE for radius-degenerate inputs). A cell is overcommitted
 * when the raw disk area (Σ π r²) of the ≥ 2 members whose centres it holds
 * exceeds PILE_OVERCOMMIT × the cell's own area. The threshold must be
 * unreachable by overlap-free geometry (a settled cluster must never be
 * exploded): with full areas credited to the centre's cell, hex-packed equal
 * disks of radius cell/PILE_CELL_FACTOR can legitimately reach
 * 0.9069 · (1 + 2/PILE_CELL_FACTOR)² ≈ 2.04× the cell area (boundary disks
 * spill half their area outside), and the engine's padded relax packings
 * measure far below that; 3× therefore only triggers on genuinely
 * intersecting piles. The ≥ 2 guard covers a single disk larger than its
 * cell, which is normal. Overcommitted cells are flood-filled into groups
 * (8-neighbourhood over cells); only groups of at least PILE_MIN_GROUP nodes
 * are scattered — a handful of stacked nodes separates fine through the
 * ordinary near-pair floors and relax passes, while a many-node pile costs
 * O(pile) relax-pass diffusion (measured: a 20k fixture's hub piles decayed
 * ~1.5 %/pass and outlived a 1024-pass cap) and is placed directly instead.
 *
 * The detector runs at build time (PivotMDS quantises coordinates to
 * hop-difference lattice points, so cold seeds stack thousands of nodes on a
 * few hundred spots; warm absorbs land newcomer batches on one parent
 * position) and again whenever the terminal settle stalls (see
 * SETTLE_SCATTER_STALL_RATIO: the stress solve can re-compact a hub's spokes
 * into a deep pile after the build-time scatter).
 */
const PILE_CELL_FACTOR = 4;
const PILE_MIN_CELL_SIZE = 8;
const PILE_OVERCOMMIT = 3;
const PILE_MIN_GROUP = 8;
/** Vogel's φ angle: successive spiral placements at ~137.5°. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Settle-phase stall detector: when a settle pass still finds more than
 * SETTLE_SCATTER_MIN_OVERLAPS overlapping pairs and shrank the count by less
 * than a factor of SETTLE_SCATTER_STALL_RATIO versus the previous pass,
 * pairwise relaxation has degenerated into deep-pile diffusion; the pile
 * scatter then re-places the offending clusters directly. The cooldown lets
 * the relax passes absorb a scatter's fringe before the detector re-arms, and
 * a repeat scatter must have earned its keep: it only fires when the found
 * count has dropped below SETTLE_SCATTER_PROGRESS × its level at the previous
 * scatter (re-placing the same cluster onto the same spiral resets 16 passes
 * of relax progress for nothing — measured as a scatter↔relax livelock).
 */
const SETTLE_SCATTER_MIN_OVERLAPS = 64;
const SETTLE_SCATTER_STALL_RATIO = 0.95;
const SETTLE_SCATTER_COOLDOWN = 16;
const SETTLE_SCATTER_PROGRESS = 0.7;

/**
 * Second settle rescue, for the stall signature the pile scatter cannot see:
 * a dense-but-distinct blob. Measured at the 20k fixture's settle cap: 11k
 * residual pairs of mean depth 1.6 px spread over a 1.4k-px blob at 0.69
 * disk-area density with NO cell above the pile detector's 3× overcommit
 * (max 1.83×). Pairwise Gauss-Seidel relaxation is percolation-jammed there:
 * every correction lands its endpoints (at clearance) into third parties, so
 * the found-count stays flat for the whole pass cap — separation pressure
 * diffuses at O(blob diameter) passes instead of expanding the blob.
 *
 * The rescue relaxes the blob at cluster granularity (a two-level multigrid
 * pass, same idea as PRISM's proximity-stress overlap removal — Gansner & Hu,
 * "Efficient Node Overlap Removal Using a Proximity Stress Model", GD 2008):
 * bin nodes into cells of COARSE_CELL_FACTOR × mean radius, model each cell
 * as a super-disk at its members' centroid sized by their packing area
 * (Σπ(r+pad/2)² at PACKING_UTILISATION — the same packing model as the
 * component feasibility scale, so "super-disks disjoint" ⇒ every cell's
 * neighbourhood has area for its members), relax the super-disks apart with
 * budgeted sweep passes (the "coarse-run" settle stage; n_super ≪ n, but a
 * one-shot rescue measured 125 ms at 20k — exactly the spike class this
 * engine exists to avoid), and translate members rigidly with their cell.
 * Super-disk relaxation only ever separates, so repeated firings make
 * monotone progress — no scatter-style progress gate is needed, only the
 * shared stall cooldown.
 * Single-member cells keep their true radius (no utilisation slack), so
 * settled dust is never inflated apart. Fine relax passes then finish
 * locally, and the fast-exit proof (a pass that moved nothing) is untouched.
 */
const COARSE_CELL_FACTOR = 8;
const COARSE_MIN_CELL_SIZE = 16;
const COARSE_RELAX_STRENGTH = 0.85;
const COARSE_RELAX_PASSES = 128;
const COARSE_RELAX_MIN_MOVE = 0.25;

/**
 * `community-region` floors: every node outside community c is kept out of c's region
 * disk; centred on the members' live centroid, radius R_c from the packing area of
 * c's member disks (the same packing model as the hub floors). This is region-level
 * separation that target shaping alone cannot provide: cross-community inflation
 * only stretches existing terms (edges + pivot pairs), so an unrelated branch;
 * sharing no edge and no pivot term with a foreign community; had nothing keeping
 * it out of that community's fan and folded straight through it (measured: 32 % of
 * real-shape nodes sat inside a foreign community's core disk; degree-1 leaves,
 * which pivot anchoring deliberately skips, interpenetrate worst).
 *
 * Enforced as a relax pass (violators are pushed radially out of the region disk,
 * gently at every iteration boundary and to verified-clean in the terminal
 * settle), not as Laplacian floor terms, for the build-once architecture's
 * economics: `regions × n` interval terms would dominate the Laplacian (~5× the
 * nnz at 5k) and add constant stiffness between every node and every region even
 * while satisfied (an in-band interval term exerts zero net force but keeps full
 * weight in L), taxing every CG step of every solve. The relax pass costs zero
 * solve stiffness and is push-only with NO opposing term; the stress energy has
 * no term pulling a foreign node into a region (that absence is the root cause),
 * so pushed-out is a genuine fixed point: the same no-livelock argument as the hub
 * bands, now enforced by the projector instead of fought over by the dynamics.
 * The terminal settle exits only when a full sweep verifies the layout both
 * disk-overlap-free and region-clean, so the end state is guaranteed, not asked
 * of the dynamics.
 *
 * Exemptions, planned per build (per-node bitmasks, hence the ≤ 32 region cap):
 * members of c are fully exempt; nodes with an edge into c (bridge endpoints)
 * are exempt from the full-disk floor but still pushed out of the region's
 * CORE (BRIDGE_CORE_FRACTION × R_c). The graduation matters on both ends:
 * shoving a bridge fully out against its own edge target leaves permanent
 * tension for the solve to fight (measured as a settle-phase treadmill), but
 * a blanket exemption makes regions toothless on dense clouds — Louvain
 * communities of a small-world cloud are so interconnected that almost every
 * node holds SOME cross-community edge, and once the PivotMDS seed became
 * faithful enough to land those communities at their (interleaved) hop
 * geometry, nothing pushed them apart: the real-shape disjointness gate sat
 * at 0.12 containment with every single contained node bridge-exempt, at
 * median depth 0.71·R. Rim-allowed / core-forbidden keeps the edge target
 * satisfiable (a rim bridge reaches its member neighbour within ~R·(1 −
 * fraction) + edge slack) while restoring separation pressure on the
 * region's mass. Only the largest communities with ≥
 * REGION_MIN_COMMUNITY_SIZE members cast a region; tiny communities and
 * singleton noise are skipped, so fragmented graphs stay O(n · 32) per pass,
 * ~a disk-relax pass's cost. REGION_MIN_COMMUNITY_SIZE and the packing
 * utilisation are imported from {@link "./region-metrics"} so the gate
 * measures exactly what the engine enforces.
 */
const REGION_FLOOR_MAX_COMMUNITIES = 32;
/**
 * Fraction of a region's radius kept bridge-free (the forbidden core).
 * Measured on the real-shape gate: 0.75 → 0.080 containment, 0.85 → 0.041,
 * 0.9 → 0.036 — while the settle-treadmill risk (bridges shoved against
 * their own edge targets) stays absent through the region-freeze valve.
 */
const BRIDGE_CORE_FRACTION = 0.85;
/** Fraction of a region violation corrected per iteration-boundary pass. */
const REGION_RELAX_STRENGTH_ITERATION = 0.5;
/**
 * Member-gather: the symmetric half of region shaping. Eviction alone is
 * one-sided — it empties a region's disk of foreigners but nothing ever pulls
 * the community's OWN members into it, so on interleaved graphs the disk
 * becomes a half-empty hole mid-cloud (foreigners evicted, owners still
 * smeared through the whole annulus: measured on the 20k fixture as spread
 * 1.55–2.0× packing radius with 86–89 % foreign-majority neighbourhoods, and
 * a visible void where the biggest region's disk sits). The gather stage
 * pulls each member sitting outside its own region's disk radially in to
 * land just inside the rim (R_r − r_v): a dead zone fills the disk interior,
 * so a gathered community is force-free — the same fixed-point argument as
 * eviction, now from the inside.
 *
 * Gather + evict together give interleaved pairs an escape dynamic that
 * eviction alone lacks: members of A caught in B's core are evicted toward
 * B's rim AND gathered toward A's centroid, so mass flows into the lens
 * complement and the two live centroids (recomputed every pass) drift apart.
 * Stress-phase only: the terminal settle never gathers, so its structural
 * termination proof (pure separation, no opposing force) is untouched — by
 * settle time the communities are already grouped and eviction is cheap.
 * Strength is gentler than eviction's: a gathered member is pulled against
 * its cross-community edge terms, and the per-iteration re-solve must stay
 * ahead of that fight (plateau detection exits the stress phase if it
 * becomes a treadmill).
 */
const REGION_GATHER_STRENGTH_ITERATION = 0.35;
/**
 * Center separation: gather alone still deadlocks interleaved communities,
 * because their LIVE centroids coincide (three of the 20k fixture's four big
 * communities centre on the same mega-hub fan) — gather then pulls three
 * member sets toward one contested spot and eviction picks a single winner
 * (measured: c0 cohered at 27 % foreign-majority, the rest stayed smeared at
 * ~75 %). So every sweep derives WORKING centers: start from the live
 * centroids and relax the ≤ 32 region disks (radius R_r) pairwise apart for
 * a few bounded iterations — the same disk-relaxation used everywhere else,
 * at region granularity (≤ 32² pair checks per iteration, noise next to a
 * node pass; coincident pairs split along a hash-derived deterministic
 * angle). Members then gather toward, and foreigners evict from, the
 * separated working centers, so interleaved communities get distinct
 * attractor territories and their member mass — and with it the next sweep's
 * live centroids — flows apart across the stress iterations instead of
 * fighting over one spot. The working centers are recomputed from scratch
 * each sweep (nothing persists), so there is no accumulated-offset state to
 * drift: once the live centroids genuinely separate, the relax is a no-op
 * and working = live. Where the topology truly cannot follow (bridge-dense
 * pairs), the plateau detector exits the stress phase and the settle freeze
 * valve reports the residual honestly, exactly as before.
 *
 * This is deliberately NOT rigid-body cluster translation (IPSep-style, which
 * livelocked: it re-translates whole communities against their edge pull
 * forever) — separated centers are targets for gentle per-member projector
 * pulls that the per-iteration re-solve mediates, not applied displacements.
 */
const REGION_CENTER_RELAX_ITERATIONS = 8;
const REGION_CENTER_RELAX_STRENGTH = 0.5;
/**
 * Region enforcement is best-effort against topologically interleaved
 * communities, with the disk invariant kept absolute. Louvain communities on
 * hub-dominated graphs can interleave structurally: two ~2.7k-member
 * communities on the captured 20k fixture share mega-hub neighbourhoods, and
 * the stress solve correctly lands them nearly concentric (111 px centre
 * distance against 658 px region radii). Geometry satisfying both
 * "non-members out of each disk" and the edge targets does not exist there,
 * and every full-enforcement scheme tried just picked a livelock flavour:
 * per-node radial pushes drive the two member sets through one another (a
 * standing crush that manufactures disk overlaps every pass — 224 stuck
 * overlap participants, settle cap burned), rigid-body pair separation
 * (IPSep-style cluster constraints) re-translates whole communities against
 * their edge pull forever, livelocking even on an 850-node fixture, and a
 * pairwise mutual-exemption mask (interleaved pairs stop pushing each
 * other's members) let regions rest interpenetrated on shapes where full
 * enforcement CAN separate them (the real-shape disjointness gate regressed
 * 0.05 → 0.16 overlap ratio).
 *
 * One graduated concession instead, sized by the stuck population when the
 * violation count stops improving for REGION_STALL_WINDOW consecutive settle
 * passes:
 *
 * - A LARGE stuck count (> max(REGION_FREEZE_MIN_VIOLATIONS,
 *   REGION_FREEZE_FRACTION × n); the 20k fixture's mega-pair sticks at ~2.4k
 *   of 20k nodes) is the structural-interleave signature: region enforcement
 *   freezes entirely and the phase exits on the disk latch alone, reporting
 *   the region residual honestly. Hulls then interleave exactly where the
 *   graph itself interleaves, which the BubbleSets corridor planner already
 *   renders correctly.
 * - A SMALL stuck count is rim churn: a handful of nodes the region pass
 *   pushes out and the disk pass knocks back in every cycle (measured: 4-66
 *   nodes across the 1k-5k gate fixtures). Freezing for those few would stop
 *   policing everyone else and let containment drift (measured: the
 *   real-shape disjointness gate regressed 0.03 → 0.12 under an
 *   unconditional freeze). Rim churn usually clears on its own, so it gets
 *   REGION_SMALL_STALL_PATIENCE × the stall window before any concession;
 *   only then is the stuck count accepted as the exit latch's floor —
 *   enforcement keeps running to the very end, the exit just no longer
 *   demands the impossible zero.
 */
const REGION_STALL_WINDOW = 12;
const REGION_FREEZE_MIN_VIOLATIONS = 64;
const REGION_FREEZE_FRACTION = 0.02;
const REGION_SMALL_STALL_PATIENCE = 4;
/**
 * Region clearance margin (world units beyond R_c + r_v) while the solve runs:
 * overlapPadding + communitySeparation · GAIN · idealEdgeLength (default 0.08 →
 * ~13 px, harness max 0.8 → ~56 px). Combined with the pre-existing
 * cross-community target inflation ×(1 + 2·separation), the slider now moves both
 * the pairwise stretch and the region clearance. The terminal settle instead
 * triggers on strict (margin-0) violation and lands corrections at
 * SETTLE_CLEARANCE (same trigger/landing hysteresis as the disk pass): the
 * margin is the stress phase's breathing room, and re-enforcing all of it
 * terminally would read as a terminal expansion.
 */
const REGION_MARGIN_GAIN = 1;

/**
 * Dead-zone ceiling for floored / packing-bound terms, as a multiple of the reference
 * radius. Such terms become interval targets [lo, hi]: below lo they push out, above
 * hi they pull in, and in between they exert zero net force (effective target =
 * current distance). Without the dead zone, majorization re-compacts every such pair
 * to a single exact distance each iteration while the projector pushes the pile out to
 * whatever configuration feasibility actually needs; a persistent tug-of-war whose
 * amplitude never decays below the convergence threshold (the projector's constraint
 * generation is discontinuous in the positions, so the alternation chatters instead
 * of settling). With the dead zone, whatever configuration the projector settles a
 * pile at is a fixed point.
 */
const FLOOR_CEILING_SLACK = 1.5;

/**
 * Relative half-widths of the interval bands on stress terms: target·[1−band, 1+band].
 * Demanding exact distances fights the disk packing; the projector necessarily
 * distorts local geometry (its minimal-displacement x/y passes shift whole chains of
 * touching rectangles), and every term left violated at the projected configuration
 * pulls again next iteration, re-creating the same overlaps and re-running the same
 * projection: a structural majorize↔project limit cycle whose amplitude never decays.
 * With dead-zone bands, the projector's output is (mostly) a zero-force configuration,
 * a genuine fixed point, while distances beyond the band still pull back, bounding
 * drift. Edge terms are tighter (they carry local structure); pivot terms, which only
 * hold the global shape, are looser.
 */
const EDGE_BAND = 0.15;
const PIVOT_BAND = 0.25;

/** Relative tolerance (preconditioned residual norm²) at which a solve stops early. */
const CG_RELATIVE_TOLERANCE = 0.01;

/**
 * Feasibility is delivered by iterated circle relaxation ({@link OverlapSweep};
 * one bounded uniform-grid sweep per pass), not by a per-iteration exact projection,
 * and the engine cleanly separates shape from feasibility in time:
 *
 * - During majorization iterations, each iteration ends with a couple of gentle
 * relax passes that bleed residual piles down while the solve spreads the
 * layout toward its (feasibility-scaled, packing-aware) targets.
 * - Once the stress solve converges or plateaus, a terminal settle phase runs relax
 * passes; one bounded pass per settle unit, sliced by pair budget, so per-tick
 * cost stays capped; until one full pass verifies the layout overlap-free.
 * Because the targets were shaped feasibility-first (and the seed piles were
 * scattered at packing density), this phase does small local separation, not a
 * global explosion (no contract→expand swing), and pure separation with no
 * opposing force always terminates; the livelock class of the abandoned
 * force-interleave is structurally impossible.
 *
 * Per-iteration projection uses bounded circle relaxation, not rectangle VPSC (the
 * mismatch between circle and rectangle separation geometry causes limit cycles: a
 * circle-optimal solve packs pairs diagonally at distances the rectangle model
 * forbids by up to ~30 %, so a VPSC projector shifts whole chains by 100-500 px
 * every iteration and the next solve pulls them straight back). Near-pair floors are
 * static, emitted once at build: regenerating them inside the loop destabilises the
 * alternation instead of letting it converge.
 */
const ITERATION_RELAX_PASSES = 4;
const ITERATION_RELAX_STRENGTH = 0.85;
const SETTLE_RELAX_STRENGTH = 1;
/**
 * Clearance a settle correction leaves beyond r_i + r_j (the sweep's
 * `overshoot`), while the settle TRIGGER is strict intersection (padding 0).
 * The trigger/target split is what makes the phase terminate:
 *
 * - Triggering at a padded distance manufactures work on strictly-clean pairs:
 *   a relax-packed cluster rests just inside any padded threshold, so every
 *   pass re-corrects the same ~10⁴ clean-but-snug pairs whose neighbours
 *   knock them back, an oscillation that burned the whole 1024-pass cap on
 *   the 20k fixture (measured: found-count pinned at ~17k while strict
 *   overlaps sat near 200; with the full 8 px padding it also inflates the
 *   settled cloud ~2 %, a terminal expand, the exact motion this engine
 *   exists to kill).
 * - Correcting to exactly-touching (zero target clearance) stalls instead:
 *   resolved pairs land ε from re-intersecting, any later nudge re-trips
 *   them, and hundreds of overlaps never clear (measured: 342).
 *
 * Strict trigger + padded landing gives hysteresis: only true intersections
 * are ever touched, and each correction buys real slack that float noise and
 * knock-on cannot immediately re-trip. Breathing room beyond this sliver is
 * the stress phase's job (near-pair floors and hub bands target the full
 * padded distance).
 */
const SETTLE_CLEARANCE = 2;
/**
 * A pass moving nothing proves feasibility (the trigger is strict
 * intersection, so a no-move pass IS a strict-clean proof); the interval
 * check re-measures both counts anyway as a cheap invariant guard.
 */
const SETTLE_VERIFY_INTERVAL = 8;
/** Safety cap on total settle passes: reaching it logs instead of spinning. */
const SETTLE_MAX_PASSES = 1024;

/**
 * Plateau detector: dense graphs (feasibility scale ≫ 1) never push per-iteration
 * displacement below the convergence threshold; the gentle relax passes keep nudging
 * piles; so when the best max-displacement has not improved by PLATEAU_IMPROVEMENT
 * for PLATEAU_WINDOW consecutive iterations, the stress phase is declared done and
 * the terminal settle phase takes over. Sparse graphs converge normally instead.
 */
const PLATEAU_WINDOW = 12;
const PLATEAU_IMPROVEMENT = 0.9;

/**
 * Analysis (CSR + components + pivot BFS) work units per advance step. Default
 * 16384: a larger chunk crosses fewer phase transitions but risks a slower single
 * tick; a smaller chunk keeps the worker cadence smoother at more per-tick overhead.
 */
const ANALYSIS_TICK_WORK = 16384;
/**
 * Term-emission / RHS / Laplacian-fill work units per advance step. Default 65536:
 * a larger chunk crosses fewer phase transitions but risks a slower single tick; a
 * smaller chunk keeps the worker cadence smoother at more per-tick overhead.
 */
const TERM_CHUNK = 65_536;
/** Edge-loop work units per advance step (prepare stages that scan the edge list). */
const EDGE_CHUNK = 131_072;
/**
 * Pair-visit budget per relaxation/verification unit: the resumable
 * {@link OverlapSweep} yields after roughly this many candidate-pair visits.
 * ~131k visits ≈ 1-2 ms; the previous monolithic 4-pass projection unit reached
 * 100+ ms on a 20k graph.
 */
const PAIR_BUDGET = 131_072;
/** Node-visit budget per region-floor unit (a region scan visits every node). */
const REGION_NODE_BUDGET = 131_072;

/**
 * Re-run Louvain after absorb once new nodes ≥ max(LOUVAIN_REFRESH_MIN_NEW_NODES,
 * LOUVAIN_REFRESH_GROWTH_FRACTION of the node count at the last refresh). Default
 * 24 / 30%: a lower fraction keeps community labels fresher at more rebuild cost; a
 * higher fraction risks stale shaping on fast growth.
 */
const LOUVAIN_REFRESH_GROWTH_FRACTION = 0.3;
const LOUVAIN_REFRESH_MIN_NEW_NODES = 24;

/**
 * Attach phase: instant visible pull for warm-absorbed newcomers. A warm
 * absorb rebuilds the whole solver, and no position moves until analysis →
 * terms → Laplacian → first CG solve completes (~300 ms at 20k under the app
 * tick budget). Under a streaming feed whose batch interval is SHORTER than
 * that restart latency, the pipeline restarts forever and almost no iterate
 * is ever published: a late-arriving hub visibly "has no pull" even though
 * its edge terms would deliver it (measured: mean hub→spoke distance flat for
 * a whole 6 s stream, with a single mid-stream iterate briefly reaching the
 * pulled state before the next restart discarded it).
 *
 * The fix runs before analysis, off the one thing already known without any
 * BFS — the new edge list: ATTACH_PASSES sweeps over edges incident to new
 * nodes, each endpoint stepped toward the ideal edge length by
 * ATTACH_STRENGTH of its excess, split inverse to attach-degree (a 200-spoke
 * hub barely moves while each degree-1 spoke flies; matching both the
 * energy-minimal move and the "hub pulls its neighbours" read). Each pass
 * publishes, so the yank animates within a tick or two of the absorb.
 * Deterministic: a fixed number of passes in fixed edge order, part of the
 * solver pipeline (not tick-count-dependent), before the analysis snapshots
 * positions — the solve then proceeds from the attached geometry exactly as
 * if the absorb had arrived that way.
 */
const ATTACH_PASSES = 6;
const ATTACH_STRENGTH = 0.5;

/**
 * Deterministic init jitter (fraction of the ideal edge length). Default 0.01, just
 * enough to break exact coincident cold seeds apart; a larger value spreads the
 * initial layout further and reduces pile pathology but moves the deterministic
 * start further from the raw hop layout.
 */
const SEED_JITTER = 0.01;

const EPS = 1e-9;
const TAU = Math.PI * 2;

const hashU32 = (value: number): number => {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
};

/** Deterministic separation direction for two exactly-coincident term endpoints. */
const coincidentAngle = (i: number, j: number): number =>
  (hashU32((((i + 1) * 0x9e3779b1) ^ ((j + 1) * 0x85ebca6b)) >>> 0) /
    0x100000000) *
  TAU;

/**
 * Per-call tuning overrides; unset fields fall back to
 * {@link defaultMajorizationConfig}. See {@link "./majorization-config"} for
 * per-field semantics.
 */
export type MajorizationLayoutOptions = Partial<MajorizationConfig>;

type ResolvedOptions = MajorizationConfig;

/** Deduped undirected edge in index space with summed parallel weight. */
interface IndexEdge {
  readonly source: number;
  readonly target: number;
  readonly weight: number;
}

interface SolverInput {
  readonly n: number;
  readonly src: Uint32Array;
  readonly dst: Uint32Array;
  /** Solver-owned position buffers; mutated in place each iteration and copied to the shared buffer at publish boundaries. */
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly radii: Float32Array;
  /** Louvain community per node (may contain -1 for unassigned). */
  readonly communities: Int32Array | undefined;
  /** Warm start: keep current positions (absorb / relayout); cold builds PivotMDS-init. */
  readonly warm: boolean;
  /**
   * First node index that is NEW this build (warm absorbs append); -1 ⇒ none.
   * Enables the attach phase (see ATTACH_PASSES).
   */
  readonly newNodesFrom?: number;
}

type SolverPhase =
  | "attach"
  | "analysis"
  | "prepare"
  | "terms"
  | "laplacian"
  | "rhs"
  | "cg-init"
  | "cg"
  | "project"
  | "settle"
  | "done";

/**
 * Sub-stages of the "prepare" phase (post-analysis term/plan build), each a
 * bounded unit or a cursor-resumed chunk loop. Order matters: the pile scatter
 * must run before near-pair detection (floors are emitted from the scattered
 * geometry) and after the hub/packing statistics (which are position-free).
 */
type PrepareStage =
  | "degrees"
  | "hub-rings"
  | "packing"
  | "max-hop"
  | "scale"
  | "edge-keys"
  | "edge-terms"
  | "pile-scatter"
  | "near-pair-grid"
  | "near-pairs"
  | "region-count"
  | "region-select"
  | "region-members"
  | "region-edges";

/** Sub-stages of one projection (iteration-boundary) round. */
type ProjectStage =
  | "adopt"
  | "region"
  | "gather"
  | "relax-build"
  | "relax-run"
  | "finish";

/** Sub-stages of one terminal-settle pass (+ its interval verification). */
type SettleStage =
  | "region"
  | "relax-run"
  | "verify-run"
  | "verify-region"
  | "coarse-run";

/**
 * The engine core: analysis → pile scatter → term/Laplacian build → persistent-CG majorization
 * iterations with sliced circle-relaxation projection.
 *
 * The class is heavy in internal state, reason being not that it is a god class, but that due
 * to the nature of the algorithm, most state must be retained across iterations, and allocations
 * must be minimized at all cost.
 */
class MajorizationSolver {
  readonly #n: number;
  readonly #src: Uint32Array;
  readonly #dst: Uint32Array;
  readonly #x: Float32Array;
  readonly #y: Float32Array;
  readonly #radii: Float32Array;
  readonly #communityOf: Int32Array | undefined;
  readonly #options: ResolvedOptions;

  #phase: SolverPhase;

  /** First new node index this build (-1 ⇒ no attach phase). */
  readonly #newNodesFrom: number;
  /** Edge indices (into src/dst) incident to a new node. */
  #attachEdges: Uint32Array = new Uint32Array(0);
  /** Attach-edge count per endpoint node (the inverse-degree move split). */
  #attachDegree: Map<number, number> = new Map();
  #attachBuilt = false;
  #attachPassesDone = 0;

  /** Budget-sliced CSR / weak-components / pivot-BFS / PivotMDS analysis passes. */
  #analysis: StressAnalysis | null;
  #analysisResult: StressAnalysisResult | undefined;

  /**
   * Static stress terms (edges + near-pair floors + pivot terms), fixed after
   * the build, stored in growable columns (worst-case pre-sizing would cost
   * hundreds of MB at 10⁵ nodes; the columns grow to actual usage instead).
   * Each term is an interval target [lo, hi]: the majorant RHS uses the
   * effective target clamp(currentDistance, lo, hi), so a pair inside its band
   * exerts zero net force (the IPSep one-sided treatment, generalised to a
   * band). See #shapeTarget for how the bands are derived.
   */
  readonly #termA = new Column(Uint32Array, 1024, { backing: "plain" });
  readonly #termB = new Column(Uint32Array, 1024, { backing: "plain" });
  readonly #termWeight = new Column(Float32Array, 1024, { backing: "plain" });
  readonly #termLo = new Column(Float32Array, 1024, { backing: "plain" });
  readonly #termHi = new Column(Float32Array, 1024, { backing: "plain" });

  #prepareStage: PrepareStage = "degrees";
  /** Generic loop cursor within the current prepare stage. */
  #prepareCursor = 0;
  #degrees = new Uint32Array(0);
  #childExtent = new Float64Array(0);
  #childAreaSq = new Float64Array(0);
  /** One-ring radius needed to seat v's children side by side (Σ(2r+pad)/2π). */
  #hubRing = new Float32Array(0);
  /** Disk radius that packs v's children at the packing utilisation. */
  #hubPack = new Float32Array(0);
  #packingSq = new Float64Array(0);
  #maxHop = new Float64Array(0);
  #edgeKeys: Set<number> = new Set();
  // componentScale[c] = max(1, 1.3·R_packing / R_hop); multiplies all hop targets for component c.
  #componentScale = new Float64Array(0);
  #componentOf: Int32Array<ArrayBufferLike> = new Int32Array(0);
  /** Shared spatial grid for pile detection and near-pair floor emission. */
  readonly #grid = new UniformGrid();
  /** Pile flood-fill scratch: group id per overloaded bucket (-1 = none). */
  #pileGroupOfBucket = new Int32Array(0);
  #nearPairPartners = new Uint8Array(0);
  // Chunked pivot-term emission resumes from these cursors.
  #pivotRowCursor = 0;
  #pivotNodeCursor = 0;

  // Community-region floor plan (see REGION_FLOOR_MAX_COMMUNITIES): the largest
  // communities cast centroid-centred packing disks that non-members are relaxed out
  // of. Built once per solver build; centroids are recomputed from live member
  // positions at every pass.
  #regionCount = 0;
  #communityCount = 0;
  #communityMemberCount = new Int32Array(0);
  #regionOfCommunity = new Int32Array(0);
  /** Region members, region-major (offsets below); feeds the centroid recompute. */
  #regionMemberNodes = new Int32Array(0);
  #regionMemberOffsets = new Int32Array(0);
  /** Packing radius per region (world units, before the per-node radius + margin). */
  #regionRadius = new Float32Array(0);
  /** Per node, bit r set ⇔ member of region r (fully exempt from its floor). */
  #regionExempt = new Uint32Array(0);
  /** Per node, bit r set ⇔ edge into region r (rim allowed, core forbidden). */
  #regionBridge = new Uint32Array(0);
  #regionCentroidX = new Float64Array(0);
  #regionCentroidY = new Float64Array(0);
  /** Solve-time clearance beyond R_c + r_v (slider-scaled; see REGION_MARGIN_GAIN). */
  #regionMargin = 0;

  #regionSweepStage: "idle" | "centroid" | "scan" = "idle";
  #regionSweepCursor = 0;
  #regionSweepMargin = 0;
  #regionSweepStrength = 0;
  #regionSweepOvershoot = 0;
  #regionSweepViolations = 0;
  /** Whether this pass derives separated working centers (stress phase only;
   * see REGION_CENTER_RELAX_ITERATIONS). */
  #regionSweepSeparate = false;

  // Member-gather sweep state (see REGION_GATHER_STRENGTH_ITERATION).
  #gatherCursor = 0;
  #gatherMoved = 0;

  /** Resumable overlap relaxation / verification sweep (one live pass at a time). */
  readonly #sweep = new OverlapSweep();

  // Scratch outputs of #shapeTarget (avoids a per-call tuple allocation at build time).
  #shapedLo = 0;
  #shapedHi = 0;

  // CSR weighted Laplacian: off-diagonals in CSR form, diagonal kept separately.
  #rowPtr = new Int32Array(0);
  #rowCursor = new Int32Array(0);
  #colIdx = new Int32Array(0);
  #offDiag = new Float32Array(0);
  #diag = new Float64Array(0);
  #invDiag = new Float64Array(0);
  #laplacianPass = 0;
  #laplacianCursor = 0;

  // Majorant RHS + persistent CG state (all Float64 for stable accumulation).
  #bX = new Float64Array(0);
  #bY = new Float64Array(0);
  #solX = new Float64Array(0);
  #solY = new Float64Array(0);
  #resX = new Float64Array(0);
  #resY = new Float64Array(0);
  #dirX = new Float64Array(0);
  #dirY = new Float64Array(0);
  #applyX = new Float64Array(0);
  #applyY = new Float64Array(0);
  #rhsCursor = 0;
  #cgStep = 0;
  #rzX = 0;
  #rzY = 0;
  #rz0X = 0;
  #rz0Y = 0;
  #cgDoneX = false;
  #cgDoneY = false;

  #iteration = 0;
  #convergedStreak = 0;
  #prevX = new Float32Array(0);
  #prevY = new Float32Array(0);
  #lastMaxDisplacement = Number.POSITIVE_INFINITY;
  #capped = false;
  // Plateau detector state (see PLATEAU_WINDOW).
  #bestDisplacement = Number.POSITIVE_INFINITY;
  #bestDisplacementIteration = 0;

  #projectStage: ProjectStage = "adopt";
  #projectPass = 0;
  #projectMoved = false;

  #settleStage: SettleStage = "region";
  /** Total settle passes run (safety-capped by SETTLE_MAX_PASSES). */
  #settlePasses = 0;
  #settleRegionViolations = 0;
  /** Set when the pass cap forced a final verification before giving up. */
  #settleCapFinalising = false;
  // Stall detector state (see SETTLE_SCATTER_STALL_RATIO).
  #settlePrevOverlaps = Number.POSITIVE_INFINITY;
  #settleScatterCooldown = 0;
  #settleOverlapsAtLastScatter = Number.POSITIVE_INFINITY;
  // Region-enforcement freeze state (see REGION_STALL_WINDOW).
  #settleRegionFrozen = false;
  #settleBestRegionViolations = Number.POSITIVE_INFINITY;
  #settleRegionStallStreak = 0;
  // Cluster-level expansion state (see COARSE_CELL_FACTOR): super-disk
  // arrays live across the budgeted "coarse-run" slices, the sweep instance
  // is dedicated (the fine sweep's pass state must survive a rescue).
  readonly #coarseSweep = new OverlapSweep();
  #coarseSuperX = new Float32Array(0);
  #coarseSuperY = new Float32Array(0);
  #coarseSuperR = new Float32Array(0);
  #coarseBaseX = new Float32Array(0);
  #coarseBaseY = new Float32Array(0);
  #coarseBucketCount = 0;
  #coarsePasses = 0;
  #coarsePassArmed = false;
  /** Latches once a full relax pass verifies the layout overlap-free. */
  #everFeasible = false;
  /** Whether the settle phase hit its pass cap with violations remaining. */
  settleCapped = false;
  /**
   * Overlapping pairs at the last measurement. During stress iterations this is
   * the count the last projection pass corrected (measured at the iteration
   * padding, pre-correction); at settle verifications it is the strict
   * (padding-0) count. Zero after {@link projectionActive} latches.
   */
  residualOverlaps = 0;
  /**
   * Community-region violations at the last measurement (pre-push count of the
   * last region sweep; strict margin-0 count at settle verifications).
   */
  residualRegionViolations = 0;
  /** Iterations/settle passes whose relax passes had actual work (diagnostic). */
  projectionRuns = 0;
  /** Max displacement of the last solve step alone, pre-projection (diagnostic). */
  lastSolveDisplacement = 0;
  /** Max displacement the last projection added on top of the solve (diagnostic). */
  lastProjectDisplacement = 0;
  /** Node index with the largest last-iteration displacement (diagnostic). */
  lastMaxDisplacementNode = -1;
  /** |CG solution − adopted position| for that node after projection (diagnostic). */
  lastMaxSolveGap = 0;
  /** Nodes scattered out of degenerate seed piles at build time (diagnostic). */
  scatteredPileNodes = 0;
  /** Per-component feasibility-scale summary for the first few components (diagnostic). */
  scaleDiagnostics: {
    size: number;
    maxHop: number;
    packingRadius: number;
    scale: number;
  }[] = [];

  constructor(input: SolverInput, options: ResolvedOptions) {
    this.#n = input.n;
    this.#src = input.src;
    this.#dst = input.dst;
    this.#x = input.x;
    this.#y = input.y;
    this.#radii = input.radii;
    this.#communityOf = input.communities;
    this.#options = options;
    this.#newNodesFrom =
      input.warm &&
      input.newNodesFrom !== undefined &&
      input.newNodesFrom < input.n
        ? input.newNodesFrom
        : -1;

    if (this.#n === 0) {
      this.#phase = "done";
      this.#analysis = null;
      return;
    }

    // Cold builds seed positions via PivotMDS; warm keeps the current layout (see
    // the StressAnalysis options below).
    this.#analysis = new StressAnalysis(
      {
        n: this.#n,
        src: this.#src,
        dst: this.#dst,
        x: this.#x,
        y: this.#y,
      },
      {
        pivotCount: options.pivotCount,
        keepInitialPositions: input.warm,
        jitter: input.warm ? 0 : SEED_JITTER,
        packComponents: !input.warm,
        randomSeed: 1,
        idealEdgeLength: options.idealEdgeLength,
        validate: false,
      },
    );
    this.#phase = this.#newNodesFrom >= 0 ? "attach" : "analysis";
  }

  get done(): boolean {
    return this.#phase === "done";
  }

  /** Completed majorization iterations since the last solver build. */
  get iteration(): number {
    return this.#iteration;
  }

  /** Whether the last run hit the hard iteration cap instead of converging. */
  get capped(): boolean {
    return this.#capped;
  }

  /** Max per-node displacement of the last completed iteration (world units). */
  get lastMaxDisplacement(): number {
    return this.#lastMaxDisplacement;
  }

  /**
   * True once terminal settle verifies zero disk overlaps. Before latch,
   * iteration-boundary publishes may still contain overlaps; after latch, the
   * layout is settled and overlap-free.
   */
  get projectionActive(): boolean {
    return this.#everFeasible;
  }

  get termCount(): number {
    return this.#termA.length;
  }

  /** Cumulative / worst-unit wall time per phase (perf diagnostics; ~free to keep). */
  readonly phaseCumulativeMs: Partial<Record<SolverPhase, number>> = {};
  readonly phaseMaxMs: Partial<Record<SolverPhase, number>> = {};

  /** Cumulative ms spent inside projection/settle relaxation (diagnostic). */
  get projectionMs(): number {
    return (
      (this.phaseCumulativeMs.project ?? 0) +
      (this.phaseCumulativeMs.settle ?? 0)
    );
  }

  /** Worst single projection/settle advance unit (ms; diagnostic). */
  get maxProjectionMs(): number {
    return Math.max(this.phaseMaxMs.project ?? 0, this.phaseMaxMs.settle ?? 0);
  }

  /**
   * One bounded unit of work. Returns true if the solver advanced (false once done).
   * Units are budgeted so the worst single unit stays far below a frame at any
   * graph size: chunked scans in the build phases, one CG step (= one SpMV per
   * dimension) in the solve, pair-budgeted relaxation slices in projection and
   * settle.
   */
  advance(): boolean {
    const phase = this.#phase;
    if (phase === "done") {
      return false;
    }
    const start = performance.now();
    const advanced = this.#advanceInner();
    const elapsed = performance.now() - start;
    this.phaseCumulativeMs[phase] =
      (this.phaseCumulativeMs[phase] ?? 0) + elapsed;
    if (elapsed > (this.phaseMaxMs[phase] ?? 0)) {
      this.phaseMaxMs[phase] = elapsed;
    }
    return advanced;
  }

  #advanceInner(): boolean {
    switch (this.#phase) {
      case "attach": {
        this.#attachStep();
        return true;
      }
      case "analysis": {
        // #analysis is non-null only in the "analysis" phase; tick() returns
        // result only when done.
        const result = this.#analysis!.tick({ maxWork: ANALYSIS_TICK_WORK });
        if (result.done) {
          this.#analysisResult = result.result!;
          this.#analysis = null;
          this.#prepareStage = "degrees";
          this.#prepareCursor = 0;
          this.#phase = "prepare";
        }
        return true;
      }
      case "prepare": {
        this.#prepareStep();
        return true;
      }
      case "terms": {
        this.#buildTermsChunk(TERM_CHUNK);
        return true;
      }
      case "laplacian": {
        this.#buildLaplacianStep();
        return true;
      }
      case "rhs": {
        this.#computeRhsChunk(TERM_CHUNK);
        return true;
      }
      case "cg-init": {
        this.#initCg();
        return true;
      }
      case "cg": {
        this.#stepCg();
        return true;
      }
      case "project": {
        this.#projectStep();
        return true;
      }
      case "settle": {
        this.#settleStep();
        return true;
      }
      case "done": {
        return false;
      }
    }
  }

  /**
   * Monotonic generation counter; changes at each completed majorization iteration
   * or settle pass (and each attach pass) to gate buffer publishes.
   */
  get publishGeneration(): number {
    return this.#attachPassesDone + this.#iteration + this.#settlePasses;
  }

  /**
   * One bounded attach unit (see ATTACH_PASSES): the first unit scans the
   * edge list once for edges incident to new nodes (O(m)); each further unit
   * runs one pass over those edges, stepping endpoints toward the ideal edge
   * length split inverse to attach-degree, and counts as a publish
   * generation. No-op edge case: a batch with no new-node edges (pure dust)
   * skips straight to analysis.
   */
  #attachStep(): void {
    if (!this.#attachBuilt) {
      const from = this.#newNodesFrom;
      const edgeCount = this.#src.length;
      const found: number[] = [];
      for (let e = 0; e < edgeCount; e++) {
        if (this.#src[e]! >= from || this.#dst[e]! >= from) {
          found.push(e);
          this.#attachDegree.set(
            this.#src[e]!,
            (this.#attachDegree.get(this.#src[e]!) ?? 0) + 1,
          );
          this.#attachDegree.set(
            this.#dst[e]!,
            (this.#attachDegree.get(this.#dst[e]!) ?? 0) + 1,
          );
        }
      }
      this.#attachEdges = Uint32Array.from(found);
      this.#attachBuilt = true;
      if (found.length === 0) {
        this.#phase = "analysis";
      }
      return;
    }

    const target = this.#options.idealEdgeLength;
    for (const e of this.#attachEdges) {
      const u = this.#src[e]!;
      const v = this.#dst[e]!;
      let dx = this.#x[v]! - this.#x[u]!;
      let dy = this.#y[v]! - this.#y[u]!;
      let dist = Math.hypot(dx, dy);
      if (dist < EPS) {
        const angle = coincidentAngle(u, v);
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        dist = 1;
      } else {
        dx /= dist;
        dy /= dist;
      }
      const excess = dist - target;
      if (Math.abs(excess) < EPS) {
        continue;
      }
      const degreeU = this.#attachDegree.get(u) ?? 1;
      const degreeV = this.#attachDegree.get(v) ?? 1;
      const shareU = degreeV / (degreeU + degreeV);
      const step = excess * ATTACH_STRENGTH;
      this.#x[u]! += dx * step * shareU;
      this.#y[u]! += dy * step * shareU;
      this.#x[v]! -= dx * step * (1 - shareU);
      this.#y[v]! -= dy * step * (1 - shareU);
    }
    this.#attachPassesDone += 1;
    if (this.#attachPassesDone >= ATTACH_PASSES) {
      this.#phase = "analysis";
    }
  }

  /**
   * One bounded unit of the prepare phase. Stages either run one O(n)/O(m)
   * loop as a unit or resume a chunked scan via {@link #prepareCursor}; see
   * {@link PrepareStage} for ordering constraints.
   */
  #prepareStep(): void {
    switch (this.#prepareStage) {
      case "degrees": {
        this.#prepareDegreesChunk();
        return;
      }
      case "hub-rings": {
        this.#prepareHubRings();
        return;
      }
      case "packing": {
        this.#preparePacking();
        return;
      }
      case "max-hop": {
        this.#prepareMaxHopChunk();
        return;
      }
      case "scale": {
        this.#prepareScale();
        return;
      }
      case "edge-keys": {
        this.#prepareEdgeKeysChunk();
        return;
      }
      case "edge-terms": {
        this.#prepareEdgeTermsChunk();
        return;
      }
      case "pile-scatter": {
        this.scatteredPileNodes += this.#scatterPiles();
        this.#advancePrepareStage("near-pair-grid");
        return;
      }
      case "near-pair-grid": {
        this.#prepareNearPairGrid();
        return;
      }
      case "near-pairs": {
        this.#prepareNearPairsChunk();
        return;
      }
      case "region-count": {
        this.#prepareRegionCount();
        return;
      }
      case "region-select": {
        this.#prepareRegionSelect();
        return;
      }
      case "region-members": {
        this.#prepareRegionMembers();
        return;
      }
      case "region-edges": {
        this.#prepareRegionEdgesChunk();
      }
    }
  }

  /**
   * Degrees + per-node hub geometry accumulators from the (deduped) edge list.
   * For a hub v two radii matter: the one-ring radius that seats its children
   * side by side (Σ(2r+pad)/2π) and the disk radius that packs them at the
   * packing utilisation; the accumulation happens here, the radii in
   * "hub-rings". When the ring radius exceeds an edge's target the hub is
   * packing-bound; its children cannot all sit at the target distance; and its
   * spokes get a wide feasible band instead of an exact target (see #shapeTarget).
   */
  #prepareDegreesChunk(): void {
    const n = this.#n;
    const pad = this.#options.overlapPadding;
    if (this.#prepareCursor === 0) {
      this.#degrees = new Uint32Array(n);
      this.#childExtent = new Float64Array(n);
      this.#childAreaSq = new Float64Array(n);
    }
    const edgeCount = this.#src.length;
    const end = Math.min(edgeCount, this.#prepareCursor + EDGE_CHUNK);
    for (let e = this.#prepareCursor; e < end; e++) {
      const u = this.#src[e]!;
      const v = this.#dst[e]!;
      this.#degrees[u]! += 1;
      this.#degrees[v]! += 1;
      const ru = this.#radii[u]!;
      const rv = this.#radii[v]!;
      this.#childExtent[u]! += 2 * rv + pad;
      this.#childExtent[v]! += 2 * ru + pad;
      const halfU = ru + pad / 2;
      const halfV = rv + pad / 2;
      this.#childAreaSq[u]! += halfV * halfV;
      this.#childAreaSq[v]! += halfU * halfU;
    }
    this.#prepareCursor = end;
    if (end >= edgeCount) {
      this.#advancePrepareStage("hub-rings");
    }
  }

  #prepareHubRings(): void {
    const n = this.#n;
    this.#hubRing = new Float32Array(n);
    this.#hubPack = new Float32Array(n);
    for (let v = 0; v < n; v++) {
      const ringNeed = this.#childExtent[v]! / TAU;
      const diskNeed = Math.sqrt(this.#childAreaSq[v]! / PACKING_UTILISATION);
      this.#hubRing[v] = ringNeed;
      // A hub's own disk is part of the packing: children sit outside its radius.
      this.#hubPack[v] = Math.min(ringNeed, diskNeed + this.#radii[v]!);
    }
    this.#advancePrepareStage("packing");
  }

  /**
   * Per-component packing area for the feasibility scale: hop targets are
   * multiplied by max(1, R_packing / R_hop-ideal) so the unconstrained stress
   * optimum is roughly packing-feasible and the projector only has local work.
   * R_packing is the radius of the disk holding Σπ(r+pad/2)² at the packing
   * utilisation; R_hop-ideal comes from the pivot-BFS rows in "max-hop".
   */
  #preparePacking(): void {
    const analysis = this.#analysisResult!;
    const components = analysis.components;
    this.#componentOf = components.labels;
    const pad = this.#options.overlapPadding;
    this.#packingSq = new Float64Array(components.count);
    for (let v = 0; v < this.#n; v++) {
      const half = this.#radii[v]! + pad / 2;
      this.#packingSq[this.#componentOf[v]!]! += half * half;
    }
    this.#maxHop = new Float64Array(components.count);
    this.#advancePrepareStage("max-hop");
  }

  /** Max BFS distance per component, one pivot row per unit (row scans a component). */
  #prepareMaxHopChunk(): void {
    const analysis = this.#analysisResult!;
    const pivots = analysis.pivots;
    const components = analysis.components;
    const n = this.#n;
    const distances = pivots.distances;

    let scanned = 0;
    while (this.#prepareCursor < pivots.pivots.length && scanned < TERM_CHUNK) {
      const row = this.#prepareCursor;
      const component = pivots.components[row]!;
      const rowBase = row * n;
      const start = components.offsets[component]!;
      const end = components.offsets[component + 1]!;
      let rowMax = this.#maxHop[component]!;
      for (let i = start; i < end; i++) {
        const d = distances[rowBase + components.nodes[i]!]!;
        if (d !== INF_DIST && d > rowMax) {
          rowMax = d;
        }
      }
      this.#maxHop[component] = rowMax;
      scanned += end - start;
      this.#prepareCursor += 1;
    }
    if (this.#prepareCursor >= pivots.pivots.length) {
      this.#advancePrepareStage("scale");
    }
  }

  #prepareScale(): void {
    const components = this.#analysisResult!.components;
    /**
     * Feasibility-scale headroom. Default 1.3: without it, hop-scaled targets sit
     * just inside the packing envelope and terminal settle must inflate the cloud
     * (~8 % RMS rebound at 3k), the exact motion this engine exists to kill.
     */
    const SCALE_SAFETY = 1.3;
    this.#componentScale = new Float64Array(components.count);
    for (let c = 0; c < components.count; c++) {
      const packingRadius = Math.sqrt(
        this.#packingSq[c]! / PACKING_UTILISATION,
      );
      const hopRadius =
        Math.max(1, this.#maxHop[c]! / 2) * this.#options.idealEdgeLength;
      this.#componentScale[c] = Math.max(
        1,
        (SCALE_SAFETY * packingRadius) / hopRadius,
      );
    }
    this.scaleDiagnostics = Array.from(
      { length: Math.min(4, components.count) },
      (_, c) => ({
        size: components.offsets[c + 1]! - components.offsets[c]!,
        maxHop: this.#maxHop[c]!,
        packingRadius: Math.sqrt(this.#packingSq[c]! / PACKING_UTILISATION),
        scale: this.#componentScale[c]!,
      }),
    );
    this.#advancePrepareStage("edge-keys");
  }

  /**
   * Packed edge keys so near-pair floors never duplicate an edge term (their
   * targets would conflict: the floor would pull an adjacent pair inward
   * against its edge). Chunked: Set inserts on a 10⁵-edge list are a
   * double-digit-ms unit otherwise.
   */
  #prepareEdgeKeysChunk(): void {
    const n = this.#n;
    if (this.#prepareCursor === 0) {
      this.#edgeKeys = new Set<number>();
    }
    const edgeCount = this.#src.length;
    const end = Math.min(edgeCount, this.#prepareCursor + EDGE_CHUNK);
    for (let e = this.#prepareCursor; e < end; e++) {
      const u = this.#src[e]!;
      const v = this.#dst[e]!;
      this.#edgeKeys.add(Math.min(u, v) * n + Math.max(u, v));
    }
    this.#prepareCursor = end;
    if (end >= edgeCount) {
      this.#termA.clear();
      this.#termB.clear();
      this.#termWeight.clear();
      this.#termLo.clear();
      this.#termHi.clear();
      this.#advancePrepareStage("edge-terms");
    }
  }

  #prepareEdgeTermsChunk(): void {
    const edgeCount = this.#src.length;
    const end = Math.min(edgeCount, this.#prepareCursor + EDGE_CHUNK);
    for (let e = this.#prepareCursor; e < end; e++) {
      const u = this.#src[e]!;
      const v = this.#dst[e]!;
      this.#shapeTarget(u, v, 1);
      this.#pushTerm(u, v, 1, this.#shapedLo, this.#shapedHi);
    }
    this.#prepareCursor = end;
    if (end >= edgeCount) {
      this.#advancePrepareStage("pile-scatter");
    }
  }

  /**
   * Detect degenerate piles and scatter each onto an area-weighted phyllotaxis
   * spiral around the group's centroid: member k (ascending node index) lands
   * at radius √(Σ_{j≤k}(r_j + pad/2)² / utilisation) — the rim of the disk
   * that packs the members placed so far — at angle k·φ plus a hash-derived
   * group offset. Deterministic (bucket ids ascend in first-seen node order,
   * the flood fill scans buckets in id order and neighbours in a fixed 3×3
   * order, members sort ascending) and near-feasible by construction: what
   * pair relaxation would need O(pile) diffusion passes to achieve happens in
   * one placement. See the PILE_CELL_FACTOR doc for the detection rule and
   * its no-false-positive argument; runs as one O(n) unit, at build time and
   * on settle stall. Returns the number of nodes scattered.
   */
  #scatterPiles(): number {
    const n = this.#n;
    const pad = this.#options.overlapPadding;

    let radiusSum = 0;
    for (let v = 0; v < n; v++) {
      radiusSum += this.#radii[v]!;
    }
    const cellSize = Math.max(
      PILE_MIN_CELL_SIZE,
      PILE_CELL_FACTOR * (radiusSum / Math.max(1, n)),
    );

    const grid = this.#grid;
    grid.build(this.#x, this.#y, n, cellSize);
    const bucketCount = grid.bucketCount;
    const starts = grid.starts;
    const order = grid.order;

    // Overcommit test per bucket: Σ πr² of members vs the cell's own area.
    const areaLimit = PILE_OVERCOMMIT * cellSize * cellSize;
    if (this.#pileGroupOfBucket.length < bucketCount) {
      this.#pileGroupOfBucket = new Int32Array(bucketCount);
    }
    const groupOf = this.#pileGroupOfBucket;
    groupOf.fill(-1, 0, bucketCount);

    const overloaded = (bucket: number): boolean => {
      const start = starts[bucket]!;
      const end = starts[bucket + 1]!;
      if (end - start < 2) {
        return false;
      }
      let area = 0;
      for (let m = start; m < end; m++) {
        const radius = this.#radii[order[m]!]!;
        area += Math.PI * radius * radius;
      }
      return area > areaLimit;
    };

    const stack: number[] = [];
    const members: number[] = [];
    let scattered = 0;
    let groupCount = 0;
    for (let seed = 0; seed < bucketCount; seed++) {
      if (groupOf[seed]! !== -1 || !overloaded(seed)) {
        continue;
      }
      const group = groupCount;
      groupCount += 1;

      members.length = 0;
      stack.length = 0;
      stack.push(seed);
      groupOf[seed] = group;
      while (stack.length > 0) {
        const bucket = stack.pop()!;
        for (let m = starts[bucket]!; m < starts[bucket + 1]!; m++) {
          members.push(order[m]!);
        }
        // 8-neighbourhood over cells; grid cells are keyed by coordinates, so
        // neighbours resolve through the same exact-match lookup as the sweeps.
        const cellX = grid.cellXOf(order[starts[bucket]!]!);
        const cellY = grid.cellYOf(order[starts[bucket]!]!);
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            if (ox === 0 && oy === 0) {
              continue;
            }
            const neighbour = grid.bucketAt(cellX + ox, cellY + oy);
            if (
              neighbour >= 0 &&
              groupOf[neighbour]! === -1 &&
              overloaded(neighbour)
            ) {
              groupOf[neighbour] = group;
              stack.push(neighbour);
            }
          }
        }
      }

      if (members.length < PILE_MIN_GROUP) {
        continue;
      }

      if (process.env.PILE_DEBUG) {
        // eslint-disable-next-line no-console
        console.log(
          `[pile-scatter] group size=${members.length} seedCell=(${grid.cellXOf(
            order[starts[seed]!]!,
          )},${grid.cellYOf(order[starts[seed]!]!)})`,
        );
      }

      members.sort((a, b) => a - b);
      let centroidX = 0;
      let centroidY = 0;
      for (const node of members) {
        centroidX += this.#x[node]!;
        centroidY += this.#y[node]!;
      }
      centroidX /= members.length;
      centroidY /= members.length;

      const baseAngle = (hashU32(members[0]! + 1) / 0x100000000) * TAU;
      let cumHalfSq = 0;
      for (const [rank, node] of members.entries()) {
        const half = this.#radii[node]! + pad / 2;
        cumHalfSq += half * half;
        const radius = Math.sqrt(cumHalfSq / PACKING_UTILISATION);
        const angle = baseAngle + rank * GOLDEN_ANGLE;
        this.#x[node] = centroidX + Math.cos(angle) * radius;
        this.#y[node] = centroidY + Math.sin(angle) * radius;
      }
      scattered += members.length;
    }

    return scattered;
  }

  /**
   * Arm the cluster-level expansion for a percolation-jammed settle stall
   * (see the COARSE_CELL_FACTOR doc for the failure signature and the
   * multigrid argument). One O(n) unit: grid the nodes and derive one
   * super-disk per occupied cell — members' centroid, radius from their
   * packing area. The "coarse-run" stage then relaxes the super-disks apart
   * in budgeted slices, and {@link #coarseApply} translates members rigidly
   * with their cell. Rigid translations of separating cells never create new
   * member overlaps (cells only move apart), and cells whose super-disks are
   * already disjoint do not move at all, so a feasible-density layout is a
   * fixed point. Deterministic: bucket ids ascend in first-seen node order
   * and the sweep is itself deterministic.
   *
   * The node grid snapshot (`#grid`) must survive untouched until
   * {@link #coarseApply}; nothing else builds `#grid` during the settle
   * phase (the relax/verify sweeps own their grids, and the pile scatter
   * only runs from the same stall branch).
   */
  #coarseInit(): void {
    const n = this.#n;
    const pad = this.#options.overlapPadding;

    let radiusSum = 0;
    for (let v = 0; v < n; v++) {
      radiusSum += this.#radii[v]!;
    }
    const cellSize = Math.max(
      COARSE_MIN_CELL_SIZE,
      COARSE_CELL_FACTOR * (radiusSum / Math.max(1, n)),
    );

    const grid = this.#grid;
    grid.build(this.#x, this.#y, n, cellSize);
    const bucketCount = grid.bucketCount;
    const starts = grid.starts;
    const order = grid.order;

    if (this.#coarseSuperX.length < bucketCount) {
      this.#coarseSuperX = new Float32Array(bucketCount);
      this.#coarseSuperY = new Float32Array(bucketCount);
      this.#coarseSuperR = new Float32Array(bucketCount);
      this.#coarseBaseX = new Float32Array(bucketCount);
      this.#coarseBaseY = new Float32Array(bucketCount);
    }
    for (let bucket = 0; bucket < bucketCount; bucket++) {
      const start = starts[bucket]!;
      const end = starts[bucket + 1]!;
      let cx = 0;
      let cy = 0;
      let halfSq = 0;
      for (let m = start; m < end; m++) {
        const v = order[m]!;
        cx += this.#x[v]!;
        cy += this.#y[v]!;
        const half = this.#radii[v]! + pad / 2;
        halfSq += half * half;
      }
      const members = end - start;
      cx /= members;
      cy /= members;
      this.#coarseSuperX[bucket] = cx;
      this.#coarseSuperY[bucket] = cy;
      this.#coarseBaseX[bucket] = cx;
      this.#coarseBaseY[bucket] = cy;
      // Single disks need no packing slack; piles/clusters claim the disk
      // that packs their members at the engine-wide utilisation.
      this.#coarseSuperR[bucket] =
        members === 1
          ? Math.sqrt(halfSq)
          : Math.sqrt(halfSq / PACKING_UTILISATION);
    }

    this.#coarseBucketCount = bucketCount;
    this.#coarsePasses = 0;
    this.#coarsePassArmed = false;
    this.#settleStage = "coarse-run";
  }

  /** Rigid per-cell displacement of members after the super-disk relaxation. */
  #coarseApply(): void {
    const starts = this.#grid.starts;
    const order = this.#grid.order;
    for (let bucket = 0; bucket < this.#coarseBucketCount; bucket++) {
      const dx = this.#coarseSuperX[bucket]! - this.#coarseBaseX[bucket]!;
      const dy = this.#coarseSuperY[bucket]! - this.#coarseBaseY[bucket]!;
      if (dx === 0 && dy === 0) {
        continue;
      }
      const start = starts[bucket]!;
      const end = starts[bucket + 1]!;
      for (let m = start; m < end; m++) {
        const v = order[m]!;
        this.#x[v]! += dx;
        this.#y[v]! += dy;
      }
    }
  }

  /**
   * Near-pair floor grid over the (scattered) seed/warm positions: the same
   * cell sizing as the overlap sweeps, so any pair within the collision floor
   * lands within one cell.
   */
  #prepareNearPairGrid(): void {
    const n = this.#n;
    const pad = this.#options.overlapPadding;
    let maxRadius = 0;
    for (let v = 0; v < n; v++) {
      if (this.#radii[v]! > maxRadius) {
        maxRadius = this.#radii[v]!;
      }
    }
    this.#grid.build(this.#x, this.#y, n, Math.max(1e-6, 2 * maxRadius + pad));
    if (this.#nearPairPartners.length < n) {
      this.#nearPairPartners = new Uint8Array(n);
    } else {
      this.#nearPairPartners.fill(0, 0, n);
    }
    this.#advancePrepareStage("near-pairs");
  }

  /**
   * Grid-detected near-pair floors, pair-budget sliced. Deterministic: nodes
   * scanned in index order, each unordered pair visited once (3×3 scan with
   * the b ≤ a skip), partners capped per node in scan order. Pairs currently
   * overlapping (or nearly) that share no edge get push-only floor terms
   * [r_i + r_j + pad, ∞): they break residual piles apart through the stress
   * solve itself. Pairs that become overlapping only mid-solve are separated
   * in the terminal settle phase; static floors keep the Laplacian build-once.
   */
  #prepareNearPairsChunk(): void {
    const n = this.#n;
    const pad = this.#options.overlapPadding;
    const grid = this.#grid;
    const starts = grid.starts;
    const order = grid.order;
    const partners = this.#nearPairPartners;

    let visits = 0;
    let a = this.#prepareCursor;
    for (; a < n && visits < PAIR_BUDGET; a++) {
      if (partners[a]! >= NEAR_PAIR_MAX_PARTNERS) {
        continue;
      }
      const baseX = grid.cellXOf(a);
      const baseY = grid.cellYOf(a);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = grid.bucketAt(baseX + ox, baseY + oy);
          if (bucket < 0) {
            continue;
          }
          const end = starts[bucket + 1]!;
          for (let m = starts[bucket]!; m < end; m++) {
            const b = order[m]!;
            if (b <= a) {
              continue;
            }
            visits += 1;
            if (
              partners[a]! >= NEAR_PAIR_MAX_PARTNERS ||
              partners[b]! >= NEAR_PAIR_MAX_PARTNERS
            ) {
              continue;
            }
            const floor = this.#radii[a]! + this.#radii[b]! + pad;
            const dx = this.#x[b]! - this.#x[a]!;
            const dy = this.#y[b]! - this.#y[a]!;
            if (dx * dx + dy * dy >= floor * floor) {
              continue;
            }
            if (this.#edgeKeys.has(a * n + b)) {
              continue;
            }
            this.#pushTerm(
              a,
              b,
              NEAR_PAIR_WEIGHT,
              floor,
              Number.POSITIVE_INFINITY,
            );
            partners[a]! += 1;
            partners[b]! += 1;
          }
        }
      }
    }
    this.#prepareCursor = a;
    if (a >= n) {
      this.#advancePrepareStage("region-count");
    }
  }

  #prepareRegionCount(): void {
    const n = this.#n;
    const communityOf = this.#communityOf;
    this.#regionCount = 0;
    this.#regionExempt = new Uint32Array(0);
    if (!communityOf || n === 0) {
      // No communities ⇒ no regions; skip straight to the pivot-term phase.
      this.#finishPrepare();
      return;
    }

    let communityCount = 0;
    for (let v = 0; v < n; v++) {
      if (communityOf[v]! + 1 > communityCount) {
        communityCount = communityOf[v]! + 1;
      }
    }
    this.#communityCount = communityCount;
    this.#communityMemberCount = new Int32Array(communityCount);
    for (let v = 0; v < n; v++) {
      // -1 = community-less (absorbed past the provisional labeler's reach);
      // such nodes join no region and are counted nowhere.
      if (communityOf[v]! >= 0) {
        this.#communityMemberCount[communityOf[v]!]! += 1;
      }
    }
    this.#advancePrepareStage("region-select");
  }

  #prepareRegionSelect(): void {
    const communityCount = this.#communityCount;
    const memberCount = this.#communityMemberCount;

    const candidates: number[] = [];
    for (let c = 0; c < communityCount; c++) {
      if (memberCount[c]! >= REGION_MIN_COMMUNITY_SIZE) {
        candidates.push(c);
      }
    }
    // Largest first; community id breaks ties; deterministic under the dense
    // (first-seen) community numbering.
    candidates.sort((a, b) => memberCount[b]! - memberCount[a]! || a - b);
    const regions = candidates.slice(0, REGION_FLOOR_MAX_COMMUNITIES);
    if (regions.length === 0) {
      this.#finishPrepare();
      return;
    }

    this.#regionOfCommunity = new Int32Array(communityCount).fill(-1);
    for (const [regionIndex, community] of regions.entries()) {
      this.#regionOfCommunity[community] = regionIndex;
    }

    const count = regions.length;
    this.#regionCount = count;
    this.#regionRadius = new Float32Array(count);
    this.#regionCentroidX = new Float64Array(count);
    this.#regionCentroidY = new Float64Array(count);
    this.#regionMemberOffsets = new Int32Array(count + 1);
    this.#regionExempt = new Uint32Array(this.#n);
    this.#regionBridge = new Uint32Array(this.#n);
    this.#regionMargin =
      this.#options.overlapPadding +
      this.#options.communitySeparation *
        REGION_MARGIN_GAIN *
        this.#options.idealEdgeLength;
    this.#advancePrepareStage("region-members");
  }

  /** Counting-sort member lists so region scans stay cache-friendly and deterministic. */
  #prepareRegionMembers(): void {
    const n = this.#n;
    const communityOf = this.#communityOf!;
    const count = this.#regionCount;
    const pad = this.#options.overlapPadding;
    const areaSq = new Float64Array(count);
    for (let v = 0; v < n; v++) {
      const community = communityOf[v]!;
      // The community >= 0 guard is load-bearing: communityOf can hold -1
      // (community-less), and regionOfCommunity[-1] is undefined — which
      // `region < 0` does NOT catch, and `1 << undefined` is 1, silently
      // exempting every unlabeled node from region 0's floor.
      const region = community >= 0 ? this.#regionOfCommunity[community]! : -1;
      if (region < 0) {
        continue;
      }
      const half = this.#radii[v]! + pad / 2;
      areaSq[region]! += half * half;
      this.#regionExempt[v]! |= 1 << region;
      this.#regionMemberOffsets[region + 1]! += 1;
    }
    for (let r = 0; r < count; r++) {
      this.#regionRadius[r] = Math.sqrt(
        areaSq[r]! / REGION_PACKING_UTILISATION,
      );
      this.#regionMemberOffsets[r + 1]! += this.#regionMemberOffsets[r]!;
    }
    this.#regionMemberNodes = new Int32Array(this.#regionMemberOffsets[count]!);
    const cursor = this.#regionMemberOffsets.slice(0, count);
    for (let v = 0; v < n; v++) {
      const community = communityOf[v]!;
      const region = community >= 0 ? this.#regionOfCommunity[community]! : -1;
      if (region >= 0) {
        this.#regionMemberNodes[cursor[region]!] = v;
        cursor[region]! += 1;
      }
    }
    this.#advancePrepareStage("region-edges");
  }

  /**
   * Edge-adjacency exemption: a bridge endpoint may sit at the foreign region's
   * rim (its own edge target puts it there); shoving it out would fight the edge.
   */
  #prepareRegionEdgesChunk(): void {
    const communityOf = this.#communityOf!;
    const edgeCount = this.#src.length;
    const end = Math.min(edgeCount, this.#prepareCursor + EDGE_CHUNK);
    for (let e = this.#prepareCursor; e < end; e++) {
      const u = this.#src[e]!;
      const v = this.#dst[e]!;
      const communityU = communityOf[u]!;
      const communityV = communityOf[v]!;
      const regionU =
        communityU >= 0 ? this.#regionOfCommunity[communityU]! : -1;
      const regionV =
        communityV >= 0 ? this.#regionOfCommunity[communityV]! : -1;
      if (regionU >= 0) {
        this.#regionBridge[v]! |= 1 << regionU;
      }
      if (regionV >= 0) {
        this.#regionBridge[u]! |= 1 << regionV;
      }
    }
    this.#prepareCursor = end;
    if (end >= edgeCount) {
      this.#finishPrepare();
    }
  }

  #advancePrepareStage(next: PrepareStage): void {
    this.#prepareStage = next;
    this.#prepareCursor = 0;
  }

  #finishPrepare(): void {
    this.#pivotRowCursor = 0;
    this.#pivotNodeCursor = 0;
    this.#phase = "terms";
  }

  // ---------------------------------------------------- region-floor sweep

  /**
   * Arm one community-region relax pass: recompute each region's centroid from
   * its live members, then push every non-exempt node inside
   * R_region + r_node + `margin` radially out to that trigger distance plus
   * `overshoot` (the same trigger/landing hysteresis as the settle disk pass;
   * a zero-overshoot full-strength push lands exactly on the trigger and
   * ε-refires forever). With `strength` 0 it only counts (the settle phase's
   * verification read). Deterministic: fixed region order, index-ordered node
   * scan, hash-derived direction for a node exactly on a centroid. One-sided
   * by design; the stress energy has no term pulling a foreign node into a
   * region, so pushed-out is a fixed point (no force to fight) — but see
   * REGION_STALL_WINDOW: topologically interleaved communities admit no
   * region-clean geometry at all, and the settle phase freezes enforcement
   * rather than livelock against them.
   */
  #regionSweepStart(
    margin: number,
    strength: number,
    overshoot = 0,
    separateCenters = false,
  ): void {
    this.#regionSweepMargin = margin;
    this.#regionSweepStrength = strength;
    this.#regionSweepOvershoot = overshoot;
    this.#regionSweepSeparate = separateCenters;
    this.#regionSweepViolations = 0;
    this.#regionSweepCursor = 0;
    this.#regionSweepStage = this.#regionCount === 0 ? "idle" : "centroid";
  }

  /**
   * Advance the armed region pass by a bounded number of node visits.
   * Returns true when the pass is complete (violation count in
   * {@link #regionSweepViolations}).
   */
  #regionSweepRun(): boolean {
    if (this.#regionSweepStage === "idle") {
      return true;
    }
    const count = this.#regionCount;
    const n = this.#n;

    if (this.#regionSweepStage === "centroid") {
      // All centroids in one unit: Σ members ≤ n.
      for (let r = 0; r < count; r++) {
        const start = this.#regionMemberOffsets[r]!;
        const end = this.#regionMemberOffsets[r + 1]!;
        let cx = 0;
        let cy = 0;
        for (let m = start; m < end; m++) {
          const member = this.#regionMemberNodes[m]!;
          cx += this.#x[member]!;
          cy += this.#y[member]!;
        }
        const members = end - start;
        this.#regionCentroidX[r] = members > 0 ? cx / members : 0;
        this.#regionCentroidY[r] = members > 0 ? cy / members : 0;
      }
      if (this.#regionSweepSeparate) {
        this.#separateRegionCenters();
      }
      this.#regionSweepStage = "scan";
      this.#regionSweepCursor = 0;
      return false;
    }

    // Scan stage: whole regions per unit, budgeted by node visits.
    const regionsPerUnit = Math.max(1, Math.floor(REGION_NODE_BUDGET / n));
    const margin = this.#regionSweepMargin;
    const strength = this.#regionSweepStrength;
    const overshoot = this.#regionSweepOvershoot;
    let processed = 0;
    let violations = this.#regionSweepViolations;
    let r = this.#regionSweepCursor;
    for (; r < count && processed < regionsPerUnit; r++, processed++) {
      const cx = this.#regionCentroidX[r]!;
      const cy = this.#regionCentroidY[r]!;
      const base = this.#regionRadius[r]! + margin;
      // Bridges (nodes with an edge into r) may sit on r's rim but not in
      // its core; see BRIDGE_CORE_FRACTION.
      const core = BRIDGE_CORE_FRACTION * this.#regionRadius[r]! + margin;
      const skipMask = 1 << r;
      for (let v = 0; v < n; v++) {
        if ((this.#regionExempt[v]! & skipMask) !== 0) {
          continue;
        }
        const isBridge = (this.#regionBridge[v]! & skipMask) !== 0;
        const need = (isBridge ? core : base) + this.#radii[v]!;
        let dx = this.#x[v]! - cx;
        let dy = this.#y[v]! - cy;
        const distSq = dx * dx + dy * dy;
        if (distSq >= need * need) {
          continue;
        }
        violations += 1;
        if (strength === 0) {
          continue;
        }
        let dist = Math.sqrt(distSq);
        if (dist < EPS) {
          const angle = coincidentAngle(v, n + r);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          dist = 1;
        } else {
          dx /= dist;
          dy /= dist;
        }
        const shift = (need + overshoot - dist) * strength;
        this.#x[v]! += dx * shift;
        this.#y[v]! += dy * shift;
      }
    }
    this.#regionSweepCursor = r;
    this.#regionSweepViolations = violations;
    if (r >= count) {
      this.#regionSweepStage = "idle";
      return true;
    }
    return false;
  }

  /**
   * Relax the live centroids into separated working centers, in place (see
   * REGION_CENTER_RELAX_ITERATIONS): pairwise disk relaxation over the ≤ 32
   * region disks, mass-weighted so a small community's center yields before a
   * big one's. Deterministic: fixed pair order, fixed iteration count, early
   * exit only on a clean iteration; a coincident pair splits along a
   * hash-derived angle.
   */
  #separateRegionCenters(): void {
    const count = this.#regionCount;
    for (let pass = 0; pass < REGION_CENTER_RELAX_ITERATIONS; pass++) {
      let anyPush = false;
      for (let a = 0; a < count; a++) {
        const membersA =
          this.#regionMemberOffsets[a + 1]! - this.#regionMemberOffsets[a]!;
        for (let b = a + 1; b < count; b++) {
          const need = this.#regionRadius[a]! + this.#regionRadius[b]!;
          let dx = this.#regionCentroidX[b]! - this.#regionCentroidX[a]!;
          let dy = this.#regionCentroidY[b]! - this.#regionCentroidY[a]!;
          const distSq = dx * dx + dy * dy;
          if (distSq >= need * need) {
            continue;
          }
          anyPush = true;
          let dist = Math.sqrt(distSq);
          if (dist < EPS) {
            const angle = coincidentAngle(this.#n + a, this.#n + b);
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            dist = 1;
          } else {
            dx /= dist;
            dy /= dist;
          }
          const membersB =
            this.#regionMemberOffsets[b + 1]! - this.#regionMemberOffsets[b]!;
          const total = Math.max(1, membersA + membersB);
          const shift = (need - dist) * REGION_CENTER_RELAX_STRENGTH;
          const shareA = membersB / total;
          this.#regionCentroidX[a]! -= dx * shift * shareA;
          this.#regionCentroidY[a]! -= dy * shift * shareA;
          this.#regionCentroidX[b]! += dx * shift * (1 - shareA);
          this.#regionCentroidY[b]! += dy * shift * (1 - shareA);
        }
      }
      if (!anyPush) {
        return;
      }
    }
  }

  /** Arm one member-gather pass (see REGION_GATHER_STRENGTH_ITERATION). */
  #gatherStart(): void {
    this.#gatherCursor = 0;
    this.#gatherMoved = 0;
  }

  /**
   * Advance the armed gather pass by a bounded number of member visits: every
   * member sitting outside its own region's disk (dist + r_v > R_r) is pulled
   * radially toward the region centroid by
   * REGION_GATHER_STRENGTH_ITERATION × its excess. Uses the centroids the
   * region sweep just recomputed (eviction moves only non-members, so they
   * are still exact). Total work is Σ members ≤ n per pass. Returns true when
   * the pass is complete (moved count in {@link #gatherMoved}).
   */
  #gatherSweepRun(): boolean {
    const total = this.#regionMemberNodes.length;
    if (this.#regionCount === 0 || total === 0) {
      return true;
    }
    const end = Math.min(total, this.#gatherCursor + REGION_NODE_BUDGET);
    const offsets = this.#regionMemberOffsets;
    // Locate the region containing the cursor (≤ 32 regions; linear is fine).
    let r = 0;
    while (offsets[r + 1]! <= this.#gatherCursor) {
      r += 1;
    }
    let moved = this.#gatherMoved;
    for (let m = this.#gatherCursor; m < end; m++) {
      while (offsets[r + 1]! <= m) {
        r += 1;
      }
      const v = this.#regionMemberNodes[m]!;
      const inside = Math.max(0, this.#regionRadius[r]! - this.#radii[v]!);
      const dx = this.#x[v]! - this.#regionCentroidX[r]!;
      const dy = this.#y[v]! - this.#regionCentroidY[r]!;
      const distSq = dx * dx + dy * dy;
      if (distSq <= inside * inside) {
        continue;
      }
      const dist = Math.sqrt(distSq);
      // dist ≥ inside ≥ 0 here; dist can only be 0 when inside is too, and
      // then the shift below is 0 regardless of direction.
      const shift =
        dist < EPS
          ? 0
          : ((dist - inside) * REGION_GATHER_STRENGTH_ITERATION) / dist;
      this.#x[v]! -= dx * shift;
      this.#y[v]! -= dy * shift;
      moved += 1;
    }
    this.#gatherMoved = moved;
    this.#gatherCursor = end;
    return end >= total;
  }

  // ----------------------------------------------------------- term shaping

  /**
   * Community-shaped target band for a pair at `hops` graph distance, written to
   * `#shapedLo` / `#shapedHi`.
   *
   * - Edge terms (hops = 1) get an exact target; they carry local structure;
   * unless an endpoint hub is packing-bound (its one-ring radius exceeds the
   * target, i.e. its children cannot all sit at the target distance). Such spokes
   * get the wide feasible band [collision + haloShare·(pack − collision),
   * max(pack, target)·slack]: the compact packing the projector produces (children
   * at radii from the hub's rim out to the packing radius) lies inside the band,
   * so a packed hub is a fixed point instead of a fight. `degreeRepulsion` sets
   * haloShare; how far children are pushed from the rim toward an explicit
   * halo shell.
   * - Pivot terms (hops ≥ 2) get a ±PIVOT_BAND dead zone around the target so
   * packing distortion does not generate perpetual pulls.
   * - The collision floor r_i + r_j + pad applies to every band (floored terms get a
   * FLOOR_CEILING_SLACK dead zone rather than an exact floor).
   *
   * The hub band is applied here, not just on edge terms, because a pivot row
   * re-emits (pivot, neighbour) pairs at d = 1 and a conflicting un-banded target
   * would average against the edge term and undercut the halo. All d = 1 terms for a
   * pair agree exactly, so duplicates only add weight.
   */
  #shapeTarget(u: number, v: number, hops: number): void {
    const opts = this.#options;
    // Both endpoints share a component (terms come from edges / same-component
    // pivot-BFS rows), so u's feasibility scale is the pair's.
    let target =
      hops *
      opts.idealEdgeLength *
      this.#componentScale[this.#componentOf[u]!]!;
    const communityOf = this.#communityOf;
    if (communityOf) {
      const cu = communityOf[u]!;
      const cv = communityOf[v]!;
      // Community-less (-1) pairs are neither same (two unlabeled newcomers
      // share no discovered affinity) nor different (don't stretch a newcomer
      // away from its labeled neighbour): they take the unshaped target.
      if (cu >= 0 && cv >= 0) {
        if (cu !== cv) {
          target *= 1 + opts.communitySeparation * SEPARATION_TARGET_GAIN;
        } else {
          target /= 1 + opts.communityCohesion * COHESION_TARGET_GAIN;
        }
      }
    }
    const collision = this.#radii[u]! + this.#radii[v]! + opts.overlapPadding;

    if (hops === 1) {
      const ringNeed = Math.max(this.#hubRing[u]!, this.#hubRing[v]!);
      if (ringNeed > target) {
        const packRadius = Math.max(
          collision,
          Math.max(this.#hubPack[u]!, this.#hubPack[v]!),
        );
        const haloShare = Math.min(1, opts.degreeRepulsion * DEGREE_HALO_GAIN);
        this.#shapedLo = collision + haloShare * (packRadius - collision);
        this.#shapedHi = Math.max(packRadius, target) * FLOOR_CEILING_SLACK;
        return;
      }
    }

    const band = hops >= 2 ? PIVOT_BAND : EDGE_BAND;
    let lo = target * (1 - band);
    let hi = target * (1 + band);
    if (lo < collision) {
      lo = collision;
      const flooredHi = collision * FLOOR_CEILING_SLACK;
      if (hi < flooredHi) {
        hi = flooredHi;
      }
    }
    this.#shapedLo = lo;
    this.#shapedHi = hi;
  }

  #pushTerm(
    a: number,
    b: number,
    weight: number,
    lo: number,
    hi: number,
  ): void {
    this.#termA.push(a);
    this.#termB.push(b);
    this.#termWeight.push(weight);
    this.#termLo.push(lo);
    this.#termHi.push(hi);
  }

  /**
   * Pivot terms, chunked: for pivot row p and node v at BFS distance d, a term with
   * weight 1/d² and community-shaped target d·ideal. Degree-1 nodes are skipped as the
   * non-pivot endpoint: a leaf's position is fully determined by its single edge plus
   * the projector, and anchoring it to k pivots at hop-scaled targets is exactly the
   * inward compaction pressure that fought the hub halos (its own pivot row, if a leaf
   * is selected as a pivot, still anchors the rest of the graph to it).
   */
  #buildTermsChunk(budget: number): void {
    const analysis = this.#analysisResult!;
    const pivots = analysis.pivots;
    const components = analysis.components;
    const n = this.#n;
    const distances = pivots.distances;
    let work = 0;

    while (work < budget) {
      if (this.#pivotRowCursor >= pivots.pivots.length) {
        this.#laplacianPass = 0;
        this.#laplacianCursor = 0;
        this.#phase = "laplacian";
        return;
      }
      const row = this.#pivotRowCursor;
      const pivotNode = pivots.pivots[row]!;
      const component = pivots.components[row]!;
      const start = components.offsets[component]!;
      const end = components.offsets[component + 1]!;
      if (this.#pivotNodeCursor === 0) {
        this.#pivotNodeCursor = start;
      }
      const rowBase = row * n;

      while (this.#pivotNodeCursor < end && work < budget) {
        const v = components.nodes[this.#pivotNodeCursor]!;
        this.#pivotNodeCursor += 1;
        work += 1;
        if (v === pivotNode || this.#degrees[v]! <= 1) {
          continue;
        }
        const d = distances[rowBase + v]!;
        if (d === 0 || d === INF_DIST) {
          continue;
        }
        this.#shapeTarget(pivotNode, v, d);
        this.#pushTerm(
          pivotNode,
          v,
          1 / (d * d),
          this.#shapedLo,
          this.#shapedHi,
        );
      }

      if (this.#pivotNodeCursor >= end) {
        this.#pivotRowCursor += 1;
        this.#pivotNodeCursor = 0;
      }
    }
  }

  /**
   * CSR weighted Laplacian over the terms, built once per (re)layout/absorb, in
   * bounded passes (count / prefix+allocate / fill, the term scans chunked).
   * Off-diagonals only; the diagonal lives in its own array (also the Jacobi
   * preconditioner). Duplicate (i,j) entries (an edge that is also a pivot
   * pair) simply accumulate in the SpMV; no dedupe pass.
   */
  #buildLaplacianStep(): void {
    const n = this.#n;
    const terms = this.#termA.length;
    const termA = this.#termA.raw;
    const termB = this.#termB.raw;

    if (this.#laplacianPass === 0) {
      if (this.#laplacianCursor === 0) {
        this.#rowPtr = new Int32Array(n + 1);
      }
      const end = Math.min(terms, this.#laplacianCursor + TERM_CHUNK);
      for (let t = this.#laplacianCursor; t < end; t++) {
        this.#rowPtr[termA[t]! + 1]! += 1;
        this.#rowPtr[termB[t]! + 1]! += 1;
      }
      this.#laplacianCursor = end;
      if (end >= terms) {
        this.#laplacianPass = 1;
        this.#laplacianCursor = 0;
      }
      return;
    }

    if (this.#laplacianPass === 1) {
      for (let v = 0; v < n; v++) {
        this.#rowPtr[v + 1]! += this.#rowPtr[v]!;
      }
      const nnz = this.#rowPtr[n]!;
      this.#colIdx = new Int32Array(nnz);
      this.#offDiag = new Float32Array(nnz);
      this.#diag = new Float64Array(n);
      this.#invDiag = new Float64Array(n);
      this.#rowCursor = this.#rowPtr.slice(0, n);
      this.#laplacianPass = 2;
      this.#laplacianCursor = 0;
      return;
    }

    if (this.#laplacianPass === 2) {
      const cursor = this.#rowCursor;
      const weight = this.#termWeight.raw;
      const end = Math.min(terms, this.#laplacianCursor + TERM_CHUNK);
      for (let t = this.#laplacianCursor; t < end; t++) {
        const a = termA[t]!;
        const b = termB[t]!;
        const w = weight[t]!;
        this.#colIdx[cursor[a]!] = b;
        this.#offDiag[cursor[a]!] = w;
        cursor[a]! += 1;
        this.#colIdx[cursor[b]!] = a;
        this.#offDiag[cursor[b]!] = w;
        cursor[b]! += 1;
        this.#diag[a]! += w;
        this.#diag[b]! += w;
      }
      this.#laplacianCursor = end;
      if (end >= terms) {
        this.#laplacianPass = 3;
      }
      return;
    }

    for (let v = 0; v < n; v++) {
      // Term-less nodes (singleton components) have a zero row; they never move.
      this.#invDiag[v] = this.#diag[v]! > 0 ? 1 / this.#diag[v]! : 0;
    }

    // Zero-allocation iterate loop (worker hot path).
    this.#bX = new Float64Array(n);
    this.#bY = new Float64Array(n);
    this.#solX = new Float64Array(n);
    this.#solY = new Float64Array(n);
    this.#resX = new Float64Array(n);
    this.#resY = new Float64Array(n);
    this.#dirX = new Float64Array(n);
    this.#dirY = new Float64Array(n);
    this.#applyX = new Float64Array(n);
    this.#applyY = new Float64Array(n);
    this.#prevX = new Float32Array(n);
    this.#prevY = new Float32Array(n);
    this.#prevX.set(this.#x.subarray(0, n));
    this.#prevY.set(this.#y.subarray(0, n));

    this.#iteration = 0;
    this.#convergedStreak = 0;
    this.#capped = false;
    this.#bestDisplacement = Number.POSITIVE_INFINITY;
    this.#bestDisplacementIteration = 0;
    this.#settlePasses = 0;
    this.#everFeasible = false;
    this.settleCapped = false;
    this.#settleCapFinalising = false;
    this.residualOverlaps = 0;
    this.residualRegionViolations = 0;
    this.#rhsCursor = 0;
    this.#phase = "rhs";
  }

  /**
   * Majorant right-hand side from the current positions: for each term (a, b, w, d*)
   * the contribution is w·d*·û along the current separation direction û (a hash-derived
   * deterministic direction for exactly-coincident endpoints). This is (L_Z·z) of
   * Gansner/Koren/North, computed term-wise in one chunked pass.
   */
  #computeRhsChunk(budget: number): void {
    if (this.#rhsCursor === 0) {
      this.#bX.fill(0);
      this.#bY.fill(0);
    }
    const terms = this.#termA.length;
    const termA = this.#termA.raw;
    const termB = this.#termB.raw;
    const termWeight = this.#termWeight.raw;
    const termLo = this.#termLo.raw;
    const termHi = this.#termHi.raw;
    const end = Math.min(terms, this.#rhsCursor + budget);
    for (let t = this.#rhsCursor; t < end; t++) {
      const a = termA[t]!;
      const b = termB[t]!;
      const dx = this.#x[a]! - this.#x[b]!;
      const dy = this.#y[a]! - this.#y[b]!;
      const distSq = dx * dx + dy * dy;
      let target;
      let ux;
      let uy;
      if (distSq > EPS) {
        const dist = Math.sqrt(distSq);
        // Interval target: inside [lo, hi] the effective target is the current
        // distance, so the term's contribution matches L·z exactly and exerts zero
        // net force (the IPSep one-sided treatment, generalised to a band).
        const lo = termLo[t]!;
        const hi = termHi[t]!;
        target = dist < lo ? lo : dist > hi ? hi : dist;
        const inv = 1 / dist;
        ux = dx * inv;
        uy = dy * inv;
      } else {
        target = termLo[t]!;
        const angle = coincidentAngle(a, b);
        ux = Math.cos(angle);
        uy = Math.sin(angle);
      }
      const c = termWeight[t]! * target;
      this.#bX[a]! += c * ux;
      this.#bY[a]! += c * uy;
      this.#bX[b]! -= c * ux;
      this.#bY[b]! -= c * uy;
    }
    this.#rhsCursor = end;
    if (this.#rhsCursor >= terms) {
      this.#rhsCursor = 0;
      this.#phase = "cg-init";
    }
  }

  /** y ← L·v (diag − off-diagonal CSR accumulate). */
  #spmv(v: Float64Array, out: Float64Array): void {
    const n = this.#n;
    const rowPtr = this.#rowPtr;
    const colIdx = this.#colIdx;
    const offDiag = this.#offDiag;
    const diag = this.#diag;
    for (let i = 0; i < n; i++) {
      let sum = diag[i]! * v[i]!;
      const end = rowPtr[i + 1]!;
      for (let k = rowPtr[i]!; k < end; k++) {
        sum -= offDiag[k]! * v[colIdx[k]!]!;
      }
      out[i] = sum;
    }
  }

  /**
   * (Re)start CG warm from the current positions. L is PSD with one constant-vector
   * nullspace per weak component; b has zero component sums (it is L_Z·z), so CG is
   * consistent and preserves each component's centroid from the warm start.
   */
  #initCg(): void {
    const n = this.#n;
    for (let v = 0; v < n; v++) {
      this.#solX[v] = this.#x[v]!;
      this.#solY[v] = this.#y[v]!;
    }
    this.#spmv(this.#solX, this.#applyX);
    this.#spmv(this.#solY, this.#applyY);
    let rzX = 0;
    let rzY = 0;
    for (let v = 0; v < n; v++) {
      const rx = this.#bX[v]! - this.#applyX[v]!;
      const ry = this.#bY[v]! - this.#applyY[v]!;
      this.#resX[v] = rx;
      this.#resY[v] = ry;
      const zx = rx * this.#invDiag[v]!;
      const zy = ry * this.#invDiag[v]!;
      this.#dirX[v] = zx;
      this.#dirY[v] = zy;
      rzX += rx * zx;
      rzY += ry * zy;
    }
    this.#rzX = rzX;
    this.#rzY = rzY;
    this.#rz0X = rzX;
    this.#rz0Y = rzY;
    this.#cgDoneX = rzX <= EPS;
    this.#cgDoneY = rzY <= EPS;
    this.#cgStep = 0;
    if (this.#cgDoneX && this.#cgDoneY) {
      this.#startProject();
    } else {
      this.#phase = "cg";
    }
  }

  /** One preconditioned-CG step per dimension (bounded: ≤ 2 SpMV per unit). */
  #stepCg(): void {
    const relTolSq = CG_RELATIVE_TOLERANCE * CG_RELATIVE_TOLERANCE;
    if (!this.#cgDoneX) {
      this.#rzX = this.#cgKernel(
        this.#solX,
        this.#resX,
        this.#dirX,
        this.#applyX,
        this.#rzX,
      );
      if (this.#rzX <= relTolSq * this.#rz0X || this.#rzX <= EPS) {
        this.#cgDoneX = true;
      }
    }
    if (!this.#cgDoneY) {
      this.#rzY = this.#cgKernel(
        this.#solY,
        this.#resY,
        this.#dirY,
        this.#applyY,
        this.#rzY,
      );
      if (this.#rzY <= relTolSq * this.#rz0Y || this.#rzY <= EPS) {
        this.#cgDoneY = true;
      }
    }
    this.#cgStep += 1;
    if (
      (this.#cgDoneX && this.#cgDoneY) ||
      this.#cgStep >= this.#options.cgStepsPerIteration
    ) {
      this.#startProject();
    }
  }

  /** One PCG update over one dimension's persistent state; returns the new r·z. */
  #cgKernel(
    sol: Float64Array,
    res: Float64Array,
    dir: Float64Array,
    apply: Float64Array,
    rz: number,
  ): number {
    const n = this.#n;
    this.#spmv(dir, apply);
    let pAp = 0;
    for (let i = 0; i < n; i++) {
      pAp += dir[i]! * apply[i]!;
    }
    // Degenerate search direction: treat dimension as converged (pAp ≤ ε avoids
    // divide-by-zero and infinite step).
    if (pAp <= EPS) {
      return 0;
    }
    const invDiag = this.#invDiag;
    const alpha = rz / pAp;
    let rzNew = 0;
    for (let i = 0; i < n; i++) {
      sol[i]! += alpha * dir[i]!;
      const r = res[i]! - alpha * apply[i]!;
      res[i] = r;
      rzNew += r * (r * invDiag[i]!);
    }
    const beta = rzNew / rz;
    for (let i = 0; i < n; i++) {
      dir[i] = res[i]! * invDiag[i]! + beta * dir[i]!;
    }
    return rzNew;
  }

  #startProject(): void {
    this.#projectStage = "adopt";
    this.#projectPass = 0;
    this.#projectMoved = false;
    this.#phase = "project";
  }

  /**
   * One bounded unit of the iteration boundary: adopt the CG iterate, run the
   * region floor (it can create disk overlaps for the relax passes to bleed;
   * the reverse order would leave region pushes un-cleaned until next
   * iteration), gather stray community members into their region disks (the
   * symmetric half; also a disk-overlap source for the relax passes), bleed
   * piles with a couple of gentle relax passes (each sliced by pair budget),
   * measure displacement, and decide; converge (→ settle), plateau
   * (→ settle), cap (log, → settle), or loop (→ rhs).
   */
  #projectStep(): void {
    switch (this.#projectStage) {
      case "adopt": {
        const n = this.#n;
        for (let v = 0; v < n; v++) {
          this.#x[v] = this.#solX[v]!;
          this.#y[v] = this.#solY[v]!;
        }
        let solveDispSq = 0;
        for (let v = 0; v < n; v++) {
          const dx = this.#x[v]! - this.#prevX[v]!;
          const dy = this.#y[v]! - this.#prevY[v]!;
          const dispSq = dx * dx + dy * dy;
          if (dispSq > solveDispSq) {
            solveDispSq = dispSq;
          }
        }
        this.lastSolveDisplacement = Math.sqrt(solveDispSq);
        this.#regionSweepStart(
          this.#regionMargin,
          REGION_RELAX_STRENGTH_ITERATION,
          0,
          true,
        );
        this.#projectStage = "region";
        return;
      }
      case "region": {
        if (!this.#regionSweepRun()) {
          return;
        }
        this.residualRegionViolations = this.#regionSweepViolations;
        if (this.#regionSweepViolations > 0) {
          this.#projectMoved = true;
        }
        this.#gatherStart();
        this.#projectStage = "gather";
        return;
      }
      case "gather": {
        if (!this.#gatherSweepRun()) {
          return;
        }
        if (this.#gatherMoved > 0) {
          this.#projectMoved = true;
        }
        this.#projectStage = "relax-build";
        return;
      }
      case "relax-build": {
        if (this.#projectPass >= ITERATION_RELAX_PASSES) {
          this.#projectStage = "finish";
          return;
        }
        this.#sweep.reset({
          x: this.#x,
          y: this.#y,
          radii: this.#radii,
          count: this.#n,
          padding: this.#options.overlapPadding,
          strength: ITERATION_RELAX_STRENGTH,
        });
        this.#sweep.buildGrid();
        this.#projectStage = "relax-run";
        return;
      }
      case "relax-run": {
        if (!this.#sweep.run(PAIR_BUDGET)) {
          return;
        }
        const { maxMove, overlapsFound } = this.#sweep.result;
        this.residualOverlaps = overlapsFound;
        if (maxMove === 0) {
          this.#projectStage = "finish";
          return;
        }
        this.#projectMoved = true;
        this.#projectPass += 1;
        this.#projectStage = "relax-build";
        return;
      }
      case "finish": {
        this.#finishIteration();
      }
    }
  }

  #finishIteration(): void {
    const n = this.#n;
    if (this.#projectMoved) {
      this.projectionRuns += 1;
    }

    let maxDispSq = 0;
    let maxDispNode = -1;
    for (let v = 0; v < n; v++) {
      const dx = this.#x[v]! - this.#prevX[v]!;
      const dy = this.#y[v]! - this.#prevY[v]!;
      const dispSq = dx * dx + dy * dy;
      if (dispSq > maxDispSq) {
        maxDispSq = dispSq;
        maxDispNode = v;
      }
      this.#prevX[v] = this.#x[v]!;
      this.#prevY[v] = this.#y[v]!;
    }
    this.#lastMaxDisplacement = Math.sqrt(maxDispSq);
    this.lastMaxDisplacementNode = maxDispNode;
    this.lastMaxSolveGap =
      maxDispNode >= 0
        ? Math.hypot(
            this.#solX[maxDispNode]! - this.#x[maxDispNode]!,
            this.#solY[maxDispNode]! - this.#y[maxDispNode]!,
          )
        : 0;
    this.lastProjectDisplacement = Math.max(
      0,
      this.#lastMaxDisplacement - this.lastSolveDisplacement,
    );
    this.#iteration += 1;

    const threshold =
      this.#options.convergenceEpsilon * this.#options.idealEdgeLength;
    if (this.#lastMaxDisplacement < threshold) {
      this.#convergedStreak += 1;
    } else {
      this.#convergedStreak = 0;
    }
    if (
      this.#lastMaxDisplacement <
      this.#bestDisplacement * PLATEAU_IMPROVEMENT
    ) {
      this.#bestDisplacement = this.#lastMaxDisplacement;
      this.#bestDisplacementIteration = this.#iteration;
    }

    // Stress phase exits on convergence, plateau, or iteration cap; terminal settle
    // then seeks verified feasibility (unless {@link settleCapped}; see SETTLE_MAX_PASSES).
    if (this.#convergedStreak >= this.#options.convergenceStreak) {
      this.#startSettle();
      return;
    }
    if (this.#iteration - this.#bestDisplacementIteration >= PLATEAU_WINDOW) {
      this.#startSettle();
      return;
    }
    if (this.#iteration >= this.#options.maxIterations) {
      this.#capped = true;
      // eslint-disable-next-line no-console
      console.warn(
        `[majorization] capped at ${this.#iteration} iterations ` +
          `(maxDisplacement=${this.#lastMaxDisplacement.toFixed(3)}, ` +
          `threshold=${threshold.toFixed(3)})`,
      );
      this.#startSettle();
      return;
    }
    this.#phase = "rhs";
  }

  #startSettle(): void {
    this.#phase = "settle";
    this.#settleStage = "region";
    this.#settlePrevOverlaps = Number.POSITIVE_INFINITY;
    this.#settleScatterCooldown = 0;
    this.#settleOverlapsAtLastScatter = Number.POSITIVE_INFINITY;
    this.#settleRegionFrozen = false;
    this.#settleBestRegionViolations = Number.POSITIVE_INFINITY;
    this.#settleRegionStallStreak = 0;
    // The stress solve can have re-compacted piles the build-time scatter
    // separated (or created new ones); re-scatter before relaxation so the
    // settle starts near-feasible instead of diffusing a deep pile apart.
    this.scatteredPileNodes += this.#scatterPiles();
    this.#regionSweepStart(0, SETTLE_RELAX_STRENGTH, SETTLE_CLEARANCE);
  }

  /**
   * One bounded unit of the terminal settle: full-strength relax passes
   * (region floor, then disk overlap), one pass per publish generation, each
   * sliced by pair/region budgets. The phase ends once a pass proves the
   * layout clean; the disk pass triggers on strict intersection, so a pass
   * that moved nothing IS a strict-clean proof, and a pre-push region count
   * of zero proves the regions clean; or once an interval verification
   * (strict overlap + region count) confirms it. Pure separation with no
   * opposing force, so termination is structural — with two safety valves for
   * the structurally-impossible cases: deep-pile diffusion re-scatters (see
   * SETTLE_SCATTER_STALL_RATIO) and unsatisfiable region constraints freeze
   * (see REGION_STALL_WINDOW; the disk guarantee survives, the region
   * residual is reported honestly).
   *
   * When the cap is hit, a final verification runs so the residual counts are
   * accurate, `settleCapped` latches true, and `#phase` still moves to "done":
   * `residualOverlaps` / `residualRegionViolations` may be non-zero and
   * `isSettled` is still true. Callers must treat a capped settle as a hard
   * failure mode to surface, not a benign alternate exit.
   */
  #settleStep(): void {
    switch (this.#settleStage) {
      case "region": {
        if (this.#settleRegionFrozen) {
          this.#settleRegionViolations = 0;
        } else {
          if (!this.#regionSweepRun()) {
            return;
          }
          const violations = this.#regionSweepViolations;
          this.#settleRegionViolations = violations;
          if (violations < this.#settleBestRegionViolations) {
            this.#settleBestRegionViolations = violations;
            this.#settleRegionStallStreak = 0;
          } else if (violations > 0) {
            this.#settleRegionStallStreak += 1;
            // Structural interleave (big stuck set) freezes immediately at
            // the stall window; rim churn (small set) gets extended patience
            // first — see REGION_FREEZE_MIN_VIOLATIONS.
            const structural =
              violations >
              Math.max(
                REGION_FREEZE_MIN_VIOLATIONS,
                REGION_FREEZE_FRACTION * this.#n,
              );
            const patience =
              REGION_STALL_WINDOW *
              (structural ? 1 : REGION_SMALL_STALL_PATIENCE);
            if (this.#settleRegionStallStreak >= patience) {
              this.#settleRegionFrozen = true;
              this.residualRegionViolations = violations;
              // eslint-disable-next-line no-console
              console.warn(
                `[majorization] region enforcement frozen after ` +
                  `${this.#settlePasses} settle passes: ${violations} ` +
                  `violations not improving (interleaved communities); ` +
                  `settling disks only`,
              );
            }
          }
        }
        this.#sweep.reset({
          x: this.#x,
          y: this.#y,
          radii: this.#radii,
          count: this.#n,
          padding: 0,
          strength: SETTLE_RELAX_STRENGTH,
          overshoot: SETTLE_CLEARANCE,
        });
        this.#sweep.buildGrid();
        this.#settleStage = "relax-run";
        return;
      }
      case "relax-run": {
        if (!this.#sweep.run(PAIR_BUDGET)) {
          return;
        }
        const { maxMove, overlapsFound } = this.#sweep.result;
        this.#settlePasses += 1;
        this.projectionRuns += 1;
        this.residualOverlaps = overlapsFound;

        if (maxMove === 0 && this.#settleRegionViolations === 0) {
          // A full pass that moved nothing proves the layout strictly
          // overlap-free (and region-clean, unless enforcement froze — then
          // the region residual keeps its last honest measurement).
          this.residualOverlaps = 0;
          if (!this.#settleRegionFrozen) {
            this.residualRegionViolations = 0;
          }
          this.#everFeasible = true;
          this.#phase = "done";
          return;
        }

        // Stall detection: near-flat overlap decay on a still-dirty layout.
        // Deep piles (which the overcommit detector can prove) are re-placed
        // directly; when no pile qualifies the stall is a dense-blob
        // percolation jam and the layout expands at cluster granularity
        // instead (see COARSE_CELL_FACTOR).
        if (this.#settleScatterCooldown > 0) {
          this.#settleScatterCooldown -= 1;
        } else if (
          overlapsFound > SETTLE_SCATTER_MIN_OVERLAPS &&
          overlapsFound > this.#settlePrevOverlaps * SETTLE_SCATTER_STALL_RATIO
        ) {
          this.#settleScatterCooldown = SETTLE_SCATTER_COOLDOWN;
          this.#settlePrevOverlaps = overlapsFound;
          let scattered = 0;
          if (
            overlapsFound <
            this.#settleOverlapsAtLastScatter * SETTLE_SCATTER_PROGRESS
          ) {
            scattered = this.#scatterPiles();
            if (scattered > 0) {
              this.scatteredPileNodes += scattered;
              this.#settleOverlapsAtLastScatter = overlapsFound;
            }
          }
          if (scattered === 0) {
            this.#coarseInit();
            return;
          }
        }
        this.#settlePrevOverlaps = overlapsFound;

        if (
          this.#settlePasses % SETTLE_VERIFY_INTERVAL === 0 ||
          this.#settlePasses >= SETTLE_MAX_PASSES
        ) {
          this.#settleCapFinalising = this.#settlePasses >= SETTLE_MAX_PASSES;
          this.#sweep.reset({
            x: this.#x,
            y: this.#y,
            radii: this.#radii,
            count: this.#n,
            padding: 0,
            strength: 0,
          });
          this.#sweep.buildGrid();
          this.#settleStage = "verify-run";
          return;
        }
        this.#regionSweepStart(0, SETTLE_RELAX_STRENGTH, SETTLE_CLEARANCE);
        this.#settleStage = "region";
        return;
      }
      case "verify-run": {
        if (!this.#sweep.run(PAIR_BUDGET)) {
          return;
        }
        this.residualOverlaps = this.#sweep.result.overlapsFound;
        this.#regionSweepStart(0, 0);
        this.#settleStage = "verify-region";
        return;
      }
      case "verify-region": {
        if (!this.#regionSweepRun()) {
          return;
        }
        this.residualRegionViolations = this.#regionSweepViolations;
        if (
          this.residualOverlaps === 0 &&
          (this.residualRegionViolations === 0 || this.#settleRegionFrozen)
        ) {
          this.#everFeasible = true;
          this.#phase = "done";
          return;
        }
        if (this.#settleCapFinalising) {
          this.settleCapped = true;
          // eslint-disable-next-line no-console
          console.warn(
            `[majorization] settle pass cap hit at ${this.#settlePasses} passes: ` +
              `${this.residualOverlaps} overlaps, ` +
              `${this.residualRegionViolations} region violations remain`,
          );
          this.#phase = "done";
          return;
        }
        this.#regionSweepStart(0, SETTLE_RELAX_STRENGTH, SETTLE_CLEARANCE);
        this.#settleStage = "region";
        return;
      }
      case "coarse-run": {
        // One super-disk relax pass per arm: positions persist across
        // passes, the grid snapshot is per pass (same pass semantics as the
        // fine sweep). Converged (or pass-capped) ⇒ apply the rigid per-cell
        // displacements and resume the ordinary region → relax cycle.
        if (!this.#coarsePassArmed) {
          this.#coarseSweep.reset({
            x: this.#coarseSuperX,
            y: this.#coarseSuperY,
            radii: this.#coarseSuperR,
            count: this.#coarseBucketCount,
            padding: 0,
            strength: COARSE_RELAX_STRENGTH,
          });
          this.#coarseSweep.buildGrid();
          this.#coarsePassArmed = true;
          return;
        }
        if (!this.#coarseSweep.run(PAIR_BUDGET)) {
          return;
        }
        this.#coarsePassArmed = false;
        this.#coarsePasses += 1;
        if (
          this.#coarseSweep.result.maxMove >= COARSE_RELAX_MIN_MOVE &&
          this.#coarsePasses < COARSE_RELAX_PASSES
        ) {
          return;
        }
        this.#coarseApply();
        this.#regionSweepStart(0, SETTLE_RELAX_STRENGTH, SETTLE_CLEARANCE);
        this.#settleStage = "region";
      }
    }
  }
}

class MajorizationLayout implements LayoutSimulation {
  readonly #nodes: ForceNode[];
  readonly #buffer: FlatGraphBuffer;
  readonly #idToIndex = new Map<string, number>();
  readonly #communities: number[];
  readonly #options: ResolvedOptions;

  #indexEdges: IndexEdge[] = [];
  /** Solver coordinates (mutated in place by the solver). Source of truth. */
  #x: Float32Array;
  #y: Float32Array;
  #radii: Float32Array;

  #solver: MajorizationSolver | null = null;
  #status: ForceLayoutStatus;
  /**
   * Last published solver generation (iterations + settle passes). Starts at 0 so
   * nothing is published until the first majorization iterate completes; the
   * analysis phases mutate positions incrementally (PivotMDS init, pile
   * scatter), and a mid-init frame must never be displayed.
   */
  #publishedGeneration = 0;

  // Public diagnostic fields for perf/regression harnesses (iteration count, tick
  // budget, residual overlaps).
  /** Cumulative wall time (ms) spent in solver ticks. */
  overlapProjectionMs = 0;
  /** Majorization iterations completed. */
  overlapProjectionCalls = 0;
  /** Worst single tick (ms); the per-tick budget guard. */
  maxTickMs = 0;
  /**
   * Overlap count at the last measurement (padded pass count during stress,
   * strict at settle verifications; see the solver field). Non-zero during
   * stress is expected; non-zero after settle indicates {@link settleCapped}.
   * Published SAB frames during stress may still show overlaps until
   * {@link projectionActive} latches.
   */
  overlapsRemaining = 0;
  /** Laplacian (re)builds (cold build + every warm absorb/relayout). */
  laplacianRebuilds = 0;

  #absorbedSinceLouvain = 0;
  #countAtLastLouvain = 0;

  constructor(
    nodes: ForceNode[],
    edges: ForceEdge[],
    buffer: FlatGraphBuffer,
    options: MajorizationLayoutOptions = {},
  ) {
    this.#nodes = nodes;
    this.#buffer = buffer;
    this.#options = {
      idealEdgeLength:
        options.idealEdgeLength ?? DEFAULT_TUNING.idealEdgeLength,
      overlapPadding: options.overlapPadding ?? DEFAULT_TUNING.overlapPadding,
      communityCohesion:
        options.communityCohesion ?? DEFAULT_TUNING.communityCohesion,
      communitySeparation:
        options.communitySeparation ?? DEFAULT_TUNING.communitySeparation,
      degreeRepulsion:
        options.degreeRepulsion ?? DEFAULT_TUNING.degreeRepulsion,
      maxIterations: options.maxIterations ?? DEFAULT_TUNING.maxIterations,
      convergenceEpsilon:
        options.convergenceEpsilon ?? DEFAULT_TUNING.convergenceEpsilon,
      convergenceStreak:
        options.convergenceStreak ?? DEFAULT_TUNING.convergenceStreak,
      cgStepsPerIteration:
        options.cgStepsPerIteration ?? DEFAULT_TUNING.cgStepsPerIteration,
      // The pivot budget never exceeds the node count (every node a pivot).
      pivotCount: Math.min(
        nodes.length,
        options.pivotCount ?? DEFAULT_TUNING.pivotCount,
      ),
    };

    const count = nodes.length;
    for (const [index, node] of nodes.entries()) {
      this.#idToIndex.set(node.id, index);
    }
    this.#communities = Array.from<number>({ length: count }).fill(-1);
    this.#countAtLastLouvain = count;

    this.#x = new Float32Array(count);
    this.#y = new Float32Array(count);
    for (let index = 0; index < count; index++) {
      this.#x[index] = nodes[index]!.x ?? 0;
      this.#y[index] = nodes[index]!.y ?? 0;
    }
    this.#radii = this.#buildRadii();

    this.#indexEdges = MajorizationLayout.resolveEdges(edges, this.#idToIndex);
    this.#runLouvain();

    this.#solver = count > 0 ? this.#buildSolver(false) : null;
    this.#status = count > 0 ? "running" : "settled";
    this.#writePositions();
  }

  get status(): ForceLayoutStatus {
    return this.#status;
  }

  get isSettled(): boolean {
    return this.#status === "settled";
  }

  get nodes(): readonly ForceNode[] {
    return this.#nodes;
  }

  get buffer(): SharedArrayBuffer | ArrayBuffer {
    return this.#buffer.raw;
  }

  get nodeIds(): string[] {
    return this.#nodes.map((node) => node.id);
  }

  get alpha(): number {
    return this.#status === "settled" ? 0 : 1;
  }

  /**
   * Louvain community id per node, in buffer order: the membership BubbleSets
   * group by. Each solver build densifies a snapshot of it for target shaping and
   * community-region floors; live relabels reach the solver only at the next
   * build (see {@link refreshCommunities}).
   */
  get communities(): readonly number[] {
    return this.#communities;
  }

  /** Deduped edge count after parallel merge. */
  get edgeCount(): number {
    return this.#indexEdges.length;
  }

  /** Whether the last solve hit the iteration cap instead of converging. */
  get capped(): boolean {
    return this.#solver?.capped ?? false;
  }

  /** Whether the settle phase hit its pass cap with violations remaining. */
  get settleCapped(): boolean {
    return this.#solver?.settleCapped ?? false;
  }

  /** Community-region violations at the last measurement. */
  get regionViolations(): number {
    return this.#solver?.residualRegionViolations ?? 0;
  }

  /** Majorization iterations completed so far. */
  get iterations(): number {
    return this.#solver?.iteration ?? 0;
  }

  /** The live solver instance, source of phase-timing and projection diagnostics. */
  get solverDiagnostics(): {
    readonly phaseCumulativeMs: Partial<Record<string, number>>;
    readonly phaseMaxMs: Partial<Record<string, number>>;
    readonly projectionMs: number;
    readonly maxProjectionMs: number;
    readonly projectionRuns: number;
    readonly lastSolveDisplacement: number;
    readonly lastProjectDisplacement: number;
    readonly lastMaxDisplacementNode: number;
    readonly lastMaxSolveGap: number;
    readonly termCount: number;
    readonly scatteredPileNodes: number;
  } | null {
    return this.#solver;
  }

  /** Whether published frames are projected (overlap-free) already. */
  get projectionActive(): boolean {
    return this.#solver?.projectionActive ?? false;
  }

  /**
   * Advance the solver by up to `budgetMs` of bounded work units. Returns
   * whether positions were committed to the shared buffer this call: the
   * solver publishes only at majorization-iteration / settle-pass boundaries,
   * so most working ticks return false. Callers use the return to gate frame
   * emission (the {@link LayoutSimulation} contract), NOT to detect liveness;
   * `isSettled` is the termination signal. (Returning "advanced" here instead
   * made the worker rebuild all edge geometry every tick: ~13 ms of emit per
   * ~1.5 ms of solve on a 20k graph, and an in-app settle wall ~9x the
   * solver's.)
   */
  tick(budgetMs: number): boolean {
    if (this.#status === "settled" || this.#status === "paused") {
      return false;
    }
    this.#status = "running";
    const startTime = performance.now();
    let stepped = false;
    let published = false;
    const solver = this.#solver;

    if (solver) {
      // while: at least one advance per tick even if the budget is already gone
      // (a pre-empted worker can lose >1 ms between taking startTime and the first
      // check; never advancing while unsettled would read as a dead layout).
      while (!solver.done) {
        solver.advance();
        stepped = true;
        if (performance.now() - startTime >= budgetMs) {
          break;
        }
      }
      this.overlapProjectionCalls = solver.iteration;
      this.overlapsRemaining = solver.residualOverlaps;
      // Publish at iteration/settle-pass boundaries only. Frames during stress may
      // still overlap; overlap-free publish is guaranteed only after
      // {@link projectionActive} latches.
      if (
        solver.publishGeneration !== this.#publishedGeneration ||
        (solver.done && stepped)
      ) {
        this.#writePositions();
        this.#publishedGeneration = solver.publishGeneration;
        published = true;
      }
      if (solver.done) {
        this.#status = "settled";
      }
    } else {
      this.#status = "settled";
    }

    const elapsed = performance.now() - startTime;
    this.overlapProjectionMs += elapsed;
    if (elapsed > this.maxTickMs) {
      this.maxTickMs = elapsed;
    }
    return published;
  }

  pause(): void {
    if (this.#status === "running") {
      this.#status = "paused";
    }
  }

  resume(): void {
    if (this.#status === "paused") {
      this.#status = "running";
    }
  }

  /**
   * Absorb newly-arrived nodes without a cold restart: append them (existing indices
   * keep their slot so the shared buffer grows in place), rebuild the analysis +
   * Laplacian over the new topology, and continue majorization warm from the preserved
   * positions (projection re-enables after the first iteration). Refreshes Louvain once
   * the layout has grown enough that stale Louvain labels would mis-shape targets.
   */
  absorb(newNodes: ForceNode[], edges: ForceEdge[]): void {
    const previousCount = this.#nodes.length;
    for (const node of newNodes) {
      this.#idToIndex.set(node.id, this.#nodes.length);
      this.#nodes.push(node);
      this.#communities.push(-1);
    }
    const count = this.#nodes.length;

    const nextX = new Float32Array(count);
    const nextY = new Float32Array(count);
    nextX.set(this.#x.subarray(0, previousCount));
    nextY.set(this.#y.subarray(0, previousCount));
    for (let index = previousCount; index < count; index++) {
      const node = this.#nodes[index]!;
      nextX[index] = node.x ?? 0;
      nextY[index] = node.y ?? 0;
    }
    this.#x = nextX;
    this.#y = nextY;
    this.#radii = this.#buildRadii();

    this.#indexEdges = MajorizationLayout.resolveEdges(edges, this.#idToIndex);
    this.#absorbedSinceLouvain += newNodes.length;

    const refreshAt = Math.max(
      LOUVAIN_REFRESH_MIN_NEW_NODES,
      Math.ceil(this.#countAtLastLouvain * LOUVAIN_REFRESH_GROWTH_FRACTION),
    );
    if (count > 0 && this.#absorbedSinceLouvain >= refreshAt) {
      this.#runLouvain();
      this.#absorbedSinceLouvain = 0;
      this.#countAtLastLouvain = count;
    } else {
      this.#labelNewcomersByNeighbors(previousCount);
    }

    this.#solver = count > 0 ? this.#buildSolver(true, previousCount) : null;
    this.#publishedGeneration = 0;
    this.#status = count > 0 ? "running" : "settled";
    this.#writePositions();
  }

  /**
   * Provisional community labels for absorbed nodes below the Louvain refresh
   * threshold: each newcomer adopts the plurality label among its labeled
   * neighbours (ties → smaller label; no labeled neighbour → stays -1, which
   * the solver treats as community-less). Between refreshes the labels drive
   * live shaping — gather, region floors, target bands — and leaving
   * newcomers at -1 makes those forces actively WRONG for them: a
   * late-arriving hub stayed unlabeled through a whole stream (the 30 %
   * growth refresh needs thousands of nodes at 20k), so member-gather pulled
   * its spokes toward their old territories while region eviction pushed the
   * hub out of every core — the star was torn apart instead of pulled
   * together. Two label-propagation rounds (each an O(m) scan + assignment in
   * node-arrival order), so a newcomer wired only to OTHER newcomers of the
   * same batch inherits via round two once its neighbours got labeled in
   * round one; unlabeled islands (dust) stay -1. The next real Louvain
   * refresh replaces all provisional labels.
   */
  #labelNewcomersByNeighbors(fromIndex: number): void {
    const count = this.#nodes.length;
    if (fromIndex >= count) {
      return;
    }
    for (let round = 0; round < 2; round++) {
      const votes = new Map<number, Map<number, number>>();
      for (const edge of this.#indexEdges) {
        for (const [newcomer, other] of [
          [edge.source, edge.target],
          [edge.target, edge.source],
        ] as const) {
          if (newcomer < fromIndex || this.#communities[newcomer]! >= 0) {
            continue;
          }
          const label = this.#communities[other] ?? -1;
          if (label < 0) {
            continue;
          }
          const tally = votes.get(newcomer) ?? new Map<number, number>();
          tally.set(label, (tally.get(label) ?? 0) + 1);
          votes.set(newcomer, tally);
        }
      }
      if (votes.size === 0) {
        return;
      }
      for (let index = fromIndex; index < count; index++) {
        const tally = votes.get(index);
        if (!tally) {
          continue;
        }
        let best = -1;
        let bestVotes = 0;
        for (const [label, voteCount] of tally) {
          if (
            voteCount > bestVotes ||
            (voteCount === bestVotes && (best < 0 || label < best))
          ) {
            best = label;
            bestVotes = voteCount;
          }
        }
        this.#communities[index] = best;
      }
    }
  }

  /**
   * Force a Louvain refresh if nodes were absorbed since the last one (trailing-edge
   * complement to the growth trigger in {@link absorb}). Returns whether it ran.
   *
   * Relabel-only, never a re-solve: `#communities` (the {@link communities} getter,
   * republished for BubbleSets grouping) updates immediately, but the live solver
   * keeps the membership snapshot densified into it at build time, with the
   * community-shaped target bands and the community-region floor plan baked into
   * its terms. Whether that solve is mid-flight (the usual case: the trailing
   * debounce that invokes this is far shorter than a solve) or already settled, it
   * proceeds exactly as if the relabel had not happened. Positions never move
   * because of a refresh; the new labels reach the physics at the next warm solver
   * build (the next {@link absorb} or relayout).
   *
   * The hull/physics divergence this permits is bounded and self-healing:
   * {@link absorb} re-runs Louvain before building the solver once growth crosses
   * the refresh threshold, so the published membership and the solver's snapshot
   * describe graphs that differ by less than one sub-threshold tail of absorbed
   * nodes (see LOUVAIN_REFRESH_GROWTH_FRACTION). Worst case a relabeled node keeps
   * the spot the old shaping gave it while BubbleSets paint it into its new
   * community; the corridor planner ({@link "../../render/bubble-corridors"})
   * still connects it there, so the artifact is a stretched hull, not a wrong
   * grouping, and the next absorb re-shapes it away.
   *
   * Rebuilding the solver here instead would be strictly worse: warm-starting from
   * whatever positions the timer happened to catch would make the settled layout
   * depend on tick/timer interleaving (breaking the engine's guarantee that
   * identical input yields identical output), a rebuild after settle would
   * re-animate a resting layout (the post-settle motion this engine exists to
   * kill), and the linger caller does not re-kick the tick scheduler, so a solver
   * rebuilt after the scheduler stopped would sit unticked forever.
   */
  refreshCommunities(): boolean {
    if (this.#absorbedSinceLouvain === 0) {
      return false;
    }
    this.#runLouvain();
    this.#absorbedSinceLouvain = 0;
    this.#countAtLastLouvain = this.#nodes.length;
    return true;
  }

  #buildRadii(): Float32Array {
    const count = this.#nodes.length;
    const radii = new Float32Array(count);
    for (let index = 0; index < count; index++) {
      radii[index] = this.#nodes[index]!.radius;
    }
    return radii;
  }

  #buildSolver(warm: boolean, newNodesFrom = -1): MajorizationSolver {
    const count = this.#nodes.length;
    const edgeCount = this.#indexEdges.length;
    const src = new Uint32Array(edgeCount);
    const dst = new Uint32Array(edgeCount);
    for (let index = 0; index < edgeCount; index++) {
      const edge = this.#indexEdges[index]!;
      src[index] = edge.source;
      dst[index] = edge.target;
    }

    // Densified Louvain ids (arbitrary ids → dense ints) for target shaping;
    // only materialised when a community shaping weight is active. Raw -1
    // (absorbed, not yet labeled) stays -1: densifying it would mint a fake
    // community out of ALL unlabeled newcomers, and once a stream's worth of
    // them crossed the region-floor size threshold they would be GATHERED
    // into one blob regardless of topology (measured: a late hub dragged
    // ~4.3k px away from its own spokes, toward the unrelated dust batches it
    // happened to share the -1 label with).
    const communityActive =
      this.#options.communityCohesion > 0 ||
      this.#options.communitySeparation > 0;
    let communities: Int32Array | undefined;
    if (communityActive) {
      communities = new Int32Array(count);
      const denseByRaw = new Map<number, number>();
      for (let index = 0; index < count; index++) {
        const raw = this.#communities[index] ?? -1;
        if (raw < 0) {
          communities[index] = -1;
          continue;
        }
        let dense = denseByRaw.get(raw);
        if (dense === undefined) {
          dense = denseByRaw.size;
          denseByRaw.set(raw, dense);
        }
        communities[index] = dense;
      }
    }

    this.laplacianRebuilds += 1;
    return new MajorizationSolver(
      {
        n: count,
        src,
        dst,
        x: this.#x,
        y: this.#y,
        radii: this.#radii,
        communities,
        warm,
        newNodesFrom,
      },
      {
        ...this.#options,
        pivotCount: Math.min(count, this.#options.pivotCount),
      },
    );
  }

  /** Run seeded Louvain over the link graph; fill `#communities` (singletons if no edges). */
  #runLouvain(): void {
    if (this.#indexEdges.length === 0) {
      for (let index = 0; index < this.#nodes.length; index++) {
        this.#communities[index] = index;
      }
      return;
    }

    const graph = new UndirectedGraph<
      Record<string, never>,
      { weight: number }
    >();
    for (const node of this.#nodes) {
      graph.addNode(node.id);
    }
    for (const edge of this.#indexEdges) {
      graph.mergeEdge(
        this.#nodes[edge.source]!.id,
        this.#nodes[edge.target]!.id,
        { weight: edge.weight },
      );
    }

    const membership = louvain(graph, {
      getEdgeWeight: "weight",
      randomWalk: false,
      rng: parkMillerRng(1),
    });
    for (let index = 0; index < this.#nodes.length; index++) {
      this.#communities[index] = membership[this.#nodes[index]!.id] ?? index;
    }
  }

  /**
   * Re-centre the solver coordinates on their centroid and publish them to the shared
   * buffer + the mirrored ForceNode view (so a warm absorb can read settled coords).
   */
  #writePositions(): void {
    const count = this.#nodes.length;

    let centroidX = 0;
    let centroidY = 0;
    for (let index = 0; index < count; index++) {
      centroidX += this.#x[index]!;
      centroidY += this.#y[index]!;
    }
    centroidX = count > 0 ? centroidX / count : 0;
    centroidY = count > 0 ? centroidY / count : 0;

    for (let index = 0; index < count; index++) {
      const localX = this.#x[index]! - centroidX;
      const localY = this.#y[index]! - centroidY;
      this.#nodes[index]!.x = localX;
      this.#nodes[index]!.y = localY;
      this.#buffer.setPosition(index, localX, localY);
    }
    this.#buffer.commit();
  }

  /** Resolve string/object endpoints to index pairs, drop self/dangling, merge parallels. */
  private static resolveEdges(
    edges: ForceEdge[],
    idToIndex: Map<string, number>,
  ): IndexEdge[] {
    const weightByPair = new Map<string, IndexEdge>();
    for (const edge of edges) {
      const sourceId =
        typeof edge.source === "string" ? edge.source : edge.source.id;
      const targetId =
        typeof edge.target === "string" ? edge.target : edge.target.id;
      const source = idToIndex.get(sourceId);
      const target = idToIndex.get(targetId);
      if (source === undefined || target === undefined || source === target) {
        continue;
      }
      const lo = Math.min(source, target);
      const hi = Math.max(source, target);
      const key = `${lo}:${hi}`;
      const existing = weightByPair.get(key);
      weightByPair.set(key, {
        source: lo,
        target: hi,
        weight: (existing?.weight ?? 0) + edge.weight,
      });
    }
    return [...weightByPair.values()];
  }
}

/**
 * Constructs a budget-sliced stress-majorization layout that implements
 * {@link LayoutSimulation}.
 *
 * Cold construction seeds positions via PivotMDS (degenerate seed piles are
 * scattered onto packing spirals; see the module doc) and builds the
 * sparse-stress Laplacian once; each `tick` call then advances a bounded unit
 * of analysis, term-build, CG, or relaxation work and publishes to `buffer`
 * only at majorization-iteration or settle-pass boundaries. Calling `absorb`
 * on the returned layout keeps existing positions (warm start), rebuilds the
 * analysis and Laplacian over the grown topology, and continues majorization
 * without a cold restart.
 *
 * Deterministic: identical `nodes` / `edges` / `options` produce bitwise-identical
 * output. The terminal (settled) layout is guaranteed overlap-free unless the
 * returned instance's `settleCapped` diagnostic is set, which signals a hard
 * failure of the safety cap rather than a benign alternate exit. See
 * {@link MajorizationLayoutOptions} for tunable defaults.
 */
export function createMajorizationLayout(
  nodes: ForceNode[],
  edges: ForceEdge[],
  buffer: FlatGraphBuffer,
  options?: MajorizationLayoutOptions,
): LayoutSimulation {
  return new MajorizationLayout(nodes, edges, buffer, options);
}
