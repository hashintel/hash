/**
 * Decides when a settled cluster layout must be rebuilt.
 *
 * Layouts are reused across commits for stability, but a reused layout keeps
 * frozen positions while child radii grow with entity count. A child that
 * grows can overlap a neighbour at its frozen position, and a count-only
 * guard never notices.
 *
 * The trigger is the overlap itself: growth with slack around it keeps the
 * layout, growth into a neighbour rebuilds it, and a shrink never rebuilds
 * (it only frees space). A radius-percentage threshold would rebuild
 * harmless growth (churn) yet miss overlap in a tightly-packed spot.
 */

/**
 * How far one bubble may penetrate another (as a fraction of the smaller
 * radius) before a rebuild is forced. A small dead-band so freshly-solved
 * padding doesn't trigger an immediate rebuild.
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
 * Whether a reused layout must be rebuilt: the child set changed, or a child
 * now overlaps a neighbour by more than `toleranceFrac` of the smaller radius.
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
