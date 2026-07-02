/**
 * Constrained stress-MAJORIZATION layout engine — the third community-tier engine,
 * drop-in interchangeable with the ForceAtlas2 ({@link "./community-layout"}) and
 * sparse-stress-SGD ({@link "./stress-layout"}) engines (all implement
 * {@link LayoutSimulation} and fill the same {@link FlatGraphBuffer}).
 *
 * Architecture (IPSep-CoLa style: majorize, then project):
 *
 *   1. Sparse quadratic stress over graph edges + subsampled pivot terms (the Ortmann
 *      sparse-stress model; pivot selection and BFS graph distances are REUSED from the
 *      existing {@link SparseStressSolver} by running it with `epochs: 0`, which performs
 *      exactly the CSR / weak-components / pivot-BFS analysis passes plus the PivotMDS
 *      initialisation, then stops). Weights are 1/d² in hop space and NEVER change; the
 *      weighted CSR Laplacian is built ONCE per (re)layout/absorb.
 *   2. Per majorization iteration (SMACOF): the majorant right-hand side is computed from
 *      the current positions, then L·x = bₓ and L·y = b_y are solved per dimension with
 *      Jacobi-preconditioned conjugate gradient. CG state persists across worker ticks —
 *      each tick advances a bounded number of CG steps, so per-tick cost is capped BY
 *      CONSTRUCTION (the budget is generous enough that each majorant is solved to
 *      tolerance; see CG_STEPS_PER_ITERATION).
 *   3. Feasibility comes from iterated CIRCLE relaxation ({@link overlapRelaxPass} —
 *      the same grid machinery the sibling engines use): gentle pile-bleeding passes
 *      at every iteration boundary, then a TERMINAL SETTLE phase (a few bounded
 *      passes per advance unit) that runs until one full pass VERIFIES the layout
 *      overlap-free. See ITERATION_RELAX_PASSES for why the rectangle-based VPSC
 *      solver is deliberately NOT used as a per-iteration projector (geometry
 *      mismatch ⇒ limit cycle). Positions are published to the shared buffer at
 *      iteration / settle-unit boundaries only, and the final published frame is
 *      verified overlap-free.
 *
 * FEASIBILITY SCALING makes the two halves agree instead of fight: raw hop-space
 * targets (hops · 60 px) are frequently infeasible for the disk packing — a ~3k-node
 * cloud "wants" a ~240 px-radius layout while its disks need ~800 px — and an
 * infeasible stress optimum turns majorize→project into a permanent tug-of-war (the
 * solve compresses, the projector re-expands, every iteration, forever). Each weak
 * component therefore gets a target scale factor
 *   scale_c = max(1, R_packing / R_hop-ideal)
 * where R_packing is the radius of the disk that holds the component's nodes at the
 * sibling engines' packing utilisation and R_hop-ideal comes from the pivot-BFS
 * eccentricity. Scaled targets put the UNCONSTRAINED stress optimum near the feasible
 * set, so the projector's correction is small and local, the alternation contracts,
 * and — because the PivotMDS seed is laid out at unscaled hop geometry — the layout
 * only ever EXPANDS toward its targets: no contract→expand swing.
 *
 * Non-overlap is therefore the PROJECTOR's job, never the dynamics': there is no
 * force-summed separation term to livelock against the stress pull (the failure mode of
 * the abandoned force-interleave), and termination is a max-displacement threshold plus
 * a hard iteration cap that logs and stops rather than spinning.
 *
 * Community / degree / size awareness is TARGET SHAPING, not forces:
 *
 *   - Cross-community pair targets are inflated by `communitySeparation`; same-community
 *     targets are slightly deflated by `communityCohesion` (Louvain ids come from the
 *     same pipeline the sibling engines use). Weight-to-shaping mapping from the SGD
 *     engine's force weights: separation w → ×(1 + 2w) on cross-community targets
 *     (default 0.08 → +16 %, harness max 0.8 → +160 %); cohesion w → ×1/(1 + 2w) on
 *     same-community targets (default 0.02 → −4 %); degreeRepulsion w → haloShare
 *     min(1, 2w), the fraction of a packing-bound hub's packing radius its children
 *     are pushed out to (default 0.02 → compact packing against the hub's rim;
 *     harness max 0.3 → children start 60 % of the way to the packing shell). All
 *     three sliders keep working; they regenerate targets (the Laplacian, keyed to
 *     hop distances only, is unaffected).
 *   - Hub-incident edge targets are PACKING-AWARE: when a hub's one-ring radius
 *     (Σ_children(2r+pad)/2π) exceeds the edge target, its children cannot all sit at
 *     the target distance, so its spokes get the feasible band from the collision gap
 *     out to the hub's disk-packing radius (at the sibling engines' ~55 % utilisation)
 *     with slack. A 150-leaf hub thus AIMS its spokes at a geometrically feasible
 *     halo from iteration one instead of compacting to an infeasible 1-hop length and
 *     being exploded by a terminal overlap pass — this kills the contract→expand
 *     relayout swing.
 *   - Near-coincident non-adjacent pairs (spatial-hash grid over the initial/warm
 *     positions, same 3×3-neighbourhood scan the sibling overlap passes use) get floor
 *     terms d* ≥ rᵢ + r_j + pad, so piles separate through the stress solve itself.
 *
 * Deterministic throughout: seeded pivot selection, hash-derived coincident directions,
 * index-ordered scans, and a deterministic projector — identical input yields identical
 * output. Warm start on absorb/relayout: positions are kept, the analysis + Laplacian
 * are rebuilt, and CG warm-starts from the current layout. No cold re-seed.
 *
 * References:
 *   - Emden R. Gansner, Yehuda Koren, Stephen North,
 *     "Graph Drawing by Stress Majorization" (GD 2004).
 *   - Tim Dwyer, Yehuda Koren, Kim Marriott,
 *     "IPSep-CoLa: An Incremental Procedure for Separation Constraint Layout of
 *     Graphs" (InfoVis 2006).
 *   - Mark Ortmann, Mirza Klimenta, Ulrik Brandes,
 *     "A Sparse Stress Model" (GD 2016).
 *   - Tim Dwyer, Kim Marriott, Peter J. Stuckey,
 *     "Fast Node Overlap Removal" (GD 2005) — evaluated as the projector; rejected
 *     for the steady state because its rectangle geometry conflicts with circle
 *     stress terms (see ITERATION_RELAX_PASSES).
 */
/* eslint-disable no-bitwise */
/* eslint-disable id-length */
/* eslint-disable no-param-reassign -- typed-array kernels (SpMV / CG) write through
   caller-owned buffers by design, as in the sibling solvers */

import { UndirectedGraph } from "graphology";
import louvain from "graphology-communities-louvain";

import { parkMillerRng } from "../../math/random";
import { countOverlaps, overlapRelaxPass } from "./overlap-relax";
import {
  REGION_MIN_COMMUNITY_SIZE,
  REGION_PACKING_UTILISATION,
} from "./region-metrics";
import { INF_DIST, SparseStressSolver } from "./sparse-stress-solver";

import type { FlatGraphBuffer } from "../buffers/position-buffer";
import type {
  ForceEdge,
  ForceLayoutStatus,
  ForceNode,
  LayoutSimulation,
} from "./force-simulation";
import type { SparseStressSolverResult } from "./sparse-stress-solver";

