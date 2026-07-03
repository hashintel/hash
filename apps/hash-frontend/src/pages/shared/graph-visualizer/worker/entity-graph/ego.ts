import type { EntityIndex } from "../../ids";
import type { CutIndex } from "../geometry/edge-aggregation";
import type { EgoTarget } from "../protocol";
import type { LinkStore } from "./store/link";

/**
 * The ego of a selected node: for each neighbor, the representative currently
 * on screen (the entity itself when individually rendered, or the visible
 * cluster it collapses into). Neighbors not in view are omitted. Without a
 * cut (flat tier), every entity is an individually-rendered dot.
 */
export function egoTargets(
  entityIdx: EntityIndex,
  links: LinkStore,
  cutIndex: CutIndex | undefined,
): EgoTarget[] {
  const targets = new Map<string, EgoTarget>();
  for (const link of links.linksFor(entityIdx)) {
    const neighbor = link.otherId;

    if (!cutIndex) {
      targets.set(`e${neighbor}`, { kind: "entity", entityIdx: neighbor });
      continue;
    }

    const owner = cutIndex.ownerOf(neighbor);
    if (owner === undefined) {
      continue; // not in the current view
    }

    if (cutIndex.isEntityMode(owner)) {
      targets.set(`e${neighbor}`, { kind: "entity", entityIdx: neighbor });
    } else {
      targets.set(`c${owner}`, { kind: "cluster", clusterId: owner });
    }
  }
  return [...targets.values()];
}
