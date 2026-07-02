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

import type { Circle, Position } from "../../../geometry";

/**
 * How far one bubble may penetrate another (as a fraction of the smaller
 * radius) before a rebuild is forced. A small dead-band so freshly-solved
 * padding doesn't trigger an immediate rebuild.
 */
export const OVERLAP_REBUILD_TOLERANCE_FRAC = 0.05;

interface PlacedNode extends Position {
  readonly id: string;
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
  const placed: Circle[] = [];
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

/**
 * How much a child may grow (as a fraction of its build-time radius) before
 * the layout is re-warmed. Separate from {@link layoutNeedsRebuild} (which
 * fires on infeasible overlaps): this is a voluntary re-pack so growing
 * clusters visibly re-arrange before any overlap occurs. The threshold
 * prevents re-warming on every streaming batch.
 *
 * Radius grows as `sqrt(count)`, so 0.15 ≈ +32% members.
 */
export const GROWTH_RELAYOUT_TOLERANCE_FRAC = 0.15;

/**
 * Whether any child's radius has grown past `toleranceFrac` of the radius it had
 * when the layout was built (`buildTime`). Ids only present on one side are
 * ignored — {@link layoutNeedsRebuild} owns set-membership changes.
 */
export function layoutOutgrown(
  buildTime: readonly SizedNode[],
  current: readonly SizedNode[],
  toleranceFrac: number = GROWTH_RELAYOUT_TOLERANCE_FRAC,
): boolean {
  const builtRadiusById = new Map<string, number>();

  for (const node of buildTime) {
    builtRadiusById.set(node.id, node.radius);
  }

  for (const child of current) {
    const built = builtRadiusById.get(child.id);
    if (built !== undefined && child.radius > built * (1 + toleranceFrac)) {
      return true;
    }
  }

  return false;
}