/** Layout-space length for one graph hop (matches the sibling engines). */
const IDEAL_LINK_LENGTH = 60;
/** Extra gap between node disks: collision floors AND the projector's pair gap. */
const OVERLAP_PADDING = 8;
/** Default community/degree shaping weights — identical to the SGD engine's sliders. */
const COMMUNITY_COHESION = 0.02;
const COMMUNITY_SEPARATION = 0.08;
const DEGREE_REPULSION = 0.02;

/**
 * Slider-to-target-shaping gains. The SGD engine consumed the three weights as
 * per-epoch force step fractions; here they shape TARGETS instead:
 *   cross-community target ×(1 + separation·GAIN), same-community ×1/(1 + cohesion·GAIN),
 *   packing-bound hub spokes: haloShare = min(1, degreeRepulsion·GAIN) — the fraction
 *   of the hub's packing radius its children are pushed out to (0 = children may pack
 *   right against the hub's rim; 1 = children start at the packing radius shell).
 * GAIN = 2 places the harness slider ranges (0–0.3 / 0–0.8 / 0–0.3) onto a
 * ±few-percent … +160 % shaping range, bracketing the old engines' visual effect.
 */
const SEPARATION_TARGET_GAIN = 2;
const COHESION_TARGET_GAIN = 2;
const DEGREE_HALO_GAIN = 2;

/**
 * Disk-packing utilisation (matches the sibling engines' scale-to-fit sizing), used
 * both for the multi-ring hub floor (the disk that packs a hub's children) and for the
 * per-component feasibility scale (the disk that packs a whole component).
 */
const PACKING_UTILISATION = 0.55;

/** Near-pair floor weight: full edge weight — these terms ARE the separation engine. */
const NEAR_PAIR_WEIGHT = 1;
/** Cap near-pair partners per node so a k-node pile emits O(k), not O(k²), terms. */
const NEAR_PAIR_MAX_PARTNERS = 8;

/**
 * COMMUNITY-REGION floors: every node outside community c is kept OUT of c's region
 * disk — centred on the members' live centroid, radius R_c from the packing area of
 * c's member disks (the same packing model as the hub floors and the sibling
 * engines' scale-to-fit). This is the region-level separation the target-shaping
 * translation of the SGD engine dropped: cross-community inflation only stretches
 * EXISTING terms (edges + pivot pairs), so an unrelated branch — sharing no edge
 * and no pivot term with a foreign community — had NOTHING keeping it out of that
 * community's fan and folded straight through it (measured: 32 % of real-shape
 * nodes sat inside a foreign community's core disk; degree-1 leaves, which pivot
 * anchoring deliberately skips, interpenetrate worst).
 *
 * Enforced as a RELAX PASS (violators are pushed radially out of the region disk,
 * gently at every iteration boundary and to verified-clean in the terminal
 * settle), NOT as Laplacian floor terms, for the build-once architecture's
 * economics: `regions × n` interval terms would dominate the Laplacian (~5× the
 * nnz at 5k) and add constant stiffness between every node and every region even
 * while satisfied (an in-band interval term exerts zero net force but keeps full
 * weight in L), taxing every CG step of every solve. The relax pass costs zero
 * solve stiffness and is push-only with NO opposing term — the stress energy has
 * no term pulling a foreign node into a region (that absence is the root cause),
 * so pushed-out is a genuine fixed point: the same no-livelock argument as the hub
 * bands, now enforced by the projector instead of fought over by the dynamics.
 * The terminal settle exits only when a full sweep verifies the layout BOTH
 * disk-overlap-free AND region-clean, so the end state is guaranteed, not asked
 * of the dynamics.
 *
 * Exemptions, planned per build (per-node bitmask, hence the ≤ 32 region cap):
 * members of c, and nodes with an edge INTO c — a bridge endpoint legitimately
 * sits at the region rim, and shoving it out against its own edge target would
 * leave permanent tension for the solve to fight (measured as a settle-phase
 * treadmill). Only the largest communities with ≥ REGION_MIN_COMMUNITY_SIZE
 * members cast a region — tiny communities and singleton noise are skipped, so
 * fragmented graphs stay O(n · 32) per pass, ~a disk-relax pass's cost.
 * REGION_MIN_COMMUNITY_SIZE and the packing utilisation are imported from
 * {@link "./region-metrics"} so the gate measures exactly what the engine enforces.
 */
const REGION_FLOOR_MAX_COMMUNITIES = 32;
/** Fraction of a region violation corrected per iteration-boundary pass. */
const REGION_RELAX_STRENGTH_ITERATION = 0.5;
/**
 * Region clearance margin (world units beyond R_c + r_v) while the solve runs:
 * overlapPadding + communitySeparation · GAIN · idealEdgeLength (default 0.08 →
 * ~13 px, harness max 0.8 → ~56 px). Combined with the pre-existing
 * cross-community TARGET inflation ×(1 + 2·separation), the slider now moves both
 * the pairwise stretch and the region clearance. The terminal settle relaxes and
 * verifies at a 2 px sliver instead (same design as SETTLE_PADDING): the margin is
 * the stress phase's breathing room, and re-enforcing all of it terminally would
 * read as a terminal expansion.
 */
const REGION_MARGIN_GAIN = 1;
const REGION_SETTLE_MARGIN = 2;

/**
 * Dead-zone ceiling for FLOORED / packing-bound terms, as a multiple of the reference
 * radius. Such terms become INTERVAL targets [lo, hi]: below lo they push out, above
 * hi they pull in, and in between they exert zero net force (effective target =
 * current distance). Without the dead zone, majorization re-compacts every such pair
 * to a single exact distance each iteration while the projector pushes the pile out to
 * whatever configuration feasibility actually needs — a persistent tug-of-war whose
 * amplitude never decays below the convergence threshold (the projector's constraint
 * generation is discontinuous in the positions, so the alternation chatters instead
 * of settling). With the dead zone, whatever configuration the projector settles a
 * pile at is a fixed point.
 */
const FLOOR_CEILING_SLACK = 1.5;

/**
 * Relative half-widths of the interval bands on stress terms: target·[1−band, 1+band].
 * Demanding EXACT distances fights the disk packing — the projector necessarily
 * distorts local geometry (its minimal-displacement x/y passes shift whole chains of
 * touching rectangles), and every term left violated at the projected configuration
 * pulls again next iteration, re-creating the same overlaps and re-running the same
 * projection: a structural majorize↔project limit cycle whose amplitude never decays.
 * With dead-zone bands, the projector's output is (mostly) a ZERO-FORCE configuration
 * — a genuine fixed point — while distances beyond the band still pull back, bounding
 * drift. Edge terms are tighter (they carry local structure); pivot terms, which only
 * hold the global shape, are looser.
 */
const EDGE_BAND = 0.15;
const PIVOT_BAND = 0.25;

/** Pivot budget: ~all nodes as pivots for tiny graphs, capped so terms stay ~64·n. */
const PIVOT_COUNT_CAP = 64;

/**
 * CG budget per majorization iteration (each step costs one SpMV per open dimension).
 * The Laplacian is very sparse (pivot terms skip degree-≤1 endpoints), so a step is
 * tens of microseconds even at 5k — the budget is set high enough that CG effectively
 * CONVERGES on the majorant each iteration. Under-solving is not a saving: it leaves
 * low-degree nodes' rows unsolved, the next iteration restarts CG from scratch against
 * a fresh RHS, and the leftover disequilibrium re-appears every iteration as sustained
 * displacement that never crosses the convergence threshold.
 */
