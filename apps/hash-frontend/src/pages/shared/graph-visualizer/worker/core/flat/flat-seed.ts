/**
 * Seed positions for flat-tier layout (re)builds.
 *
 * Already-placed nodes keep their prior position; new nodes land beside a
 * placed link-neighbour (golden-angle spread so siblings fan out); orphans
 * fall back to a deterministic phyllotaxis disk.
 */
import { nodeIdForEntityIndex } from "../../../ids";
import { radiusForDegree } from "../../entity-style";

import type { EntityIndex } from "../../../ids";
import type { PositionScratch } from "../../collections/position-scratch";
import type { ForceNode } from "../../layout/force-simulation";
import type { LinkStore } from "../../store/link";

/** Seed offset (world units) for a streamed node placed beside a placed neighbour. */
export const FLAT_SEED_NEIGHBOUR_OFFSET = 24;

/** Phyllotaxis disk scale (world units) for cold-start / orphan flat nodes. */
export const FLAT_SEED_DISK_SCALE = 28;

/** Optional overrides for the seeding geometry (defaults above). */
export interface FlatSeedTuning {
  readonly neighbourOffset?: number;
  readonly diskScale?: number;
}

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
  const neighbourOffset = tuning?.neighbourOffset ?? FLAT_SEED_NEIGHBOUR_OFFSET;
  const diskScale = tuning?.diskScale ?? FLAT_SEED_DISK_SCALE;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  // Repeat until no progress: each unplaced node with a placed neighbor
  // picks a golden-angle offset beside that neighbor (handles out-of-order
  // input).
  let changed = true;
  while (changed) {
    changed = false;

    for (const idx of entityIdxs) {
      if (placed.has(idx)) {
        continue;
      }

      for (const link of links.linksFor(idx)) {
        if (placed.has(link.otherId)) {
          const angle = idx * goldenAngle;

          placed.set(
            idx,
            placed.x(link.otherId) + Math.cos(angle) * neighbourOffset,
            placed.y(link.otherId) + Math.sin(angle) * neighbourOffset,
          );

          changed = true;
          break;
        }
      }
    }
  }

  // Remaining unplaced -> a phyllotaxis disk (even, deterministic fill).
  const unplaced = entityIdxs.filter((idx) => !placed.has(idx));
  const fillRadius = diskScale * Math.sqrt(Math.max(1, unplaced.length));

  for (let slot = 0; slot < unplaced.length; slot++) {
    const dist = fillRadius * Math.sqrt((slot + 0.5) / unplaced.length);
    const angle = slot * goldenAngle;
    placed.set(unplaced[slot]!, Math.cos(angle) * dist, Math.sin(angle) * dist);
  }

  return entityIdxs.map((idx) => ({
    id: nodeIdForEntityIndex(idx),
    x: placed.x(idx),
    y: placed.y(idx),
    radius: radiusForDegree(links.degreeOf(idx)),
  }));
}
