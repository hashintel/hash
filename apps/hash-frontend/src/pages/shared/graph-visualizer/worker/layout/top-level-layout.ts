/* eslint-disable no-param-reassign, id-length -- numeric optimiser: in-place position mutation and short math identifiers (x/y/dx) read best here. */
/**
 * Principled top-level layout optimiser.
 *
 * Why the top level is special. Inside a cluster, children are confined to the
 * parent circle, similarly sized, and their external pull is handled by port
 * anchors; WebCola's stress + non-overlap (plus the anchors) is the right tool
 * there. The outside is harder: top-level clusters are unconfined, vary
 * enormously in size (a 5 500-node bubble next to a 76-node one), and the edges
 * between them have to get past those huge obstacles. Stress alone does not
 * penalize crossings or detours; staging layout through separate centre,
 * untangle, port, and routing passes optimizes proxies rather than the drawn
 * rim-to-rim geometry. The top level is also the overview every deeper
 * decision inherits, so it's worth solving directly.
 *
 * This optimiser minimises one objective over the small top-level layout,
 * evaluated on the geometry that gets drawn: edges leave each bubble at the rim
 * facing their neighbour (a port), and we score crossings + detours of those
 * rim-to-rim segments, plus edge length (connected-near), non-overlap, and
 * neighbour spread, so a cluster's connections fan out instead of bunching.
 * Neighbour spread is an explicit objective term (the "mitosis" intuition)
 * rather than a separate seeding pass. The N is tiny, so a simulated-annealing
 * search with position swaps and restarts gets a near-optimal layout cheaply.
 *
 * Stability (mental-map preservation). A from-scratch global search is the right
 * tool for the first build, but re-running it on every ingest makes the top
 * level jump around: the search is a near-optimal but discontinuous function of
 * its input, so adding one bubble re-derives a completely different (if equally
 * good) arrangement. So on an incremental update the caller passes the previous
 * positions as {@link Anchor}s and the search becomes a local refine: an inertia
 * term penalises moving an existing bubble away from its anchor, and the search
 * takes small steps with few restarts and rare swaps. New bubbles (null anchor)
 * are still placed freely, and the layout keeps self-healing crossings. It just
 * does so by small, legible adjustments instead of wholesale reshuffles.
 */

import { mulberry32 } from "../../math/random";

import type { Position } from "../../geometry";

/** A node being laid out; `x`/`y` are mutated in place. */
export interface LayoutNode {
  x: number;
  y: number;
  readonly radius: number;
}

/** A node's previous position, used to anchor it during an incremental refine. */
export interface Anchor extends Position {
  /**
   * Per-node multiplier on the inertia weight, in [0, 1]: 1 pins the node to its
   * previous position, 0 lets it move freely (defaults to 1). The caller sets it
   * from how central the bubble is on screen, so what the user is looking at
   * stays put while off-screen bubbles are free to reflow.
   */
  readonly weight?: number;
}

export interface OptimizeTopLevelOptions {
  /**
   * Previous positions, parallel to `nodes`. A non-null entry anchors that node
   * (it existed in the prior layout and should keep its place); a null entry is
   * a new node, placed freely. Supplying any anchor switches the search to a
   * local, stability-preserving refine; omit entirely for a cold global build.
   */
  readonly anchors?: readonly (Anchor | null)[];
  /**
   * Skip the final non-overlap relaxation. Exists so tests can assert that the
   * anchored search alone leaves a grown-bubble overlap unresolved (proving the
   * relaxation is what clears it); production never sets it.
   */
  readonly skipOverlapRelaxation?: boolean;
  /**
   * Tuning overrides; unset fields fall back to
   * {@link defaultTopLevelPolishConfig}.
   */
  readonly tuning?: Partial<TopLevelPolishConfig>;
}

/**
 * Tuning for the top-level (hierarchy overview) polish: this module's
 * annealing search plus the gates its callers apply
 * ({@link "../core/hierarchical/settle-polish"} skips the optimiser above
 * `maxNodes`; {@link "../core/hierarchical/viewport-anchor"} floors its anchor
 * weight at `viewportAnchorFloor`).
 */