const CG_STEPS_PER_ITERATION = 120;
/** Relative tolerance (preconditioned residual norm²) at which a solve stops early. */
const CG_RELATIVE_TOLERANCE = 0.01;

/** Hard iteration cap: reaching it LOGS "capped" and settles rather than spinning. */
const MAX_ITERATIONS = 150;
/** Converged when max per-iteration displacement < ε · idealEdgeLength for `streak` iterations. */
const CONVERGENCE_EPSILON = 8e-3;
const CONVERGENCE_STREAK = 2;

/**
 * FEASIBILITY is delivered by iterated CIRCLE relaxation ({@link overlapRelaxPass} —
 * one bounded uniform-grid sweep per pass), NOT by a per-iteration exact projection,
 * and the engine cleanly separates SHAPE from FEASIBILITY in time:
 *
 *   - During majorization iterations, each iteration ends with a couple of GENTLE
 *     relax passes that bleed coincident piles down while the solve spreads the
 *     layout toward its (feasibility-scaled, packing-aware) targets.
 *   - Once the stress solve converges or plateaus, a TERMINAL SETTLE phase runs relax
 *     passes — a few per advance unit, so per-tick cost stays capped — until one full
 *     pass VERIFIES the layout overlap-free. Because the targets were shaped
 *     feasibility-first, this phase does small local separation, not a global
 *     explosion (no contract→expand swing), and pure separation with no opposing
 *     force always terminates — the livelock class of the abandoned force-interleave
 *     is structurally impossible.
 *
 * Two projector designs were tried and REJECTED on measurement, both livelocking the
 * 3k benchmark at the iteration cap with projection eating ~98 % of wall time:
 *   1. Per-iteration exact VPSC ({@link "./overlap-removal"}): its RECTANGLE
 *      geometry (|dx| or |dy| ≥ half-extent sum) conflicts with the CIRCLE geometry
 *      of the stress terms, the collision floors, and the zero-overlap oracle
 *      (dist ≥ rᵢ+r_j+pad). A circle-optimal solve packs pairs diagonally at
 *      distances the rectangle model forbids by up to ~30 %, so the projector
 *      shifted whole chains by 100–500 px every iteration and the next solve pulled
 *      them straight back.
 *   2. Per-iteration relax-to-clean with near-pair floors regenerated INSIDE the
 *      solve every iteration: the ever-changing one-sided terms destabilised the
 *      alternation (overlap count grew to a ~2.6k steady state as solve and relaxer
 *      fought at ~200 px amplitude).
 */
const ITERATION_RELAX_PASSES = 4;
const ITERATION_RELAX_STRENGTH = 0.85;
/** Settle-phase relax passes per advance unit (keeps a single unit far below a frame). */
const SETTLE_PASSES_PER_UNIT = 4;
const SETTLE_RELAX_STRENGTH = 1;
/**
 * Gap the settle phase enforces (world units beyond r_i + r_j). Deliberately a
 * SLIVER of the full overlap padding: breathing room is the stress phase's job
 * (near-pair floors and hub bands already target the padded distance), so the
 * terminal phase only fixes residual true intersections. Both extremes fail
 * measurably — at the full padding the phase is diffusive (a packed 3k cloud holds
 * ~5k padded-but-clean pairs; every fixture burned the whole pass cap) and inflates
 * the settled cloud ~2 % (a terminal expand, the exact motion this engine exists to
 * kill); at zero it stalls (pairs resolve to exactly-touching, any later nudge
 * re-intersects them — 342 overlaps never cleared). A couple of pixels of slack
 * keeps resolution stable at negligible inflation.
 */
const SETTLE_PADDING = 2;
/** A pass moving nothing proves feasibility; the interval check catches near-zero treadmills. */
const SETTLE_VERIFY_INTERVAL = 8;
/** Safety cap on total settle passes: reaching it LOGS instead of spinning. */
const SETTLE_MAX_PASSES = 1024;

/**
 * Plateau detector: dense graphs (feasibility scale ≫ 1) never push per-iteration
 * displacement below the convergence threshold — the gentle relax passes keep nudging
 * piles — so when the best max-displacement has not improved by PLATEAU_IMPROVEMENT
 * for PLATEAU_WINDOW consecutive iterations, the stress phase is declared done and
 * the terminal settle phase takes over. Sparse graphs converge normally instead.
 */
const PLATEAU_WINDOW = 12;
const PLATEAU_IMPROVEMENT = 0.9;

/** Analysis (CSR + components + pivot BFS) work units per advance step. */
const ANALYSIS_TICK_WORK = 16384;
/** Term-emission / RHS work units per advance step. */
const TERM_CHUNK = 65_536;

/** Refresh Louvain once the layout grows by this fraction (matches the sibling engines). */
const LOUVAIN_REFRESH_GROWTH_FRACTION = 0.3;
const LOUVAIN_REFRESH_MIN_NEW_NODES = 24;

/** Deterministic init jitter (fraction of the ideal edge length), as the SGD engine uses. */
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

export interface MajorizationLayoutOptions {
  readonly idealEdgeLength?: number;
  /** Extra gap between node disks (floors + the projector's pair gap). Default 8. */
  readonly overlapPadding?: number;
  /** Community cohesion shaping weight (same-community targets deflate). Default 0.02. */
  readonly communityCohesion?: number;
  /** Community separation shaping weight (cross-community targets inflate). Default 0.08. */
  readonly communitySeparation?: number;
  /** Degree halo shaping weight (hub ring floors inflate). Default 0.02. */
  readonly degreeRepulsion?: number;
  /** Hard majorization-iteration cap (logs "capped" when reached). Default 150. */
  readonly maxIterations?: number;
  /** Convergence threshold: max displacement / idealEdgeLength. Default 8e-3. */
  readonly convergenceEpsilon?: number;
  /** Consecutive converged iterations required to settle. Default 2. */
  readonly convergenceStreak?: number;
  /** CG steps allowed per majorization iteration. Default 120. */
  readonly cgStepsPerIteration?: number;
  /** Pivot count cap (terms ≈ pivots·nodes). Default min(n, 64). */
  readonly pivotCount?: number;
}

type ResolvedOptions = Required<MajorizationLayoutOptions>;

/** A resolved index pair plus accumulated weight (parallel links merged). */
interface IndexEdge {
  readonly source: number;
  readonly target: number;
  readonly weight: number;
}

interface SolverInput {
  readonly n: number;
  readonly src: Uint32Array;
  readonly dst: Uint32Array;
  /** Mutated in place; the shell publishes them. */
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly radii: Float32Array;
  /** Louvain community per node (may contain -1 for unassigned). */
  readonly communities: Int32Array | undefined;
  /** Warm start: keep current positions (absorb / relayout); cold builds PivotMDS-init. */
  readonly warm: boolean;
}

type SolverPhase =
  | "analysis"
  | "terms"
  | "laplacian"
  | "rhs"
  | "cg-init"
  | "cg"
  | "project"
  | "settle"
  | "done";

