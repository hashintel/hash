/**
 * When a settled cluster layout may be REUSED versus rebuilt from scratch.
 *
 * A layout is keyed by its parent and reused across commits for stability (so
 * the arrangement doesn't churn on every ingest). But a reused layout keeps the
 * positions it was solved with, while child radii are recomputed every commit
 * (radius ~ sqrt(entity count)). So a child that grows can end up OVERLAPPING a
 * neighbour at its frozen position — and, since the child COUNT is unchanged, a
 * count-only reuse guard never notices and the overlap is drawn forever.
 *
 * The trigger is the overlap ITSELF, not a proxy like "radius grew > X%":
 * - growth with slack around it (no overlap) does NOT rebuild → no churn;
 * - growth INTO a neighbour rebuilds → the overlap is re-solved;
 * - a shrink never rebuilds (it only frees space).
 * A percentage-of-radius threshold gets both wrong: it rebuilds harmless growth
 * (churn) yet misses growth that overlaps in a tightly-packed spot.
 */

/**
 * How far one bubble may penetrate another (as a fraction of the smaller
 * radius) before a rebuild is forced. A small dead-band: it stops a freshly
 * solved layout — which leaves a little padding between bubbles — from
 * rebuilding the instant a child nibbles into that padding, while still firing
 * on any real, visible overlap.
 */
export const OVERLAP_REBUILD_TOLERANCE_FRAC = 0.05;

interface PlacedNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

interface SizedNode {
  readonly id: string;
  readonly radius: number;
}

/**
 * Whether a reused layout (`previous`, the live layout nodes with their current
 * positions) must be rebuilt to fit the `current` children (same ids, but
 * freshly-sized radii): the child set changed, or some child now overlaps a
 * neighbour by more than `toleranceFrac` of the smaller radius. Pure and
 * side-effect free so it can be unit-tested directly.
 */
export function layoutNeedsRebuild(
  previous: readonly PlacedNode[],
  current: readonly SizedNode[],
  toleranceFrac: number = OVERLAP_REBUILD_TOLERANCE_FRAC,
): boolean {
  // A child added or removed: the set changed, rebuild.
  if (previous.length !== current.length) {
    return true;
  }
  const positionById = new Map<string, PlacedNode>();
  for (const node of previous) {
    positionById.set(node.id, node);
  }
  // Join the new radii onto the current positions; a missing id means the set
  // changed even though the count matched.
  const placed: { x: number; y: number; radius: number }[] = [];
  for (const child of current) {
    const position = positionById.get(child.id);
    if (position === undefined) {
      return true;
    }
    placed.push({ x: position.x, y: position.y, radius: child.radius });
  }
  // Any pair overlapping (beyond the dead-band) at the frozen positions with the
  // new radii means the reused layout is no longer feasible.
  for (let idxA = 0; idxA < placed.length; idxA++) {
    const nodeA = placed[idxA]!;
    for (let idxB = idxA + 1; idxB < placed.length; idxB++) {
      const nodeB = placed[idxB]!;
      const distance = Math.hypot(nodeB.x - nodeA.x, nodeB.y - nodeA.y);
      const penetration = nodeA.radius + nodeB.radius - distance;
      const tolerance = toleranceFrac * Math.min(nodeA.radius, nodeB.radius);
      if (penetration > tolerance) {
        return true;
      }
    }
  }
  return false;
}
