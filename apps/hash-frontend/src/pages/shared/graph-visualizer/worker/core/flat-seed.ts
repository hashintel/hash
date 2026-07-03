/**
 * Seed placement for whole-graph flat layout (re)builds, shared by the two
 * flat lifecycles (the entity flat tier and the type graph).
 *
 * Already-placed nodes keep their prior position; new nodes land beside a
 * placed neighbour (golden-angle spread so siblings fan out); remaining
 * orphans fill a deterministic phyllotaxis disk.
 */
import type { PositionScratch } from "../collections/position-scratch";

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
 * Fill `placed` with a position for every id in `ids`. `placed` holds the
 * prior positions on entry (see {@link PositionScratch}) and is extended in
 * place with every new placement, so after the call it covers all of `ids`.
 */
export function placeFlatSeeds<Index extends number>(
  ids: readonly Index[],
  placed: PositionScratch<Index>,
  neighboursOf: (id: Index) => Iterable<Index>,
  tuning?: FlatSeedTuning,
): void {
  const neighbourOffset = tuning?.neighbourOffset ?? FLAT_SEED_NEIGHBOUR_OFFSET;
  const diskScale = tuning?.diskScale ?? FLAT_SEED_DISK_SCALE;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  // Repeat until no progress: each unplaced node with a placed neighbor
  // picks a golden-angle offset beside that neighbor (handles out-of-order
  // input).
  let changed = true;
  while (changed) {
    changed = false;

    for (const id of ids) {
      if (placed.has(id)) {
        continue;
      }

      for (const neighbour of neighboursOf(id)) {
        if (placed.has(neighbour)) {
          const angle = id * goldenAngle;

          placed.set(
            id,
            placed.x(neighbour) + Math.cos(angle) * neighbourOffset,
            placed.y(neighbour) + Math.sin(angle) * neighbourOffset,
          );

          changed = true;
          break;
        }
      }
    }
  }

  // Remaining unplaced -> a phyllotaxis disk (even, deterministic fill).
  const unplaced = ids.filter((id) => !placed.has(id));
  const fillRadius = diskScale * Math.sqrt(Math.max(1, unplaced.length));

  for (let slot = 0; slot < unplaced.length; slot++) {
    const dist = fillRadius * Math.sqrt((slot + 0.5) / unplaced.length);
    const angle = slot * goldenAngle;
    placed.set(unplaced[slot]!, Math.cos(angle) * dist, Math.sin(angle) * dist);
  }
}