/**
 * The engine core: analysis (reused sparse-stress machinery) → term/Laplacian build →
 * persistent-CG majorization iterations with circle-relaxation projection. All hot-path
 * state lives
 * in typed arrays that are allocated during the build phases and reused for the life of
 * the solve; the iterate loop performs zero allocation.
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

  /** Reused pivot/BFS/PivotMDS analysis from the sparse-stress engine (epochs: 0). */
  #analysis: SparseStressSolver | null;
  #analysisResult: SparseStressSolverResult | undefined;

  /**
   * STATIC stress terms (edges + pivot terms), fixed after the build. Each term is an
   * INTERVAL target [lo, hi]: the majorant RHS uses the effective target
   * clamp(currentDistance, lo, hi), so a pair inside its band exerts zero net force
   * (the IPSep one-sided treatment, generalised to a band). See #shapeTarget for how
   * the bands are derived.
   */
  #termA = new Uint32Array(0);
  #termB = new Uint32Array(0);
  #termWeight = new Float32Array(0);
  #termLo = new Float32Array(0);
  #termHi = new Float32Array(0);
  #termCount = 0;
  #termCapacity = 0;

  // Term-emission cursors (chunked build).
  #pivotRowCursor = 0;
  #pivotNodeCursor = 0;
  #degrees = new Uint32Array(0);
  /** One-ring radius needed to seat v's children side by side (Σ(2r+pad)/2π). */
  #hubRing = new Float32Array(0);
  /** Disk radius that packs v's children at the packing utilisation. */
  #hubPack = new Float32Array(0);
  #edgeKeys: Set<number> = new Set();
  // Per-component feasibility scale on hop targets + node→component map (see header).
  #componentScale = new Float64Array(0);
  #componentOf: Int32Array<ArrayBufferLike> = new Int32Array(0);

  // Community-region floor plan (see REGION_FLOOR_MAX_COMMUNITIES): the largest
  // communities cast centroid-centred packing disks that non-members are relaxed out
  // of. Built once per solver build; centroids are recomputed from live member
  // positions at every pass.
  #regionCount = 0;
  /** Region members, region-major (offsets below); feeds the centroid recompute. */
  #regionMemberNodes = new Int32Array(0);
  #regionMemberOffsets = new Int32Array(0);
  /** Packing radius per region (world units, before the per-node radius + margin). */
  #regionRadius = new Float32Array(0);
  /** Per node, bit r set ⇔ exempt from region r (member or edge-adjacent). */
  #regionExempt = new Uint32Array(0);
  #regionCentroidX = new Float64Array(0);
  #regionCentroidY = new Float64Array(0);
  /** Solve-time clearance beyond R_c + r_v (slider-scaled; see REGION_MARGIN_GAIN). */
  #regionMargin = 0;
  // Scratch outputs of #shapeTarget (avoids a per-call tuple allocation at build time).
  #shapedLo = 0;
  #shapedHi = 0;

  // CSR weighted Laplacian: off-diagonals in CSR form, diagonal kept separately.
  #rowPtr = new Int32Array(0);
  #colIdx = new Int32Array(0);
  #offDiag = new Float32Array(0);
  #diag = new Float64Array(0);
  #invDiag = new Float64Array(0);
  #laplacianPass = 0;

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

  // Iteration bookkeeping.
  #iteration = 0;
  #convergedStreak = 0;
  #prevX = new Float32Array(0);
  #prevY = new Float32Array(0);
  #lastMaxDisplacement = Number.POSITIVE_INFINITY;
  #capped = false;
  // Plateau detector state (see PLATEAU_WINDOW).
  #bestDisplacement = Number.POSITIVE_INFINITY;
  #bestDisplacementIteration = 0;

  // Terminal-settle bookkeeping (iterated circle relaxation to verified clean).
  /** Total settle passes run (safety-capped by SETTLE_MAX_PASSES). */
  #settlePasses = 0;
  /** Completed settle advance units (publish cadence for the shell). */
  #settleUnits = 0;
  /** Latches once a full relax pass verifies the layout overlap-free. */
  #everFeasible = false;
  /** Whether the settle phase hit its pass cap with violations remaining. */
  settleCapped = false;
  /** Strict disk overlaps at the last measurement (per iteration / settle verify). */
  residualOverlaps = 0;
  /** Community-region violations (margin 0) at the last measurement. */
  residualRegionViolations = 0;
  /** Cumulative ms spent inside relaxation passes (diagnostic). */
  projectionMs = 0;
  /** Worst single relaxation unit (ms; diagnostic). */
  maxProjectionMs = 0;
  /** Iterations/settle units whose relax passes had actual work (diagnostic). */
  projectionRuns = 0;
  /** Max displacement of the last SOLVE step alone, pre-projection (diagnostic). */
  lastSolveDisplacement = 0;
  /** Max displacement the last PROJECTION added on top of the solve (diagnostic). */
  lastProjectDisplacement = 0;
  /** Node index with the largest last-iteration displacement (diagnostic). */
  lastMaxDisplacementNode = -1;
  /** |CG solution − adopted position| for that node after projection (diagnostic). */
  lastMaxSolveGap = 0;
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

    if (this.#n === 0) {
      this.#phase = "done";
      this.#analysis = null;
      return;
    }

    // Reuse the sparse-stress analysis passes: CSR, weak components, min-fill/max-min
    // pivot selection with per-pivot BFS distance rows, and (cold only) the PivotMDS
    // coordinate initialisation. `epochs: 0` runs exactly those phases and stops —
    // no SGD epoch ever executes.
    this.#analysis = new SparseStressSolver(
      {
        n: this.#n,
        src: this.#src,
        dst: this.#dst,
        x: this.#x,
        y: this.#y,
      },
      {
        pivotCount: options.pivotCount,
        epochs: 0,
        keepInitialPositions: input.warm,
        jitter: input.warm ? 0 : SEED_JITTER,
        packComponents: !input.warm,
        returnPivotDistances: true,
        randomSeed: 1,
        idealEdgeLength: options.idealEdgeLength,
        validate: false,
      },
    );
    this.#phase = "analysis";
  }

  get done(): boolean {
    return this.#phase === "done";
  }

  /** Completed majorization iterations (the shell publishes on change). */
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
   * Whether published frames are verified non-overlapping: latches when the settle
   * phase's final relax pass confirms zero overlaps (the engine settles right after,
   * so every frame published from then on — the final state — is feasible).
   */
  get projectionActive(): boolean {
    return this.#everFeasible;
  }

  get termCount(): number {
    return this.#termCount;
  }

  /** Cumulative / worst-unit wall time per phase (perf diagnostics; ~free to keep). */
  readonly phaseCumulativeMs: Partial<Record<SolverPhase, number>> = {};
  readonly phaseMaxMs: Partial<Record<SolverPhase, number>> = {};

  /**
   * One bounded unit of work. Returns true if the solver advanced (false once done).
   * Units are sized so the worst single unit (a few bounded relaxation passes, or one
   * CG step = one SpMV per dimension) stays far below a frame.
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
      case "analysis": {
        const result = this.#analysis!.tick({ maxWork: ANALYSIS_TICK_WORK });
        if (result.done) {
          this.#analysisResult = result.result!;
          this.#analysis = null;
          this.#prepareTermBuild();
          this.#phase = "terms";
        }
        return true;
      }
      case "terms": {
        this.#buildTermsChunk(TERM_CHUNK);
        return true;
      }
      case "laplacian": {
        this.#buildLaplacianPass();
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
        this.#projectAndFinishIteration();
        return true;
      }
      case "settle": {
        this.#settleChunk();
        return true;
      }
      case "done": {
        return false;
      }
    }
  }

  /** Publish cadence for the shell: bumps at iteration AND settle-unit boundaries. */
  get publishGeneration(): number {
    return this.#iteration + this.#settleUnits;
  }

  // --- Build phases -------------------------------------------------------------

  #prepareTermBuild(): void {
    const n = this.#n;
    const edgeCount = this.#src.length;
    const pad = this.#options.overlapPadding;

    // Degrees + per-node hub geometry from the (deduped) edge list. For a hub v two
    // radii matter: the ONE-RING radius that seats its children side by side
    // (Σ(2r+pad)/2π) and the DISK radius that packs them at the packing utilisation.
    // When the ring radius exceeds an edge's target the hub is PACKING-BOUND — its
    // children cannot all sit at the target distance — and its spokes get a wide
    // feasible band instead of an exact target (see #shapeTarget).
    this.#degrees = new Uint32Array(n);
    const childExtent = new Float64Array(n);
    const childAreaSq = new Float64Array(n);
    for (let e = 0; e < edgeCount; e++) {
      const u = this.#src[e]!;
      const v = this.#dst[e]!;
      this.#degrees[u]! += 1;
      this.#degrees[v]! += 1;
      const ru = this.#radii[u]!;
      const rv = this.#radii[v]!;
      childExtent[u]! += 2 * rv + pad;
      childExtent[v]! += 2 * ru + pad;
      const halfU = ru + pad / 2;
      const halfV = rv + pad / 2;
      childAreaSq[u]! += halfV * halfV;
      childAreaSq[v]! += halfU * halfU;
    }
    this.#hubRing = new Float32Array(n);
    this.#hubPack = new Float32Array(n);
    for (let v = 0; v < n; v++) {
      const ringNeed = childExtent[v]! / TAU;
      const diskNeed = Math.sqrt(childAreaSq[v]! / PACKING_UTILISATION);
      this.#hubRing[v] = ringNeed;
      // A hub's own disk is part of the packing: children sit outside its radius.
      this.#hubPack[v] = Math.min(ringNeed, diskNeed + this.#radii[v]!);
    }

    // Per-component feasibility scale (see header): hop targets are multiplied by
    // max(1, R_packing / R_hop-ideal) so the unconstrained stress optimum is roughly
    // packing-feasible and the projector only has local work. R_packing is the radius
    // of the disk holding Σπ(r+pad/2)² at the packing utilisation; R_hop-ideal is half
    // the component's max pivot-BFS distance in layout units.
    const analysis = this.#analysisResult!;
    const components = analysis.components;
    this.#componentOf = components.labels;
    const packingSq = new Float64Array(components.count);
    for (let v = 0; v < n; v++) {
      const half = this.#radii[v]! + pad / 2;
      packingSq[this.#componentOf[v]!]! += half * half;
    }
    const pivots = analysis.pivots;
    const distances = pivots.distances;
    const maxHop = new Float64Array(components.count);
    for (let row = 0; row < pivots.pivots.length; row++) {
      const component = pivots.components[row]!;
      const rowBase = row * n;
      const start = components.offsets[component]!;
      const end = components.offsets[component + 1]!;
      let rowMax = maxHop[component]!;
      for (let i = start; i < end; i++) {
        const d = distances[rowBase + components.nodes[i]!]!;
        if (d !== INF_DIST && d > rowMax) {
          rowMax = d;
        }
      }
      maxHop[component] = rowMax;
    }
    // The safety factor puts the stress optimum slightly OUTSIDE the packing
    // envelope instead of just inside it: without it the settle phase must inflate
    // the whole cloud by the missing few percent, which reads as a terminal
    // contract→expand rebound (measured ~8 % RMS-spread dip at 3k, the exact motion
    // this engine exists to kill).
    const SCALE_SAFETY = 1.3;
    this.#componentScale = new Float64Array(components.count);
    for (let c = 0; c < components.count; c++) {
      const packingRadius = Math.sqrt(packingSq[c]! / PACKING_UTILISATION);
      const hopRadius =
        Math.max(1, maxHop[c]! / 2) * this.#options.idealEdgeLength;
      this.#componentScale[c] = Math.max(
        1,
        (SCALE_SAFETY * packingRadius) / hopRadius,
      );
    }
    this.scaleDiagnostics = Array.from(
      { length: Math.min(4, components.count) },
      (_, c) => ({
        size: components.offsets[c + 1]! - components.offsets[c]!,
        maxHop: maxHop[c]!,
        packingRadius: Math.sqrt(packingSq[c]! / PACKING_UTILISATION),
        scale: this.#componentScale[c]!,
      }),
    );

    // Packed edge keys so near-pair floors never duplicate an edge term (their targets
    // would conflict: the floor would pull an adjacent pair inward against its edge).
    this.#edgeKeys = new Set<number>();
    for (let e = 0; e < edgeCount; e++) {
      const u = this.#src[e]!;
      const v = this.#dst[e]!;
      this.#edgeKeys.add(Math.min(u, v) * n + Math.max(u, v));
    }

    // Exact term capacity: edges + capped near-pairs + pivot rows (bounded above).
    const pivotTermBound = pivots.pivots.length * n;
    this.#termCapacity =
      edgeCount + n * NEAR_PAIR_MAX_PARTNERS + pivotTermBound;
    this.#termA = new Uint32Array(this.#termCapacity);
    this.#termB = new Uint32Array(this.#termCapacity);
    this.#termWeight = new Float32Array(this.#termCapacity);
    this.#termLo = new Float32Array(this.#termCapacity);
    this.#termHi = new Float32Array(this.#termCapacity);
    this.#termCount = 0;

    // Edge terms (one hop): shaped target with halo + collision floors (see below).
    for (let e = 0; e < edgeCount; e++) {
      const u = this.#src[e]!;
      const v = this.#dst[e]!;
      this.#shapeTarget(u, v, 1);
      this.#pushTerm(u, v, 1, this.#shapedLo, this.#shapedHi);
    }

    // Near-pair floor terms: pairs currently overlapping (or nearly) that share no
    // edge, found with the same uniform-grid 3×3 scan the sibling overlap passes use.
    // Emitted ONCE per build from the seed/warm positions: they break the initial
    // coincident piles apart through the stress solve itself (PUSH-ONLY: [floor, ∞)).
    // Pairs that drift together only mid-solve are the settle phase's job instead —
    // regenerating these inside the loop was tried and destabilised the alternation
    // (see the projector notes above).
    this.#emitNearPairTerms();

    this.#buildRegionPlan();

    this.#pivotRowCursor = 0;
    this.#pivotNodeCursor = 0;
  }

  /**
   * Community-region floor plan (see REGION_FLOOR_MAX_COMMUNITIES): pick the largest
   * ≥ REGION_MIN_COMMUNITY_SIZE communities (bounded, deterministic order), compute
   * each one's packing radius from its member disk areas, and mark the exempt nodes
   * (members + anything edge-adjacent to a member) in a per-node bitmask.
   */
  #buildRegionPlan(): void {
    const n = this.#n;
    const communityOf = this.#communityOf;
    this.#regionCount = 0;
    this.#regionExempt = new Uint32Array(0);
    if (!communityOf || n === 0) {
      return;
    }

    let communityCount = 0;
    for (let v = 0; v < n; v++) {
      if (communityOf[v]! + 1 > communityCount) {
        communityCount = communityOf[v]! + 1;
      }
    }
    const memberCount = new Int32Array(communityCount);
    for (let v = 0; v < n; v++) {
      memberCount[communityOf[v]!]! += 1;
    }

    const candidates: number[] = [];
    for (let c = 0; c < communityCount; c++) {
      if (memberCount[c]! >= REGION_MIN_COMMUNITY_SIZE) {
        candidates.push(c);
      }
    }
    // Largest first; community id breaks ties — deterministic under the dense
    // (first-seen) community numbering.
    candidates.sort((a, b) => memberCount[b]! - memberCount[a]! || a - b);
    const regions = candidates.slice(0, REGION_FLOOR_MAX_COMMUNITIES);
    if (regions.length === 0) {
      return;
    }

    const regionOfCommunity = new Int32Array(communityCount).fill(-1);
    for (const [regionIndex, community] of regions.entries()) {
      regionOfCommunity[community] = regionIndex;
    }

    const count = regions.length;
    this.#regionCount = count;
    this.#regionRadius = new Float32Array(count);
    this.#regionCentroidX = new Float64Array(count);
    this.#regionCentroidY = new Float64Array(count);
    this.#regionMemberOffsets = new Int32Array(count + 1);
    this.#regionExempt = new Uint32Array(n);
    this.#regionMargin =
      this.#options.overlapPadding +
      this.#options.communitySeparation *
        REGION_MARGIN_GAIN *
        this.#options.idealEdgeLength;

    // Packing radius + member exemption, then member lists (counting sort).
    const pad = this.#options.overlapPadding;
    const areaSq = new Float64Array(count);
    for (let v = 0; v < n; v++) {
      const region = regionOfCommunity[communityOf[v]!]!;
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
      const region = regionOfCommunity[communityOf[v]!]!;
      if (region >= 0) {
        this.#regionMemberNodes[cursor[region]!] = v;
        cursor[region]! += 1;
      }
    }

    // Edge-adjacency exemption: a bridge endpoint may sit at the foreign region's
    // rim (its own edge target puts it there); shoving it out would fight the edge.
    for (let e = 0; e < this.#src.length; e++) {
      const u = this.#src[e]!;
      const v = this.#dst[e]!;
      const regionU = regionOfCommunity[communityOf[u]!]!;
      const regionV = regionOfCommunity[communityOf[v]!]!;
      if (regionU >= 0) {
        this.#regionExempt[v]! |= 1 << regionU;
      }
      if (regionV >= 0) {
        this.#regionExempt[u]! |= 1 << regionV;
      }
    }
  }

  /**
   * One community-region relax pass: recompute each region's centroid from its live
   * members, then push every non-exempt node radially out to R_region + r_node +
   * `margin`. Returns the number of violations found; with `strength` 0 it only
   * counts (the settle phase's verification read). Deterministic: fixed region
   * order, index-ordered node scan, hash-derived direction for a node exactly on a
   * centroid. One-sided by design — the stress energy has no term pulling a foreign
   * node INTO a region, so pushed-out is a fixed point (no force to fight).
   */
  #regionRelaxPass(margin: number, strength: number): number {
    const count = this.#regionCount;
    if (count === 0) {
      return 0;
    }
    const n = this.#n;

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

    let violations = 0;
    for (let r = 0; r < count; r++) {
      const cx = this.#regionCentroidX[r]!;
      const cy = this.#regionCentroidY[r]!;
      const base = this.#regionRadius[r]! + margin;
      const bit = 1 << r;
      for (let v = 0; v < n; v++) {
        if ((this.#regionExempt[v]! & bit) !== 0) {
          continue;
        }
        const need = base + this.#radii[v]!;
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
        const shift = (need - dist) * strength;
        this.#x[v]! += dx * shift;
        this.#y[v]! += dy * shift;
      }
    }
    return violations;
  }

  /**
   * Community-shaped target band for a pair at `hops` graph distance, written to
   * `#shapedLo` / `#shapedHi`.
   *
   *   - Edge terms (hops = 1) get an exact target — they carry local structure —
   *     UNLESS an endpoint hub is PACKING-BOUND (its one-ring radius exceeds the
   *     target, i.e. its children cannot all sit at the target distance). Such spokes
   *     get the wide feasible band [collision + haloShare·(pack − collision),
   *     max(pack, target)·slack]: the compact packing the projector produces (children
   *     at radii from the hub's rim out to the packing radius) lies INSIDE the band,
   *     so a packed hub is a fixed point instead of a fight. `degreeRepulsion` sets
   *     haloShare — how far children are pushed from the rim toward an explicit
   *     halo shell.
   *   - Pivot terms (hops ≥ 2) get a ±PIVOT_BAND dead zone around the target so
   *     packing distortion does not generate perpetual pulls.
   *   - The collision floor rᵢ + r_j + pad applies to every band (floored terms get a
   *     FLOOR_CEILING_SLACK dead zone rather than an exact floor).
   *
   * The hub band is applied HERE, not just on edge terms, because a pivot row
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
      if (cu !== cv) {
        target *= 1 + opts.communitySeparation * SEPARATION_TARGET_GAIN;
      } else {
        target /= 1 + opts.communityCohesion * COHESION_TARGET_GAIN;
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
    const at = this.#termCount;
    this.#termA[at] = a;
    this.#termB[at] = b;
    this.#termWeight[at] = weight;
    this.#termLo[at] = lo;
    this.#termHi[at] = hi;
    this.#termCount = at + 1;
  }

  /**
   * Grid-detected near-pair floors. Deterministic: nodes scanned in index order, each
   * unordered pair visited once, partners capped per node in scan order. Cell keys
   * are packed NUMERIC (like the sibling grids' cell hashing, but collision-free):
   * (cx, cy) offset into [0, 2²⁶) and combined as cx·2²⁶ + cy — exact in a float64
   * up to 2⁵², injective for |cell| < 2²⁵ (world coords far beyond any layout).
   */
  #emitNearPairTerms(): void {
    const n = this.#n;
    const pad = this.#options.overlapPadding;
    let maxRadius = 0;
    for (let v = 0; v < n; v++) {
      if (this.#radii[v]! > maxRadius) {
        maxRadius = this.#radii[v]!;
      }
    }
    const cellSize = Math.max(1e-6, 2 * maxRadius + pad);
    const CELL_OFFSET = 1 << 25;
    const CELL_STRIDE = 1 << 26;

    const cellOf = new Int32Array(n * 2);
    const buckets = new Map<number, number[]>();
    for (let v = 0; v < n; v++) {
      const cx = Math.floor(this.#x[v]! / cellSize);
      const cy = Math.floor(this.#y[v]! / cellSize);
      cellOf[v * 2] = cx;
      cellOf[v * 2 + 1] = cy;
      const key = (cx + CELL_OFFSET) * CELL_STRIDE + (cy + CELL_OFFSET);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(v);
      } else {
        buckets.set(key, [v]);
      }
    }

    const partnersOf = new Uint8Array(n);
    for (let a = 0; a < n; a++) {
      if (partnersOf[a]! >= NEAR_PAIR_MAX_PARTNERS) {
        continue;
      }
      const baseX = cellOf[a * 2]!;
      const baseY = cellOf[a * 2 + 1]!;
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = buckets.get(
            (baseX + ox + CELL_OFFSET) * CELL_STRIDE +
              (baseY + oy + CELL_OFFSET),
          );
          if (!bucket) {
            continue;
          }
          for (const b of bucket) {
            if (b <= a) {
              continue;
            }
            if (
              partnersOf[a]! >= NEAR_PAIR_MAX_PARTNERS ||
              partnersOf[b]! >= NEAR_PAIR_MAX_PARTNERS
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
            partnersOf[a]! += 1;
            partnersOf[b]! += 1;
          }
        }
      }
    }
  }

  /**
   * Pivot terms, chunked: for pivot row p and node v at BFS distance d, a term with
   * weight 1/d² and community-shaped target d·ideal. Degree-1 nodes are SKIPPED as the
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
   * CSR weighted Laplacian over the terms, built ONCE per (re)layout/absorb, in three
   * bounded passes (count / prefix+allocate / fill). Off-diagonals only; the diagonal
   * lives in its own array (also the Jacobi preconditioner). Duplicate (i,j) entries
   * (an edge that is also a pivot pair) simply accumulate in the SpMV — no dedupe pass.
   */
  #buildLaplacianPass(): void {
    const n = this.#n;
    const terms = this.#termCount;

    if (this.#laplacianPass === 0) {
      this.#rowPtr = new Int32Array(n + 1);
      for (let t = 0; t < terms; t++) {
        this.#rowPtr[this.#termA[t]! + 1]! += 1;
        this.#rowPtr[this.#termB[t]! + 1]! += 1;
      }
      this.#laplacianPass = 1;
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
      this.#laplacianPass = 2;
      return;
    }

    const cursor = new Int32Array(n);
    for (let v = 0; v < n; v++) {
      cursor[v] = this.#rowPtr[v]!;
    }
    for (let t = 0; t < terms; t++) {
      const a = this.#termA[t]!;
      const b = this.#termB[t]!;
      const w = this.#termWeight[t]!;
      this.#colIdx[cursor[a]!] = b;
      this.#offDiag[cursor[a]!] = w;
      cursor[a]! += 1;
      this.#colIdx[cursor[b]!] = a;
      this.#offDiag[cursor[b]!] = w;
      cursor[b]! += 1;
      this.#diag[a]! += w;
      this.#diag[b]! += w;
    }
    for (let v = 0; v < n; v++) {
      // Term-less nodes (singleton components) have a zero row; they never move.
      this.#invDiag[v] = this.#diag[v]! > 0 ? 1 / this.#diag[v]! : 0;
    }

    // Allocate the iterate-loop state once; the loop itself never allocates.
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
    this.#settleUnits = 0;
    this.#everFeasible = false;
    this.settleCapped = false;
    this.residualOverlaps = 0;
    this.residualRegionViolations = 0;
    this.#rhsCursor = 0;
    this.#phase = "rhs";
  }

  // --- Majorization iterations ----------------------------------------------------

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
    const terms = this.#termCount;
    const end = Math.min(terms, this.#rhsCursor + budget);
    for (let t = this.#rhsCursor; t < end; t++) {
      const a = this.#termA[t]!;
      const b = this.#termB[t]!;
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
        const lo = this.#termLo[t]!;
        const hi = this.#termHi[t]!;
        target = dist < lo ? lo : dist > hi ? hi : dist;
        const inv = 1 / dist;
        ux = dx * inv;
        uy = dy * inv;
      } else {
        target = this.#termLo[t]!;
        const angle = coincidentAngle(a, b);
        ux = Math.cos(angle);
        uy = Math.sin(angle);
      }
      const c = this.#termWeight[t]! * target;
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
    this.#phase = this.#cgDoneX && this.#cgDoneY ? "project" : "cg";
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
      this.#phase = "project";
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

  /**
   * Iteration boundary: adopt the CG iterate, bleed piles with a couple of gentle
   * relax passes, measure displacement, and decide — converge (→ settle), plateau
   * (→ settle), cap (log, → settle), or loop.
   */
  #projectAndFinishIteration(): void {
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

    const start = performance.now();
    // Region floor first (it can create disk overlaps for the passes below to bleed;
    // the reverse order would leave region pushes un-cleaned until next iteration).
    let moved =
      this.#regionRelaxPass(
        this.#regionMargin,
        REGION_RELAX_STRENGTH_ITERATION,
      ) > 0;
    for (let pass = 0; pass < ITERATION_RELAX_PASSES; pass++) {
      if (
        overlapRelaxPass({
          x: this.#x,
          y: this.#y,
          radii: this.#radii,
          count: n,
          padding: this.#options.overlapPadding,
          strength: ITERATION_RELAX_STRENGTH,
        }) === 0
      ) {
        break;
      }
      moved = true;
    }
    this.#trackProjectionUnit(start);
    if (moved) {
      this.projectionRuns += 1;
    }
    // Truthful live diagnostics: the worker debug log prints these every tick, so
    // they must reflect the actual iterate rather than an optimistic constant.
    this.residualOverlaps = countOverlaps({
      x: this.#x,
      y: this.#y,
      radii: this.#radii,
      count: n,
      padding: 0,
    });
    this.residualRegionViolations = this.#regionRelaxPass(0, 0);

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

    // The stress phase ends by converging, plateauing, or hitting the hard cap; in
    // every case the terminal settle phase delivers verified feasibility.
    if (this.#convergedStreak >= this.#options.convergenceStreak) {
      this.#phase = "settle";
      return;
    }
    if (this.#iteration - this.#bestDisplacementIteration >= PLATEAU_WINDOW) {
      this.#phase = "settle";
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
      this.#phase = "settle";
      return;
    }
    this.#phase = "rhs";
  }

  #trackProjectionUnit(start: number): void {
    const elapsed = performance.now() - start;
    this.projectionMs += elapsed;
    if (elapsed > this.maxProjectionMs) {
      this.maxProjectionMs = elapsed;
    }
  }

  /**
   * One terminal-settle unit: a few full-strength relax passes (region floor, then
   * disk overlap). Ends the solve once a sweep verifies the layout BOTH
   * disk-overlap-free and region-clean; pure separation with no opposing force, so
   * termination is structural — the safety cap only guards against the impossible
   * and LOGS if ever hit (surfaced via `settleCapped`).
   */
  #settleChunk(): void {
    const start = performance.now();
    let verifiedClean = false;
    for (let pass = 0; pass < SETTLE_PASSES_PER_UNIT; pass++) {
      this.#settlePasses += 1;
      const regionViolations = this.#regionRelaxPass(
        REGION_SETTLE_MARGIN,
        SETTLE_RELAX_STRENGTH,
      );
      const moved = overlapRelaxPass({
        x: this.#x,
        y: this.#y,
        radii: this.#radii,
        count: this.#n,
        padding: SETTLE_PADDING,
        strength: SETTLE_RELAX_STRENGTH,
      });
      if (
        (moved === 0 && regionViolations === 0) ||
        this.#settlePasses % SETTLE_VERIFY_INTERVAL === 0
      ) {
        this.residualOverlaps = countOverlaps({
          x: this.#x,
          y: this.#y,
          radii: this.#radii,
          count: this.#n,
          padding: 0,
        });
        this.residualRegionViolations = this.#regionRelaxPass(0, 0);
        if (
          this.residualOverlaps === 0 &&
          this.residualRegionViolations === 0
        ) {
          verifiedClean = true;
          break;
        }
      }
      if (this.#settlePasses >= SETTLE_MAX_PASSES) {
        break;
      }
    }
    this.#trackProjectionUnit(start);
    this.#settleUnits += 1;
    this.projectionRuns += 1;

    if (verifiedClean) {
      this.#everFeasible = true;
      this.#phase = "done";
      return;
    }
    if (this.#settlePasses >= SETTLE_MAX_PASSES) {
      this.settleCapped = true;
      this.residualOverlaps = countOverlaps({
        x: this.#x,
        y: this.#y,
        radii: this.#radii,
        count: this.#n,
        padding: 0,
      });
      this.residualRegionViolations = this.#regionRelaxPass(0, 0);
      // eslint-disable-next-line no-console
      console.warn(
        `[majorization] settle pass cap hit at ${this.#settlePasses} passes: ` +
          `${this.residualOverlaps} overlaps, ` +
          `${this.residualRegionViolations} region violations remain`,
      );
      this.#phase = "done";
    }
  }
}

