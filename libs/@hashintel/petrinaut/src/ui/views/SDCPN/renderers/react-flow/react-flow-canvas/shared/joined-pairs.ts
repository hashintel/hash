import type { CanvasLinkEnds } from "../../../../canvas-scene";

/**
 * Whether a line already runs from one node to another, among `links`. Node
 * pairs only, ports aside: an arc into a component port and one out of the
 * same component would otherwise meet the transition at one point.
 *
 * An arc takes the reverse lane when a line runs the other way between its
 * two nodes, so that the two do not lie on each other.
 */
export const joinedPairs = (
  links: readonly Pick<CanvasLinkEnds, "sourceId" | "targetId">[],
): ((sourceId: string, targetId: string) => boolean) => {
  const targetsBySource = new Map<string, Set<string>>();
  for (const { sourceId, targetId } of links) {
    const targets = targetsBySource.get(sourceId);
    if (targets) {
      targets.add(targetId);
    } else {
      targetsBySource.set(sourceId, new Set([targetId]));
    }
  }
  return (sourceId, targetId) =>
    targetsBySource.get(sourceId)?.has(targetId) ?? false;
};