export interface TopLevelPolishConfig {
  /**
   * Above this top-level cluster count, skip the optimiser (keep WebCola's
   * result).
   *
   * @defaultValue 32. The objective is O(n²)-ish per evaluation, so raising it
   * trades settle-time CPU for polish quality on big overviews.
   */
  readonly maxNodes: number;
  /**
   * Objective weight per edge crossing. Crossings, detours, and overlap
   * dominate legibility; stress and spread are gentle shaping terms.
   *
   * @defaultValue 30.
   */
  readonly crossingWeight: number;
  /** Objective weight per unit of edge-through-bubble intrusion. @defaultValue 24. */
  readonly detourWeight: number;
  /** Objective weight per unit of bubble overlap. @defaultValue 40. */
  readonly overlapWeight: number;
  /** Objective weight on normalised (scale-free) edge-length stress. @defaultValue 3. */
  readonly stressWeight: number;
  /** Objective weight on neighbour angular-spread pinching. @defaultValue 2. */
  readonly spreadWeight: number;
  /**
   * Ideal rim-to-rim gap between linked bubbles, as a fraction of the mean
   * radius. Additive, not multiplicative: a multiplicative ideal makes any edge
   * touching a huge bubble "want" to be hundreds of px long, flinging connected
   * small nodes far away.
   *
   * @defaultValue 0.5. Must stay >= {@link TopLevelPolishConfig.overlapPadFraction}
   * so stress and non-overlap don't fight.
   */
  readonly idealGapFraction: number;
  /** Non-overlap gap as a fraction of the mean radius. @defaultValue 0.3. */
  readonly overlapPadFraction: number;
  /** Initial annealing temperature for cold (unanchored) builds. @defaultValue 25. */
  readonly startTemperature: number;
  /** Per-step temperature multiplier. @defaultValue 0.9975. */
  readonly cooling: number;
  /** Annealing steps per restart. @defaultValue 1600. */
  readonly steps: number;
  /** Independent annealing restarts for cold builds; best result wins. @defaultValue 8. */
  readonly restarts: number;
  /** Fraction of cold-build moves that are position swaps (the rest jitter). @defaultValue 0.25. */
  readonly swapProbability: number;
  /**
   * Inertia weight for the anchored (incremental-refine) search: each anchored
   * node adds weight·(displacement / meanRadius)² to the objective, so existing
   * bubbles keep their place.
   *
   * @defaultValue 12, calibrated against {@link TopLevelPolishConfig.crossingWeight}:
   * a node won't travel ~2 mean-radii from its anchor unless doing so removes
   * more than ~1.5 crossings.
   */
  readonly anchorWeight: number;
  /** Annealing start temperature for anchored refines (local search). @defaultValue 6. */
  readonly anchoredStartTemperature: number;
  /** Restarts for anchored refines (one local pass, no global re-search). @defaultValue 1. */
  readonly anchoredRestarts: number;
  /**
   * Swap probability during anchored refines. Rare: a swap relocates a node
   * across the whole layout, the opposite of staying put.
   *
   * @defaultValue 0.05.
   */
  readonly anchoredSwapProbability: number;
  /** Anchored move scale, as a multiple of the mean radius. @defaultValue 1.2. */
  readonly anchoredMoveScale: number;
  /**
   * Iteration cap for the post-refine deterministic overlap relaxation (see
   * {@link relaxOverlaps}); a pathological all-pinned growth case may retain a
   * residual sliver when exhausted.
   *
   * @defaultValue 64.
   */
  readonly overlapRelaxIterations: number;
  /**
   * Relaxation mass of an un-anchored (new) bubble: very light, so it yields
   * freely rather than shoving an anchored neighbour. Below the viewport floor.
   *
   * @defaultValue 0.01.
   */
  readonly freeNodeMass: number;
  /**
   * Anchor weight kept by off-screen bubbles during viewport-weighted refines:
   * they reflow but don't teleport while the user isn't looking (see
   * {@link "../core/hierarchical/viewport-anchor"}).
   *
   * @defaultValue 0.05.
   */
  readonly viewportAnchorFloor: number;
}

export const defaultTopLevelPolishConfig: TopLevelPolishConfig = {
  maxNodes: 32,
  crossingWeight: 30,
  detourWeight: 24,
  overlapWeight: 40,
  stressWeight: 3,
  spreadWeight: 2,
  idealGapFraction: 0.5,
  overlapPadFraction: 0.3,
  startTemperature: 25,
  cooling: 0.9975,
  steps: 1600,
  restarts: 8,
  swapProbability: 0.25,
  anchorWeight: 12,
  anchoredStartTemperature: 6,
  anchoredRestarts: 1,
  anchoredSwapProbability: 0.05,
  anchoredMoveScale: 1.2,
  overlapRelaxIterations: 64,
  freeNodeMass: 0.01,
  viewportAnchorFloor: 0.05,
};

