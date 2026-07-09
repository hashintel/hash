import type { EngineFrameLayout } from "../frames/internal-frame";

/**
 * Resolves a place ID to its dense frame-layout index.
 *
 * Monte Carlo frame buffers store place metadata in parallel typed arrays, so
 * all hot-path frame operations need this numeric index before reading counts,
 * offsets, or dimensions.
 */
export function getPlaceIndex(
  layout: EngineFrameLayout,
  placeId: string,
): number {
  const placeIndex = layout.placeIndexById.get(placeId);
  if (placeIndex === undefined) {
    throw new Error(`Place ${placeId} not found in Monte Carlo frame layout`);
  }

  return placeIndex;
}

/**
 * Resolves a transition ID to its dense frame-layout index.
 *
 * Transition timer and firing metadata are stored in parallel typed arrays,
 * indexed by the SDCPN-specialized frame layout.
 */
export function getTransitionIndex(
  layout: EngineFrameLayout,
  transitionId: string,
): number {
  const transitionIndex = layout.transitionIndexById.get(transitionId);
  if (transitionIndex === undefined) {
    throw new Error(
      `Transition ${transitionId} not found in Monte Carlo frame layout`,
    );
  }

  return transitionIndex;
}
