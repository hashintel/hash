/* eslint-disable id-length, no-param-reassign */
/**
 * D1: small-N layout solver (crossing + readability minimisation).
 *
 * The objective is self-contained: it does not reference the force layout. We
 * minimise what actually makes a small node-link layout bad:
 *
 *   energy = crossings + edge-through-node + node overlap
 *          + linked-pairs-too-far   (the link "meaning": connected -> near)
 *          + compactness            (stay near the centre of the allotted disc)
 *
 * and search the full configuration space with simulated annealing from several
 * restarts, keeping the lowest-energy result. A warm-start init (e.g. the force
 * layout or a SMACOF embedding) can be passed in via the node positions, but it
 * has no privileged hold: there is no anchor term tethering us to it; it just
 * seeds restart 0 and competes on equal terms with jittered/random restarts.
 * The committed layout is the optimum of the real objective, not a polish of
 * whatever local minimum the seed fell into.
 *
 * Two correctness notes:
 *  - Temperature is on the energy scale (a crossing costs `CROSS_WEIGHT`), so
 *    `exp(-Δ/T)` actually accepts uphill moves early and this is real annealing,
 *    not greedy descent.
 *  - Crossing minimisation is NP-hard, so "directly" means full-space search
 *    with the true objective + restarts (near-optimal for the dozens of nodes we
 *    have at the cluster level), not a provable global optimum.
 *
 * A seeded PRNG makes every run deterministic.
 *
 * Per-move cost is O(degree*E + N): only the moved node's incident edges and its
 * own overlaps change, so we evaluate the delta incrementally. The full-layout
 * `totalEnergy` (O(E² + E*N + N²)) is computed only once per restart, to pick
 * the winner.
 */
import { mulberry32 } from "../../math/random";

/** Mutated in place. Positions are in the layout's local frame (origin-centred). */
export interface UntangleNode {
  x: number;
  y: number;
  readonly radius: number;
}

export interface UntangleOptions {
  /** Index pairs into `nodes`: the edges whose crossings we minimise. */
  readonly edges: readonly (readonly [number, number])[];
  /** Confine nodes within this radius of the origin (Infinity = free). */
  readonly confinementRadius: number;
  /** Deterministic seed so re-runs reproduce the layout. */
  readonly seed: number;
  /** Anneal iterations per restart. Defaults to scale with N. */
  readonly iterations?: number;
  /** Independent annealing runs; the lowest-energy one wins. Defaults to 6. */
  readonly restarts?: number;
}

// Crossings (and edges through bubbles) dominate the soft link-length /
// compactness terms, so the 2-opt swaps and annealing prioritise removing them
// over a slightly longer edge; crossing reduction is the goal here.
const CROSS_WEIGHT = 20;
const THROUGH_WEIGHT = 28;
const OVERLAP_WEIGHT = 6;
/** Pull linked clusters together: per unit an edge is longer than ideal. */
const LINK_WEIGHT = 0.02;
/** Ideal edge length as a multiple of the endpoints' combined radii. */
const LINK_IDEAL_MUL = 1.5;
/** Keep the layout compact: per unit a node sits from the origin. */
const COMPACT_WEIGHT = 0.012;
/** Keep an edge this far (x node radius) clear of a non-incident node. */
const THROUGH_CLEARANCE = 1.15;
/**
 * Initial annealing temperature, on the energy scale (~ a couple of crossings),
 * so uphill moves are genuinely accepted early. Cools to ~0 over the run.
 */
const START_TEMP = 25;
const DEFAULT_RESTARTS = 6;
/** Above this node count, skip 2-opt swaps (the O(N²*|energy|) pass gets slow). */
const TWO_OPT_MAX_NODES = 24;
/** Cap on 2-opt passes; it converges in a few full pairwise sweeps. */
const TWO_OPT_PASSES = 4;