/** Resolve per-call overrides against the module defaults. */
function resolveTuning(
  tuning: Partial<TopLevelPolishConfig> | undefined,
): TopLevelPolishConfig {
  return tuning
    ? { ...defaultTopLevelPolishConfig, ...tuning }
    : defaultTopLevelPolishConfig;
}

/** The rim point of `node` in the direction of `(tx,ty)`, where an edge to that
 * neighbour attaches (its port, before any min-separation nudge). */
function rim(node: LayoutNode, tx: number, ty: number): [number, number] {
  const dx = tx - node.x;
  const dy = ty - node.y;
  const dist = Math.hypot(dx, dy) || 1;
  return [
    node.x + (node.radius * dx) / dist,
    node.y + (node.radius * dy) / dist,
  ];
}

/** Standard segment-intersection test (proper crossings; shared endpoints handled by the caller). */
function segmentsCross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** How deep a segment intrudes into a circle (0 if it stays clear). */
function circleIntrusion(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  radius: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = ax + t * dx;
  const py = ay + t * dy;
  const dist = Math.hypot(cx - px, cy - py);
  return dist < radius ? radius - dist : 0;
}

interface Problem {
  readonly edges: readonly (readonly [number, number])[];
  readonly adjacency: readonly (readonly number[])[];
  readonly ideals: readonly number[];
  readonly meanRadius: number;
}

function buildProblem(
  nodes: readonly LayoutNode[],
  edges: readonly (readonly [number, number])[],
  tuning: TopLevelPolishConfig,
): Problem {
  let meanRadius = 0;
  for (const node of nodes) {
    meanRadius += node.radius;
  }
  meanRadius = nodes.length > 0 ? meanRadius / nodes.length : 1;

  const adjacency: number[][] = nodes.map(() => []);
  const ideals: number[] = [];
  const gap = meanRadius * tuning.idealGapFraction;
  // Edge endpoints are valid node indices: buildProblem is only called from
  // measureLayout/optimizeTopLevel on the same nodes array that defines
  // adjacency's length.
  for (const [a, b] of edges) {
    adjacency[a]!.push(b);
    adjacency[b]!.push(a);
    ideals.push(nodes[a]!.radius + nodes[b]!.radius + gap);
  }
  return { edges, adjacency, ideals, meanRadius };
}

interface LayoutTerms {
  crossings: number;
  detour: number;
  overlap: number;
  stress: number;
  spread: number;
}

/**
 * Computes crossings, detour, overlap, stress, and spread for the current node
 * positions into `terms` (unweighted components).
 */
