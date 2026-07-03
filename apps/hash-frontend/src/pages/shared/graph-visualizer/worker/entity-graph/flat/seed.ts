/**
 * Seed positions for entity flat-tier layout (re)builds: the shared flat
 * placement pass ({@link "../../core/flat-seed"}) walked over the link
 * store's adjacency, then materialised as {@link ForceNode}s sized by degree.
 */
import { nodeIdForEntityIndex } from "../../../ids";
import { placeFlatSeeds } from "../../core/flat-seed";
import { radiusForDegree } from "../../entity-style";

import type { EntityIndex } from "../../../ids";
import type { PositionScratch } from "../../collections/position-scratch";
import type { FlatSeedTuning } from "../../core/flat-seed";
import type { ForceNode } from "../../layout/force-simulation";
import type { LinkStore } from "../store/link";

/**
 * `placed` holds the prior positions on entry (see
 * {@link PositionScratch}) and is extended in place with every new
 * placement, so after the call it covers all of `entityIdxs`.
 */
export function seedFlatNodes(
  entityIdxs: readonly EntityIndex[],
  placed: PositionScratch<EntityIndex>,
  links: LinkStore,
  tuning?: FlatSeedTuning,
): ForceNode[] {
  placeFlatSeeds(
    entityIdxs,
    placed,
    function* neighbours(idx) {
      for (const link of links.linksFor(idx)) {
        yield link.otherId;
      }
    },
    tuning,
  );

  return entityIdxs.map((idx) => ({
    id: nodeIdForEntityIndex(idx),
    x: placed.x(idx),
    y: placed.y(idx),
    radius: radiusForDegree(links.degreeOf(idx)),
  }));
}