/** Orientation sign of (a, b, c). */
function orient(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** Do open segments (p1,p2) and (p3,p4) properly cross? Shared endpoints don't. */
function segmentsCross(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  p3x: number,
  p3y: number,
  p4x: number,
  p4y: number,
): boolean {
  const d1 = orient(p3x, p3y, p4x, p4y, p1x, p1y);
  const d2 = orient(p3x, p3y, p4x, p4y, p2x, p2y);
  const d3 = orient(p1x, p1y, p2x, p2y, p3x, p3y);
  const d4 = orient(p1x, p1y, p2x, p2y, p4x, p4y);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Squared distance from point (px,py) to segment (ax,ay)-(bx,by). */
function pointSegDist2(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t =
    len2 < 1e-9
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return (px - qx) ** 2 + (py - qy) ** 2;
}

/** Ideal centre-to-centre distance for a linked pair. */
function idealLinkDist(a: UntangleNode, b: UntangleNode): number {
  return (a.radius + b.radius) * LINK_IDEAL_MUL;
}

/**
 * Energy of every term that involves node `i`. Moving only `i` changes exactly
 * these terms, so `Δtotal = nodeEnergy(after) - nodeEnergy(before)`.
 */
function nodeEnergy(
  i: number,
  nodes: readonly UntangleNode[],
  edges: readonly (readonly [number, number])[],
  incident: readonly number[],
): number {
  const node = nodes[i]!;
  let energy = 0;

  // Crossings of i's incident edges against every other edge.
  for (const ie of incident) {
    const [a, b] = edges[ie]!;
    const ax = nodes[a]!.x;
    const ay = nodes[a]!.y;
    const bx = nodes[b]!.x;
    const by = nodes[b]!.y;
    for (let je = 0; je < edges.length; je++) {
      if (je === ie) {
        continue;
      }
      const [c, d] = edges[je]!;
      // Skip edges sharing an endpoint (they meet, not cross).
      if (c === a || c === b || d === a || d === b) {
        continue;
      }
      if (
        segmentsCross(
          ax,
          ay,
          bx,
          by,
          nodes[c]!.x,
          nodes[c]!.y,
          nodes[d]!.x,
          nodes[d]!.y,
        )
      ) {
        energy += CROSS_WEIGHT;
      }
    }
  }

  // i's incident edges passing through any other node.
  for (const ie of incident) {
    const [a, b] = edges[ie]!;
    const ax = nodes[a]!.x;
    const ay = nodes[a]!.y;
    const bx = nodes[b]!.x;
    const by = nodes[b]!.y;
    for (let k = 0; k < nodes.length; k++) {
      if (k === a || k === b) {
        continue;
      }
      const clear = nodes[k]!.radius * THROUGH_CLEARANCE;
      if (
        pointSegDist2(nodes[k]!.x, nodes[k]!.y, ax, ay, bx, by) <
        clear * clear
      ) {
        energy += THROUGH_WEIGHT;
      }
    }
  }

  // Any edge (not incident to i) passing through node i.
  const clearI = node.radius * THROUGH_CLEARANCE;
  for (let je = 0; je < edges.length; je++) {
    const [c, d] = edges[je]!;
    if (c === i || d === i) {
      continue;
    }
    if (
      pointSegDist2(
        node.x,
        node.y,
        nodes[c]!.x,
        nodes[c]!.y,
        nodes[d]!.x,
        nodes[d]!.y,
      ) <
      clearI * clearI
    ) {
      energy += THROUGH_WEIGHT;
    }
  }

  // i overlapping other nodes.
  for (let k = 0; k < nodes.length; k++) {
    if (k === i) {
      continue;
    }
    const minDist = node.radius + nodes[k]!.radius;
    const dist = Math.hypot(node.x - nodes[k]!.x, node.y - nodes[k]!.y);
    if (dist < minDist) {
      energy += OVERLAP_WEIGHT * (minDist - dist);
    }
  }

  // Linked-pairs-too-far: pull i toward the clusters it links to.
  for (const ie of incident) {
    const [a, b] = edges[ie]!;
    const other = nodes[a === i ? b : a]!;
    const len = Math.hypot(node.x - other.x, node.y - other.y);
    const ideal = idealLinkDist(node, other);
    if (len > ideal) {
      energy += LINK_WEIGHT * (len - ideal);
    }
  }

  // Compactness: a fixed geometric pull toward the disc centre (not an anchor to
  // any prior layout, it references the origin, not the seed positions).
  energy += COMPACT_WEIGHT * Math.hypot(node.x, node.y);

  return energy;
}

/** Absolute objective for the whole layout, used to pick the best restart. */
function totalEnergy(
  nodes: readonly UntangleNode[],
  edges: readonly (readonly [number, number])[],
): number {
  let energy = 0;

  // Crossings: each unordered edge pair once.
  for (let ie = 0; ie < edges.length; ie++) {
    const [a, b] = edges[ie]!;
    const ax = nodes[a]!.x;
    const ay = nodes[a]!.y;
    const bx = nodes[b]!.x;
    const by = nodes[b]!.y;
    for (let je = ie + 1; je < edges.length; je++) {
      const [c, d] = edges[je]!;
      if (c === a || c === b || d === a || d === b) {
        continue;
      }
      if (
        segmentsCross(
          ax,
          ay,
          bx,
          by,
          nodes[c]!.x,
          nodes[c]!.y,
          nodes[d]!.x,
          nodes[d]!.y,
        )
      ) {
        energy += CROSS_WEIGHT;
      }
    }
  }

  // Edge-through-node: each edge against each non-endpoint node.
  for (let ie = 0; ie < edges.length; ie++) {
    const [a, b] = edges[ie]!;
    const ax = nodes[a]!.x;
    const ay = nodes[a]!.y;
    const bx = nodes[b]!.x;
    const by = nodes[b]!.y;
    for (let k = 0; k < nodes.length; k++) {
      if (k === a || k === b) {
        continue;
      }
      const clear = nodes[k]!.radius * THROUGH_CLEARANCE;
      if (
        pointSegDist2(nodes[k]!.x, nodes[k]!.y, ax, ay, bx, by) <
        clear * clear
      ) {
        energy += THROUGH_WEIGHT;
      }
    }
  }

  // Overlap + compactness over each node; links over each edge once.
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    for (let k = i + 1; k < nodes.length; k++) {
      const minDist = node.radius + nodes[k]!.radius;
      const dist = Math.hypot(node.x - nodes[k]!.x, node.y - nodes[k]!.y);
      if (dist < minDist) {
        energy += OVERLAP_WEIGHT * (minDist - dist);
      }
    }
    energy += COMPACT_WEIGHT * Math.hypot(node.x, node.y);
  }
  for (let ie = 0; ie < edges.length; ie++) {
    const [a, b] = edges[ie]!;
    const len = Math.hypot(
      nodes[a]!.x - nodes[b]!.x,
      nodes[a]!.y - nodes[b]!.y,
    );
    const ideal = idealLinkDist(nodes[a]!, nodes[b]!);
    if (len > ideal) {
      energy += LINK_WEIGHT * (len - ideal);
    }
  }

  return energy;
}

/** Clamp a node inside the confinement circle (no-op if radius is Infinity). */
function confine(node: UntangleNode, confinementRadius: number): void {
  if (!Number.isFinite(confinementRadius)) {
    return;
  }
  const limit = Math.max(0, confinementRadius - node.radius);
  const dist = Math.hypot(node.x, node.y);
  if (dist > limit && dist > 0) {
    node.x = (node.x / dist) * limit;
    node.y = (node.y / dist) * limit;
  }
}

/** One simulated-annealing descent over the current node positions, in place. */
function annealOnce(
  nodes: UntangleNode[],
  edges: readonly (readonly [number, number])[],
  incident: readonly (readonly number[])[],
  confinementRadius: number,
  rng: () => number,
  iterations: number,
): void {
  const count = nodes.length;

  let extent = 0;
  for (const node of nodes) {
    extent = Math.max(extent, Math.hypot(node.x, node.y) + node.radius);
  }
  const startScale = Math.max(1, extent * 0.4);

  for (let iter = 0; iter < iterations; iter++) {
    const progress = iter / iterations;
    const temperature = START_TEMP * (1 - progress) ** 2;
    const scale = startScale * (1 - progress);
    const i = Math.floor(rng() * count);
    const node = nodes[i]!;

    const before = nodeEnergy(i, nodes, edges, incident[i]!);
    const oldX = node.x;
    const oldY = node.y;

    const angle = rng() * 2 * Math.PI;
    const step = scale * rng();
    node.x += Math.cos(angle) * step;
    node.y += Math.sin(angle) * step;
    confine(node, confinementRadius);

    const after = nodeEnergy(i, nodes, edges, incident[i]!);
    const delta = after - before;

    // Accept improvements always; uphill moves with annealing probability.
    if (delta > 0 && rng() >= Math.exp(-delta / Math.max(1e-3, temperature))) {
      node.x = oldX;
      node.y = oldY;
    }
  }
}

/**
 * 2-opt position swaps: greedily exchange pairs of node positions, keeping any
 * swap that lowers total energy, until none does (or the pass cap is hit). A
 * single swap can un-cross many edges at once (the move single-node annealing
 * nudges can not reach), so this is what actually minimises crossings for the
 * small node counts at the cluster level. `totalEnergy` includes overlap, so a
 * swap that would collide is rejected. O(passes * N² * |totalEnergy|), hence
 * gated to small N by the caller.
 */
function twoOptSwaps(
  nodes: UntangleNode[],
  edges: readonly (readonly [number, number])[],
): void {
  const count = nodes.length;
  let base = totalEnergy(nodes, edges);
  for (let pass = 0; pass < TWO_OPT_PASSES; pass++) {
    let improved = false;
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const ix = nodes[i]!.x;
        const iy = nodes[i]!.y;
        const jx = nodes[j]!.x;
        const jy = nodes[j]!.y;
        nodes[i]!.x = jx;
        nodes[i]!.y = jy;
        nodes[j]!.x = ix;
        nodes[j]!.y = iy;
        const energy = totalEnergy(nodes, edges);
        if (energy < base - 1e-6) {
          base = energy;
          improved = true;
        } else {
          nodes[i]!.x = ix;
          nodes[i]!.y = iy;
          nodes[j]!.x = jx;
          nodes[j]!.y = jy;
        }
      }
    }
    if (!improved) {
      break;
    }
  }
}