function computeTerms(
  nodes: readonly LayoutNode[],
  problem: Problem,
  terms: LayoutTerms,
  tuning: TopLevelPolishConfig,
): void {
  const { edges, adjacency, ideals, meanRadius } = problem;
  const edgeCount = edges.length;

  // Score crossings and detours on rim-to-rim segments, not centre-to-centre lines.
  const ax = new Float64Array(edgeCount);
  const ay = new Float64Array(edgeCount);
  const bx = new Float64Array(edgeCount);
  const by = new Float64Array(edgeCount);
  for (let e = 0; e < edgeCount; e++) {
    const [a, b] = edges[e]!;
    const na = nodes[a]!;
    const nb = nodes[b]!;
    const pa = rim(na, nb.x, nb.y);
    const pb = rim(nb, na.x, na.y);
    ax[e] = pa[0];
    ay[e] = pa[1];
    bx[e] = pb[0];
    by[e] = pb[1];
  }

  let crossings = 0;
  for (let e = 0; e < edgeCount; e++) {
    const [a1, b1] = edges[e]!;
    for (let f = e + 1; f < edgeCount; f++) {
      const [a2, b2] = edges[f]!;
      if (a1 === a2 || a1 === b2 || b1 === a2 || b1 === b2) {
        continue; // share a node, not a crossing
      }
      if (
        segmentsCross(
          ax[e]!,
          ay[e]!,
          bx[e]!,
          by[e]!,
          ax[f]!,
          ay[f]!,
          bx[f]!,
          by[f]!,
        )
      ) {
        crossings += 1;
      }
    }
  }

  let detour = 0;
  for (let e = 0; e < edgeCount; e++) {
    const [a, b] = edges[e]!;
    for (let w = 0; w < nodes.length; w++) {
      if (w === a || w === b) {
        continue;
      }
      const node = nodes[w]!;
      const intr = circleIntrusion(
        ax[e]!,
        ay[e]!,
        bx[e]!,
        by[e]!,
        node.x,
        node.y,
        node.radius,
      );
      if (intr > 0) {
        detour += intr / node.radius; // fraction of the bubble pierced
      }
    }
  }

  let stress = 0;
  for (let e = 0; e < edgeCount; e++) {
    const [a, b] = edges[e]!;
    const dist = Math.hypot(
      nodes[a]!.x - nodes[b]!.x,
      nodes[a]!.y - nodes[b]!.y,
    );
    const ratio = dist / ideals[e]! - 1;
    stress += ratio * ratio;
  }

  let overlap = 0;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const ni = nodes[i]!;
      const nj = nodes[j]!;
      const dist = Math.hypot(ni.x - nj.x, ni.y - nj.y);
      const minDist =
        ni.radius + nj.radius + tuning.overlapPadFraction * meanRadius;
      if (dist < minDist) {
        overlap += (minDist - dist) / meanRadius;
      }
    }
  }

  let spread = 0;
  for (let u = 0; u < nodes.length; u++) {
    const neighbours = adjacency[u]!;
    if (neighbours.length < 2) {
      continue;
    }
    const node = nodes[u]!;
    const angles = neighbours
      .map((v) => Math.atan2(nodes[v]!.y - node.y, nodes[v]!.x - node.x))
      .sort((lhs, rhs) => lhs - rhs);
    const idealGap = (2 * Math.PI) / angles.length;
    for (let k = 0; k < angles.length; k++) {
      const next = angles[(k + 1) % angles.length]!;
      let gap = next - angles[k]!;
      if (gap <= 0) {
        gap += 2 * Math.PI;
      }
      if (gap < idealGap) {
        spread += (idealGap - gap) / idealGap;
      }
    }
  }

  terms.crossings = crossings;
  terms.detour = detour;
  terms.overlap = overlap;
  terms.stress = stress;
  terms.spread = spread;
}

function weightedTotal(
  terms: LayoutTerms,
  tuning: TopLevelPolishConfig,
): number {
  return (
    tuning.crossingWeight * terms.crossings +
    tuning.detourWeight * terms.detour +
    tuning.overlapWeight * terms.overlap +
    tuning.stressWeight * terms.stress +
    tuning.spreadWeight * terms.spread
  );
}

/** Per-term breakdown of the drawn-geometry objective plus total weighted energy. */
export interface LayoutMeasure extends LayoutTerms {
  readonly energy: number;
}

/**
 * Returns the drawn-geometry objective terms and total weighted energy for
 * `nodes`/`edges` without mutating positions.
 */
export function measureLayout(
  nodes: readonly LayoutNode[],
  edges: readonly (readonly [number, number])[],
  tuning?: Partial<TopLevelPolishConfig>,
): LayoutMeasure {
  const resolved = resolveTuning(tuning);
  const problem = buildProblem(nodes, edges, resolved);
  const terms: LayoutTerms = {
    crossings: 0,
    detour: 0,
    overlap: 0,
    stress: 0,
    spread: 0,
  };
  computeTerms(nodes, problem, terms, resolved);
  return { ...terms, energy: weightedTotal(terms, resolved) };
}

/**
 * Push overlapping nodes apart in place, stopping when no pair overlaps or
 * after {@link TopLevelPolishConfig.overlapRelaxIterations} passes, distributing each pair's
 * separation by anchor weight as a mass: a node moves proportionally to the
 * other's mass, so a heavy (pinned, high-weight) bubble barely moves and a
 * light (off-screen or new) one yields. Uses the same minimum separation as the
 * overlap objective term. When the budget is exhausted with residual overlap,
 * positions are left as-is; callers must not assume zero overlap without
 * verifying.
 */