// --- LayoutSimulation shell ----------------------------------------------------------

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
   * Last published solver generation (iterations + settle units). Starts at 0 so
   * nothing is published until the FIRST majorization iterate completes — the
   * analysis phases mutate positions incrementally (PivotMDS init), and a mid-init
   * frame must never be displayed.
   */
  #publishedGeneration = 0;

  // Diagnostics, duck-typed to the names the worker's debug log reads STRUCTURALLY
  // from every engine (`diag.forbidOverlaps` etc. in graph-worker's #tickLayouts) —
  // renaming them would silently drop this engine from the debug line, so the names
  // stay and the mapping is documented per field.
  /** Cumulative wall time (ms) spent in solver ticks. */
  overlapProjectionMs = 0;
  /** Majorization iterations completed. */
  overlapProjectionCalls = 0;
  /** Worst single tick (ms) — the per-tick budget guard. */
  maxForbidStepMs = 0;
  /**
   * MEASURED strict disk overlaps in the last completed iterate / settle
   * verification (the SGD engine feeds this from `overlapsRemaining`). Non-zero
   * during the stress phase by design; a non-zero value after settle means the
   * settle cap was hit — see {@link settleCapped}.
   */
  forbidOverlaps = 0;
  /** Laplacian (re)builds — the closest analogue to the SGD engine's expansions. */
  forbidExpansions = 0;

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
      idealEdgeLength: options.idealEdgeLength ?? IDEAL_LINK_LENGTH,
      overlapPadding: options.overlapPadding ?? OVERLAP_PADDING,
      communityCohesion: options.communityCohesion ?? COMMUNITY_COHESION,
      communitySeparation: options.communitySeparation ?? COMMUNITY_SEPARATION,
      degreeRepulsion: options.degreeRepulsion ?? DEGREE_REPULSION,
      maxIterations: options.maxIterations ?? MAX_ITERATIONS,
      convergenceEpsilon: options.convergenceEpsilon ?? CONVERGENCE_EPSILON,
      convergenceStreak: options.convergenceStreak ?? CONVERGENCE_STREAK,
      cgStepsPerIteration:
        options.cgStepsPerIteration ?? CG_STEPS_PER_ITERATION,
      pivotCount: options.pivotCount ?? Math.min(nodes.length, PIVOT_COUNT_CAP),
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

  /** Louvain community id per node, in buffer order (for BubbleSets / seeding). */
  get communities(): readonly number[] {
    return this.#communities;
  }

  /** Resolved (deduped) edge count; a worker/bench diagnostic. */
  get edgeCount(): number {
    return this.#indexEdges.length;
  }

  /** Whether the last solve hit the iteration cap (bench/test diagnostic). */
  get capped(): boolean {
    return this.#solver?.capped ?? false;
  }

  /** Whether the settle phase hit its pass cap with violations remaining. */
  get settleCapped(): boolean {
    return this.#solver?.settleCapped ?? false;
  }

  /** Community-region violations (margin 0) at the last measurement. */
  get regionViolations(): number {
    return this.#solver?.residualRegionViolations ?? 0;
  }

  /** Majorization iterations completed so far (bench/test diagnostic). */
  get iterations(): number {
    return this.#solver?.iteration ?? 0;
  }

  /** The live solver, exposed for perf diagnostics (phase timings) in tests/benches. */
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
  } | null {
    return this.#solver;
  }

  /** Whether published frames are projected (overlap-free) already. */
  get projectionActive(): boolean {
    return this.#solver?.projectionActive ?? false;
  }

  tick(budgetMs: number): boolean {
    if (this.#status === "settled" || this.#status === "paused") {
      return false;
    }
    this.#status = "running";
    const startTime = performance.now();
    let stepped = false;
    const solver = this.#solver;

    if (solver) {
      // do-while: at least one advance per tick even if the budget is already gone
      // (a pre-empted worker can lose >1 ms between taking startTime and the first
      // check; returning false while unsettled would read as a dead layout).
      while (!solver.done) {
        solver.advance();
        stepped = true;
        if (performance.now() - startTime >= budgetMs) {
          break;
        }
      }
      this.overlapProjectionCalls = solver.iteration;
      this.forbidOverlaps = solver.residualOverlaps;
      // Publish at iteration / settle-unit boundaries only: every displayed frame is
      // a completed majorization iterate (or a settle sweep of one).
      if (
        solver.publishGeneration !== this.#publishedGeneration ||
        (solver.done && stepped)
      ) {
        this.#writePositions();
        this.#publishedGeneration = solver.publishGeneration;
      }
      if (solver.done) {
        this.#status = "settled";
      }
    } else {
      this.#status = "settled";
    }

    const elapsed = performance.now() - startTime;
    this.overlapProjectionMs += elapsed;
    if (elapsed > this.maxForbidStepMs) {
      this.maxForbidStepMs = elapsed;
    }
    return stepped;
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
   * Laplacian over the new topology, and continue majorization WARM from the preserved
   * positions (projection re-enables after the first iteration). Refreshes Louvain once
   * the layout has grown enough, so the BubbleSets track the evolving communities.
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
    }

    this.#solver = count > 0 ? this.#buildSolver(true) : null;
    this.#publishedGeneration = 0;
    this.#status = count > 0 ? "running" : "settled";
    this.#writePositions();
  }

  /**
   * Force a Louvain refresh if nodes were absorbed since the last one (trailing-edge
   * complement to the growth trigger). Position-neutral; returns whether it ran. The
   * refreshed membership feeds the NEXT solver build's target shaping (a mid-solve
   * relabel does not regenerate the current targets — parity with the SGD engine).
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

  #buildSolver(warm: boolean): MajorizationSolver {
    const count = this.#nodes.length;
    const edgeCount = this.#indexEdges.length;
    const src = new Uint32Array(edgeCount);
    const dst = new Uint32Array(edgeCount);
    for (let index = 0; index < edgeCount; index++) {
      const edge = this.#indexEdges[index]!;
      src[index] = edge.source;
      dst[index] = edge.target;
    }

    // Densified Louvain ids (arbitrary ids incl. -1 → dense ints) for target shaping;
    // only materialised when a community shaping weight is active.
    const communityActive =
      this.#options.communityCohesion > 0 ||
      this.#options.communitySeparation > 0;
    let communities: Int32Array | undefined;
    if (communityActive) {
      communities = new Int32Array(count);
      const denseByRaw = new Map<number, number>();
      for (let index = 0; index < count; index++) {
        const raw = this.#communities[index] ?? -1;
        let dense = denseByRaw.get(raw);
        if (dense === undefined) {
          dense = denseByRaw.size;
          denseByRaw.set(raw, dense);
        }
        communities[index] = dense;
      }
    }

    this.forbidExpansions += 1;
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

export function createMajorizationLayout(
  nodes: ForceNode[],
  edges: ForceEdge[],
  buffer: FlatGraphBuffer,
  options?: MajorizationLayoutOptions,
): LayoutSimulation {
  return new MajorizationLayout(nodes, edges, buffer, options);
}