export function untangleLayout(
  nodes: UntangleNode[],
  options: UntangleOptions,
): void {
  const { edges, confinementRadius, seed } = options;
  const count = nodes.length;
  if (count < 3 || edges.length === 0) {
    return;
  }

  // Per-node incident-edge index lists.
  const incident: number[][] = Array.from({ length: count }, () => []);
  for (let e = 0; e < edges.length; e++) {
    const [a, b] = edges[e]!;
    incident[a]!.push(e);
    incident[b]!.push(e);
  }

  const restarts = Math.max(1, options.restarts ?? DEFAULT_RESTARTS);
  const iterations = options.iterations ?? Math.min(4000, count * 120);
  const rng = mulberry32(seed);

  // The warm-start init the caller positioned `nodes` at (force / SMACOF).
  const init = nodes.map((node) => ({ x: node.x, y: node.y }));
  let extent = 0;
  for (const node of init) {
    extent = Math.max(extent, Math.hypot(node.x, node.y));
  }
  const jitterScale = Math.max(1, extent * 0.6);
  const randomRadius = Number.isFinite(confinementRadius)
    ? confinementRadius
    : Math.max(1, extent);

  let best = init.map((p) => ({ ...p }));
  let bestEnergy = Infinity;

  for (let r = 0; r < restarts; r++) {
    // Restart 0 starts from the given seed; later restarts perturb it (and the
    // last starts fully random) so the search is not captured by the seed.
    for (let i = 0; i < count; i++) {
      const node = nodes[i]!;
      if (r === 0) {
        node.x = init[i]!.x;
        node.y = init[i]!.y;
      } else if (r === restarts - 1 && restarts > 2) {
        const angle = rng() * 2 * Math.PI;
        const rad = Math.sqrt(rng()) * randomRadius;
        node.x = Math.cos(angle) * rad;
        node.y = Math.sin(angle) * rad;
      } else {
        node.x = init[i]!.x + (rng() * 2 - 1) * jitterScale;
        node.y = init[i]!.y + (rng() * 2 - 1) * jitterScale;
      }
      confine(node, confinementRadius);
    }

    annealOnce(nodes, edges, incident, confinementRadius, rng, iterations);

    const energy = totalEnergy(nodes, edges);
    if (energy < bestEnergy) {
      bestEnergy = energy;
      best = nodes.map((node) => ({ x: node.x, y: node.y }));
    }
  }

  for (let i = 0; i < count; i++) {
    nodes[i]!.x = best[i]!.x;
    nodes[i]!.y = best[i]!.y;
  }

  // Polish the best result with 2-opt position swaps. For the small N at the
  // cluster level this removes the crossings the single-node annealing only
  // nudges at (a swap un-crosses what a nudge can't).
  if (count <= TWO_OPT_MAX_NODES) {
    twoOptSwaps(nodes, edges);
  }
}