export function relaxOverlaps(
  nodes: LayoutNode[],
  anchors: readonly (Anchor | null)[],
  meanRadius: number,
  tuning?: Partial<TopLevelPolishConfig>,
): void {
  const resolved = resolveTuning(tuning);
  const pad = resolved.overlapPadFraction * meanRadius;
  const count = nodes.length;
  for (let iter = 0; iter < resolved.overlapRelaxIterations; iter++) {
    let moved = false;
    for (let i = 0; i < count; i++) {
      const ni = nodes[i]!;
      for (let j = i + 1; j < count; j++) {
        const nj = nodes[j]!;
        let dx = nj.x - ni.x;
        let dy = nj.y - ni.y;
        let dist = Math.hypot(dx, dy);
        const minDist = ni.radius + nj.radius + pad;
        if (dist >= minDist) {
          continue;
        }
        if (dist < 1e-6) {
          // Coincident: pick a deterministic direction from the indices.
          const angle = (i * 1.3 + j * 0.7) % (2 * Math.PI);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          dist = 1;
        }
        const penetration = minDist - dist;
        const massI = anchors[i]?.weight ?? resolved.freeNodeMass;
        const massJ = anchors[j]?.weight ?? resolved.freeNodeMass;
        const total = massI + massJ;
        // Mass-weighted split so low-weight (off-screen) neighbours yield
        // before pinned, high-weight anchors.
        const shareI = total > 0 ? massJ / total : 0.5;
        const shareJ = total > 0 ? massI / total : 0.5;
        const ux = dx / dist;
        const uy = dy / dist;
        ni.x -= ux * penetration * shareI;
        ni.y -= uy * penetration * shareI;
        nj.x += ux * penetration * shareJ;
        nj.y += uy * penetration * shareJ;
        moved = true;
      }
    }
    if (!moved) {
      break;
    }
  }
}

/**
 * Optimise the top-level node positions in place, minimising the drawn-geometry
 * objective. `nodes` should already hold a reasonable seed (e.g. WebCola's
 * stress result). `seed` makes the search deterministic. Pass
 * {@link OptimizeTopLevelOptions.anchors} to switch from a cold global search to
 * an incremental local refine that keeps anchored nodes near their previous
 * positions (see the stability note in the module header).
 */
export function optimizeTopLevel(
  nodes: LayoutNode[],
  edges: readonly (readonly [number, number])[],
  seed: number,
  options?: OptimizeTopLevelOptions,
): void {
  const count = nodes.length;
  if (count < 3 || edges.length === 0) {
    return;
  }
  const tuning = resolveTuning(options?.tuning);
  const problem = buildProblem(nodes, edges, tuning);
  const rng = mulberry32(seed);
  const terms: LayoutTerms = {
    crossings: 0,
    detour: 0,
    overlap: 0,
    stress: 0,
    spread: 0,
  };

  const rawAnchors = options?.anchors;
  const anchored =
    rawAnchors !== undefined && rawAnchors.some((anchor) => anchor !== null);

  // Align the anchor cloud to the seed, so inertia penalises relative
  // rearrangement only. The layout is re-centred on its centroid (which shifts
  // when a node is added/removed), so the raw anchors and the seed differ by a
  // uniform translation we must not fight. The alignment is weighted, pinning
  // the frame to the heavily-anchored (central) nodes, so they keep their
  // on-screen position while low-weight nodes drift.
  const anchors = Array.from<Anchor | null>({
    length: count,
  }).fill(null);

  if (anchored) {
    let anchorMeanX = 0;
    let anchorMeanY = 0;
    let seedMeanX = 0;
    let seedMeanY = 0;
    let totalWeight = 0;
    for (let i = 0; i < count; i++) {
      const anchor = rawAnchors[i];
      if (!anchor) {
        continue;
      }
      const weight = anchor.weight ?? 1;
      anchorMeanX += anchor.x * weight;
      anchorMeanY += anchor.y * weight;
      seedMeanX += nodes[i]!.x * weight;
      seedMeanY += nodes[i]!.y * weight;
      totalWeight += weight;
    }
    const offsetX =
      totalWeight > 0 ? (seedMeanX - anchorMeanX) / totalWeight : 0;
    const offsetY =
      totalWeight > 0 ? (seedMeanY - anchorMeanY) / totalWeight : 0;
    for (let i = 0; i < count; i++) {
      const anchor = rawAnchors[i];
      if (anchor) {
        anchors[i] = {
          x: anchor.x + offsetX,
          y: anchor.y + offsetY,
          weight: anchor.weight,
        };
      }
    }
  }

  const anchorScale = Math.max(problem.meanRadius, 1);
  const anchorEnergy = (): number => {
    if (!anchored) {
      return 0;
    }
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const anchor = anchors[i];
      if (!anchor) {
        continue;
      }
      const dx = nodes[i]!.x - anchor.x;
      const dy = nodes[i]!.y - anchor.y;
      const weight = anchor.weight ?? 1;
      sum += (weight * (dx * dx + dy * dy)) / (anchorScale * anchorScale);
    }
    return tuning.anchorWeight * sum;
  };

  const evalEnergy = (): number => {
    computeTerms(nodes, problem, terms, tuning);
    return weightedTotal(terms, tuning) + anchorEnergy();
  };

  // Cold-search jitter span scales with layout extent so moves stay
  // proportional to bubble spread.
  let extent = 0;
  for (const node of nodes) {
    extent = Math.max(extent, Math.hypot(node.x, node.y) + node.radius);
  }
  extent = Math.max(extent, problem.meanRadius);

  // Anchored: a local refine (small steps, one pass, rare swaps). Cold: the
  // full global search. `jitterBasis` also scales the restart kick, so an
  // anchored pass never throws a node across the layout.
  const restarts = anchored ? tuning.anchoredRestarts : tuning.restarts;
  const startTemp = anchored
    ? tuning.anchoredStartTemperature
    : tuning.startTemperature;
  const swapProb = anchored
    ? tuning.anchoredSwapProbability
    : tuning.swapProbability;
  const jitterBasis = anchored
    ? anchorScale * tuning.anchoredMoveScale
    : extent;

  const bestX = nodes.map((node) => node.x);
  const bestY = nodes.map((node) => node.y);
  let bestEnergy = evalEnergy();

  for (let restart = 0; restart < restarts; restart++) {
    // Restart 0 keeps the seed; later restarts jitter it to escape minima.
    if (restart > 0) {
      for (let i = 0; i < count; i++) {
        nodes[i]!.x = bestX[i]! + (rng() - 0.5) * jitterBasis;
        nodes[i]!.y = bestY[i]! + (rng() - 0.5) * jitterBasis;
      }
    } else {
      for (let i = 0; i < count; i++) {
        nodes[i]!.x = bestX[i]!;
        nodes[i]!.y = bestY[i]!;
      }
    }

    let current = evalEnergy();
    let temp = startTemp;

    for (let step = 0; step < tuning.steps; step++) {
      if (rng() < swapProb) {
        // Swap two nodes' positions: the move that un-crosses a layout.
        const i = Math.floor(rng() * count);
        let j = Math.floor(rng() * count);
        if (j === i) {
          j = (j + 1) % count;
        }
        const tx = nodes[i]!.x;
        const ty = nodes[i]!.y;
        nodes[i]!.x = nodes[j]!.x;
        nodes[i]!.y = nodes[j]!.y;
        nodes[j]!.x = tx;
        nodes[j]!.y = ty;
        const candidate = evalEnergy();
        if (
          candidate <= current ||
          rng() < Math.exp((current - candidate) / temp)
        ) {
          current = candidate;
        } else {
          nodes[j]!.x = nodes[i]!.x;
          nodes[j]!.y = nodes[i]!.y;
          nodes[i]!.x = tx;
          nodes[i]!.y = ty;
        }
      } else {
        // Annealing shrinks jitter with temperature so late steps are local
        // refinements.
        const i = Math.floor(rng() * count);
        const ox = nodes[i]!.x;
        const oy = nodes[i]!.y;
        const scale = (jitterBasis * temp) / startTemp;
        nodes[i]!.x = ox + (rng() - 0.5) * scale;
        nodes[i]!.y = oy + (rng() - 0.5) * scale;
        const candidate = evalEnergy();
        if (
          candidate <= current ||
          rng() < Math.exp((current - candidate) / temp)
        ) {
          current = candidate;
        } else {
          nodes[i]!.x = ox;
          nodes[i]!.y = oy;
        }
      }
      temp *= tuning.cooling;
    }

    if (current < bestEnergy) {
      bestEnergy = current;
      for (let i = 0; i < count; i++) {
        bestX[i] = nodes[i]!.x;
        bestY[i] = nodes[i]!.y;
      }
    }
  }

  for (let i = 0; i < count; i++) {
    nodes[i]!.x = bestX[i]!;
    nodes[i]!.y = bestY[i]!;
  }

  // Anchoring pins bubbles to their previous positions, which become infeasible
  // when one grows. The search clears most of the resulting overlap, but anchored
  // to overlapping positions it can leave a residual sliver it won't close (the
  // quadratic inertia holds bubbles short of fully separating). Run post-search
  // overlap relaxation to clear that sliver; separation is mass-weighted toward
  // lighter/off-screen bubbles (see {@link relaxOverlaps} iteration budget).
  // (Cold builds resolve overlap during the global search.)
  if (anchored && options?.skipOverlapRelaxation !== true) {
    relaxOverlaps(nodes, anchors, problem.meanRadius, tuning);
  }
}
